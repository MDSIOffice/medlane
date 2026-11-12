#!/usr/bin/env node
// Load test: N simulated employees using the app at once.
//
// Each virtual user does what a real browser tab does:
//   1. signs in            POST /api/auth/login
//   2. loads all modules   GET  /api/modules/state
//   3. opens live updates  WS   /api/live
//   4. for the test duration: on every live "changed" message (and every --poll seconds) fetches
//      GET /api/modules/changes, and now and then re-loads the full state (page refresh).
// Optional --stock-race KEY: every user at the same moment changes the same stock row by 1
// (POST /api/modules/records, exactly like the app): -1 each when the row has at least --users
// units, otherwise +1 each. Afterwards the script checks the stored qty equals start + the sum of
// successful changes, i.e. that no change was lost (lost updates would leave it off by ~N-1).
// The script puts the row back to its starting qty at the end.
//
// Usage (Node 22+):
//   node tools/load-test.mjs --base-url https://<preview-host> --accounts accounts.csv --users 100
//   node tools/load-test.mjs ... --stock-race "ITEMCODE|Branch|LOT"     (needs Admin/CEO/Superadmin accounts)
//
// accounts.csv: one "email,password" per line (# comments allowed). With fewer accounts than
// --users, accounts are reused (each still gets its own sign-in and session).
//
// Run it against the PREVIEW deployment, not production: it creates sign-in sessions, and
// --stock-race writes stock. Production hosts are refused unless --allow-production is passed.
// Note: >10 wrong passwords for one account in 5 minutes locks that account, so check the CSV.

import { readFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args["base-url"] || !args.accounts) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((line) => line.startsWith("//")).map((line) => line.slice(3)).join("\n"));
  process.exit(args.help ? 0 : 1);
}

const BASE = String(args["base-url"]).replace(/\/+$/, "");
const USERS = Number(args.users || 50);
const DURATION_S = Number(args.duration || 120);
const RAMP_S = Number(args.ramp ?? 10);
const POLL_S = Number(args.poll || 30);
const RELOAD_EVERY_S = Number(args["reload-every"] || 90);
const STOCK_KEY = args["stock-race"] ? String(args["stock-race"]) : "";

if (/medlanesolutions\.com/i.test(BASE) && !/preview/i.test(BASE) && !args["allow-production"]) {
  console.error(`Refusing to load-test ${BASE} — that looks like production. Use the preview deployment, or pass --allow-production if you really mean it.`);
  process.exit(1);
}
if (typeof WebSocket !== "function") {
  console.error("This script needs Node 22+ (global WebSocket).");
  process.exit(1);
}

const accounts = readFileSync(String(args.accounts), "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
  const comma = line.indexOf(",");
  return { email: line.slice(0, comma).trim(), password: line.slice(comma + 1) };
}).filter((account) => account.email && account.password);
if (!accounts.length) {
  console.error("No accounts found in the CSV (expected email,password per line).");
  process.exit(1);
}

// ---------- metrics ----------
/** @type {Map<string, { ok: number, fail: number, ms: number[], statuses: Map<string, number>, errors: Map<string, number> }>} */
const metrics = new Map();
function record(name, ms, status, error = "") {
  if (!metrics.has(name)) metrics.set(name, { ok: 0, fail: 0, ms: [], statuses: new Map(), errors: new Map() });
  const m = metrics.get(name);
  const ok = status >= 200 && status < 300;
  ok ? m.ok++ : m.fail++;
  m.ms.push(ms);
  m.statuses.set(String(status), (m.statuses.get(String(status)) || 0) + 1);
  if (!ok && error) m.errors.set(error.slice(0, 120), (m.errors.get(error.slice(0, 120)) || 0) + 1);
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function call(name, path, { method = "GET", session, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (session) {
    headers.authorization = `Bearer ${session.access_token}`;
    if (session.app_session_id) headers["x-medlane-session-id"] = session.app_session_id;
  }
  const started = performance.now();
  let status = 0;
  let payload = null;
  try {
    const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    status = response.status;
    payload = await response.json().catch(() => null);
  } catch (error) {
    payload = { error: error instanceof Error ? error.message : String(error) };
  }
  record(name, performance.now() - started, status, payload?.error || "");
  return { status, payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);

// ---------- one virtual user ----------
let liveMessages = 0;
let liveConnected = 0;
let liveErrors = 0;

async function virtualUser(index, endAt, stockBarrier) {
  const account = accounts[index % accounts.length];
  const login = await call("login", "/api/auth/login", { method: "POST", body: { email: account.email, password: account.password } });
  if (login.status !== 200 || !login.payload?.session?.access_token) return { index, signedIn: false };
  const session = login.payload.session;

  const state = await call("load state", "/api/modules/state", { session });
  let cursor = state.payload?.changesCursor || new Date().toISOString();

  let pendingChanges = false;
  let socket = null;
  try {
    const params = new URLSearchParams();
    if (session.app_session_id) params.set("sid", session.app_session_id);
    socket = new WebSocket(`${BASE.replace(/^http/, "ws")}/api/live?${params}`, ["medlane-live", session.access_token]);
    socket.addEventListener("open", () => { liveConnected++; });
    socket.addEventListener("message", (event) => { if (event.data !== "pong") { liveMessages++; pendingChanges = true; } });
    socket.addEventListener("error", () => { liveErrors++; });
  } catch {
    liveErrors++;
  }

  const pullChanges = async () => {
    const result = await call("live changes", `/api/modules/changes?${new URLSearchParams({ since: cursor })}`, { session });
    if (result.payload?.cursor) cursor = result.payload.cursor;
  };

  let stockResult = null;
  if (stockBarrier) {
    // Everyone loads the row first, then all write at the same instant.
    const row = (state.payload?.data?.inventory || []).find((item) => [item.code || item.item || "stock", item.branch || "branch", item.lot || item.serial || "lot"].map((part) => String(part).trim() || "-").join("|") === STOCK_KEY);
    await stockBarrier.arrive();
    if (row) {
      const delta = STOCK_DIRECTION;
      const save = await call("stock save (race)", "/api/modules/records", { method: "POST", session, body: { records: { inventory: [{ ...row, qty: Number(row.qty) + delta }] }, recordKeys: {}, basedOn: state.payload?.loadedAt } });
      stockResult = { delta, ok: save.status === 200 };
      pendingChanges = true;
    } else stockResult = { delta: 0, ok: false, missing: true };
  }

  let nextPoll = Date.now() + jitter(POLL_S * 1000);
  let nextReload = Date.now() + jitter(RELOAD_EVERY_S * 1000);
  while (Date.now() < endAt) {
    if (pendingChanges) {
      pendingChanges = false;
      await sleep(200 + Math.random() * 2000); // same spread as the app
      await pullChanges();
    } else if (Date.now() >= nextPoll) {
      nextPoll = Date.now() + jitter(POLL_S * 1000);
      await pullChanges();
    } else if (Date.now() >= nextReload) {
      nextReload = Date.now() + jitter(RELOAD_EVERY_S * 1000);
      const reload = await call("load state", "/api/modules/state", { session });
      if (reload.payload?.changesCursor) cursor = reload.payload.changesCursor;
    } else {
      await sleep(250);
    }
  }
  try { socket?.close(1000, "load test done"); } catch { /* ignore */ }
  return { index, signedIn: true, session, stockResult };
}

function makeBarrier(count) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    async arrive() { arrived++; if (arrived >= count) release(); await Promise.race([gate, sleep(60_000)]); },
    reduce() { count--; if (arrived >= count) release(); },
  };
}

// ---------- run ----------
console.log(`Load test: ${USERS} users against ${BASE} for ${DURATION_S}s (ramp ${RAMP_S}s, ${accounts.length} account(s))${STOCK_KEY ? `, stock race on "${STOCK_KEY}"` : ""}`);

let stockStart = null;
let STOCK_DIRECTION = 1;
let adminSession = null;
if (STOCK_KEY) {
  const login = await call("login", "/api/auth/login", { method: "POST", body: { email: accounts[0].email, password: accounts[0].password } });
  adminSession = login.payload?.session;
  if (!adminSession) { console.error("Could not sign in with the first account to read the stock row."); process.exit(1); }
  const state = await call("load state", "/api/modules/state", { session: adminSession });
  stockStart = findStock(state.payload?.data?.inventory, STOCK_KEY);
  if (!stockStart) { console.error(`Stock row "${STOCK_KEY}" not found (format: code|branch|lot).`); process.exit(1); }
  STOCK_DIRECTION = Number(stockStart.qty) >= USERS ? -1 : 1;
  console.log(`Stock row starts at qty ${stockStart.qty}; each user will ${STOCK_DIRECTION < 0 ? "take 1 unit" : "add 1 unit"}.`);
}

const started = Date.now();
const endAt = started + (RAMP_S + DURATION_S) * 1000;
// With a stock race everyone signs in together so the writes really collide.
const barrier = STOCK_KEY ? makeBarrier(USERS) : null;
const runs = Array.from({ length: USERS }, async (_, index) => {
  if (!STOCK_KEY) await sleep((RAMP_S * 1000 * index) / USERS);
  const result = await virtualUser(index, endAt, barrier).catch((error) => ({ index, signedIn: false, error }));
  if (!result.signedIn && barrier) barrier.reduce();
  return result;
});
const progress = setInterval(() => {
  const loads = metrics.get("load state");
  process.stdout.write(`\r  ${Math.round((Date.now() - started) / 1000)}s · signed in ${metrics.get("login")?.ok || 0}/${USERS} · state loads ${loads ? loads.ok + loads.fail : 0} · live ${liveConnected} connected, ${liveMessages} msgs   `);
}, 1000);
const results = await Promise.all(runs);
clearInterval(progress);
process.stdout.write("\n\n");

// ---------- report ----------
const rows = [...metrics.entries()].map(([name, m]) => {
  const sorted = [...m.ms].sort((a, b) => a - b);
  return { endpoint: name, requests: m.ok + m.fail, failed: m.fail, "p50 ms": Math.round(pct(sorted, 50)), "p95 ms": Math.round(pct(sorted, 95)), "p99 ms": Math.round(pct(sorted, 99)), "max ms": Math.round(sorted[sorted.length - 1] || 0), statuses: [...m.statuses].map(([s, n]) => `${s}×${n}`).join(" ") };
});
console.table(rows);
for (const [name, m] of metrics) for (const [error, count] of m.errors) console.log(`  ${name}: ${count}× ${error}`);
console.log(`Live updates: ${liveConnected} sockets connected, ${liveErrors} socket errors, ${liveMessages} change messages received.`);

let failed = results.filter((r) => !r.signedIn).length > 0 || rows.some((r) => r.endpoint !== "stock save (race)" && r.failed > 0);

if (STOCK_KEY) {
  const stockRuns = results.filter((r) => r.stockResult && !r.stockResult.missing);
  const applied = stockRuns.filter((r) => r.stockResult.ok).reduce((sum, r) => sum + r.stockResult.delta, 0);
  const okCount = stockRuns.filter((r) => r.stockResult.ok).length;
  const state = await call("load state", "/api/modules/state", { session: adminSession });
  const end = findStock(state.payload?.data?.inventory, STOCK_KEY);
  const expected = Number(stockStart.qty) + applied;
  console.log(`\nStock race: ${okCount}/${stockRuns.length} saves succeeded. Start ${stockStart.qty}, net change ${applied >= 0 ? "+" : ""}${applied}, expected ${expected}, stored now ${end?.qty}.`);
  if (Number(end?.qty) === expected) console.log("PASS — no stock change was lost.");
  else { console.log("FAIL — stored qty does not match: concurrent stock changes were lost."); failed = true; }
  // Put the row back where it started.
  if (end && Number(end.qty) !== Number(stockStart.qty)) {
    const restore = await call("stock restore", "/api/modules/records", { method: "POST", session: adminSession, body: { records: { inventory: [{ ...end, qty: Number(stockStart.qty) }] }, recordKeys: {}, basedOn: state.payload?.loadedAt } });
    console.log(restore.status === 200 ? `Restored the row to qty ${stockStart.qty}.` : `Could not restore the row (HTTP ${restore.status}) — set it back to ${stockStart.qty} by hand.`);
  }
}

console.log(failed ? "\nResult: problems found (see failures above)." : "\nResult: all requests succeeded.");
process.exit(failed ? 1 : 0);

function findStock(inventory, key) {
  return (inventory || []).find((item) => [item.code || item.item || "stock", item.branch || "branch", item.lot || item.serial || "lot"].map((part) => String(part).trim() || "-").join("|") === key) || null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

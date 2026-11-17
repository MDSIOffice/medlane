// User activity log on the Worker: audit entries are appended to activity_log (never changed),
// older ones are copied in once, and each person reads only what their role allows.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv } from "./helpers/load-worker.mjs";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const BOSS = "11111111-1111-4111-8111-111111111111";
const CEO = "22222222-2222-4222-8222-222222222222";
const ANA = "33333333-3333-4333-8333-333333333333";
const BEN = "44444444-4444-4444-8444-444444444444";
const PEOPLE = {
  [BOSS]: { email: "boss@example.com", full_name: "Bea Boss", role: "Superadmin", token: "boss" },
  [CEO]: { email: "ceo@example.com", full_name: "Cy Ceo", role: "CEO", token: "ceo" },
  [ANA]: { email: "ana@example.com", full_name: "Ana Cruz", role: "Sales", token: "ana" },
  [BEN]: { email: "ben@example.com", full_name: "Ben Uy", role: "Accounting", token: "ben" },
};
const SID = (/** @type {string} */ id) => `aaaaaaaa-0000-4000-8000-${id.slice(-12)}`;
let run = 0;

/** A PostgREST-ish fake that enforces activity_log's append-only rule like the real database. */
function fakeSupabase({ logs = /** @type {any[]} */ ([]), activity = /** @type {any[]} */ ([]) } = {}) {
  const db = { logs, activity, monitoring: /** @type {Record<string, any>} */ ({}), requests: /** @type {{ method: string, path: string }[]} */ ([]) };
  let nextId = activity.length + 1;
  activity.forEach((row, i) => { row.id ??= i + 1; });
  /** One PostgREST condition "col.op.value" against a row. @param {any} row @param {string} cond */
  const test1 = (row, cond) => {
    const m = /^([a-z_]+)\.(not\.)?(eq|neq|in|gte|lt|is|ilike)\.(.*)$/.exec(cond);
    if (!m) return true;
    const [, col, not, op, raw] = m;
    const v = row[col];
    let ok;
    if (op === "eq") ok = String(v ?? "") === raw;
    else if (op === "neq") ok = String(v ?? "") !== raw;
    else if (op === "in") ok = raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
    else if (op === "gte") ok = String(v) >= raw;
    else if (op === "lt") ok = String(v) < raw;
    else if (op === "is") ok = raw === "null" ? v === null || v === undefined : String(v) === raw;
    else ok = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(String(v ?? ""));
    return not ? !ok : ok;
  };
  /** @param {string} inner */
  const splitTop = (inner) => { const out = []; let depth = 0, cur = ""; for (const ch of inner) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch; } if (cur) out.push(cur); return out; };
  /** @param {any} row @param {URL} url */
  const matches = (row, url) => [...url.searchParams.entries()].every(([key, value]) => {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) return true;
    if (key === "or") return splitTop(value.slice(1, -1)).some((c) => test1(row, c));
    if (key === "and") return splitTop(value.slice(1, -1)).every((g) => splitTop(g.replace(/^or\(|\)$/g, "")).some((c) => test1(row, c)));
    return test1(row, `${key}.${value}`);
  });
  /** @param {any[]} rows @param {URL} url */
  const page = (rows, url) => {
    const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 1000);
    return { slice: sorted.slice(offset, offset + limit), total: sorted.length };
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const path = url.pathname;
    db.requests.push({ method, path });
    const headers = /** @type {any} */ (init.headers) || {};
    if (path === "/auth/v1/user") {
      const token = String(headers.authorization || "");
      const id = Object.keys(PEOPLE).find((key) => token.endsWith(PEOPLE[key].token)) || ANA;
      return Response.json({ id, email: PEOPLE[id].email });
    }
    if (path === "/rest/v1/app_sessions") return Response.json(Object.keys(PEOPLE).map((id) => ({ id: SID(id), user_id: id, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), revoked_at: null })).filter((row) => matches(row, url)));
    if (path === "/rest/v1/profiles") return Response.json(Object.entries(PEOPLE).map(([id, p]) => ({ id, email: p.email, full_name: p.full_name, role: p.role, branch: "all", created_at: "2026-01-01T00:00:00Z" })).filter((row) => matches(row, url)));
    if (path === "/rest/v1/module_permissions") return Response.json([]);
    if (path === "/rest/v1/activity_log") {
      if (method === "PATCH" || method === "DELETE" || method === "PUT") return Response.json({ message: `activity_log is append-only: ${method} is not allowed` }, { status: 403 });
      if (method === "POST") {
        if (String(headers.prefer || "").includes("merge-duplicates")) return Response.json({ message: "activity_log is append-only: UPDATE is not allowed" }, { status: 403 });
        for (const row of body) if (!db.activity.some((r) => r.source_key === row.source_key)) db.activity.push({ ...row, id: nextId++ });
        return new Response(null, { status: 201 });
      }
      const { slice, total } = page(db.activity.filter((row) => matches(row, url)), url);
      const res = Response.json(slice.map((row) => ({ ...row })));
      res.headers.set("content-range", `0-${Math.max(0, slice.length - 1)}/${total}`);
      return res;
    }
    if (path === "/rest/v1/app_records") {
      const module = url.searchParams.get("module_name");
      if (method === "POST") {
        for (const row of body) {
          if (row.module_name === "logs") db.logs.push({ ...row, updated_at: row.data?.serverCapturedAt || new Date().toISOString() });
          if (row.module_name === "system-monitoring") db.monitoring[row.record_key] = row.data;
        }
        return new Response(null, { status: 201 });
      }
      if (module === "eq.system-monitoring") { const key = url.searchParams.get("record_key")?.slice(3) || ""; return Response.json(db.monitoring[key] ? [{ data: db.monitoring[key] }] : []); }
      if (module === "eq.logs") {
        const rows = db.logs.filter((row) => matches({ ...row, module_name: "logs" }, new URL(url.toString().replace(/module_name=[^&]*&?/, "")))).sort((a, b) => (url.searchParams.get("order")?.endsWith("asc") ? (a.updated_at < b.updated_at ? -1 : 1) : (a.updated_at < b.updated_at ? 1 : -1)));
        return Response.json(rows);
      }
      return Response.json([]);
    }
    return Response.json([]);
  };
  return db;
}

const ctx = { waitUntil: (/** @type {Promise<any>} */ p) => p };
const freshEnv = () => ({ ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key", APP_STATE_KEY: `act-${++run}` });
/** @param {any} env @param {string} path @param {{ method?: string, body?: any, as?: string, ua?: string }} [options] */
const call = (env, path, { method = "GET", body, as = ANA, ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" } = {}) => worker.default.fetch(new Request(`https://app.test${path}`, {
  method, headers: { authorization: `Bearer ${PEOPLE[as].token}`, "x-medlane-session-id": SID(as), "content-type": "application/json", "user-agent": ua },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env, ctx);
const entry = (/** @type {string} */ user, /** @type {string} */ role, /** @type {string} */ action, /** @type {string} */ iso, extra = {}) => ({ user, role, action, module: "Sales", record: "SI-1", serverCapturedAt: iso, ...extra });

describe("append-only activity entries", () => {
  test("an audit entry written anywhere is appended to activity_log, classified", async () => {
    const env = freshEnv();
    const db = fakeSupabase();
    const res = await call(env, "/api/logs", { method: "POST", body: { action: "Voided invoice", module: "Invoicing", record: "SI-77" } });
    assert.equal(res.status, 201);
    assert.equal(db.logs.length, 1);
    assert.equal(db.activity.length, 1);
    const row = db.activity[0];
    assert.deepEqual([row.actor, row.kind, row.record, row.user_id, row.source_key], ["Ana Cruz", "voided", "SI-77", ANA, db.logs[0].record_key]);
    assert.match(row.flag_reason, /Void or cancellation/);
  });

  test("appending the same entry again never duplicates or overwrites it", async () => {
    const env = freshEnv();
    const db = fakeSupabase();
    const source = { record_key: "logs-x", state_key: env.APP_STATE_KEY, updated_by: ANA, data: entry("Ana Cruz", "Sales", "Created sales invoice", "2026-11-18T01:00:00Z") };
    await worker.mirrorAuditRows(env, [source]);
    await worker.mirrorAuditRows(env, [{ ...source, data: { ...source.data, action: "Something else" } }]);
    assert.equal(db.activity.length, 1);
    assert.equal(db.activity[0].action, "Created sales invoice");
  });

  test("the copy of older entries runs once, keeps their flags, and is safe to repeat", async () => {
    const env = freshEnv();
    const logs = [
      { record_key: "logs-1", state_key: env.APP_STATE_KEY, updated_by: ANA, data: entry("Ana Cruz", "Sales", "Signed in", "2026-11-01T01:00:00Z", { event: "signin", browser: "Chrome", device: "macOS" }) },
      { record_key: "logs-2", state_key: env.APP_STATE_KEY, updated_by: ANA, data: entry("Ana Cruz", "Sales", "Signed in", "2026-11-02T01:00:00Z", { event: "signin", browser: "Safari", device: "iPhone" }) },
      { record_key: "logs-3", state_key: env.APP_STATE_KEY, updated_by: BEN, data: entry("Ben Uy", "Accounting", "Exported receivables aging", "2026-11-03T01:00:00Z", { module: "Receivables" }) },
    ].map((row) => ({ ...row, updated_at: row.data.serverCapturedAt }));
    const db = fakeSupabase({ logs });
    assert.equal((await worker.runActivityBackfill(env)).copied, 3);
    assert.equal((await worker.runActivityBackfill(env)).copied, 3);
    assert.equal(db.activity.length, 3);
    assert.deepEqual(db.activity.map((r) => Boolean(r.flag_reason)), [false, true, true]);
    // From now on the Audit Logs page reads the same table.
    const rows = await worker.auditLogRows(env, { gte: "2026-10-01T00:00:00Z", all: true });
    assert.deepEqual(rows.map((/** @type {any} */ r) => r.data.action), ["Exported receivables aging", "Signed in", "Signed in"]);
    assert.ok(db.requests.some((r) => r.path === "/rest/v1/activity_log" && r.method === "GET"));
  });

  test("a new device is flagged against the person's sign-in history", async () => {
    const env = freshEnv();
    const db = fakeSupabase({ activity: [{ source_key: "old", state_key: env.APP_STATE_KEY, created_at: "2026-11-01T00:00:00Z", user_id: ANA, kind: "signin", action: "Signed in", device: "macOS", browser: "Chrome", email: "", actor: "Ana Cruz" }] });
    const signIn = (/** @type {string} */ key, /** @type {string} */ browser, /** @type {string} */ device) => worker.mirrorAuditRows(env, [{ record_key: key, state_key: env.APP_STATE_KEY, updated_by: ANA, data: entry("Ana Cruz", "Sales", "Signed in", new Date().toISOString(), { event: "signin", browser, device }) }]);
    await signIn("k1", "Chrome", "macOS");
    await signIn("k2", "Safari", "iPhone");
    assert.equal(db.activity.find((r) => r.source_key === "k1").flag_reason, null);
    assert.match(db.activity.find((r) => r.source_key === "k2").flag_reason, /new device or browser \(Safari on iPhone\)/);
  });

  test("no request ever tries to change or remove an activity entry", async () => {
    const env = freshEnv();
    const db = fakeSupabase();
    await call(env, "/api/logs", { method: "POST", body: { action: "Stock adjusted", module: "Inventory", record: "LOT-1" } });
    await call(env, "/api/logs", { method: "POST", body: { action: "Exported clients CSV", module: "Masterlists" } });
    await call(env, "/api/activity?tab=flagged", { as: BOSS });
    await worker.runActivityBackfill(env);
    const touching = db.requests.filter((r) => r.path === "/rest/v1/activity_log");
    assert.ok(touching.length > 0);
    assert.deepEqual([...new Set(touching.map((r) => r.method))].sort(), ["GET", "POST"]);
    assert.equal(db.activity.filter((r) => r.flag_reason).length, 2, "stock adjustment without a reason + client export");
  });
});

describe("who sees what", () => {
  /** @param {string} key */
  const seed = (key) => [
    { source_key: "a1", state_key: key, created_at: new Date(Date.now() - 60000).toISOString(), user_id: ANA, email: "ana@example.com", actor: "Ana Cruz", role: "Sales", action: "Created sales invoice", module: "Sales", record: "SI-1", kind: "created", flag_reason: null, data: {} },
    { source_key: "a2", state_key: key, created_at: new Date(Date.now() - 50000).toISOString(), user_id: null, email: "ana@example.com", actor: "ana@example.com", role: "—", action: "Failed sign-in", module: "Authentication", record: "ana@example.com", kind: "signin", flag_reason: "3 failed sign-ins", data: {} },
    { source_key: "b1", state_key: key, created_at: new Date(Date.now() - 40000).toISOString(), user_id: BEN, email: "", actor: "Ben Uy", role: "Accounting", action: "Approved payable", module: "Payables", record: "PAY-1", kind: "approved", flag_reason: null, data: { changes: [{ field: "Status", from: "For Approval", to: "Approved" }] } },
    { source_key: "b2", state_key: key, created_at: new Date(Date.now() - 30000).toISOString(), user_id: BEN, email: "", actor: "Ben Uy", role: "Accounting", action: "Signed in", module: "Authentication", record: "ben@example.com", kind: "signin", flag_reason: null, data: {} },
  ];

  test("Superadmin sees everyone and can narrow to one person", async () => {
    const env = freshEnv();
    fakeSupabase({ activity: seed(env.APP_STATE_KEY) });
    const all = await (await call(env, "/api/activity", { as: BOSS })).json();
    assert.equal(all.total, 4);
    assert.deepEqual(all.scope, { all: true, readOnly: false, user: "" });
    assert.deepEqual(all.counts, { all: 4, changes: 1, approvals: 1, signins: 2, exports: 0, flagged: 1 });
    assert.deepEqual(all.stats, { actionsToday: 2, signInsToday: 1, flagged7d: 1 });
    assert.deepEqual(all.items.find((/** @type {any} */ i) => i.record === "PAY-1").changes, [{ field: "Status", from: "For Approval", to: "Approved" }]);
    const ben = await (await call(env, "/api/activity?user=Ben%20Uy", { as: BOSS })).json();
    assert.deepEqual(ben.items.map((/** @type {any} */ i) => i.user), ["Ben Uy", "Ben Uy"]);
  });

  test("CEO sees everyone, read-only", async () => {
    const env = freshEnv();
    fakeSupabase({ activity: seed(env.APP_STATE_KEY) });
    const page = await (await call(env, "/api/activity", { as: CEO })).json();
    assert.equal(page.total, 4);
    assert.equal(page.scope.readOnly, true);
    assert.equal((await call(env, "/api/activity/backfill", { method: "POST", as: CEO })).status, 403);
  });

  test("everyone else sees only their own activity, including failed sign-ins on their email", async () => {
    const env = freshEnv();
    fakeSupabase({ activity: seed(env.APP_STATE_KEY) });
    const ana = await (await call(env, "/api/activity?user=Ben%20Uy", { as: ANA })).json();
    assert.deepEqual(ana.items.map((/** @type {any} */ i) => i.id).length, 2);
    assert.ok(ana.items.every((/** @type {any} */ i) => i.user !== "Ben Uy"));
    assert.equal(ana.scope.user, "", "the user filter is ignored for them");
    const searched = await (await call(env, "/api/activity?q=PAY-1", { as: ANA })).json();
    assert.equal(searched.total, 0, "searching can't reach someone else's entries");
  });

  test("search, tab and paging are applied on the server", async () => {
    const env = freshEnv();
    fakeSupabase({ activity: seed(env.APP_STATE_KEY) });
    const p1 = await (await call(env, "/api/activity?size=10&page=1&tab=signins", { as: BOSS })).json();
    assert.deepEqual([p1.total, p1.pages, p1.items.length], [2, 1, 2]);
    const q = await (await call(env, "/api/activity?q=si-1", { as: BOSS })).json();
    assert.deepEqual(q.items.map((/** @type {any} */ i) => i.record), ["SI-1"]);
  });
});

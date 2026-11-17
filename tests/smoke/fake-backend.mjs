// Serves public/ and fakes the worker's API, using the same auth errors as src/worker.js. An endpoint
// it doesn't know gets a 404, which fails the smoke test, so it can't hide a new call.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { seedData } from "./seed-data.mjs";
import { RECON_AREAS, RECON_CHECKS, mergeDifferences, runRecon } from "../../src/recon.js";
import { preferencesFromRow, preferencePatchColumns, resolveNotificationSettings, notificationSettingPatch, profilePatch, passwordAge } from "../../src/account.js";

const port = Number(process.argv[2] || 8799);
const seedScale = Number(process.argv[3] || 0);
const root = fileURLToPath(new URL("../../public/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const fakeToken = (role, expiresInSeconds = 3600) => `${b64({ alg: "none" })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.fake`;
const claims = (token) => { try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url")); } catch { return null; } };
const roleFromEmail = (email) => ({ superadmin: "Superadmin", ceo: "CEO", admin: "Admin", accounting: "Accounting", sales: "Sales", logistics: "Logistics" })[String(email).split("@")[0]] || "Superadmin";
const ROLE_MODULES = {
  Logistics: ["dashboard", "calendar", "inventory", "purchase-orders"],
  Accounting: ["dashboard", "calendar", "sales", "invoicing", "collections", "receivables-tracker", "payables", "replenishments", "reports"],
  Sales: ["dashboard", "calendar", "analytics", "inventory", "item-forecast", "purchase-orders", "sales", "client-invoices"],
};
const userFor = (role) => ({
  id: `fake-${role}`, name: `Fake ${role}`, email: `${role.toLowerCase()}@medlane.test`, role, branch: "Las Pinas", phone: "",
  modules: ROLE_MODULES[role] || [], customPermissions: { enabled: false, view: [], edit: [] }, passwordKycDue: false, themePreference: "dark",
});
const newSession = (role) => ({ access_token: fakeToken(role), refresh_token: `refresh-${role}`, app_session_id: "00000000-0000-4000-8000-000000000001" });
const readBody = async (req) => { let text = ""; for await (const chunk of req) text += chunk; try { return JSON.parse(text); } catch { return {}; } };

// Recon runs the real checks (src/recon.js) over the seed data, so the page shows real results.
const reconRuns = [];
let reconDiffs = [];
const reconRun = (role, only) => {
  const startedAt = new Date().toISOString();
  const { results, rows, recordsChecked } = runRecon(seedData(seedScale), { now: new Date(), only: only ? [only] : undefined });
  const changed = mergeDifferences(reconDiffs.filter((diff) => !only || diff.check === only), rows, results, startedAt);
  const ids = new Set(changed.map((diff) => diff.id));
  reconDiffs = [...reconDiffs.filter((diff) => !ids.has(diff.id)), ...changed];
  const run = { id: `RUN-${startedAt}`, startedAt, durationMs: 1200, trigger: only ? "check" : "manual", by: `Fake ${role}`, recordsChecked, checks: Object.keys(results).length, results };
  reconRuns.unshift(run);
  return run;
};
const reconOverview = (role) => {
  if (!reconRuns.length) reconRun(role);
  const latest = {};
  for (const run of reconRuns) for (const [id, result] of Object.entries(run.results)) if (!latest[id]) latest[id] = { ...result, runAt: run.startedAt };
  return {
    checks: RECON_CHECKS.map(({ id, area, name, rule }) => ({ id, area, name, rule })), areas: RECON_AREAS, latest,
    runs: reconRuns.map(({ results, ...run }) => run), differences: reconDiffs, settings: { id: "settings", invoiceSeries: [] }, baseline: null,
    stockCounts: [], bankStatements: [], cashCounts: [], canFix: role === "Superadmin", schedule: ["06:00", "18:00"],
  };
};

// Account settings, kept per role for the life of the server (uses the real rules in src/account.js).
const accounts = {};
const accountFor = (role) => (accounts[role] ||= {
  prefsRow: null, settingRows: [], name: `Fake ${role}`, phone: "",
  sessions: [
    { id: "00000000-0000-4000-8000-000000000001", device: "macOS", browser: "Chrome", ipAddress: "127.0.0.1", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true },
    { id: "00000000-0000-4000-8000-000000000002", device: "iPhone", browser: "Safari", ipAddress: "10.0.0.8", createdAt: new Date(Date.now() - 3 * 3600e3).toISOString(), lastSeenAt: new Date(Date.now() - 2 * 3600e3).toISOString(), current: false },
  ],
});
const accountView = (role) => {
  const a = accountFor(role);
  const preferences = preferencesFromRow(a.prefsRow);
  return { preferences, notificationSettings: resolveNotificationSettings(a.settingRows, userFor(role).modules.length ? userFor(role).modules : ["purchase-orders", "inventory", "collections", "product-issues", "reconciliation"]), passwordAge: passwordAge(preferences.passwordChangedAt || new Date(Date.now() - 84 * 86400e3).toISOString(), null) };
};
const accountRoutes = {
  "GET /api/account": (role) => ({ ...accountView(role), sessions: accountFor(role).sessions }),
  "PATCH /api/account/preferences": (role, body) => { const a = accountFor(role); a.prefsRow = { ...(a.prefsRow || {}), ...preferencePatchColumns(body, { branches: null }) }; return { ok: true, preferences: accountView(role).preferences }; },
  "PATCH /api/account/profile": (role, body) => { const a = accountFor(role); const p = profilePatch(body); a.name = p.fullName; a.phone = p.phone; a.prefsRow = { ...(a.prefsRow || {}), display_name: p.displayName }; return { ok: true, name: p.fullName, phone: p.phone, displayName: p.displayName }; },
  "PUT /api/account/notification-settings": (role, body) => {
    const a = accountFor(role); const c = notificationSettingPatch(body, ["purchase-orders", "inventory", "collections", "product-issues", "reconciliation"]);
    const cur = accountView(role).notificationSettings.find((x) => x.type === c.type);
    a.settingRows = [...a.settingRows.filter((r) => r.alert_type !== c.type), { alert_type: c.type, in_app: c.channel === "inApp" ? c.value : cur.inApp, email: c.channel === "email" ? c.value : cur.email }];
    return { ok: true, notificationSettings: accountView(role).notificationSettings };
  },
  "POST /api/account/sessions/revoke": (role, body) => { const a = accountFor(role); const before = a.sessions.length; a.sessions = a.sessions.filter((x) => x.current || x.id !== body?.sessionId); return { ok: true, revoked: before - a.sessions.length }; },
  "POST /api/account/sessions/revoke-others": (role) => { const a = accountFor(role); const before = a.sessions.length; a.sessions = a.sessions.filter((x) => x.current); return { ok: true, revoked: before - a.sessions.length }; },
};

const authedRoutes = {
  ...accountRoutes,
  "GET /api/recon": (role) => reconOverview(role),
  "POST /api/recon/run": (role, body) => { const run = reconRun(role, body?.check); return { ...reconOverview(role), run }; },
  "GET /api/auth/me": (role) => ({ user: userFor(role) }),
  "GET /api/modules/state": () => ({ data: seedData(seedScale), revision: 1, changesCursor: "cursor-1", pagination: {} }),
  "PUT /api/modules/state": () => ({ revision: 2 }),
  "POST /api/modules/records": () => ({ revision: 2 }),
  "GET /api/modules/changes": () => ({ rows: [], cursor: "cursor-2" }),
  "GET /api/users": (role) => ({ users: [userFor(role)] }),
  "GET /api/files": () => ({ files: [] }),
  "GET /api/logs": () => ({ entries: [], nextCursor: null }),
  "GET /api/logs/summary": () => ({ days: 7, total: 0, today: 0, failedSignIns: 0, prevSensitive: 0, byDay: [], byModule: [], byUser: [], sensitive: [], afterHours: [], signins: [], truncated: false }),
  "POST /api/logs": () => ({ ok: true }),
  "GET /api/backups": () => ({ backups: [] }),
  "GET /api/backups/status": () => ({ latest: null, ageHours: null, stale: true, message: "Fake backend" }),
  "GET /api/backups/objects": () => ({ objects: [], cursor: null }),
  "GET /api/storage/usage": () => ({ configured: true, usedBytes: 100, objectCount: null, truncated: false, maxBytes: 1000, remainingBytes: 900 }),
  "GET /api/auth/sessions": () => ({ sessions: [] }),
  "GET /api/reports": () => ({ reports: [] }),
  "GET /api/game/leaderboard": () => ({ entries: [] }),
  "GET /api/game/me": () => ({ score: null }),
};

// Compressed like production, so transfer sizes and timings mean something.
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "content-encoding": "gzip" }); res.end(gzipSync(JSON.stringify(body))); };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/auth/login") {
      const { email } = await readBody(req);
      const role = roleFromEmail(email);
      return send(res, 200, { session: newSession(role), user: userFor(role) });
    }
    if (pathname === "/api/auth/refresh") {
      const { refreshToken } = await readBody(req);
      const role = String(refreshToken).replace("refresh-", "");
      if (!refreshToken || refreshToken === "refused") return send(res, 401, { error: "Invalid Refresh Token" });
      return send(res, 200, { session: newSession(role), user: userFor(role) });
    }
    if (pathname === "/api/version") return send(res, 200, { version: "smoke" });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return send(res, 401, { error: "Authentication required" });
    const claim = claims(token);
    if (!claim || claim.exp * 1000 <= Date.now()) return send(res, 401, { error: "Invalid or expired session" });
    const reconAction = /^\/api\/recon\/differences\/([^/]+)\/(fix|undo|explain|reopen|assign)$/.exec(pathname);
    if (req.method === "POST" && reconAction) {
      const body = await readBody(req);
      const id = decodeURIComponent(reconAction[1]);
      const at = new Date().toISOString();
      const by = `Fake ${claim.role}`;
      reconDiffs = reconDiffs.map((diff) => {
        if (diff.id !== id) return diff;
        const action = reconAction[2];
        const status = { fix: "fixed", undo: "open", explain: "explained", reopen: "open", assign: diff.status }[action];
        const label = { fix: `Fixed: ${diff.fix?.label || "fix"}`, undo: "Fix undone", explain: "Marked as explained", reopen: "Explanation withdrawn", assign: "Assigned" }[action];
        return { ...diff, status, ...(action === "fix" ? { fixedAt: at, fixedBy: by, appliedChanges: (diff.fix?.preview || []).map(([field, change]) => ({ field, from: String(change).split(" → ")[0], to: String(change).split(" → ")[1] })), undo: [] } : {}), ...(action === "explain" ? { explainedAt: at, explainedBy: by, note: body.note } : {}), ...(action === "assign" ? { assignedTo: body.assignee, assignedBy: by, assignedAt: at } : {}), history: [{ at, action: label, by, note: body.note || "" }, ...(diff.history || [])] };
      });
      return send(res, 200, { difference: reconDiffs.find((diff) => diff.id === id) });
    }
    if (req.method === "POST" && /^\/api\/recon\/(settings|stock-counts|bank-statements|cash-counts)$/.test(pathname)) { await readBody(req); return send(res, 200, { ok: true }); }
    const route = authedRoutes[`${req.method} ${pathname}`];
    if (!route) return send(res, 404, { error: `Fake backend has no ${req.method} ${pathname}` });
    try {
      return send(res, 200, route(claim.role, ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : undefined));
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }
  let file = join(root, decodeURIComponent(pathname));
  try { if (!(await stat(file)).isFile()) throw new Error("not a file"); } catch { file = join(root, "index.html"); }
  const type = TYPES[extname(file)] || "application/octet-stream";
  const content = await readFile(file);
  const compress = /text|javascript|json|svg/.test(type);
  res.writeHead(200, { "content-type": type, "cache-control": "no-store", ...(compress ? { "content-encoding": "gzip" } : {}) });
  res.end(compress ? gzipSync(content) : content);
}).listen(port, "127.0.0.1");

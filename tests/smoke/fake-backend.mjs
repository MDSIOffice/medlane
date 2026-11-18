// Serves public/ and fakes the worker's API, using the same auth errors as src/worker.js. An endpoint
// it doesn't know gets a 404, which fails the smoke test, so it can't hide a new call.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { seedData } from "./seed-data.mjs";
import { RECON_AREAS, RECON_CHECKS, mergeDifferences, runRecon } from "../../src/recon.js";
import { generateNotices, planFanOut, notificationPage, rowInTab } from "../../src/notifications.js";
import { activityRowsInOrder, activityScope, activityPage as activityPageOf, activityTab, activitySearchTerm, ACTIVITY_TABS, ACTIVITY_TAB_KINDS } from "../../src/activity.js";
import { preferencesFromRow, preferencePatchColumns, resolveNotificationSettings, notificationSettingPatch, profilePatch, passwordAge } from "../../src/account.js";

const port = Number(process.argv[2] || 8799);
const seedScale = Number(process.argv[3] || 0);
const root = fileURLToPath(new URL("../../public/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const fakeToken = (role, expiresInSeconds = 3600) => `${b64({ alg: "none" })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.fake`;
const claims = (token) => { try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url")); } catch { return null; } };
const roleFromEmail = (email) => ({ superadmin: "Superadmin", ceo: "CEO", admin: "Admin", accounting: "Accounting", sales: "Sales", logistics: "Logistics", engineering: "Engineering" })[String(email).split("@")[0]] || "Superadmin";
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

// Notifications, per role for the life of the server: the seed's standing alerts plus a few
// hand-made ones over the last week, fanned out with the real rules in src/notifications.js.
const noticeRows = {};
const noticesFor = (role) => {
  if (noticeRows[role]) return noticeRows[role];
  const user = userFor(role);
  const a = accountFor(role);
  const modules = user.modules?.length ? user.modules : ["purchase-orders", "inventory", "collections", "product-issues", "reconciliation", "receivables-tracker", "payables", "replenishments", "invoicing", "warranty"];
  const person = { id: role, email: user.email, role, modules, settings: resolveNotificationSettings(a.settingRows, modules), prefs: preferencesFromRow(a.prefsRow) };
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const manual = [
    { id: "NTF-demo-1", type: "Demo request approved", message: "DR-0142 for St. Luke's Global City was approved — ready for dispatch.", section: "inventory", createdAt: ago(0.5) },
    { id: "NTF-sign-in", type: "New sign-in", message: "Signed in on Safari on iPhone from a new device.", targetUser: user.email, createdAt: ago(2) },
    { id: "NTF-po-9", type: "New PO", message: "PO-2026-0911 from Asian Hospital needs invoicing.", section: "invoicing", audience: ["Accounting", "Superadmin", "CEO"], createdAt: ago(26) },
    { id: "NTF-exp-3", type: "Expense request", message: "EXP-0388 (₱18,450 fuel and tolls) is waiting for approval.", section: "replenishments", createdAt: ago(50) },
    { id: "NTF-ticket", type: "Support ticket", message: "Ticket PI-0057 (centrifuge noise, Naga) passed to Engineering.", section: "product-issues", createdAt: ago(80) },
    { id: "NTF-memo", type: "Memo", message: "Holiday schedule for December has been posted.", section: "memos", createdAt: ago(200) },
  ];
  const plan = planFanOut([...generateNotices(seedData(seedScale), new Date()), ...manual], [person], new Map([[role, new Map([["seed", { message: "", record: "", title: "" }]])]]), new Date());
  return (noticeRows[role] = plan.inserts.map((row, i) => ({ ...row, created_at: row.notice_id.startsWith("GEN-") ? ago(i * 7 + 0.2) : row.created_at, read_at: i % 3 === 2 ? ago(0) : null })));
};

// Activity log: a week of realistic entries run through the real classifier (src/activity.js).
let activityRows = null;
const activityAll = () => {
  if (activityRows) return activityRows;
  const people = [["Fake Superadmin", "Superadmin", "superadmin"], ["Joy Santos", "Accounting", "accounting"], ["Ana Cruz", "Sales", "sales"], ["Ramon Dela Cruz", "Logistics", "logistics"]];
  const h = (n) => new Date(Date.now() - n * 3600e3).toISOString();
  const steps = [
    [0, 0.2, "Signed in", "Authentication", "superadmin@medlane.test", { event: "signin", browser: "Chrome", device: "macOS" }],
    [1, 0.5, "Approved payable", "Payables", "PAY-2026-0142", { changes: [{ field: "Status", from: "For Approval", to: "Approved" }] }],
    [2, 0.8, "Created sales invoice", "Invoicing", "SI-0004812", {}],
    [2, 1.1, "Exported clients CSV", "Masterlists", "Clients (214 rows)", {}],
    [3, 1.6, "Stock adjusted", "Inventory", "MDX-CRP-500 · LOT 24B117", { changes: [{ field: "Qty", from: "40", to: "36" }] }],
    [1, 2.4, "Edited collection", "Collections", "OR-77310", { changes: [{ field: "Amount", from: "₱48,000.00", to: "₱84,000.00" }, { field: "Bank", from: "BDO", to: "Metrobank" }] }],
    [2, 3.2, "Signed in", "Authentication", "sales@medlane.test", { event: "signin", browser: "Safari", device: "iPhone" }],
    [0, 5, "Changed role", "Users", "logistics@medlane.test", { changes: [{ field: "Role", from: "Logistics", to: "Admin" }] }],
    [1, 7, "Voided invoice", "Invoicing", "SI-0004790", {}],
    [3, 20, "Received transfer", "Inventory", "TR-0311 · Naga", {}],
    [2, 26, "Signed in", "Authentication", "sales@medlane.test", { event: "signin", browser: "Chrome", device: "Windows" }],
    [1, 30, "Downloaded report", "Reports", "Collections & AR", {}],
    [0, 49, "Edited client", "Masterlists", "St. Luke's Medical Center", { changes: [{ field: "Terms", from: "30", to: "45" }] }],
  ];
  const sources = steps.slice().reverse().map(([who, hours, action, module, record, extra], i) => {
    const [user, role, key] = people[who];
    return { record_key: `logs-${i}`, state_key: "production", updated_by: key, updated_at: h(hours), data: { user, role, action, module, record, browser: ["Chrome", "Edge", "Safari", "Chrome"][who], device: ["macOS", "Windows", "macOS", "Android"][who], location: ["Makati City, Metro Manila", "Makati City, Metro Manila", "Naga, Bicol", "Cebu City, Central Visayas"][who], ipAddress: "203.177.12.4", serverCapturedAt: h(hours), ...extra } };
  });
  // Ana's earlier sign-in history, so the iPhone one reads as a new device.
  sources.unshift({ record_key: "logs-old", state_key: "production", updated_by: "sales", updated_at: h(60), data: { user: "Ana Cruz", role: "Sales", action: "Signed in", event: "signin", module: "Authentication", record: "sales@medlane.test", browser: "Chrome", device: "Windows", serverCapturedAt: h(60) } });
  activityRows = activityRowsInOrder(sources).map((row, i) => ({ ...row, id: i + 1 }));
  return activityRows;
};
const activityFor = (role, url) => {
  const scope = activityScope({ id: role.toLowerCase(), role });
  const tab = activityTab(url.searchParams.get("tab") || "all");
  const user = scope.all ? url.searchParams.get("user") || "" : "";
  const term = activitySearchTerm(url.searchParams.get("q") || "").toLowerCase();
  const mine = activityAll().filter((row) => scope.all || row.user_id === role.toLowerCase()).filter((row) => !user || row.actor === user)
    .filter((row) => !term || [row.actor, row.action, row.record, row.module].some((v) => String(v).toLowerCase().includes(term)));
  const inTab = (row, key) => key === "all" || (key === "flagged" ? Boolean(row.flag_reason) : ACTIVITY_TAB_KINDS[key].includes(row.kind));
  const rows = mine.filter((row) => inTab(row, tab)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const size = [10, 25, 50].includes(Number(url.searchParams.get("size"))) ? Number(url.searchParams.get("size")) : 25;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), pages);
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) + "T00:00:00+08:00").toISOString();
  return {
    ...activityPageOf(rows.slice((page - 1) * size, page * size), rows.length, { page, size }), tab,
    counts: Object.fromEntries(ACTIVITY_TABS.map((key) => [key, mine.filter((row) => inTab(row, key)).length])),
    stats: { actionsToday: mine.filter((r) => r.created_at >= today && r.kind !== "signin").length, signInsToday: mine.filter((r) => r.created_at >= today && r.kind === "signin").length, flagged7d: mine.filter((r) => r.flag_reason).length },
    scope: { ...scope, user },
  };
};

const authedRoutes = {
  ...accountRoutes,
  "GET /api/activity": (role, _body, url) => activityFor(role, url),
  "GET /api/calendar/feed": () => ({ enabled: false, url: "" }),
  "POST /api/calendar/feed": () => ({ enabled: true, url: "http://127.0.0.1/api/calendar/feed/u.0a1b2c3d.sig.ics", createdAt: new Date().toISOString() }),
  "DELETE /api/calendar/feed": () => ({ enabled: false, url: "" }),
  "GET /api/support/engineers": () => ({ engineers: [{ id: "eng-1", email: "engineering@medlane.test", name: "Engineer 1", branch: "Las Pinas" }, { id: "eng-2", email: "engineer2@medlane.test", name: "Engineer 2", branch: "Naga" }, { id: "aps-1", email: "aps@medlane.test", name: "Pia Santos", branch: "Naga", role: "Product Specialist" }] }),
  "GET /api/notifications": (role, _body, url) => notificationPage(noticesFor(role), { tab: url.searchParams.get("tab") || "all", page: Number(url.searchParams.get("page") || 1), size: Number(url.searchParams.get("size") || 10) }),
  "GET /api/notifications/unread": (role) => ({ unread: noticesFor(role).filter((row) => row.in_app && !row.read_at).length }),
  "POST /api/notifications/read": (role, body) => {
    const rows = noticesFor(role).filter((row) => (body?.ids || []).includes(row.notice_id));
    rows.forEach((row) => { row.read_at = body?.read === false ? null : new Date().toISOString(); });
    return { ok: true, changed: rows.length };
  },
  "POST /api/notifications/read-all": (role, body) => {
    const rows = noticesFor(role).filter((row) => row.in_app && !row.read_at && rowInTab(row, body?.tab || "all"));
    rows.forEach((row) => { row.read_at = new Date().toISOString(); });
    return { ok: true, changed: rows.length };
  },
  "GET /api/recon": (role) => reconOverview(role),
  "POST /api/recon/run": (role, body) => { const run = reconRun(role, body?.check); return { ...reconOverview(role), run }; },
  "GET /api/auth/me": (role) => ({ user: { ...userFor(role), ...accountView(role) } }),
  "GET /api/modules/state": () => ({ data: seedData(seedScale), revision: 1, changesCursor: "cursor-1", pagination: {} }),
  "PUT /api/modules/state": () => ({ revision: 2 }),
  // Same answer shape as the real Worker.
  "POST /api/modules/records": (_role, body) => ({ ok: true, savedRecords: Object.values(body?.records || {}).flat().length, revision: 2 }),
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
  "GET /api/game/score/me": () => ({ best: 0, badge: null, totalXp: 0, level: 1, xpToNextLevel: 100, skin: "classic" }),
};

// Compressed like production, so transfer sizes and timings mean something.
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "content-encoding": "gzip" }); res.end(gzipSync(JSON.stringify(body))); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const { pathname } = url;
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/auth/login") {
      const { email } = await readBody(req);
      const role = roleFromEmail(email);
      return send(res, 200, { session: newSession(role), user: { ...userFor(role), ...accountView(role) } });
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
      return send(res, 200, route(claim.role, ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : undefined, url));
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

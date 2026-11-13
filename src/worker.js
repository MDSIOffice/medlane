/** @typedef {{ content?: string, embeds?: any[], allowedMentions?: any, wait?: boolean }} DiscordOptions */
import { DurableObject } from "cloudflare:workers";
import { collectSample, collectLiveDetails, buildWeeklyReport, hasAccessToken } from "./perf-report.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

// Cache busting: every deploy gets a new version id, which the HTML pages stamp onto their script,
// stylesheet and landing-image URLs (and expose as data-asset-version for the inline script loader).
// Those paths are served with a one-year immutable cache (public/_headers), so a deploy is picked up
// at once while repeat visits skip the download. No build step to forget: the worker does it per page.
const VERSIONED_ASSET = /^\/?(scripts\/|styles\.css|assets\/landing\/)/;
/** @param {Response} page @param {WorkerEnv} env */
function stampAssetUrls(page, env) {
  const version = String(env.CF_VERSION_METADATA?.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 12);
  if (!version) return page;
  /** @param {string} attr */
  const stamp = (attr) => ({
    /** @param {Element} element */
    element(element) {
      const value = element.getAttribute(attr) || "";
      if (VERSIONED_ASSET.test(value) && !value.includes("?")) element.setAttribute(attr, `${value}?v=${version}`);
    },
  });
  return new HTMLRewriter()
    .on("html", { element(element) { element.setAttribute("data-asset-version", version); } })
    .on("script[src]", stamp("src"))
    .on("link[href]", stamp("href"))
    .on("img[src]", stamp("src"))
    .transform(page);
}

/** @type {Record<AppRole, string[]>} */
const roleModules = {
  Superadmin: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  CEO: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  // Admin: everything except Users and Backup.
  Admin: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "settings", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  // Accounting sees Inventory read-only (ROLE_VIEW_ONLY_DEFAULTS). Masterlists isn't a default but
  // can still be granted per user from the Users page when they need it.
  Accounting: ["dashboard", "inventory", "purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "payables", "replenishments", "imports", "print-templates", "notifications", "user-settings"],
  // Sales: Analytics is scoped to their assigned clients; Inventory is view + request demo only (DEMO_ONLY_ROLES).
  Sales: ["dashboard", "analytics", "inventory", "purchase-orders", "sales", "client-invoices", "notifications", "user-settings"],
  Logistics: ["dashboard", "inventory", "notifications", "user-settings"],
  "Product Specialist": ["dashboard", "inventory", "notifications", "user-settings", "product-issues"],
  Engineering: ["dashboard", "inventory", "notifications", "user-settings", "product-issues"],
  HR: ["dashboard", "analytics", "masterlists", "replenishments", "reports", "notifications", "user-settings"],
};
// Every role can view memos (audience targeting is enforced per-memo, not per-module); only
// requireMemoAdmin() gates who may post one.
Object.values(roleModules).forEach((modules) => modules.push("memos"));

// Modules a role may never see, even if an admin granted them in per-user module_permissions
// (profileForUser strips them). Logistics has no business in the audit trail or support tracker.
/** @type {Partial<Record<AppRole, string[]>>} */
const ROLE_BLOCKED_MODULES = {
  Logistics: ["logs", "product-issues"],
};
// Engineering and Product (Application) Specialists use Inventory only to file demo requests:
// they keep read access to stock (for lot/serial pickers) but can write nothing in the
// inventory group except inventoryDemoRequests. Enforced in canAccessKey().
/** @type {AppRole[]} */
const DEMO_ONLY_ROLES = ["Engineering", "Product Specialist", "Sales"];
// Modules a role gets as view-only by default (no per-user module_permissions rows). A per-user
// grant on the Users page can still give edit access.
/** @type {Partial<Record<AppRole, string[]>>} */
const ROLE_VIEW_ONLY_DEFAULTS = {
  Accounting: ["inventory"],
};
/** @param {string | undefined} role @param {string[]} modules */
function withoutViewOnlyDefaults(role, modules) {
  const viewOnly = ROLE_VIEW_ONLY_DEFAULTS[/** @type {AppRole} */ (role)] || [];
  return viewOnly.length ? modules.filter((module) => !viewOnly.includes(module)) : modules;
}
/** @type {AppRole[]} */
const DEMO_REQUESTER_ROLES = [...DEMO_ONLY_ROLES, "Superadmin", "CEO"];

const DISCORD_ROLE_IDS = {
  nagaTeam: "1356861232480780421",
  lpTeam: "1356901352487391233",
  Accounting: "1356901581030690986",
  Engineering: "1356901760442040390",
  Sales: "1356901905372151839",
  Logistics: "1382979208883732500",
  "Product Specialist": "1527546344477036544",
};

/** @type {Record<string, any>} */
const digestRoleMentions = {
  Accounting: [DISCORD_ROLE_IDS.Accounting],
  Sales: [DISCORD_ROLE_IDS.Sales],
  Logistics: [DISCORD_ROLE_IDS.Logistics],
  "Product Specialist": [DISCORD_ROLE_IDS["Product Specialist"]],
  Engineering: [DISCORD_ROLE_IDS.Engineering],
  Superadmin: [DISCORD_ROLE_IDS.Accounting, DISCORD_ROLE_IDS.lpTeam, DISCORD_ROLE_IDS.nagaTeam].filter(Boolean),
  CEO: [DISCORD_ROLE_IDS.Accounting, DISCORD_ROLE_IDS.lpTeam, DISCORD_ROLE_IDS.nagaTeam].filter(Boolean),
};

const moduleRecordKeys = {
  users: ["users"],
  masterlists: ["clients", "items", "suppliers", "employees", "banks", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals", "masterTab"],
  // Read-only baseline every role gets regardless of module_permissions — items/clients/suppliers are
  // reference data other modules (receiving, transfers, demos, invoicing) autofill from, not just data
  // the Masterlists admin screen shows. Stock quantities/lots are included too so invoice creation can
  // show stock hints and lot options for a role (e.g. Accounting) that has no Inventory module access —
  // this key alone does not expose transfers/POs/demo requests/receipts, which stay gated by the real
  // "inventory" permission below. Never granted for "edit": editing the catalog still requires
  // the "masterlists" (or "inventory", for stock) permission itself.
  "catalog-reference": ["items", "clients", "suppliers", "inventory"],
  inventory: ["inventory", "pendingTransfers", "transferHistory", "inventoryPurchaseOrders", "inventoryDemoRequests", "stockReceipts"],
  "purchase-orders": ["purchaseOrders"],
  invoicing: ["sales", "pendingCreditInvoices"],
  sales: ["sales"],
  receivables: ["sales", "payments", "collectionContacts", "collectionContactHistory"],
  warranty: ["warranties"],
  history: ["sales", "purchaseOrders", "payments"],
  collections: ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  payables: ["payables"],
  // Budgets and recurring costs sit with Expenses: anyone with Expenses can read them, but only
  // Superadmin/CEO/Admin may change them (canAccessKey).
  replenishments: ["replenishments", "expenseBudgets", "recurringCosts"],
  imports: ["imports"],
  reports: ["reports"],
  reconciliation: ["reconHistory"],
  security: ["notifications"],
  settings: ["branch", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  system: ["branch", "notifications", "imports", "reconHistory"],
  "product-issues": ["productIssues"],
  "print-templates": ["printTemplates"],
  memos: ["memos"],
  // Shared team schedule: every role views and adds events (granted in profileForUser);
  // only an event's creator (or Superadmin/CEO) changes it — assertCalendarEventChangesAllowed.
  calendar: ["calendarEvents"],
};

/** Expense budgets / recurring costs: Superadmin, CEO and Admin set them; other Expenses users only read them. */
const EXPENSE_PLANNING_KEYS = ["expenseBudgets", "recurringCosts"];
const persistedKeys = [...new Set(Object.values(moduleRecordKeys).flat())];
const genericStateBlockedKeys = new Set(["users", "branch", "masterTab"]);
const defaultSeedSignature = { clients: 2, items: 4, suppliers: 3, employees: 1, banks: 2 };

/** @param {any} data @param {Record<string, any>} [init] */
function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function shortDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** @type {Record<string, any>} */
const poNextStatus = { Approved: "Sent to Supplier", "Sent to Supplier": "In Transit", "In Transit": "For Receiving" };
const poCancellableStatuses = ["Approved", "Sent to Supplier", "In Transit", "For Receiving", "Partially Received"];
function poTimestamp() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}

/** @param {WorkerEnv} env */
function appStateKey(env) {
  return env.APP_STATE_KEY || env.ENVIRONMENT || "production";
}

/** @param {WorkerEnv} env */
function supabaseBaseUrl(env) {
  return new URL(env.SUPABASE_URL).origin;
}

function methodNotAllowed() {
  return json({ error: "Method not allowed" }, { status: 405 });
}

/** @param {any} value */
async function shortHash(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** @param {WorkerEnv} env @param {any} keys */
function requireEnv(env, keys) {
  const missing = keys.filter((/** @type {any} */ key) => !env[key]);
  if (missing.length) throw new Error(`Missing Worker secret/var: ${missing.join(", ")}`);
}

/** @param {WorkerEnv} env @param {string} [token] */
function supabaseHeaders(env, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

// The public custom domain. Every link we put in an email (invites, password resets, digests)
// must point here, never at the production workers.dev hostname — an admin who happens to be
// using the workers.dev URL would otherwise stamp it into every invite they send.
const PUBLIC_APP_ORIGIN = "https://medlanesolutions.com";
const PRODUCTION_WORKERS_DEV_HOST = "medlane.tofllorin.workers.dev";

/** @param {Request} request */
function requestOrigin(request) {
  const url = new URL(request.url);
  return url.hostname === PRODUCTION_WORKERS_DEV_HOST ? PUBLIC_APP_ORIGIN : url.origin;
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseFetchOnce(env, path, init = {}) {
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Supabase request failed: ${response.status}`);
  return payload;
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseFetch(env, path, init = {}) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const result = await supabaseFetchWithRetry(env, path, init);
  const modules = liveModulesForWrite(path, init);
  if (modules.length) {
    // Someone just saved: the next full load must read fresh data, not a shared snapshot.
    stateSnapshots.clear();
    await notifyLiveClients(env, modules);
  }
  return result;
}

/** @param {WorkerEnv} env @param {string} path @param {any} init */
async function supabaseFetchWithRetry(env, path, init) {
  try {
    return await supabaseFetchOnce(env, path, init);
  } catch (/** @type {any} */ error) {
    // Supabase occasionally rejects our service-role JWT for a moment when its clock and the
    // Worker's clock drift apart ("JWT issued at future" / "nbf" / "not active") — never a
    // real auth problem, just transient skew that clears itself within a second or two. Retry
    // once instead of failing whatever scheduled task happened to be mid-request.
    if (!isTransientJwtClockSkew(error)) throw error;
    await sleep(1500);
    return supabaseFetchOnce(env, path, init);
  }
}

// ---- Live updates (instant, push-based) ------------------------------------------------------
// Every successful write to app_records pings the LiveHub Durable Object with just the module
// names that changed; LiveHub fans that tiny message out to every connected tab over a hibernated
// WebSocket, and each tab then pulls the actual rows through /api/modules/changes (which applies
// the user's view permissions). No record data ever travels over the socket.
/** @param {string} path @param {any} init */
function liveModulesForWrite(path, init) {
  if (!String(path).startsWith("/rest/v1/app_records")) return [];
  const method = String(init?.method || "GET").toUpperCase();
  if (!["POST", "PATCH", "DELETE"].includes(method)) return [];
  let modules = [];
  if (method === "POST") {
    try {
      const body = JSON.parse(init.body || "[]");
      modules = (Array.isArray(body) ? body : [body]).map((row) => row?.module_name).filter(Boolean);
    } catch { modules = []; }
  } else {
    const match = /[?&]module_name=eq\.([^&]+)/.exec(path);
    if (match) modules = [decodeURIComponent(match[1])];
  }
  return [...new Set(modules)].filter((module) => !NON_STATE_MODULES.includes(module));
}

/** @param {WorkerEnv} env @param {any} modules */
async function notifyLiveClients(env, modules) {
  if (!env.LIVE_HUB || !modules.length) return;
  try {
    const stub = env.LIVE_HUB.get(env.LIVE_HUB.idFromName(appStateKey(env)));
    await stub.fetch("https://live-hub/notify", { method: "POST", body: JSON.stringify({ modules }) });
  } catch (/** @type {any} */ error) {
    // Live push is best-effort; clients still catch up through their fallback poll.
    console.warn(JSON.stringify({ message: "Live notify failed", error: error.message }));
  }
}

const LOGIN_THROTTLE_WINDOW_MS = 5 * 60 * 1000;
// Per account: 10 wrong passwords in 5 minutes locks only that account (brute-force guard).
const LOGIN_THROTTLE_MAX_FAILS_PER_ACCOUNT = 10;
// Per IP: a whole office shares one public IP, so this limit is deliberately high. It only stops
// one machine guessing across many accounts, never 50-100 staff who mistype now and then.
const LOGIN_THROTTLE_MAX_FAILS_PER_IP = 100;

// Our own brute-force guard for /api/auth/login. Supabase only sees the Worker's egress IPs, so
// its per-IP limits can't tell users apart. Two counters: per account (reset when that account
// signs in) and per IP (never reset by a success, so one valid login can't wipe an attacker's
// count). Fails open: a throttle outage must never lock everyone out of the app.
/** @param {WorkerEnv} env @param {Request} request @param {string} action @param {string} [email] */
async function loginThrottle(env, request, action, email = "") {
  const ip = clientIp(request);
  const account = String(email || "").trim().toLowerCase();
  if (!env.LIVE_HUB) return { blocked: false, retryAfter: 0 };
  /** @type {Array<[string, number, string]>} */
  const counters = [];
  if (account) counters.push([`login-throttle-account:${account}`, LOGIN_THROTTLE_MAX_FAILS_PER_ACCOUNT, action]);
  // A successful login resets only that account's counter.
  if (ip) counters.push([`login-throttle:${ip}`, LOGIN_THROTTLE_MAX_FAILS_PER_IP, action === "reset" ? "check" : action]);
  try {
    const results = await Promise.all(counters.map(async ([name, max, counterAction]) => {
      const stub = env.LIVE_HUB.get(env.LIVE_HUB.idFromName(name));
      const response = await stub.fetch(`https://live-hub/login-throttle/${counterAction}?max=${max}`, { method: "POST" });
      return /** @type {{ blocked: boolean, retryAfter: number }} */ (await response.json());
    }));
    const blocked = results.filter((result) => result.blocked);
    return { blocked: blocked.length > 0, retryAfter: Math.max(0, ...blocked.map((result) => Number(result.retryAfter) || 0)) };
  } catch (error) {
    console.warn(JSON.stringify({ message: "Login throttle unavailable", error: error instanceof Error ? error.message : String(error) }));
    return { blocked: false, retryAfter: 0 };
  }
}

// ---- Stock concurrency ----------------------------------------------------------------------
// The browser works out a stock row's new qty itself and saves the final number. Two people
// moving the same lot at once would each save "100 - 10 = 90" and one deduction would vanish.
// So every inventory row the server hands out carries `_stockBase` = {key, qty} as stored at that
// moment; on save the server applies the browser's CHANGE (qty - base) on top of what is stored
// NOW, and stock-touching saves run one at a time (withStockLock) so that read+write is atomic.
// `_stockBase` is never stored. A row without one (older tab, brand-new lot) is saved as-is.
const STOCK_LOCK_LEASE_MS = 20_000;
const STOCK_LOCK_WAIT_MS = 20_000;

/** @template T @param {string} moduleName @param {string} recordKey @param {T} recordData @returns {T} */
function withStockBase(moduleName, recordKey, recordData) {
  if (moduleName !== "inventory" || !recordData || typeof recordData !== "object" || Array.isArray(recordData)) return recordData;
  const stockData = /** @type {Record<string, unknown>} */ (recordData);
  return /** @type {T} */ ({ ...stockData, _stockBase: { key: recordKey, qty: Number(stockData.qty || 0) } });
}

/** @param {AppRecordRow} row */
function withStockBaseRow(row) {
  return row.module_name === "inventory" ? { ...row, data: withStockBase(row.module_name, row.record_key, row.data) } : row;
}

// Strips `_stockBase` from incoming inventory rows (it must never be stored or trip the
// field-by-field guards) and returns record_key -> base qty for rows whose marker belongs to
// that same record (a row copied to another branch/lot carries a foreign key and is ignored).
/** @param {AppRecordRow[]} rows @returns {Map<string, number>} */
function takeStockBases(rows) {
  /** @type {Map<string, number>} */
  const bases = new Map();
  for (const row of rows) {
    if (row.module_name !== "inventory" || !row.data || typeof row.data !== "object" || !("_stockBase" in row.data)) continue;
    const { _stockBase, ...rest } = /** @type {Record<string, unknown>} */ (row.data);
    const marker = /** @type {{ key?: unknown, qty?: unknown } | null | undefined} */ (_stockBase);
    row.data = rest;
    if (marker && marker.key === row.record_key && Number.isFinite(Number(marker.qty))) bases.set(row.record_key, Number(marker.qty));
  }
  return bases;
}

/** @param {number} value */
function roundStockQty(value) {
  return Math.round(value * 10000) / 10000;
}

// Must run inside withStockLock: re-reads the stored qty and applies this save's change on top.
/** @param {WorkerEnv} env @param {string} stateKey @param {AppRecordRow[]} rows @param {Map<string, number>} bases */
async function rebaseStockRows(env, stateKey, rows, bases) {
  if (!bases.size) return;
  const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&record_key=in.${encodeURIComponent(postgrestIn([...bases.keys()]))}&select=record_key,data`));
  const storedQty = new Map(stored.map((row) => [row.record_key, Number(/** @type {Record<string, unknown>} */ (row.data || {}).qty || 0)]));
  for (const row of rows) {
    if (row.module_name !== "inventory" || !bases.has(row.record_key) || !storedQty.has(row.record_key)) continue;
    const base = /** @type {number} */ (bases.get(row.record_key));
    const current = /** @type {number} */ (storedQty.get(row.record_key));
    if (current === base) continue;
    const recordData = /** @type {Record<string, unknown>} */ (row.data || {});
    const next = roundStockQty(current + (Number(recordData.qty || 0) - base));
    if (next < 0) {
      const label = [recordData.item || recordData.code, recordData.lot && `lot ${recordData.lot}`, recordData.branch].filter(Boolean).join(" · ");
      throw new Error(`Stock changed: ${label || row.record_key} now has only ${current} left (someone else used it while you were working). Reload and redo this change.`);
    }
    row.data = { ...recordData, qty: next };
  }
}

/** @param {AppRecordRow[]} rows @returns {Record<string, number>} */
function savedStockQty(rows) {
  return Object.fromEntries(rows.filter((row) => row.module_name === "inventory").map((row) => [row.record_key, Number(/** @type {Record<string, unknown>} */ (row.data || {}).qty || 0)]));
}

// Runs fn while holding the single stock lock (a LiveHub Durable Object), so stock reads and
// writes from different people can't interleave. Fails open if the lock service is down.
/** @template T @param {WorkerEnv} env @param {string} stateKey @param {() => Promise<T>} fn @returns {Promise<T>} */
async function withStockLock(env, stateKey, fn) {
  /** @type {ReturnType<NonNullable<WorkerEnv["LIVE_HUB"]>["get"]> | null} */
  let stub = null;
  /** @type {string | null} */
  let token = null;
  if (env.LIVE_HUB) {
    try {
      stub = env.LIVE_HUB.get(env.LIVE_HUB.idFromName(`stock-lock:${stateKey}`));
      const response = await stub.fetch("https://live-hub/stock-lock/acquire", { method: "POST" });
      token = (/** @type {{ token: string | null }} */ (await response.json())).token;
    } catch (error) {
      console.warn(JSON.stringify({ message: "Stock lock unavailable", error: error instanceof Error ? error.message : String(error) }));
      stub = null;
    }
    if (stub && !token) throw new Error("Stock is busy: other stock saves are still running. Please try again in a moment.");
  }
  try {
    return await fn();
  } finally {
    if (stub && token) await stub.fetch("https://live-hub/stock-lock/release", { method: "POST", body: JSON.stringify({ token }) }).catch(() => null);
  }
}

// ---- Shared state snapshot ------------------------------------------------------------------
// The full-state load reads every record (megabytes) before trimming. When 50-100 people load at
// once (Monday 8am, or every tab reloading after a deploy) each used to do its own read, and the
// database fell over. Loads arriving within a couple of seconds now share one in-flight read in
// this isolate. Safe because the client catches up from `changesCursor` (the snapshot's own
// newest updated_at) through /api/modules/changes, and any write from this isolate drops it.
const STATE_SNAPSHOT_MAX_AGE_MS = 2000;
/** @typedef {{ trimmedRows: ReturnType<typeof trimPaginatedModuleRows>["rows"], pagination: ReturnType<typeof trimPaginatedModuleRows>["pagination"], changesCursor: string, loadedAt: string, resetAt: Awaited<ReturnType<typeof dataResetAt>> }} StateSnapshot */
/** @type {Map<string, { at: number, promise: Promise<StateSnapshot> }>} */
const stateSnapshots = new Map();

/** @param {WorkerEnv} env @param {string} stateKey @returns {Promise<StateSnapshot>} */
function sharedStateSnapshot(env, stateKey) {
  const hit = stateSnapshots.get(stateKey);
  if (hit && Date.now() - hit.at < STATE_SNAPSHOT_MAX_AGE_MS) return hit.promise;
  // loadedAt is taken before the read, so it never postdates the data it describes.
  const loadedAt = new Date().toISOString();
  const promise = Promise.all([
    supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=not.in.${encodeURIComponent(postgrestIn(NON_STATE_MODULES))}&select=module_name,record_key,data,updated_at&order=updated_at.asc`),
    dataResetAt(env, stateKey),
  ]).then(([rows, resetAt]) => {
    // Ship only what's still open/pending plus the most recent PAGINATED_MODULE_PAGE_SIZE for the
    // modules whose history only ever grows — older closed records come via /api/modules/page.
    // changesCursor is the database's own latest updated_at over the FULL row set, so an edit to
    // an old, trimmed-out record still moves the live-sync cursor and clock skew can't open a gap.
    const { rows: trimmedRows, pagination } = trimPaginatedModuleRows(rows);
    return { trimmedRows, pagination, changesCursor: rows.length ? rows[rows.length - 1].updated_at : new Date().toISOString(), loadedAt, resetAt };
  });
  stateSnapshots.set(stateKey, { at: Date.now(), promise });
  // A failed read must not be handed to the next people who load.
  promise.catch(() => { if (stateSnapshots.get(stateKey)?.promise === promise) stateSnapshots.delete(stateKey); });
  return promise;
}

// ---- Short-lived auth cache -----------------------------------------------------------------
// Every open tab calls /api/modules/changes whenever anyone saves. Re-verifying the login each
// time costs ~4 Supabase round trips, so with 100 people one save meant ~400 extra auth queries.
// Read-only endpoints reuse a verified result for a few seconds (per token + app session).
const AUTH_CACHE_TTL_MS = 15_000;
/** @type {Map<string, { expires: number, value: Awaited<ReturnType<typeof authenticatedProfile>> }>} */
const authCache = new Map();

/** @param {Request} request @param {WorkerEnv} env */
async function authenticatedProfileCached(request, env) {
  const cacheKey = `${request.headers.get("authorization") || ""}|${sessionHeader(request)}|${request.headers.get(PREVIEW_ROLE_HEADER) || ""}`;
  const hit = authCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await authenticatedProfile(request, env);
  if (authCache.size > 500) authCache.clear();
  authCache.set(cacheKey, { expires: Date.now() + AUTH_CACHE_TTL_MS, value });
  return value;
}

export class LiveHub extends DurableObject {
  constructor(/** @type {any} */ ctx, /** @type {any} */ env) {
    super(ctx, env);
    /** @type {{ token: string, expires: number } | null} */
    this.stockLock = null;
    /** @type {Array<(value: unknown) => void>} */
    this.stockWaiters = [];
    // Answered by the runtime itself, without waking this object — keepalives cost nothing.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(/** @type {any} */ request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/login-throttle/") && request.method === "POST") {
      // Per-IP failed-login counter (one object per IP). Only failures count, so many staff
      // behind one office IP signing in successfully never block each other.
      const action = url.pathname.split("/")[2];
      const maxFails = Number(url.searchParams.get("max")) || LOGIN_THROTTLE_MAX_FAILS_PER_ACCOUNT;
      const now = Date.now();
      let fails = /** @type {number[]} */ ((await this.ctx.storage.get("fails")) || []).filter((t) => now - t < LOGIN_THROTTLE_WINDOW_MS);
      if (action === "fail") fails.push(now);
      if (action === "reset") fails = [];
      if (fails.length) await this.ctx.storage.put("fails", fails); else await this.ctx.storage.delete("fails");
      const blocked = fails.length >= maxFails;
      const retryAfter = blocked ? Math.max(1, Math.ceil((fails[0] + LOGIN_THROTTLE_WINDOW_MS - now) / 1000)) : 0;
      return Response.json({ blocked, retryAfter });
    }
    if (url.pathname === "/stock-lock/acquire" && request.method === "POST") {
      // In-memory mutex with a lease: one stock save at a time; waiters are woken on release
      // and re-check every 250ms so an expired lease (crashed request) never wedges the lock.
      const deadline = Date.now() + STOCK_LOCK_WAIT_MS;
      while (this.stockLock && this.stockLock.expires > Date.now()) {
        if (Date.now() >= deadline) return Response.json({ token: null });
        await new Promise((resolve) => { this.stockWaiters.push(resolve); setTimeout(resolve, 250); });
      }
      const token = crypto.randomUUID();
      this.stockLock = { token, expires: Date.now() + STOCK_LOCK_LEASE_MS };
      return Response.json({ token });
    }
    if (url.pathname === "/stock-lock/release" && request.method === "POST") {
      const { token } = await request.json().catch(() => ({}));
      if (this.stockLock?.token === token) {
        this.stockLock = null;
        const waiters = this.stockWaiters;
        this.stockWaiters = [];
        for (const wake of waiters) wake(undefined);
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      const { modules = [] } = await request.json().catch(() => ({}));
      const message = JSON.stringify({ type: "changed", modules });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch { /* closing socket; ignore */ }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    // Hibernatable accept: the object can be evicted from memory between messages while the
    // connection stays open, so idle tabs don't accrue duration or CPU.
    this.ctx.acceptWebSocket(server);
    // The browser requires the server to echo one of its offered subprotocols.
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": "medlane-live" } });
  }

  async webSocketMessage() { /* clients only send keepalive pings, auto-answered above */ }

  async webSocketClose(/** @type {any} */ socket, /** @type {any} */ code) {
    try { socket.close(code === 1005 ? 1000 : code, "closing"); } catch { /* already closed */ }
  }
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseFetchOnceWithTotal(env, path, init = {}) {
  const headers = { ...supabaseHeaders(env), ...(init.headers || {}) };
  headers.prefer = [headers.prefer, "count=exact"].filter(Boolean).join(",");
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Supabase request failed: ${response.status}`);
  // "0-999/12345" (or "*/0" when empty) — the slice after the / is Postgres's exact row count
  // for the query, computed in the same request as the first page.
  const range = response.headers.get("content-range");
  const total = range?.includes("/") ? Number(range.split("/")[1]) : NaN;
  return { payload, total: Number.isFinite(total) ? total : null };
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseFetchWithTotal(env, path, init = {}) {
  try {
    return await supabaseFetchOnceWithTotal(env, path, init);
  } catch (/** @type {any} */ error) {
    if (!isTransientJwtClockSkew(error)) throw error;
    await sleep(1500);
    return supabaseFetchOnceWithTotal(env, path, init);
  }
}

// PostgREST caps how many rows a single request can return (the project's "Max Rows" API
// setting) and silently returns only that many with a normal 200 — there is no error to
// catch. A plain supabaseFetch() on a table that has grown past that cap quietly returns a
// partial result. For queries ordered oldest-first, that means the newest rows — anything
// just written — are exactly what gets cut off. Page through with offset/limit until a page
// comes back smaller than requested, so a read is never silently incomplete.
//
// Page 1 asks Postgres for the exact total row count (`Prefer: count=exact`) alongside its
// data, so every remaining page is known up front and can be requested in parallel instead of
// one round trip at a time. A module with, say, 20,000 rows used to take 20 sequential Supabase
// round trips — the dominant cost of the full-state load on every login — and now takes one
// round trip to learn the total plus a single parallel batch for the rest. Falls back to the
// old single-page result if the count header is ever missing (e.g. a malformed query PostgREST
// rejects the Prefer header for), so this can never return less data than before.
/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseFetchAll(env, path, init = {}) {
  const pageSize = 1000;
  const separator = path.includes("?") ? "&" : "?";
  const { payload: firstPage, total } = await supabaseFetchWithTotal(env, `${path}${separator}limit=${pageSize}&offset=0`, init);
  if (!Array.isArray(firstPage)) return firstPage;
  if (total === null || firstPage.length < pageSize || firstPage.length >= total) return firstPage;
  const offsets = [];
  for (let offset = pageSize; offset < total; offset += pageSize) offsets.push(offset);
  const restPages = await Promise.all(offsets.map((offset) => supabaseFetch(env, `${path}${separator}limit=${pageSize}&offset=${offset}`, init)));
  let all = firstPage;
  for (const page of restPages) { if (Array.isArray(page)) all = all.concat(page); }
  return all;
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseAuthAdminFetchOnce(env, path, init = {}) {
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Supabase Auth request failed: ${response.status}`);
  return payload;
}

/** @param {WorkerEnv} env @param {string} path @param {Record<string, any>} [init] */
async function supabaseAuthAdminFetch(env, path, init = {}) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  try {
    return await supabaseAuthAdminFetchOnce(env, path, init);
  } catch (/** @type {any} */ error) {
    if (!isTransientJwtClockSkew(error)) throw error;
    await sleep(1500);
    return supabaseAuthAdminFetchOnce(env, path, init);
  }
}

/** @param {string} password */
function passwordPolicyError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter";
  if (!/\d/.test(value)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one special character";
  if (/\s/.test(value)) return "Password cannot contain spaces";
  return "";
}

/** @param {WorkerEnv} env */
function resendFrom(env) {
  return env.RESEND_FROM || "Medlane OS <onboarding@resend.dev>";
}

/** @param {any} actionLink @param {any} origin */
function wrapAuthActionLink(actionLink, origin) {
  // Supabase's raw action_link points at the Supabase project domain (rawjrrhskunlbffhdfxm.supabase.co),
  // which never matches the Resend sending domain and gets flagged as a mismatched-URL spam signal.
  // Route the visible email link through our own origin instead; /auth/continue below forwards it on.
  try {
    const parsed = new URL(actionLink);
    const token = parsed.searchParams.get("token");
    const type = parsed.searchParams.get("type");
    if (!token || !type) return actionLink;
    return `${origin}/auth/continue?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;
  } catch {
    return actionLink;
  }
}

/** @param {any} [origin] */
function medlaneLogoUrl(origin = PUBLIC_APP_ORIGIN) {
  return `${String(origin || PUBLIC_APP_ORIGIN).replace(/\/$/, "")}/medlane.jpg`;
}

/** @param {{ title: any, eyebrow?: string, intro?: string, bodyHtml?: string, origin?: any }} options */
function brandedEmailHtml({ title, eyebrow = "Medlane Diagnostic Solutions", intro = "", bodyHtml = "", origin = PUBLIC_APP_ORIGIN }) {
  const year = new Date().getFullYear();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#eaf7ff;font-family:Arial,Helvetica,sans-serif;color:#10213d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#dff4ff 0%,#f7fcff 55%,#fff7ec 100%);padding:34px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #bfe7fb;box-shadow:0 24px 70px rgba(0,46,93,.16);"><tr><td style="background:linear-gradient(120deg,#0b2f52 0%,#1d6fa5 100%);padding:28px 30px;color:#fff;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="width:62px;vertical-align:top;"><img src="${escapeHtml(medlaneLogoUrl(origin))}" width="52" height="52" alt="Medlane" style="display:block;border-radius:16px;background:#fff;padding:5px;box-shadow:0 10px 28px rgba(0,0,0,.18);"></td><td style="vertical-align:top;padding-left:14px;"><div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#e8c684;">${escapeHtml(eyebrow)}</div><h1 style="margin:8px 0 0;font-size:30px;line-height:1.08;letter-spacing:-.02em;color:#ffffff;">${escapeHtml(title)}</h1>${intro ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#dcedf9;">${escapeHtml(intro)}</p>` : ""}</td></tr></table></td></tr><tr><td style="padding:28px 30px;font-size:14px;line-height:1.65;border-top:4px solid #c98a1f;">${bodyHtml || "<p>Nothing to report.</p>"}</td></tr><tr><td style="padding:18px 30px;background:#f3fbff;border-top:1px solid #d8eef9;color:#4f6b86;font-size:12px;line-height:1.6;">© ${year} Medlane Diagnostic Solutions, Inc. Automated system email - do not reply.</td></tr></table></td></tr></table></body></html>`;
}

/** @param {{ fullName: any, email: string, role: any, actionLink: any, origin: any }} options */
function brandedInviteEmailHtml({ fullName, email, role, actionLink, origin }) {
  const body = `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi <strong>${escapeHtml(fullName)}</strong>,</p><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to Medlane OS as <strong>${escapeHtml(role)}</strong>. Use the button below to create your password and activate your account.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#f59e0b;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:15px 26px;color:#10213d;text-decoration:none;font-weight:900;font-size:15px;border-radius:999px;">Accept Invitation</a></td></tr></table><div style="background:#f3fbff;border:1px solid #bfe7fb;border-left:5px solid #f59e0b;border-radius:18px;padding:18px;margin:20px 0;"><strong style="display:block;margin-bottom:8px;color:#003f73;">Account details</strong><div>Email: ${escapeHtml(email)}</div><div>Role: ${escapeHtml(role)}</div></div><p style="margin:18px 0 0;color:#4f6b86;font-size:13px;line-height:1.55;">If the button does not work, open this secure link:<br><a href="${escapeHtml(actionLink)}" style="color:#0077bd;word-break:break-all;">${escapeHtml(actionLink)}</a></p>`;
  return brandedEmailHtml({ title: "Welcome to Medlane OS", intro: "Your secure workspace for inventory, invoicing, collections, reports, and audit-ready operations.", bodyHtml: body, origin });
}

/** @param {{ fullName: any, email: string, actionLink: any, origin: any }} options */
function passwordResetEmailHtml({ fullName, email, actionLink, origin }) {
  const body = `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi <strong>${escapeHtml(fullName)}</strong>,</p><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">We received a request to reset the password for your Medlane OS account. Use the button below to choose a new password.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#0077bd;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:15px 26px;color:#ffffff;text-decoration:none;font-weight:900;font-size:15px;border-radius:999px;">Reset Password</a></td></tr></table><div style="background:#f3fbff;border:1px solid #bfe7fb;border-left:5px solid #0077bd;border-radius:18px;padding:18px;margin:20px 0;"><strong style="display:block;margin-bottom:8px;color:#003f73;">Account</strong><div>Email: ${escapeHtml(email)}</div></div><p style="margin:18px 0 0;color:#4f6b86;font-size:13px;line-height:1.55;">If the button does not work, open this secure link:<br><a href="${escapeHtml(actionLink)}" style="color:#0077bd;word-break:break-all;">${escapeHtml(actionLink)}</a></p><p style="margin:14px 0 0;color:#4f6b86;font-size:13px;line-height:1.55;">This link expires shortly. If you did not request a password reset, you can safely ignore this email &mdash; your password will not change.</p>`;
  return brandedEmailHtml({ title: "Reset your Medlane OS password", intro: "Choose a new password to get back into your workspace.", bodyHtml: body, origin });
}

/** @param {{ fullName: any, email: string, role: any, actionLink: any, origin: any }} options */
function inviteEmailHtml({ fullName, email, role, actionLink, origin }) {
  const year = new Date().getFullYear();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Medlane OS</title></head><body style="margin:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#10213d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#eaf6ff,#fff5f5);padding:32px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #cfe5f7;box-shadow:0 24px 70px rgba(16,33,61,.14);"><tr><td style="background:linear-gradient(135deg,#005a9c,#008bd2 62%,#ef4b4f);padding:30px;color:#fff;"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">Medlane Diagnostic Solutions</div><h1 style="margin:12px 0 6px;font-size:34px;line-height:1.05;">Welcome to Medlane OS</h1><p style="margin:0;font-size:16px;line-height:1.6;opacity:.96;">Your secure workspace for inventory, invoicing, collections, reports, and audit-ready operations.</p></td></tr><tr><td style="padding:30px;"><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi <strong>${escapeHtml(fullName)}</strong>,</p><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to Medlane OS as <strong>${escapeHtml(role)}</strong>. Use the button below to create your password and activate your account.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#0077bd;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:15px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;border-radius:999px;">Accept Invitation</a></td></tr></table><div style="background:#f4f9ff;border:1px solid #d8ebfb;border-radius:18px;padding:18px;margin:20px 0;"><strong style="display:block;margin-bottom:8px;color:#005a9c;">Security reminder</strong><p style="margin:0;font-size:14px;line-height:1.6;color:#4c6280;">Create a password with at least 8 characters, one letter, one number, and one special character. Never share your password or invitation link.</p></div><p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#4c6280;">If the button does not work, copy and paste this link into your browser:</p><p style="word-break:break-all;margin:0 0 18px;font-size:13px;line-height:1.6;color:#0077bd;">${escapeHtml(actionLink)}</p><p style="margin:0;font-size:14px;line-height:1.6;color:#4c6280;">Account email: <strong>${escapeHtml(email)}</strong><br>Login site: <a href="${escapeHtml(origin)}" style="color:#0077bd;">${escapeHtml(origin)}</a></p></td></tr><tr><td style="padding:22px 30px;background:#f8fbff;border-top:1px solid #e1eef8;color:#60738f;font-size:12px;line-height:1.6;">© ${year} Medlane Diagnostic Solutions, Inc. This message was sent for account access setup. If you did not expect this invitation, ignore this email or contact your administrator.</td></tr></table></td></tr></table></body></html>`;
}

/** @param {any} env @param {{ action: string, module: string, record: any, extra?: any }} entry */
async function recordSystemLog(env, { action, module, record, extra }) {
  const stateKey = appStateKey(env);
  const entry = {
    date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }),
    user: "System",
    role: "System",
    action,
    module,
    record: record || "",
    ...(extra && typeof extra === "object" ? extra : {}),
  };
  await supabaseFetch(env, "/rest/v1/app_records", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: null }]),
  }).catch(() => null);
}

// Resend's API caps at 10 requests/second and answers a burst with HTTP 429
// ("Too many requests. You can only make 10 requests per second."). The daily/weekly
// digest fans out one send per recipient and used to fire them all at once, so past a
// handful of recipients every extra email 429'd and silently never arrived. Funnel every
// Resend call through one promise chain with a minimum gap (~6/sec, comfortably under the
// limit) and retry a 429 with backoff so a brief spike never drops a message.
const RESEND_MIN_GAP_MS = 160;
let resendGate = Promise.resolve();
let resendLastAt = 0;
function paceResend() {
  /** @type {Record<string, any>} */
  const next = resendGate.then(async () => {
    const wait = resendLastAt + RESEND_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    resendLastAt = Date.now();
  });
  resendGate = next.catch(() => {});
  return next;
}

/** @param {WorkerEnv} env @param {any} body */
async function resendEmailRequest(env, body) {
  for (let attempt = 0; ; attempt++) {
    await paceResend();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 || attempt >= 5) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 400 * (attempt + 1));
  }
}

/** @param {any} env @param {{ to: any, subject: any, html: any, digestMessageId?: string | null }} options @returns {Promise<any>} */
async function sendResendEmail(env, { to, subject, html, digestMessageId = null }) {
  // digestMessageId, when present, is the R2 key of the exact HTML this email carried — the
  // Audit Logs "View message" button in the app reads it back. Kept on both the sent and
  // failed log rows so a bounced digest can still be inspected.
  const extra = digestMessageId ? { digestMessageId } : undefined;
  if (!env.RESEND_API_KEY) {
    await recordSystemLog(env, { action: "Email skipped", module: "Email", record: `${to} — ${subject} (RESEND_API_KEY not configured)`, extra });
    return { sent: false, provider: "resend", reason: "RESEND_API_KEY is not configured" };
  }
  const response = await resendEmailRequest(env, { from: resendFrom(env), to: [to], subject, html });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    await recordSystemLog(env, { action: "Email failed", module: "Email", record: `${to} — ${subject}: ${payload?.message || payload?.error || response.status}`, extra });
    throw new Error(payload?.message || payload?.error || `Resend failed: ${response.status}`);
  }
  await recordSystemLog(env, { action: "Email sent", module: "Email", record: `${to} — ${subject}`, extra });
  return { sent: true, provider: "resend", id: payload?.id || null };
}

// Stashes the exact rendered HTML of a digest email in R2 so the app's Audit Logs detail
// view can show "what did they actually get". Keyed by a random id that goes onto the
// matching audit-log row. Best-effort: a failure here must never stop the digest sending.
/** @param {WorkerEnv} env @param {{ periodLabel: any, role: any, subject: any, html: any }} options */
async function saveDigestMessageSnapshot(env, { periodLabel, role, subject, html }) {
  if (!env.DOCUMENTS_BUCKET || !html) return null;
  const id = crypto.randomUUID();
  const key = `digest-messages/${appStateKey(env)}/${id}.html.gz`;
  await env.DOCUMENTS_BUCKET.put(key, await gzipBytes(html), {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { periodLabel: String(periodLabel || ""), role: String(role || ""), subject: String(subject || ""), createdAt: new Date().toISOString() },
  });
  return id;
}

/** @param {WorkerEnv} env @param {string | null} id */
async function readDigestMessageSnapshot(env, id) {
  if (!env.DOCUMENTS_BUCKET || !/^[0-9a-f-]{36}$/i.test(String(id || ""))) return null;
  const object = await env.DOCUMENTS_BUCKET.get(`digest-messages/${appStateKey(env)}/${id}.html.gz`);
  if (!object) return null;
  return { html: await gunzipText(object), meta: object.customMetadata || {} };
}

/**
 * @param {any} env
 * @param {DiscordOptions} [options]
 * @returns {Promise<any>}
 */
async function sendDiscordWebhook(env, { content = "", embeds = [], allowedMentions = null } = {}) {
  const label = embeds[0]?.title || content.slice(0, 80) || "Discord message";
  if (!env.DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord post skipped", module: "Discord", record: `${label} (DISCORD_WEBHOOK_URL not configured)` });
    return { sent: false, provider: "discord", reason: "DISCORD_WEBHOOK_URL is not configured" };
  }
  const body = JSON.stringify({ content, embeds, username: "Medlane OS", ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) });
  // Discord webhooks rate-limit (~5 requests / 2s per webhook, HTTP 429) and occasionally
  // 5xx. On a Friday 18:00 the digest, workflow events and a backup-completed notice can all
  // land within seconds, so retry 429/5xx with backoff (honouring retry_after) instead of
  // losing the message to a one-shot failure.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(env.DISCORD_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (response.ok || response.status === 204) {
      await recordSystemLog(env, { action: "Discord post sent", module: "Discord", record: label });
      return { sent: true, provider: "discord" };
    }
    const text = await response.text().catch(() => "");
    if ((response.status !== 429 && response.status < 500) || attempt >= 4) {
      await recordSystemLog(env, { action: "Discord post failed", module: "Discord", record: `${label}: ${response.status} ${text}` });
      throw new Error(`Discord webhook failed: ${response.status} ${text}`);
    }
    let waitMs = 500 * (attempt + 1);
    const headerRetry = Number(response.headers.get("retry-after"));
    if (Number.isFinite(headerRetry) && headerRetry > 0) waitMs = headerRetry * 1000;
    else { try { const parsed = JSON.parse(text); if (Number(parsed.retry_after) > 0) waitMs = Number(parsed.retry_after) * 1000; } catch { /* not JSON */ } }
    await sleep(Math.min(waitMs, 5000));
  }
}

/**
 * @param {any} env
 * @param {string | undefined} webhookUrl
 * @param {DiscordOptions} [options]
 * @returns {Promise<any>}
 */
async function sendDiscordWebhookUrl(env, webhookUrl, { content = "", embeds = [], allowedMentions = null, wait = false } = {}) {
  const label = embeds[0]?.title || content.slice(0, 80) || "Discord message";
  if (!webhookUrl) return { sent: false, provider: "discord", reason: "Webhook URL is not configured" };
  const url = new URL(webhookUrl);
  if (wait) url.searchParams.set("wait", "true");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, embeds, username: "Medlane OS", ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
  });
  const payload = wait ? await response.json().catch(() => null) : null;
  if (!response.ok && response.status !== 204) {
    const text = payload ? JSON.stringify(payload).slice(0, 500) : await response.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${label}: ${response.status} ${text}`);
  }
  return { sent: true, provider: "discord", messageId: payload?.id || null };
}

/**
 * @param {string | undefined} webhookUrl
 * @param {string | null | undefined} messageId
 * @param {DiscordOptions} [options]
 * @returns {Promise<any>}
 */
async function editDiscordWebhookMessage(webhookUrl, messageId, { content = "", embeds = [], allowedMentions = null } = {}) {
  if (!webhookUrl || !messageId) return { edited: false, reason: "Webhook URL or message ID is missing" };
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.searchParams.delete("wait");
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, embeds, ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord webhook edit failed: ${response.status} ${text}`);
  }
  return { edited: true };
}

/** @param {any} webhookUrl @param {any} messageId */
async function deleteDiscordWebhookMessage(webhookUrl, messageId) {
  if (!webhookUrl || !messageId) return { deleted: false, reason: "Webhook URL or message ID is missing" };
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.searchParams.delete("wait");
  const response = await fetch(url.toString(), { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord webhook delete failed: ${response.status} ${text}`);
  }
  return { deleted: true };
}

/** @param {any} lines @param {number} [limit] @param {any} [totalCount] */
function discordFieldValue(lines, limit = 900, totalCount = lines.length) {
  if (!lines.length) return "None";
  let value = "";
  let shown = 0;
  for (const line of lines) {
    const candidate = value ? `${value}\n${line}` : line;
    if (candidate.length > limit) break;
    value = candidate;
    shown += 1;
  }
  const hidden = totalCount - shown;
  if (hidden > 0) value += `\n*…+${hidden} more — open the app to review.*`;
  return value || "None";
}

/** @param {AppRecordRow[]} rows @param {any} moduleName */
function moduleRecordMap(rows, moduleName) {
  const map = new Map();
  rows.filter((/** @type {any} */ row) => row.module_name === moduleName).forEach((/** @type {any} */ row) => map.set(String(row.record_key), row.data || {}));
  return map;
}

/** @param {any} po */
function inventoryPoTotal(po) {
  return (po.lines || []).reduce((/** @type {number} */ sum, /** @type {any} */ line) => sum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0);
}

/** @param {any} po */
function salesPoTotal(po) {
  return Number(po.amount || po.total || po.net || 0);
}

/** @param {Profile} profile */
function eventActor(profile) {
  return profile.name || profile.email || "System User";
}

/** @param {any} value @param {string} [fallback] */
function webhookText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** @param {any} title @param {any} color @param {any} fields @param {Profile} profile */
function discordEventEmbed(title, color, fields, profile) {
  return {
    title,
    color,
    fields: [
      ...fields.filter((/** @type {any} */ field) => field.value !== undefined && field.value !== null).map((/** @type {any} */ field) => ({ ...field, value: String(field.value).slice(0, 1024) })),
      { name: "Created / Updated By", value: `${eventActor(profile)} (${profile.role || "Unknown"})`, inline: false },
    ].slice(0, 25),
    timestamp: new Date().toISOString(),
  };
}

// Modules whose creates AND status changes are broadcast to Discord by
// postRecordEventsToDiscord. The save endpoints pre-load the stored rows of these modules
// (with data) so the poster can diff before/after.
const DISCORD_EVENT_MODULES = ["purchaseOrders", "inventoryPurchaseOrders", "paymentRequests", "pendingTransfers", "payments"];

/** @param {WorkerEnv} env @param {Profile} profile @param {{ title: any, color: any, fields: any, label: any }} options */
async function postWorkflowEventToDiscord(env, profile, { title, color, fields, label }) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  await sendDiscordWebhook(env, { embeds: [discordEventEmbed(title, color, fields, profile)] })
    .catch((error) => recordSystemLog(env, { action: "Discord event post failed", module: "Discord", record: `${label}: ${error.message}` }).catch(() => null));
}

/** @param {WorkerEnv} env @param {Profile} profile @param {any} beforeRows @param {any} savedRows */
async function postRecordEventsToDiscord(env, profile, beforeRows, savedRows) {
  if (!env.DISCORD_WEBHOOK_URL || !savedRows.length) return;
  /** @type {Record<string, any>} */
  const beforeByModule = {};
  DISCORD_EVENT_MODULES.forEach((moduleName) => { beforeByModule[moduleName] = moduleRecordMap(beforeRows, moduleName); });
  /** @type {any[]} */
  const posts = [];
  const push = (/** @type {any} */ title, /** @type {any} */ color, /** @type {any} */ fields, /** @type {any} */ label) => posts.push(postWorkflowEventToDiscord(env, profile, { title, color, fields, label }));
  for (const row of savedRows) {
    const key = String(row.record_key);
    const before = beforeByModule[row.module_name]?.get(key);
    const record = row.data || {};
    const isNew = !before;
    const statusChanged = (/** @type {any} */ field) => before && String(before[field] || "") !== String(record[field] || "");

    if (row.module_name === "purchaseOrders") {
      if (isNew) {
        push("New Sales Purchase Order", 0x0077bd, [
          { name: "PO", value: webhookText(record.id || key), inline: true },
          { name: "Client", value: webhookText(record.client), inline: true },
          { name: "Amount", value: money(salesPoTotal(record)), inline: true },
          { name: "Date", value: webhookText(record.date), inline: true },
          { name: "Status", value: webhookText(record.status || "Open"), inline: true },
        ], `New sales PO ${record.id || key}`);
      } else if (statusChanged("status") && /approved/i.test(record.status || "")) {
        push("Sales Purchase Order Approved", 0x22c55e, [
          { name: "PO", value: webhookText(record.id || key), inline: true },
          { name: "Client", value: webhookText(record.client), inline: true },
          { name: "Amount", value: money(salesPoTotal(record)), inline: true },
        ], `Sales PO approved ${record.id || key}`);
      }
    } else if (row.module_name === "inventoryPurchaseOrders") {
      if (isNew) {
        push("New Inventory Purchase Order", 0xf59e0b, [
          { name: "PO", value: webhookText(record.id || key), inline: true },
          { name: "Supplier", value: webhookText(record.supplier), inline: true },
          { name: "Total", value: money(inventoryPoTotal(record)), inline: true },
          { name: "Branch", value: webhookText(record.branch), inline: true },
          { name: "Status", value: webhookText(record.status || "Pending Approval"), inline: true },
        ], `New inventory PO ${record.id || key}`);
      } else if (statusChanged("status") && /approved/i.test(record.status || "")) {
        push("Inventory Purchase Order Approved", 0x22c55e, [
          { name: "PO", value: webhookText(record.id || key), inline: true },
          { name: "Supplier", value: webhookText(record.supplier), inline: true },
          { name: "Total", value: money(inventoryPoTotal(record)), inline: true },
        ], `Inventory PO approved ${record.id || key}`);
      }
    } else if (row.module_name === "paymentRequests") {
      if (isNew && record.invoice && record.requestStatus === "Pending") {
        push("New Collection Approval", 0x22c55e, [
          { name: "Request", value: webhookText(record.cvNo || record.id || key), inline: true },
          { name: "Invoice", value: webhookText(record.invoice), inline: true },
          { name: "Amount", value: money(record.total || record.amount), inline: true },
          { name: "Employee", value: webhookText(record.employee || record.requestedBy), inline: true },
          { name: "Status", value: webhookText(record.requestStatus), inline: true },
        ], `New collection approval ${record.cvNo || record.id || key}`);
      } else if (statusChanged("requestStatus") && /approved/i.test(record.requestStatus || "")) {
        push("Collection Approved & Payment Recorded", 0x22c55e, [
          { name: "Request", value: webhookText(record.cvNo || record.id || key), inline: true },
          { name: "Invoice", value: webhookText(record.invoice), inline: true },
          { name: "Amount", value: money(record.total || record.amount), inline: true },
          { name: "Approved By", value: webhookText(record.approvedBy), inline: true },
        ], `Collection approved ${record.cvNo || record.id || key}`);
      } else if (statusChanged("requestStatus") && /cancelled|rejected/i.test(record.requestStatus || "")) {
        push("Payment Request Cancelled", 0xef4b4f, [
          { name: "Request", value: webhookText(record.cvNo || record.id || key), inline: true },
          { name: "Invoice", value: webhookText(record.invoice), inline: true },
          { name: "Status", value: webhookText(record.requestStatus), inline: true },
        ], `Payment request cancelled ${record.cvNo || record.id || key}`);
      }
    } else if (row.module_name === "pendingTransfers") {
      const lineCount = Array.isArray(record.lines) ? record.lines.length : (record.qty || record.quantity ? 1 : 0);
      const routeField = { name: "Route", value: `${webhookText(record.from)} -> ${webhookText(record.to)}`, inline: false };
      if (isNew && !/received|cancelled/i.test(record.status || "")) {
        push("New Pending Transfer", 0x8b5cf6, [
          { name: "Transfer", value: webhookText(record.id || key), inline: true },
          { name: "Items", value: webhookText(lineCount || record.item || record.code || "Items"), inline: true },
          routeField,
          { name: "Status", value: webhookText(record.status || "Pending"), inline: true },
        ], `New pending transfer ${record.id || key}`);
      } else if (statusChanged("status") && /in\s*transit/i.test(record.status || "")) {
        push("Stock Transfer Dispatched", 0x1d6fa5, [
          { name: "Transfer", value: webhookText(record.id || key), inline: true },
          { name: "Items", value: webhookText(lineCount || "Items"), inline: true },
          routeField,
          { name: "Dispatched By", value: webhookText(record.dispatchedBy), inline: true },
        ], `Stock transfer dispatched ${record.id || key}`);
      } else if (statusChanged("status") && /received/i.test(record.status || "")) {
        push("Stock Transfer Received", 0x22c55e, [
          { name: "Transfer", value: webhookText(record.id || key), inline: true },
          { name: "Status", value: webhookText(record.status), inline: true },
          routeField,
          { name: "Received By", value: webhookText(record.receivedBy || record.dispatchedBy), inline: true },
        ], `Stock transfer received ${record.id || key}`);
      } else if (statusChanged("status") && /cancelled/i.test(record.status || "")) {
        push("Stock Transfer Cancelled", 0xef4b4f, [
          { name: "Transfer", value: webhookText(record.id || key), inline: true },
          routeField,
          { name: "Status", value: webhookText(record.status), inline: true },
        ], `Stock transfer cancelled ${record.id || key}`);
      }
    } else if (row.module_name === "payments") {
      if (isNew) {
        push("Collection Recorded", 0x22c55e, [
          { name: "Receipt", value: webhookText(record.receiptNo || key), inline: true },
          { name: "Client", value: webhookText(record.client), inline: true },
          { name: "Amount", value: money(record.amount), inline: true },
          { name: "Invoice", value: webhookText(record.invoice), inline: true },
          { name: "Status", value: webhookText(record.collectionStatus || "For Deposit"), inline: true },
        ], `Collection recorded ${record.receiptNo || key}`);
      } else if (statusChanged("collectionStatus")) {
        push(`Collection Marked ${record.collectionStatus || "Updated"}`, /bounce/i.test(record.collectionStatus || "") ? 0xef4b4f : 0x1d6fa5, [
          { name: "Receipt", value: webhookText(record.receiptNo || key), inline: true },
          { name: "Client", value: webhookText(record.client), inline: true },
          { name: "Amount", value: money(record.amount), inline: true },
          { name: "Status", value: `${webhookText(before.collectionStatus)} -> ${webhookText(record.collectionStatus)}`, inline: true },
        ], `Collection status ${record.receiptNo || key}`);
      }
    }
  }
  if (posts.length) await Promise.allSettled(posts);
}

/** @returns {Promise<any[]>} */
async function trackNewOccurrences(/** @type {any} */ env, /** @type {any} */ moduleName, /** @type {any} */ currentIds) {
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${encodeURIComponent(moduleName)}&record_key=eq.state&select=data`);
  const known = new Set(rows[0]?.data?.ids || []);
  const ids = [...new Set(currentIds.filter(Boolean))];
  const fresh = ids.filter((id) => !known.has(id));
  const merged = [...new Set([...known, ...ids])];
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ state_key: stateKey, module_name: moduleName, record_key: "state", data: { ids: merged } }]),
  });
  return fresh;
}

/** @param {WorkerEnv} env @param {string} email */
async function findAuthUserByEmail(env, email) {
  const target = cleanEmail(email);
  for (let page = 1; page <= 25; page += 1) {
    const payload = await supabaseAuthAdminFetch(env, `/auth/v1/admin/users?page=${page}&per_page=1000`).catch((error) => ({ _error: error.message, users: [] }));
    const match = (payload.users || []).find((/** @type {any} */ user) => cleanEmail(user.email) === target);
    if (match) return match;
    if (!payload.users || payload.users.length < 1000) break;
  }
  return null;
}

/** @param {WorkerEnv} env @param {Profile} profile @param {string} email */
async function findAuthUserForProfileOrEmail(env, profile, email) {
  if (profile?.id) {
    const user = await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(profile.id)}`).catch(() => null);
    if (user?.id && cleanEmail(user.email || email) === cleanEmail(email)) return user;
  }
  return findAuthUserByEmail(env, email);
}

/** @param {any} payload */
function extractLinkResult(payload) {
  // Supabase's raw /admin/generate_link REST response puts the user's fields at the top level
  // of the payload (not nested under a "user" key the way the supabase-js SDK abstracts it), with
  // the link fields alongside them. Support both shapes defensively.
  if (!payload) return null;
  const user = payload.user?.id ? payload.user : payload.id ? payload : null;
  if (!user) return null;
  const actionLink = payload.action_link || payload.properties?.action_link || "";
  return { authUser: user, actionLink };
}

/** @returns {Promise<any>} */
async function generateSupabaseActionLink(/** @type {any} */ env, /** @type {any} */ { email, fullName, role, branch, origin }) {
  const redirectTo = `${origin}/?login=1`;
  const options = { redirect_to: redirectTo, data: { full_name: fullName, role, branch } };
  const invitePayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "invite", email, options }),
  }).catch((error) => ({ _error: error.message }));
  const inviteResult = extractLinkResult(invitePayload);
  if (inviteResult) return inviteResult;
  const recoveryPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", email, options }),
  }).catch((error) => ({ _error: error.message }));
  const recoveryResult = extractLinkResult(recoveryPayload);
  if (recoveryResult) return recoveryResult;
  const adminUserPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: fullName, role, branch } }),
  }).catch((error) => ({ _error: error.message }));
  // Prefer the recovery-call failure reason: for an account that already exists, the invite call
  // failing with "already registered" is expected noise, not the real problem. Recovery is the
  // correct call for an existing account, so its error (or the final create attempt's) is what
  // actually explains why no link came back.
  const detail = recoveryPayload?._error || adminUserPayload?._error || invitePayload?._error || "Unknown Supabase response";
  if (adminUserPayload?.id) {
    return { authUser: adminUserPayload, actionLink: "", linkError: detail };
  }
  // Every attempt above failed, but a "duplicate" error means the account genuinely already
  // exists in Supabase even though our earlier lookup missed it (e.g. a concurrent invite for
  // the same email). Re-fetch it directly instead of surfacing a confusing failure while leaving
  // the account orphaned with no profile row.
  if (/already.*regist|already.*exist/i.test(detail)) {
    const existing = await findAuthUserByEmail(env, email);
    if (existing) return { authUser: existing, actionLink: "", linkError: detail };
  }
  throw new Error(`Could not create Supabase user: ${detail}`);
}

/** @param {WorkerEnv} env @param {string} email @param {any} origin */
async function resolveInviteLink(env, email, origin) {
  const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
  if (!profiles[0]) throw new Error("User profile not found");
  const role = profiles[0].role || "Sales";
  const fullName = profiles[0].full_name || email;
  const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch: profiles[0].branch || "all", origin });
  if (!generated.actionLink) throw new Error(generated.linkError ? `Invitation link could not be generated: ${generated.linkError}` : "Invitation link could not be generated");
  return { actionLink: generated.actionLink, fullName, role };
}

/** @param {Request} request @param {WorkerEnv} env */
async function authenticatedUser(request, env) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  // A Supabase outage says nothing about this login. Reporting it as "expired" would log people out.
  if (response.status >= 500 || response.status === 429) throw new Error("The sign-in service is temporarily unavailable");
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Invalid or expired session");
  return { token, user };
}

/** @param {Request} request */
function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

/** @param {string} [userAgent] */
function browserName(userAgent = "") {
  const value = String(userAgent);
  if (/Edg\//.test(value)) return "Microsoft Edge";
  if (/OPR\//.test(value)) return "Opera";
  if (/Chrome\//.test(value) && !/Chromium\//.test(value)) return "Chrome";
  if (/Firefox\//.test(value)) return "Firefox";
  if (/Safari\//.test(value) && !/Chrome\//.test(value)) return "Safari";
  return "Unknown browser";
}

/** @param {string} [userAgent] */
function deviceName(userAgent = "") {
  const value = String(userAgent);
  const os = /Windows/i.test(value) ? "Windows" : /Mac OS X|Macintosh/i.test(value) ? "Mac" : /iPhone/i.test(value) ? "iPhone" : /iPad/i.test(value) ? "iPad" : /Android/i.test(value) ? "Android" : /Linux/i.test(value) ? "Linux" : "Unknown device";
  const type = /Mobile|iPhone|Android/i.test(value) ? "Mobile" : /iPad|Tablet/i.test(value) ? "Tablet" : "Desktop";
  return os === "Unknown device" ? os : `${os} ${type}`;
}

/** @param {Request} request */
function sessionHeader(request) {
  const value = request.headers.get("x-medlane-session-id") || "";
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

/** @param {WorkerEnv} env @param {Request} request @param {string} userId */
async function createAppSession(env, request, userId) {
  const userAgent = request.headers.get("user-agent") || "";
  try {
    const rows = await supabaseFetch(env, "/rest/v1/app_sessions", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, device_name: deviceName(userAgent), browser: browserName(userAgent), ip_address: clientIp(request), user_agent: userAgent }),
    });
    return rows[0] || null;
  } catch (/** @type {any} */ error) {
    console.error(JSON.stringify({ message: "App session tracking failed", error: error.message }));
    return null;
  }
}

const APP_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** @param {WorkerEnv} env @param {Request} request @param {string} userId */
async function validateAppSession(env, request, userId) {
  const id = sessionHeader(request);
  if (!id) {
    // A legitimate client always attaches this header from its very first authenticated
    // request after login (login's response embeds the same id the client stores it from,
    // worker.js's /api/auth/login handler) and keeps sending it across token refreshes. A
    // request that's otherwise authenticated but omits it is either replaying a stolen
    // Supabase access token directly — bypassing this app's own device-revocation control
    // entirely, since Supabase itself has no API to force-invalidate an already-issued
    // access token early — or predates this account ever getting a tracked session. Reject
    // the former; allow the latter, since there is nothing to revoke yet.
    const tracked = await supabaseFetch(env, `/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
    if (tracked.length) throw new Error("Invalid app session");
    return;
  }
  const rows = await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,revoked_at,created_at,last_seen_at,ip_address`);
  if (!rows[0]) throw new Error("Invalid app session");
  if (rows[0].revoked_at) throw new Error("SESSION_REVOKED");
  if (Date.now() - new Date(rows[0].created_at).getTime() >= APP_SESSION_MAX_AGE_MS) throw new Error("SESSION_EXPIRED_12H");
  // Every authenticated API call used to rewrite this row. last_seen_at only needs minute-level
  // accuracy, so skip the write unless it's stale (>60s) or the IP changed.
  const ip = clientIp(request);
  const seenAgeMs = rows[0].last_seen_at ? Date.now() - new Date(rows[0].last_seen_at).getTime() : Infinity;
  if (seenAgeMs < 60_000 && (rows[0].ip_address || "") === ip) return;
  await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), ip_address: ip }),
  });
}

const PASSWORD_KYC_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** @param {WorkerEnv} env @param {string} userId @param {string} email @returns {Promise<Profile>} */
async function profileForUser(env, userId, email) {
  const profile = /** @type {ProfileRow[]} */ (await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`));
  if (!profile[0]) throw new Error(`No Medlane profile found for ${email || "this account"}`);
  const permissions = /** @type {ModulePermissionRow[]} */ (await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(userId)}&select=module_key,can_view,can_edit`));
  const { view, edit } = moduleListsFor(profile[0].role, permissions);
  const passwordConfirmedAt = profile[0].password_confirmed_at || profile[0].created_at;
  const passwordKycDue = !passwordConfirmedAt || Date.now() - new Date(passwordConfirmedAt).getTime() >= PASSWORD_KYC_MAX_AGE_MS;
  return {
    id: profile[0].id,
    name: profile[0].full_name,
    email: profile[0].email,
    role: profile[0].role,
    branch: profile[0].branch || "all",
    phone: profile[0].phone || "",
    modules: view,
    customPermissions: { enabled: true, view, edit },
    passwordKycDue,
    themePreference: profile[0].theme_preference === "dark" ? "dark" : "light",
  };
}

// The view/edit module lists for a role: the user's own module_permissions rows when they have
// any, else the role defaults, plus the modules every role always gets and minus role blocks.
/** @param {AppRole} role @param {ModulePermissionRow[]} permissions */
function moduleListsFor(role, permissions) {
  const fallback = roleModules[role] || roleModules.Sales;
  const view = permissions.length ? permissions.filter((item) => item.can_view).map((item) => item.module_key) : fallback;
  const edit = permissions.length ? permissions.filter((item) => item.can_edit).map((item) => item.module_key) : withoutViewOnlyDefaults(role, fallback);
  // Every role can view memos regardless of when their module_permissions rows were created —
  // this is a newer module that predates most existing users' explicit permission grants, and
  // memo posting is separately gated by requireMemoAdmin(), not by this permission list.
  if (!view.includes("memos")) view.push("memos");
  // The Calendar is a shared schedule everyone can see and add to, regardless of module_permissions.
  for (const list of [view, edit]) if (!list.includes("calendar")) list.push("calendar");
  // Every role can read the items/clients/suppliers catalog regardless of module_permissions —
  // it's reference data that receiving, transfers, demos, and invoicing autofill from, not just
  // an admin-screen concern. Deliberately view-only and not overridable per-user: editing the
  // catalog still requires the real "masterlists" permission.
  if (!view.includes("catalog-reference")) view.push("catalog-reference");
  const blocked = ROLE_BLOCKED_MODULES[role] || [];
  if (blocked.length) {
    for (const list of [view, edit]) for (let i = list.length - 1; i >= 0; i -= 1) if (blocked.includes(list[i])) list.splice(i, 1);
  }
  if (["Superadmin", "CEO"].includes(role)) {
    if (!view.includes("backup")) view.push("backup");
    if (!edit.includes("backup")) edit.push("backup");
  }
  return { view, edit };
}

// ---- Role preview -----------------------------------------------------------------------------
// A real Superadmin or CEO can send `x-medlane-preview-role: <Role>` to use the app exactly as
// that role: every permission check below sees the previewed role and its DEFAULT module
// permissions (not anyone's custom grants), so what they can view and do is genuinely limited,
// server-side, not just hidden in the UI. Nobody can preview Superadmin, and a CEO can't preview
// CEO, so preview can only ever narrow access. Identity (id, email, name) stays the real person's.
const PREVIEW_ROLE_HEADER = "x-medlane-preview-role";
/** @param {AppRole} realRole @returns {AppRole[]} */
function previewableRolesFor(realRole) {
  if (!["Superadmin", "CEO"].includes(realRole)) return [];
  return /** @type {AppRole[]} */ (Object.keys(roleModules)).filter((role) => role !== "Superadmin" && role !== realRole);
}
/** @param {Request} request @param {Profile} profile @returns {Profile} */
function applyPreviewRole(request, profile) {
  const requested = String(request.headers.get(PREVIEW_ROLE_HEADER) || "").trim();
  if (!requested) return profile;
  if (!["Superadmin", "CEO"].includes(profile.role)) throw new Error("Only Superadmin or CEO can preview a role");
  const role = /** @type {AppRole} */ (requested);
  if (!previewableRolesFor(profile.role).includes(role)) throw new Error(`Only Superadmin or CEO can preview a role, and not "${requested}"`);
  const { view, edit } = moduleListsFor(role, []);
  return { ...profile, role, modules: view, customPermissions: { enabled: true, view, edit }, previewOf: profile.role };
}

/** @param {WorkerEnv} env @param {string} userId */
async function markPasswordConfirmed(env, userId) {
  try {
    await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ password_confirmed_at: new Date().toISOString() }),
    });
  } catch (/** @type {any} */ error) {
    console.error(JSON.stringify({ message: "Failed to mark password confirmed", error: error.message }));
  }
}

/** @param {Request} request @param {WorkerEnv} env */
async function authenticatedProfile(request, env) {
  const { user } = await authenticatedUser(request, env);
  await validateAppSession(env, request, user.id);
  return { authUser: user, profile: applyPreviewRole(request, await profileForUser(env, user.id, user.email)) };
}

/** @param {Profile} profile */
function canWrite(profile) {
  return Boolean(profile?.customPermissions?.edit?.length || ["Superadmin", "CEO", "Admin"].includes(profile?.role));
}

/** @param {Profile} profile */
function requireWriteAccess(profile) {
  if (!canWrite(profile)) throw new Error("You do not have permission to edit production data");
}

/** @param {Profile} profile */
function requireUserAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can manage users");
}

/** @param {Profile} profile */
function requireMemoAdmin(profile) {
  if (!["Superadmin", "CEO", "HR"].includes(profile?.role)) throw new Error("Only Superadmin, CEO, or HR can post a memo");
}

// The client (buildSale in modules.js) computes invoice totals, stock deduction, and discount
// authorization entirely in the browser before this whole-state save ever reaches the server.
// Nothing here stopped a tampered client from submitting a fabricated price/qty/discount or
// overselling stock. This re-checks those specific invariants server-side for newly created
// invoices only — editing an already-saved sale (status/payment updates) is left alone, since
// re-validating stock against a historical sale would fight the stock that sale already consumed.
/** @param {string | undefined} code @param {string | undefined} branch @param {string | undefined} lot */
function saleStockLookupKey(code, branch, lot) {
  return [code, branch, lot].map((part) => String(part || "").trim().toLowerCase()).join("|");
}

/** @param {string} value */
// Shared expiry rule (mirrors isExpiredDate in public/scripts/ui-utils.js): a lot is expired once
// its expiry date is BEFORE today's date in Manila — it can still be used on the expiry day itself.
// Compared as YYYY-MM-DD strings so the UTC worker clock can't shift the cut-over to 8am Manila.
/** @param {unknown} value */
function isExpiredDate(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "N/A") return false;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : (() => {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  })();
  return Boolean(iso) && iso < shortDate();
}

/** @param {IncomingSale} sale @returns {IncomingSaleLine[]} */
function saleLinesOf(sale) {
  return Array.isArray(sale.lines) && sale.lines.length
    ? sale.lines
    : [{ item: sale.item, code: sale.code, qty: sale.qty, price: sale.price, sourceBranch: sale.sourceBranch || sale.branch, branch: sale.sourceBranch || sale.branch, lot: sale.lot, expiry: sale.expiry }];
}

// Comparisons against NaN are always false, so a non-numeric amount or net used to pass every
// "does this add up" and "is this over the limit" check below. Reject those first, on every path:
// neither buildSale() nor the migration importer can produce one.
/** @param {IncomingSale} sale @param {string} label */
function assertSaleBasics(sale, label) {
  if (typeof sale.client !== "string" || !sale.client.trim()) throw new Error(`Invoice ${label}: client is required.`);
  for (const field of /** @type {const} */ (["amount", "net", "discount"])) {
    const value = sale[field];
    if (value !== undefined && value !== null && !Number.isFinite(Number(value))) throw new Error(`Invoice ${label}: ${field} must be a number.`);
  }
}

// buildSale() only ever produces a non-negative amount and net, so a negative one on a live invoice
// is tampering. Migrated rows are exempt: the importer can carry a negative historical net.
/** @param {IncomingSale} sale @param {string} label */
function assertSaleNotNegative(sale, label) {
  if (Number(sale.amount ?? 0) < 0 || Number(sale.net ?? 0) < 0) throw new Error(`Invoice ${label}: amount and net cannot be negative.`);
}

// Inventory migration import (Import page, "Inventory stock" CSV): a stock row created with
// `migrated: true` must reference an active product already in the Items masterlist, carry a
// positive quantity and a real (or "N/A") expiry, and come from someone who can run an import.
// Only brand-new rows are checked — once a migrated row exists, later invoicing/transfers/stock
// edits update it like any other stock row.
/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertMigratedStockAllowed(env, stateKey, profile, rows) {
  const migrated = rows.filter((row) => row.module_name === "inventory" && row.data?.migrated === true);
  if (!migrated.length) return;
  const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&record_key=in.${encodeURIComponent(postgrestIn(migrated.map((row) => row.record_key)))}&select=record_key`));
  const existing = new Set(stored.map((entry) => entry.record_key));
  const fresh = migrated.filter((row) => !existing.has(row.record_key));
  if (!fresh.length) return;
  const canImport = ["Superadmin", "CEO"].includes(profile.role) || Boolean(profile.customPermissions?.edit?.includes("imports"));
  if (!canImport) throw new Error("Importing inventory stock requires Imports edit permission.");
  const itemRows = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.items&select=data`));
  const activeCodes = new Set(itemRows.filter((entry) => !entry.data?.archived).map((entry) => String(entry.data?.code || "").trim().toLowerCase()).filter(Boolean));
  // One row per product + branch + lot per import (stock is stored per code | branch | lot, so
  // different lots of one product are separate rows); a repeated triple is refused.
  /** @type {Set<string>} */
  const seenCodes = new Set();
  for (const row of fresh) {
    const code = [row.data?.code, row.data?.branch, row.data?.lot].map((part) => String(part || "").trim().toLowerCase()).join("|");
    if (seenCodes.has(code)) throw new Error(`Stock ${row.data?.code || row.record_key}: the same product and lot appears more than once for this branch in this import. List each product/lot only once per branch.`);
    seenCodes.add(code);
  }
  for (const row of fresh) {
    const stock = row.data || {};
    const label = `${stock.code || stock.item || row.record_key}`;
    if (!activeCodes.has(String(stock.code || "").trim().toLowerCase())) throw new Error(`Stock ${label}: product is not an active item in the Products masterlist. Import Products before inventory.`);
    const qty = Number(stock.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Stock ${label}: quantity must be greater than zero.`);
    if (!stock.branch) throw new Error(`Stock ${label}: a stock branch is required.`);
    if (stock.expiry && stock.expiry !== "N/A" && !/^\d{4}-\d{2}-\d{2}$/.test(String(stock.expiry))) throw new Error(`Stock ${label}: expiry must be a date (YYYY-MM-DD).`);
  }
}

// Cancel & Replace saves the cancelled original and its replacement in one batch. The stored
// inventory still has the original's stock deducted and the stored balance still includes it, so
// without crediting both back here a replacement that reuses the same lot (or the client's
// headroom) is refused. Only an original that is active in storage and Cancelled in this batch counts.
/** @param {WorkerEnv} env @param {string} stateKey @param {AppRecordRow<IncomingSale>[]} incomingSaleRows @param {AppRecordRow<IncomingSale>[]} newSaleRows */
async function salesCancelledInBatch(env, stateKey, incomingSaleRows, newSaleRows) {
  const candidates = incomingSaleRows.filter((row) => !newSaleRows.includes(row) && String(row.data?.status || "").toLowerCase() === "cancelled");
  if (!candidates.length) return [];
  /** @type {StoredRow<IncomingSale>[]} */
  const stored = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.sales&record_key=in.${encodeURIComponent(postgrestIn(candidates.map((row) => row.record_key)))}&select=data`);
  return stored.map((row) => row.data || {}).filter((sale) => String(sale.status || "").toLowerCase() !== "cancelled");
}

/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow<IncomingSale>[]} newSaleRows @param {AppRecordRow<IncomingSale>[]} [incomingSaleRows] */
async function validateNewSaleRows(env, stateKey, profile, newSaleRows, incomingSaleRows = []) {
  const canAuthorizeDiscount = ["Superadmin", "CEO", "Admin"].includes(profile?.role);
  const cancelledInBatch = await salesCancelledInBatch(env, stateKey, incomingSaleRows, newSaleRows);
  /** @type {Map<string, number> | null} */
  let inventoryByKey = null;
  // Mirrors clientCreditState() in ui-utils.js, which only gates the UI (canAuthorize there is
  // client-trusted). Lazily loaded and keyed by client name; projectedBalanceByClient accumulates
  // net across every new row in this same save so splitting one over-limit order into several
  // rows in one batch can't slip past the per-row check.
  /** @type {Map<string, { name: string | undefined, limit: number }> | null} */
  let creditLimitByClient = null;
  /** @type {{ name: string | undefined, limit: number }[]} */
  let creditEntries = [];
  /** @type {Map<string, number> | null} */
  let projectedBalanceByClient = null;
  // Lazily loaded set of archived client names. buildSale() (modules.js) already blocks a
  // skip-PO invoice against an archived client client-side, but that check is client-trusted —
  // this mirrors it server-side the same way the credit-limit check above does.
  /** @type {Set<string | undefined> | null} */
  let archivedClientNames = null;
  // archivedClientNames and creditLimitByClient both come from the same clients table — share one
  // fetch instead of pulling the entire clients masterlist twice in the same save when a batch
  // needs both (e.g. a skip-PO invoice plus a discount-restricted row for a different client).
  /** @type {Promise<StoredRow<ClientRowData>[]> | null} */
  let clientRowsPromise = null;
  const loadClientRows = /** @type {() => Promise<StoredRow<ClientRowData>[]>} */ (() => (clientRowsPromise ||= supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.clients&select=data`)));

  // Every item code this batch will actually check stock for, gathered up front so the inventory
  // fetch below can be scoped to just those codes instead of the entire inventory table (every
  // SKU/branch/lot combination the company has ever stocked) — this runs on every new invoice.
  const stockCheckedCodes = new Set();
  for (const row of newSaleRows) {
    const sale = row.data || {};
    if (sale.migrated || sale.noPo || String(sale.status || "").toLowerCase() === "cancelled") continue;
    const lines = Array.isArray(sale.lines) && sale.lines.length ? sale.lines : [{ code: sale.code }];
    for (const line of lines) if (line.code) stockCheckedCodes.add(String(line.code));
  }

  // Credit-limit gate for a new invoice by a non-authorizer. Shared by the normal path and the
  // noPo/migrated path below — those client-set flags skip stock/amount validation but must not
  // also skip the discount and credit controls.
  const checkCredit = async (/** @type {IncomingSale} */ sale, /** @type {string} */ label) => {
  if (!canAuthorizeDiscount && sale.client) {
    if (!creditLimitByClient) {
      const clientRows = await loadClientRows();
      creditEntries = clientRows.map((clientRow) => ({ name: clientRow.data?.name, limit: Number(clientRow.data?.creditLimit || 0) }));
      creditLimitByClient = new Map(creditEntries.map((entry) => [masterName(entry.name), entry]));
    }
    // The exact name wins: two real clients can normalize alike, and neither should be blocked for it.
    const creditEntry = creditEntries.find((entry) => entry.name === sale.client) || creditLimitByClient.get(masterName(sale.client));
    const limit = creditEntry?.limit || 0;
    if (limit > 0) {
      // Matched loosely so "LAB" can't dodge Lab's limit, but must then be saved under the exact
      // name: client_sales_balance matches exactly, so a variant spelling would never count
      // toward this client's balance on later invoices.
      if (creditEntry?.name !== sale.client) throw new Error(`Invoice ${label}: client "${sale.client}" must match the masterlist name "${creditEntry?.name}" exactly.`);
      projectedBalanceByClient ||= new Map();
      if (!projectedBalanceByClient.has(sale.client)) {
        // One indexed Postgres aggregate (see docs/migrations/2026-10-19-client-sales-balance-rpc.sql)
        // scoped to this one client, instead of paging through every sale the company has ever
        // recorded — across every client — just to recompute this client's running balance.
        const [balanceRow] = await supabaseFetch(env, "/rest/v1/rpc/client_sales_balance", {
          method: "POST",
          body: JSON.stringify({ p_state_key: stateKey, p_client: sale.client }),
        });
        const freed = cancelledInBatch.filter((cancelled) => cancelled.client === sale.client).reduce((/** @type {number} */ sum, cancelled) => sum + Math.max(Number(cancelled.net ?? cancelled.amount ?? 0) - Number(cancelled.paid || 0), 0), 0);
        projectedBalanceByClient.set(sale.client, Math.max(Number(balanceRow?.balance ?? 0) - freed, 0));
      }
      // Floored at zero, as client_sales_balance does, so a negative migrated row can't lower the balance.
      const net = Math.max(Number(sale.net ?? sale.amount ?? 0), 0);
      const projected = /** @type {number} */ (projectedBalanceByClient.get(sale.client)) + net;
      if (projected > limit) throw new Error(`Invoice ${label}: credit limit exceeded for ${sale.client} (${projected.toFixed(2)} / ${limit.toFixed(2)}). Needs Admin/CEO/Superadmin authorization.`);
      projectedBalanceByClient.set(sale.client, projected);
    }
  }

  };

  const canImport = ["Superadmin", "CEO"].includes(profile.role) || Boolean(profile.customPermissions?.edit?.includes("imports"));
  for (const row of newSaleRows) {
    const sale = row.data || {};
    // A row that arrives already Cancelled moves no stock and adds no receivable (e.g. cancelling an
    // invoice whose stored record key differs from the one the client sends), so the creation
    // checks below — stock, expired lot, credit — don't apply.
    if (String(sale.status || "").toLowerCase() === "cancelled") continue;
    assertSaleBasics(sale, sale.documentNo || row.record_key);
    // `migrated` skips the stock and amount checks below, and the client sets it, so it's limited to
    // the people who can actually run an import.
    if (sale.migrated && !canImport) throw new Error(`Invoice ${sale.documentNo || row.record_key}: saving a migrated invoice requires Imports edit permission.`);
    // Opening-AR migration must run after the Clients masterlist import: a migrated invoice may only
    // reference a client already on file (exact masterlist name). Auto-creating bare placeholder
    // clients from sales rows used to give them default 30-day terms (wrong aging) and then block
    // the real Clients import as "duplicate existing client".
    if (sale.migrated) {
      const clientRows = await loadClientRows();
      if (!clientRows.some((clientRow) => clientRow.data?.name === sale.client)) throw new Error(`Invoice ${sale.documentNo || row.record_key}: client "${sale.client || ""}" is not in the Clients masterlist. Import Clients before migrating sales.`);
    }
    // A skip-PO invoice (buildSale's skipPo path) has no PO behind it, so it's the one invoice
    // shape where the client field is a brand-new, unanchored relationship — check it before the
    // `continue` below skips the rest of this row's validation along with it.
    if (sale.noPo && !sale.migrated && sale.client) {
      if (!archivedClientNames) {
        const clientRows = await loadClientRows();
        archivedClientNames = new Set(clientRows.filter((clientRow) => clientRow.data?.archived).map((clientRow) => clientRow.data?.name));
      }
      if (archivedClientNames.has(sale.client)) throw new Error(`Invoice ${sale.documentNo || row.record_key}: ${sale.client} is archived and can no longer be used on a new invoice.`);
    }
    // Historical backfills from the Sales/Collections migration importer (buildMigratedSale in
    // modules.js) carry their own net/tax formula and never touch live inventory — they aren't
    // the live invoice-creation path this validation targets, so leave them alone. Same for a
    // skip-PO invoice (buildSale's skipPo path): it's a record-keeping/collections-only entry
    // with no PO and no real stock movement behind it, so it never touches inventory either.
    const label = sale.documentNo || row.record_key;
    if (sale.migrated || sale.noPo) {
      const flaggedDiscount = Number(sale.discount || 0);
      if (!Number.isFinite(flaggedDiscount) || flaggedDiscount < 0) throw new Error(`Invoice ${label}: discount cannot be negative.`);
      if (flaggedDiscount > 0 && !canAuthorizeDiscount) throw new Error(`Invoice ${label}: discounts require Admin/CEO/Superadmin authorization.`);
      if (sale.noPo && !sale.migrated) {
        // Skips stock, but not the arithmetic: otherwise a net of 0 on a large invoice would pass
        // the credit check below. buildSale() computes these the same way on the skip-PO path.
        assertSaleNotNegative(sale, label);
        if (sale.type !== "DR") {
          const flaggedAmount = Number(sale.amount || 0);
          const recomputed = saleLinesOf(sale).reduce((/** @type {number} */ sum, line) => sum + Math.max(0, Number(line.qty) * Number(line.price)), 0);
          if (!(Math.abs(recomputed - flaggedAmount) <= 0.01)) throw new Error(`Invoice ${label}: amount does not match its line items.`);
          if (!(Math.abs(Number(sale.net ?? sale.amount ?? 0) - (flaggedAmount - flaggedDiscount)) <= 0.01)) throw new Error(`Invoice ${label}: net amount does not match amount minus discount.`);
        }
      }
      await checkCredit(sale, label);
      continue;
    }
    const lines = saleLinesOf(sale);

    for (const line of lines) {
      const qty = Number(line.qty);
      const price = Number(line.price);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invoice ${label}: invalid quantity for ${line.item || line.code || "a line item"}.`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Invoice ${label}: invalid price for ${line.item || line.code || "a line item"}.`);
      if (isExpiredDate(line.expiry)) throw new Error(`Invoice ${label}: expired lot blocked for ${line.item || line.code || "a line item"}.`);
    }

    if (sale.type === "DR") assertSaleNotNegative(sale, label);
    if (sale.type !== "DR") {
      const recomputedAmount = lines.reduce((/** @type {number} */ sum, line) => sum + Math.max(0, Number(line.qty) * Number(line.price)), 0);
      const submittedAmount = Number(sale.amount || 0);
      if (Math.abs(recomputedAmount - submittedAmount) > 0.01) throw new Error(`Invoice ${label}: amount does not match its line items.`);

      const discount = Number(sale.discount || 0);
      if (!Number.isFinite(discount) || discount < 0) throw new Error(`Invoice ${label}: discount cannot be negative.`);
      if (discount > submittedAmount) throw new Error(`Invoice ${label}: discount cannot exceed gross amount.`);
      if (discount > 0 && !canAuthorizeDiscount) throw new Error(`Invoice ${label}: discounts require Admin/CEO/Superadmin authorization.`);

      const submittedNet = Number(sale.net ?? sale.amount ?? 0);
      if (Math.abs(submittedNet - (submittedAmount - discount)) > 0.01) throw new Error(`Invoice ${label}: net amount does not match amount minus discount.`);
    }

    await checkCredit(sale, label);

    if (!inventoryByKey) {
      /** @type {StoredRow<InventoryRowData>[]} */
      const invRows = stockCheckedCodes.size
        ? await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&data->>code=in.${encodeURIComponent(postgrestIn([...stockCheckedCodes]))}&select=data`)
        : [];
      inventoryByKey = new Map();
      for (const invRow of invRows) {
        const item = invRow.data || {};
        inventoryByKey.set(saleStockLookupKey(item.code, item.branch, item.lot), Number(item.qty || 0));
      }
      // Mirrors restoreCancelledStock() (modules.js): a skip-PO or migrated original never took stock.
      for (const cancelled of cancelledInBatch) {
        if (cancelled.noPo || cancelled.migrated) continue;
        for (const line of saleLinesOf(cancelled)) {
          const key = saleStockLookupKey(line.code, line.sourceBranch || line.branch, line.lot);
          if (inventoryByKey.has(key)) inventoryByKey.set(key, /** @type {number} */ (inventoryByKey.get(key)) + Math.max(Number(line.qty || 0), 0));
        }
      }
    }
    for (const line of lines) {
      const branch = line.sourceBranch || line.branch;
      const qty = Number(line.qty);
      const exactKey = saleStockLookupKey(line.code, branch, line.lot);
      let key = exactKey;
      let available = inventoryByKey.get(exactKey) || 0;
      // A lot typed during invoicing can "claim" stock that was received without one on file
      // (see itemStockLotTracked in modules.js) — mirror that fallback here so the same line
      // that passes client-side validation doesn't get rejected server-side.
      if (available < qty) {
        const untrackedKey = saleStockLookupKey(line.code, branch, "");
        const untrackedAvailable = inventoryByKey.get(untrackedKey) || 0;
        if (untrackedAvailable >= qty) { key = untrackedKey; available = untrackedAvailable; }
      }
      if (qty > available) throw new Error(`Invoice ${label}: insufficient stock for ${line.item || line.code || "item"} in ${branch || "the selected branch"} (available ${available}, requested ${qty}).`);
      // Decrement within this batch so two new invoices in the same save that both claim the
      // last unit of something can't both pass — the second sees what the first already took.
      inventoryByKey.set(key, available - qty);
    }
  }
}

// buildPurchaseOrder() (modules.js) already blocks creating/editing a PO against an archived
// client client-side — this mirrors it server-side, the same way validateNewSaleRows() above
// mirrors buildSale()'s skip-PO archived-client check. Checked for every incoming PO row (new
// or edited), since buildPurchaseOrder() allows changing the client on an edit too.
/** @param {WorkerEnv} env @param {string} stateKey @param {AppRecordRow<PoRowData>[]} poRows */
async function assertPurchaseOrderClientsNotArchived(env, stateKey, poRows) {
  const clientNames = [...new Set(poRows.map((row) => row.data?.client).filter(Boolean))];
  if (!clientNames.length) return;
  const [clientRows, storedPoRows] = /** @type {[StoredRow<ClientRowData>[], StoredRow<PoRowData>[]]} */ (await Promise.all([
    supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.clients&select=data`),
    supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.purchaseOrders&record_key=in.${encodeURIComponent(postgrestIn(poRows.map((row) => row.record_key)))}&select=record_key,data`),
  ]));
  const archivedClientNames = new Set(clientRows.filter((clientRow) => clientRow.data?.archived).map((clientRow) => clientRow.data?.name));
  const storedClientByKey = new Map(storedPoRows.map((entry) => [entry.record_key, entry.data?.client]));
  for (const row of poRows) {
    const client = row.data?.client;
    // A PO already saved against this client (e.g. client archived afterwards, then the PO is
    // re-saved by a pending-save retry or an unrelated edit) isn't a *new use* of the archived
    // client — only block new POs or ones switched onto an archived client.
    if (storedClientByKey.has(row.record_key) && storedClientByKey.get(row.record_key) === client) continue;
    if (client && archivedClientNames.has(client)) throw new Error(`Purchase Order ${row.data?.id || row.record_key}: ${client} is archived and can no longer be used on a purchase order.`);
  }
}

// Masterlist uniqueness, enforced server-side (the client checks only its own, possibly stale,
// copy). Only rows that are new — or whose name/code/TIN actually changed — are checked, so
// legacy duplicates already in the data never block an unrelated edit. Names compare ignoring
// case, spaces and punctuation; codes ignore case and spaces; TINs compare by digits.
/** @type {Record<string, any>} */
const MASTERLIST_UNIQUE_FIELDS = {
  clients: { name: "name", code: "code", tin: "tin", label: "client" },
  // nameNeedsNoCode: a shared name is allowed when both records have their own code.
  suppliers: { name: "name", code: "code", tin: "tin", label: "supplier", nameNeedsNoCode: true },
  items: { name: "name", code: "code", label: "item", nameNeedsNoCode: true },
  banks: { name: "name", label: "bank" },
  employees: { name: "name", label: "employee" },
};
const masterName = (/** @type {any} */ value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const masterCode = (/** @type {any} */ value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");
// An all-zero TIN is a "no TIN on file" placeholder, so it never counts as a duplicate.
const masterTin = (/** @type {any} */ value) => { const digits = String(value ?? "").replace(/\D/g, ""); return /^0+$/.test(digits) ? "" : digits; };
// Client TINs several client records may share on purpose: Universidad de Sta. Isabel (R5_94) and
// its USI-HSD unit (R5_95) are one taxpayer. Keep in sync with SHARED_CLIENT_TINS in public/scripts/state.js.
const SHARED_CLIENT_TINS = new Set(["417226790001"]);

/** @param {any} data @param {any} spec */
function masterlistIdentity(data, spec) {
  return {
    name: masterName(data?.[spec.name]),
    code: spec.code ? masterCode(data?.[spec.code]) : "",
    tin: spec.tin && masterTin(data?.[spec.tin]).length === 12 && !(spec.label === "client" && SHARED_CLIENT_TINS.has(masterTin(data[spec.tin]))) ? masterTin(data[spec.tin]) : "",
  };
}

/** @param {WorkerEnv} env @param {string} stateKey @param {AppRecordRow[]} rows @param {{ replaceModules?: any }} options */
async function assertMasterlistUnique(env, stateKey, rows, { replaceModules = false } = {}) {
  /** @type {Record<string, AppRecordRow[]>} */
  const incomingByModule = {};
  for (const row of rows) if (MASTERLIST_UNIQUE_FIELDS[row.module_name] && !row.data?.archived) (incomingByModule[row.module_name] ||= []).push(row);
  for (const [moduleName, incoming] of Object.entries(incomingByModule)) {
    const spec = MASTERLIST_UNIQUE_FIELDS[moduleName];
    const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${moduleName}&select=record_key,data`));
    const storedByKey = new Map(stored.map((/** @type {any} */ entry) => [entry.record_key, entry.data || {}]));
    const incomingKeys = new Set(incoming.map((row) => row.record_key));
    // A whole-module state save replaces the module: stored rows missing from it are being removed.
    /** @type {{ key: string, id: any, incoming?: boolean }[]} */
    const active = stored.filter((/** @type {any} */ entry) => !replaceModules && !entry.data?.archived && !incomingKeys.has(entry.record_key)).map((/** @type {any} */ entry) => ({ key: entry.record_key, id: masterlistIdentity(entry.data, spec) }));
    // Rows in this same save count as "existing" for each other.
    for (const row of incoming) active.push({ key: row.record_key, id: masterlistIdentity(row.data, spec), incoming: true });
    for (const row of incoming) {
      /** @type {Record<string, any>} */
      const id = masterlistIdentity(row.data, spec);
      const prev = storedByKey.get(row.record_key);
      /** @type {Record<string, any> | null} */
      const prevId = prev ? masterlistIdentity(prev, spec) : null;
      for (const field of ["name", "code", "tin"]) {
        if (!id[field]) continue;
        if (prevId && prevId[field] === id[field]) continue;
        const clash = active.find((/** @type {any} */ other) => other.key !== row.record_key && other.id[field] === id[field] && !(field === "name" && spec.nameNeedsNoCode && id.code && other.id.code));
        if (clash) throw new Error(`Duplicate ${spec.label} ${field === "tin" ? "TIN" : field} detected: "${row.data?.[spec[field]]}" already exists.`);
      }
    }
  }
}

/** @param {WorkerEnv} env @param {any} memo */
async function postMemoToDiscord(env, memo) {
  if (!env.MEMO_DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Memo Discord post skipped", module: "Discord", record: `${memo.id}: MEMO_DISCORD_WEBHOOK_URL not configured` });
    return;
  }
  const audienceLabel = memo.audience === "all" ? "🌐 All Departments" : `🎯 ${memo.audience.join(", ")}`;
  const bodyPreview = String(memo.body || "").length > 600 ? `${memo.body.slice(0, 600)}…` : memo.body;
  const fields = [
    { name: "👥 Audience", value: audienceLabel, inline: true },
    { name: "🧑‍💼 Posted By", value: `${memo.createdBy} (${memo.createdByRole})`, inline: true },
  ];
  if (memo.eventDate) fields.push({ name: "📅 Event", value: `${memo.eventDate}${memo.eventTime ? ` · 🕒 ${memo.eventTime}` : ""}${memo.place ? ` · 📍 ${memo.place}` : ""}`, inline: false });
  fields.push({ name: "📝 Message", value: bodyPreview || "—", inline: false });
  await sendDiscordWebhookUrl(env, env.MEMO_DISCORD_WEBHOOK_URL, {
    content: "@everyone 📢 **New Memo Posted!**",
    allowedMentions: { parse: ["everyone"] },
    embeds: [{ title: `📋 ${memo.title}`, description: `Memo No. **${memo.id}**`, color: 0x006eb6, fields, timestamp: new Date().toISOString(), footer: { text: "Medlane OS · Memos & Announcements" } }],
  }).catch(async (error) => {
    await recordSystemLog(env, { action: "Memo Discord post failed", module: "Discord", record: `${memo.id}: ${error.message}` }).catch(() => null);
  });
}

/** @param {Profile} profile */
function requireBackupAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can manage backups");
}

/** @param {Profile} profile */
function requireDigestAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can send digests");
}

/** @param {Profile} profile */
function requirePoApprover(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can approve purchase orders");
}

/** @param {Profile} profile */
function requirePoReceiver(profile) {
  if (!["Superadmin", "CEO", "Logistics"].includes(profile?.role)) throw new Error("Only Logistics/Superadmin/CEO can update purchase order receiving");
}

/** @param {Profile} profile */
function requirePaymentRequestApprover(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can approve payment requests");
}

// Demo request workflow (see saveDemoRequest/updateDemoRequestStatus in modules.js):
//   filed by Engineering / Product Specialist (or Superadmin/CEO)
//   machines & spare parts only -> "For Management Approval" (Superadmin/CEO) -> "Approved"
//   any consumable line        -> "For Logistics Approval" (Logistics) -> "For Management Approval" -> "Approved"
//   "Approved" -> "Returned" / "To Sales" when the units come back.
// "For Sales Approval" is the retired first step; it is still honoured for requests filed before it.
/** @param {DemoRequestData} request */
function demoRequestInitialStatus(request) {
  return (request?.lines || []).some((line) => /consumable/i.test(String(line?.type || ""))) ? "For Logistics Approval" : "For Management Approval";
}

/** @type {Record<string, Record<string, AppRole[]> | undefined>} */
const DEMO_TRANSITIONS = {
  "For Logistics Approval": { "For Management Approval": ["Logistics", "Superadmin", "CEO"] },
  "For Sales Approval": { "For Management Approval": ["Sales", "Admin", "Superadmin", "CEO"] },
  "For Management Approval": { Approved: ["Superadmin", "CEO"] },
  Approved: { Returned: ["Sales", "Admin", "Superadmin", "CEO", "Logistics"], "To Sales": ["Sales", "Admin", "Superadmin", "CEO", "Logistics"] },
};

// Engineering / Product Specialist may only move an EXISTING support report through its status
// workflow: they cannot create reports or change anything beyond these workflow fields.
/** @type {AppRole[]} */
const SUPPORT_STATUS_ONLY_ROLES = ["Engineering", "Product Specialist"];
const SUPPORT_STATUS_FIELDS = new Set(["status", "currentActor", "resolvedBy", "resolvedAt", "history", "actionsTaken"]);
// Calendar events: anyone may add one (as themselves); only its creator or Superadmin/CEO may
// change or remove (soft-delete via `removed`) an existing one.
/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertCalendarEventChangesAllowed(env, stateKey, profile, rows) {
  const eventRows = rows.filter((row) => row.module_name === "calendarEvents");
  if (!eventRows.length) return;
  const isManagement = ["Superadmin", "CEO"].includes(profile?.role);
  const me = String(profile?.email || "").trim().toLowerCase();
  const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.calendarEvents&record_key=in.${encodeURIComponent(postgrestIn(eventRows.map((row) => row.record_key)))}&select=record_key,data`));
  const storedByKey = new Map(stored.map((row) => [row.record_key, /** @type {Record<string, unknown>} */ (row.data || {})]));
  for (const row of eventRows) {
    const next = /** @type {Record<string, unknown>} */ (row.data || {});
    const prev = storedByKey.get(row.record_key);
    const owner = String((prev || next).createdByUser || "").trim().toLowerCase();
    if (!next.removed) {
      if (!String(next.title || "").trim()) throw new Error("Calendar event needs a name");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date || ""))) throw new Error("Calendar event needs a valid date");
      if (!/^\d{2}:\d{2}$/.test(String(next.time || ""))) throw new Error("Calendar event needs a valid time");
      // Only today or later (Manila) for new events or a moved date; old past events stay removable.
      if ((!prev || String(prev.date || "") !== String(next.date || "")) && String(next.date) < shortDate()) throw new Error("Calendar event can only be scheduled for today or a future date");
    }
    if (!prev) {
      if (owner !== me && !isManagement) throw new Error("You can only add calendar events as yourself");
      continue;
    }
    const keys = ["title", "date", "time", "removed", "createdByUser"];
    const changed = keys.some((key) => String(prev[key] ?? "") !== String(next[key] ?? ""));
    if (changed && owner !== me && !isManagement) throw new Error("Only the person who added this calendar event can change or remove it");
  }
}

/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertSupportReportChangesAllowed(env, stateKey, profile, rows) {
  if (!SUPPORT_STATUS_ONLY_ROLES.includes(profile?.role)) return;
  const incoming = rows.filter((row) => row.module_name === "productIssues");
  if (!incoming.length) return;
  const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.productIssues&record_key=in.${encodeURIComponent(postgrestIn(incoming.map((row) => row.record_key)))}&select=record_key,data`));
  const storedByKey = new Map(stored.map((row) => [row.record_key, row.data || {}]));
  for (const row of incoming) {
    const prev = storedByKey.get(row.record_key);
    if (!prev) throw new Error("Only Sales, Admin, CEO or Superadmin can request a service report");
    /** @type {Record<string, any>} */
    const next = row.data || {};
    for (const field of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (SUPPORT_STATUS_FIELDS.has(field)) continue;
      if (JSON.stringify(prev[field] ?? null) !== JSON.stringify(next[field] ?? null)) throw new Error(`${profile.role} can only update the status of ${row.record_key}`);
    }
  }
}

/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertDemoRequestTransitionsAllowed(env, stateKey, profile, rows) {
  const incoming = rows.filter((row) => row.module_name === "inventoryDemoRequests");
  if (!incoming.length) return;
  const stored = /** @type {StoredRow<DemoRequestData>[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryDemoRequests&record_key=in.${encodeURIComponent(postgrestIn(incoming.map((row) => row.record_key)))}&select=record_key,data`));
  const storedByKey = new Map(stored.map((row) => [row.record_key, row.data || {}]));
  const role = profile?.role;
  for (const row of incoming) {
    /** @type {DemoRequestData} */
    const next = row.data || {};
    const prev = storedByKey.get(row.record_key);
    if (!prev) {
      if (!DEMO_REQUESTER_ROLES.includes(role)) throw new Error("Only Sales, Engineering or Product Specialist can request a demo");
      if (next.status !== demoRequestInitialStatus(next)) throw new Error(`New demo request ${row.record_key} must start at ${demoRequestInitialStatus(next)}`);
      continue;
    }
    if (String(prev.status || "") === String(next.status || "")) continue;
    const allowed = DEMO_TRANSITIONS[/** @type {string} */ (prev.status)]?.[/** @type {string} */ (next.status)];
    if (!allowed) throw new Error(`Demo request ${row.record_key} cannot move from ${prev.status} to ${next.status}`);
    if (!allowed.includes(role)) throw new Error(`Only ${allowed.join("/")} can move ${row.record_key} to ${next.status}`);
  }
}

// Approving a payable or expense request is segregated from preparing it: payables are
// Superadmin/CEO-only, and Accounting (who prepares both) can never approve either. Diffs each
// incoming payables/replenishments row against the stored one so only an actual transition into
// "Approved" is checked — ordinary edits and payment confirmation on already-approved rows pass.
/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertFinancialApprovalAllowed(env, stateKey, profile, rows) {
  const role = profile?.role;
  const isManagement = ["Superadmin", "CEO"].includes(role);
  const lower = (/** @type {unknown} */ value) => String(value ?? "").trim().toLowerCase();
  const fetchStored = async (/** @type {string} */ moduleName, /** @type {AppRecordRow[]} */ candidates) => {
    if (!candidates.length) return new Map();
    const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${moduleName}&record_key=in.${encodeURIComponent(postgrestIn(candidates.map((row) => row.record_key)))}&select=record_key,data`));
    return new Map(stored.map((row) => [row.record_key, row.data || {}]));
  };

  // Payables / expense requests: any approved-or-paid-looking state (not just the literal
  // requestStatus) counts, compared case-insensitively against the stored row, so a non-approver
  // can't reach it by writing status/paymentConfirmed instead of requestStatus.
  if (!isManagement) {
    const approvedLike = (/** @type {Record<string, unknown>} */ data) => lower(data?.requestStatus) === "approved" || ["approved", "paid"].includes(lower(data?.status)) || data?.paymentConfirmed === true || data?.paymentConfirmed === "true";
    for (const moduleName of ["payables", "replenishments"]) {
      const candidates = rows.filter((row) => row.module_name === moduleName && approvedLike(row.data));
      if (!candidates.length) continue;
      const stored = await fetchStored(moduleName, candidates);
      for (const row of candidates) {
        if (lower(stored.get(row.record_key)?.requestStatus) === "approved") continue;
        if (moduleName === "payables") throw new Error("Only Superadmin or CEO can approve payable requests");
        if (role === "Accounting") throw new Error("Accounting cannot approve expense requests");
      }
    }

    // Collection payment requests: only Superadmin/CEO move one into Approved (the dedicated
    // approver guard was never wired into these generic writers).
    const prCandidates = rows.filter((row) => row.module_name === "paymentRequests" && (lower(row.data?.requestStatus) === "approved" || lower(row.data?.status) === "approved"));
    if (prCandidates.length) {
      const stored = await fetchStored("paymentRequests", prCandidates);
      for (const row of prCandidates) {
        const prev = stored.get(row.record_key);
        if (prev && (lower(prev.requestStatus) === "approved" || lower(prev.status) === "approved")) continue;
        throw new Error("Only Superadmin/CEO can approve payment requests");
      }
    }

    // Stock receipts: approving or cancelling one is Superadmin/CEO-only (requireStockReceiptApprover).
    const receiptCandidates = rows.filter((row) => row.module_name === "stockReceipts" && lower(row.data?.status) !== "pending approval");
    if (receiptCandidates.length) {
      const stored = await fetchStored("stockReceipts", receiptCandidates);
      for (const row of receiptCandidates) {
        if (stored.has(row.record_key) && lower(stored.get(row.record_key)?.status) === lower(row.data?.status)) continue;
        throw new Error("Only Superadmin/CEO can approve or cancel stock receipts");
      }
    }
  }

  // Expense requests: a Cancelled one is final — nobody edits or revives it. A Returned one is back
  // with its maker, who edits and resubmits it; anyone else may only cancel it. (Client gates the
  // buttons in requestActions/openExpenseForResubmit; this enforces it for any direct save.)
  const expenseRows = rows.filter((row) => row.module_name === "replenishments");
  if (expenseRows.length) {
    const stored = await fetchStored("replenishments", expenseRows);
    // Only the fields a real edit/approval changes are compared: the client fills in defaults
    // (empty method/bank/cheque, …) when it loads expenses, so a whole-row comparison would flag
    // an untouched cancelled expense on every full save. Key order is normalised too — Postgres
    // jsonb reorders object keys.
    /** @param {unknown} value @returns {unknown} */
    const canonical = (value) => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(/** @type {Record<string, unknown>} */ (value)[key])]))
      : value ?? "";
    // Fields the client never back-fills on load (method → "Cash", rebuilt items and a derived
    // requestStatus are left out; status is checked separately below).
    const expenseFields = ["type", "requester", "employeeName", "office", "date", "amount"];
    const sameData = (/** @type {Record<string, unknown>} */ a, /** @type {Record<string, unknown>} */ b) =>
      expenseFields.every((field) => JSON.stringify(canonical(a?.[field])) === JSON.stringify(canonical(b?.[field])))
      && (!Array.isArray(a?.items) || JSON.stringify(canonical(a.items)) === JSON.stringify(canonical(b?.items)))
      && Boolean(a?.paymentConfirmed) === Boolean(b?.paymentConfirmed);
    const statusOf = (/** @type {Record<string, unknown>} */ data) => lower(data?.requestStatus || data?.status);
    for (const row of expenseRows) {
      const prev = stored.get(row.record_key);
      if (!prev) continue;
      if (statusOf(prev) === "cancelled") {
        if (statusOf(row.data) !== "cancelled" || !sameData(prev, row.data)) throw new Error(`Expense ${row.record_key} is cancelled and can no longer be edited`);
        continue;
      }
      if (statusOf(prev) === "returned" && statusOf(row.data) !== "cancelled" && !(statusOf(row.data) === "returned" && sameData(prev, row.data))) {
        const maker = lower(prev.createdByUser);
        if (!maker || maker !== lower(profile?.email)) throw new Error(`Only the person who made expense ${row.record_key} can edit it while it is returned`);
      }
    }
  }

  // A bounced collection can only be moved on (redeposited) by a Superadmin or CEO — the client offers
  // that as the one action on a Bounced payment, but the plain record save would otherwise let
  // any collections user flip it straight back to For Deposit/Deposited.
  if (!isManagement) {
    const paymentCandidates = rows.filter((row) => row.module_name === "payments" && lower(row.data?.collectionStatus) !== "bounced");
    if (paymentCandidates.length) {
      const stored = await fetchStored("payments", paymentCandidates);
      for (const row of paymentCandidates) {
        if (lower(stored.get(row.record_key)?.collectionStatus) === "bounced") throw new Error("Only Superadmin/CEO can redeposit a bounced payment");
      }
    }
  }

  // Inventory purchase orders: approval is Superadmin/CEO only (requirePoApprover).
  if (!isManagement) {
    const poCandidates = rows.filter((row) => row.module_name === "inventoryPurchaseOrders" && lower(row.data?.status) === "approved");
    if (poCandidates.length) {
      const stored = await fetchStored("inventoryPurchaseOrders", poCandidates);
      for (const row of poCandidates) {
        if (lower(stored.get(row.record_key)?.status) === "approved") continue;
        throw new Error("Only Superadmin/CEO can approve purchase orders");
      }
    }
    // A PO still awaiting approval may not be moved on (sent, received…) by a plain save either —
    // the only ways out are approval (above / the approve endpoint) or cancelling it.
    const pendingCandidates = rows.filter((row) => row.module_name === "inventoryPurchaseOrders" && !["pending approval", "approved", "cancelled"].includes(lower(row.data?.status)));
    if (pendingCandidates.length) {
      const stored = await fetchStored("inventoryPurchaseOrders", pendingCandidates);
      for (const row of pendingCandidates) {
        if (lower(stored.get(row.record_key)?.status) === "pending approval") throw new Error("A purchase order must be approved by Superadmin/CEO before it can move on");
      }
    }
  }
}

// Accounting can submit an invoice that exceeds a client's credit limit (see validateNewSaleRows),
// but it lands in pendingCreditInvoices with status "Pending" rather than becoming a sale — only
// Superadmin/CEO/Admin may move it to "Approved" or "Rejected". Diffs against the stored status so
// only an actual transition out of "Pending" is checked.
/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {AppRecordRow[]} rows */
async function assertCreditApprovalAllowed(env, stateKey, profile, rows) {
  if (["Superadmin", "CEO", "Admin"].includes(profile?.role)) return;
  // Case-insensitive, like the payables check, so "approved" can't slip past as a different status.
  const lower = (/** @type {unknown} */ value) => String(value ?? "").trim().toLowerCase();
  const candidates = rows.filter((row) => row.module_name === "pendingCreditInvoices" && ["approved", "rejected"].includes(lower(row.data?.status)));
  if (!candidates.length) return;
  const stored = /** @type {StoredRow[]} */ (await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.pendingCreditInvoices&record_key=in.${encodeURIComponent(postgrestIn(candidates.map((row) => row.record_key)))}&select=record_key,data`));
  const storedStatus = new Map(stored.map((row) => [row.record_key, row.data?.status]));
  for (const row of candidates) {
    if (lower(storedStatus.get(row.record_key)) === lower(row.data.status)) continue;
    throw new Error("Only Superadmin, CEO, or Admin can approve or reject a credit-limit invoice request");
  }
}

/** @param {Profile} profile */
function requireStockReceiptApprover(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can approve stock receipts");
}

const receivingSources = ["Shipment", "Local Purchase"];

/** @param {any} body */
function validateReceivingMeta(body) {
  const orderNumber = String(body.orderNumber || "").trim();
  if (!orderNumber) throw new Error("Order Number is required");
  const dateReceived = String(body.dateReceived || "").trim();
  if (!dateReceived || !/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)) throw new Error("A valid Date Received is required");
  const source = String(body.source || "").trim();
  if (!receivingSources.includes(source)) throw new Error("Source must be Shipment or Local Purchase");
  return { orderNumber, dateReceived, source };
}

// Finds the PO line a received row posts against. The lot typed on the PO (if any) is only the
// expected lot — the receiver records the lot actually delivered, so an exact lot match is
// preferred but any open line for the same item code is accepted. `allocated` tracks quantity
// already claimed by earlier rows in the same receipt, so one item split across several lots
// can't over-receive a single PO line.
/** @param {InventoryPO} po @param {string} code @param {string} lot @param {Map<PoLine, number>} allocated */
function matchReceivingPoLine(po, code, lot, allocated) {
  const open = (po.lines || []).filter((entry) => entry.code === code && Number(entry.qty || 0) - Number(entry.receivedQty || 0) - (allocated.get(entry) || 0) > 0);
  return open.find((entry) => entry.lot && entry.lot === lot) || open.find((entry) => !entry.lot) || open[0] || null;
}

// Keep in sync with ALL_RECEIVING_BRANCHES in modules.js.
const ALL_RECEIVING_BRANCHES = "All Branches";

/** @param {InventoryPO | null | undefined} po @param {ReceivingLineInput[]} submittedLines @param {MasterItem[]} items */
function validateReceivingLines(po, submittedLines, items) {
  if (!Array.isArray(submittedLines) || !submittedLines.length) throw new Error("No receiving lines provided");
  /** @type {Map<PoLine, number>} */
  const allocated = new Map();
  return submittedLines.map((submitted) => {
    const code = String(submitted.code || "").trim();
    if (!code) throw new Error("Item code is required for every receiving line");
    const item = items.find((entry) => entry.code === code);
    if (!item) throw new Error(`Unknown item code: ${code}`);
    const equipment = isEquipmentItem(item);
    const qty = Number(submitted.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid quantity for ${code}`);
    // A PO raised for "All Branches" has no single branch to fall back on — each line names its own.
    const branch = String(submitted.branch || (po?.branch === ALL_RECEIVING_BRANCHES ? "" : po?.branch) || "").trim();
    if (!branch || branch === ALL_RECEIVING_BRANCHES) throw new Error(`Choose a receiving branch for ${code}`);
    const lot = String(submitted.lot || "").trim();
    const expiry = equipment ? "N/A" : String(submitted.expiry || "").trim();
    /** @type {PoLine | null} */
    let poLine = null;
    if (po) {
      poLine = matchReceivingPoLine(po, code, lot, allocated);
      if (!poLine) throw new Error(`${code} has nothing left to receive on this purchase order`);
      const remaining = Number(poLine.qty || 0) - Number(poLine.receivedQty || 0) - (allocated.get(poLine) || 0);
      if (qty > remaining) throw new Error(`Cannot receive ${qty} of ${code} — only ${remaining} remain on this order`);
      allocated.set(poLine, (allocated.get(poLine) || 0) + qty);
    }
    return { code, item: poLine?.item || item.name, brand: poLine?.brand || item.brand || "Medlane", branch, lot, expiry, qty };
  });
}

/** @param {any} po @param {any} lines @param {any} inventory */
function applyReceivingLines(po, lines, inventory) {
  let totalReceived = 0;
  for (const entry of lines) {
    if (po) {
      // receivedQty is bumped as each row posts, so an empty `allocated` map is correct here.
      const poLine = matchReceivingPoLine(po, entry.code, entry.lot, new Map());
      if (!poLine) throw new Error(`${entry.code} has nothing left to receive on this purchase order`);
      const remaining = Number(poLine.qty || 0) - Number(poLine.receivedQty || 0);
      if (entry.qty > remaining) throw new Error(`Cannot receive ${entry.qty} of ${entry.code} — only ${remaining} remain on this order`);
      poLine.lot = poLine.lot || entry.lot;
      poLine.expiry = poLine.expiry || entry.expiry;
      poLine.receivedQty = Number(poLine.receivedQty || 0) + entry.qty;
    }
    totalReceived += entry.qty;
    const existing = inventory.find((/** @type {any} */ inv) => inv.code === entry.code && inv.branch === entry.branch && inv.lot === entry.lot);
    if (existing) existing.qty = Number(existing.qty || 0) + entry.qty;
    else inventory.push({ code: entry.code, item: entry.item, brand: entry.brand, branch: entry.branch, lot: entry.lot, serial: entry.lot, expiry: entry.expiry, qty: entry.qty, min: 10 });
  }
  return totalReceived;
}

/** @param {any} authUser */
function userStatusFromAuth(authUser) {
  if (!authUser) return "Profile only";
  if (authUser.banned_until) return "Disabled";
  if (authUser.confirmed_at || authUser.email_confirmed_at) return "Active";
  if (authUser.invited_at) return "Pending Invite";
  return "Pending";
}

/** @param {ProfileRow | null | undefined} profile @param {any} authUser @param {string} [email] */
function userDisplayName(profile, authUser, email = "") {
  const value = profile?.full_name || authUser?.user_metadata?.full_name || authUser?.raw_user_meta_data?.full_name || authUser?.user_metadata?.name || "";
  return String(value || "").trim() || (profile || authUser ? email : "Unlinked Auth Account (no profile)");
}

/** @param {ProfileRow | null | undefined} profile @param {any} authUser @param {ModulePermissionRow[]} [permissions] */
function userFromProfileAndAuth(profile, authUser, permissions = []) {
  const role = profile?.role || authUser?.user_metadata?.role || "Sales";
  const fallback = roleModules[/** @type {AppRole} */ (role)] || roleModules.Sales;
  const view = permissions.length ? permissions.filter((item) => item.can_view).map((item) => item.module_key) : fallback;
  const edit = permissions.length ? permissions.filter((item) => item.can_edit).map((item) => item.module_key) : withoutViewOnlyDefaults(role, roleEditableFallback(role, view));
  const email = cleanEmail(profile?.email || authUser?.email || "");
  return {
    id: profile?.id || authUser?.id || email,
    name: userDisplayName(profile, authUser, email),
    email,
    role,
    branch: profile?.branch || authUser?.user_metadata?.branch || "all",
    phone: profile?.phone || authUser?.phone || "",
    modules: view,
    customPermissions: { enabled: true, view, edit },
    superadminPermissions: role === "Superadmin" || Boolean(profile?.is_superadmin),
    inviteStatus: userStatusFromAuth(authUser),
    disabledReason: authUser?.user_metadata?.disabled_reason || "",
    access: `${role} with ${view.length} view / ${edit.length} edit modules`,
  };
}

/** @param {WorkerEnv} env @param {{ id: string, email: string, name: any }} options */
async function userDeleteBlockers(env, { id, email, name }) {
  const needles = [id, email, name].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  /** @type {any[]} */
  const blockers = [];
  if (!needles.length) return blockers;
  const sessions = id ? await supabaseFetch(env, `/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(id)}&revoked_at=is.null&select=id`) .catch(() => []) : [];
  if (sessions.length) blockers.push(`${sessions.length} active device session${sessions.length === 1 ? "" : "s"}`);
  const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=module_name,record_key,data`);
  const ignored = new Set(["users", "logs", "notifications"]);
  for (const row of rows) {
    if (ignored.has(row.module_name)) continue;
    const text = JSON.stringify(row.data || {}).toLowerCase();
    if (needles.some((needle) => text.includes(needle))) blockers.push(`${row.module_name}: ${row.record_key}`);
    if (blockers.length >= 12) break;
  }
  return blockers;
}

/** @param {any} role @param {any} view */
function roleEditableFallback(role, view) {
  if (["Superadmin", "CEO", "Admin"].includes(role)) return view;
  return view.filter((/** @type {any} */ module) => !["users", "settings", "backup", "security", "logs"].includes(module));
}

/** @param {string | null | undefined} email */
function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** @param {string} email */
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** @param {unknown} role @returns {role is AppRole} */
function validRole(role) {
  return Object.prototype.hasOwnProperty.call(roleModules, /** @type {PropertyKey} */ (role));
}

// Maps the ad-hoc `recordType` strings the client tags uploads with (see uploadPhysicalCopy
// in modules.js) to the persisted module key canAccessKey() understands, so a file attached to
// a module a user can't see isn't downloadable just because they're logged in. Any recordType
// not listed here (or missing) resolves to undefined, which canAccessKey denies for non-admins.
/** @type {Record<string, any>} */
const fileRecordTypeKey = {
  memo: "memos",
  "client-doc": "clients",
  sale: "sales",
  payable: "payables",
  paymentRequest: "paymentRequests",
  productIssue: "productIssues",
  instrumentalServiceReport: "productIssues",
};

/** @param {string} key */
function moduleForKey(key) {
  return Object.entries(moduleRecordKeys).find(([, keys]) => keys.includes(key))?.[0] || "system";
}

/** @param {string} key */
function modulesForKey(key) {
  return Object.entries(moduleRecordKeys).filter(([, keys]) => keys.includes(key)).map(([module]) => module);
}

/** @param {Profile} profile @param {string} key @param {AccessMode} [mode] */
function canAccessKey(profile, key, mode = "view") {
  if (["Superadmin", "CEO"].includes(profile?.role)) return true;
  // Memos are view-for-all, but posting/overwriting is Superadmin/CEO/HR only (requireMemoAdmin) —
  // the shared role list above appends "memos" to every role, so the generic writers must not
  // treat that as edit access. Acknowledgments go through /api/memos/:id/acknowledge instead.
  if (mode === "edit" && modulesForKey(key).includes("memos") && !["HR"].includes(profile?.role)) return false;
  // Support Tracker reports: Sales/Admin (Superadmin/CEO returned above) may create/edit;
  // Engineering/Product Specialist may only update status (assertSupportReportChangesAllowed).
  if (mode === "edit" && key === "productIssues" && !["Sales", "Admin", "Engineering", "Product Specialist"].includes(profile?.role)) return false;
  if (mode === "edit" && DEMO_ONLY_ROLES.includes(profile?.role) && moduleRecordKeys.inventory.includes(key) && key !== "inventoryDemoRequests") return false;
  if (mode === "edit" && EXPENSE_PLANNING_KEYS.includes(key) && profile?.role !== "Admin") return false;
  const allowed = profile?.customPermissions?.[mode] || [];
  const modules = modulesForKey(key);
  return modules.some((module) => allowed.includes(module));
}

/** @param {Profile} profile */
function writableKeys(profile) {
  return persistedKeys.filter((key) => !genericStateBlockedKeys.has(key) && canAccessKey(profile, key, "edit"));
}

/** @param {AppRecordRow[]} records @param {Profile} profile @param {AccessMode} [mode] */
function filterRecordsForProfile(records, profile, mode = "view") {
  return records.filter((row) => canAccessKey(profile, row.module_name, mode));
}

/** @param {string} key @param {any} value @param {number} index */
function recordKeyFor(key, value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return key;
  if (key === "inventory") return [value.code || value.item || "stock", value.branch || "branch", value.lot || value.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
  if (key === "transferHistory") return String(value.id || [value.transferId, value.date, value.action].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "warranties") return String(value.serial || value.id || `${value.client || "client"}|${value.equipment || "equipment"}|${value.warrantyEnd || index}`);
  if (key === "imports") return String(value.id || [value.date, value.module, value.file].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "reconHistory") return String(value.id || [value.date, value.range, value.period].filter(Boolean).join("|") || `${key}-${index}`);
  return String(value.id || value.documentNo || value.receiptNo || value.cvNo || value.code || value.name || value.email || `${key}-${index}`);
}

/** @param {any} records */
function stateFromRecords(records) {
  /** @type {Record<string, any>} */
  const next = {};
  /** @type {Record<string, any>} */
  const keyedArrays = {};
  for (const key of persistedKeys) next[key] = ["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key) ? undefined : [];
  for (const row of records) {
    const key = row.module_name;
    if (["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key)) next[key] = row.data?.value;
    else {
      keyedArrays[key] ||= new Map();
      // Use the row's own stored record_key, not a freshly recomputed one. Recomputing
      // from row.data (as this used to) is not stable for records that fall back to a
      // positional key (no id/code/name to key on): that fallback depends on how many
      // rows of this module have been seen so far in `records`, which is sorted by
      // updated_at and reshuffles every time any row in the module is saved. Two
      // unrelated records could recompute to the same key and silently overwrite each
      // other here. record_key is already the exact, stable identity Postgres used to
      // upsert this row — trust it instead of guessing again.
      keyedArrays[key].set(String(row.record_key), row.data);
    }
  }
  for (const [key, map] of Object.entries(keyedArrays)) next[key] = [...map.values()];
  for (const key of ["branch", "masterTab", "branchAddresses", "invoiceApprovals"]) if (next[key] === undefined) delete next[key];
  return next;
}


// ---- Audit trail: watched-field changes, sign-ins, weekly summary ---------------------------------
/** @typedef {Record<string, unknown>} AuditRecord A stored record's data (any module). */
/** @typedef {{ module_name: string, record_key: string, data: AuditRecord }} AuditRow */
/** @typedef {{ field: string, from: string, to: string }} AuditChange */
/** @typedef {Record<string, unknown> & { action?: string, user?: string, role?: string, module?: string, record?: string, event?: string, changes?: AuditChange[], updatedAt?: string, sensitive?: string }} AuditEntry */
// Before → after for a short list of fields that move money, prices, stock or credit, worked out by
// the server on every per-record save (so a client can't leave it out). Written as ordinary "logs"
// entries with an extra `changes` array; nothing else about the log format changes.
/** @type {Record<string, { action: string, module: string, fields: [string, string][], label: (record: AuditRecord, key: string) => string }>} */
const AUDIT_WATCHED_FIELDS = {
  items: { action: "Price changed", module: "Masterlists", fields: [["price", "Selling price"], ["cost", "Cost"]], label: (r, k) => [r.name, r.code].filter(Boolean).join(" · ") || k },
  inventory: { action: "Stock adjusted", module: "Inventory", fields: [["qty", "Quantity"], ["expiry", "Expiry"]], label: (r, k) => [r.item || r.code, r.lot ? `Lot ${r.lot}` : "", r.branch].filter(Boolean).join(" · ") || k },
  payments: { action: "Receipt edited", module: "Collections", fields: [["amount", "Amount"], ["dateCollected", "Date collected"], ["dateRecorded", "Receipt date"], ["chequeDate", "Check date"], ["invoice", "Applied to"]], label: (r, k) => String(r.receiptNo || k) },
  sales: { action: "Invoice edited", module: "Invoicing", fields: [["discount", "Discount"], ["date", "Invoice date"], ["net", "Total"], ["terms", "Terms (days)"]], label: (r, k) => [r.documentNo || r.id || k, r.client].filter(Boolean).join(" · ") },
  clients: { action: "Credit terms changed", module: "Masterlists", fields: [["creditLimit", "Credit limit"], ["terms", "Payment terms"]], label: (r, k) => String(r.name || k) },
};
/** @param {unknown} value */
function auditValue(value) { return value === undefined || value === null || value === "" ? "—" : String(value).slice(0, 200); }
/** Stored rows for the watched records a save touches (keyed module → record_key → data). @param {WorkerEnv} env @param {string} stateKey @param {AuditRow[]} rows */
async function auditBeforeRows(env, stateKey, rows) {
  /** @type {Record<string, string[]>} */
  const keys = {};
  rows.forEach((row) => { if (AUDIT_WATCHED_FIELDS[row.module_name]) (keys[row.module_name] ||= []).push(String(row.record_key)); });
  const groups = await Promise.all(Object.entries(keys).map(async ([moduleName, list]) => {
    const stored = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${encodeURIComponent(moduleName)}&record_key=in.${encodeURIComponent(postgrestIn(list))}&select=record_key,data`).catch(() => []);
    return /** @type {[string, Map<string, AuditRecord>]} */ ([moduleName, new Map(stored.map((/** @type {AuditRow} */ row) => [String(row.record_key), row.data || {}]))]);
  }));
  return new Map(groups);
}
/**
 * Audit entries (with `changes`) for watched fields that a save changed. Stock quantities are only
 * audited for direct stock edits (inventory saved on its own), not for invoice/transfer movements.
 * @param {AuditRow[]} rows @param {Map<string, Map<string, AuditRecord>>} before
 */
function auditChangeEntries(rows, before) {
  const stockEditOnly = rows.every((row) => row.module_name === "inventory");
  /** @type {{ action: string, module: string, record: string, changes: { field: string, from: string, to: string }[] }[]} */
  const out = [];
  for (const row of rows) {
    const watch = AUDIT_WATCHED_FIELDS[row.module_name];
    if (!watch || (row.module_name === "inventory" && !stockEditOnly)) continue;
    const key = String(row.record_key);
    const old = before.get(row.module_name)?.get(key);
    const record = row.data || {};
    if (!old) {
      // New records are routine, except an invoice raised with a discount.
      if (row.module_name === "sales" && Number(record.discount || 0) > 0) out.push({ action: "Discount applied", module: watch.module, record: watch.label(record, key), changes: [{ field: "Discount", from: "—", to: auditValue(record.discount) }, ...(record.discountReason ? [{ field: "Reason", from: "—", to: auditValue(record.discountReason) }] : [])] });
      continue;
    }
    const changes = watch.fields.filter(([field]) => auditValue(old[field]) !== auditValue(record[field])).map(([field, label]) => ({ field: label, from: auditValue(old[field]), to: auditValue(record[field]) }));
    if (!changes.length) continue;
    if (row.module_name === "inventory") {
      const history = /** @type {{ reason?: string }[]} */ (Array.isArray(record.history) ? record.history : []);
      const oldHistory = /** @type {{ reason?: string }[]} */ (Array.isArray(old.history) ? old.history : []);
      const latest = history[0];
      if (latest && (history.length > oldHistory.length || JSON.stringify(latest) !== JSON.stringify(oldHistory[0]))) changes.push({ field: "Reason", from: "—", to: auditValue(latest.reason || "(none)") });
    }
    const action = row.module_name === "sales" && changes.every((change) => change.field === "Discount") ? "Discount changed" : watch.action;
    out.push({ action, module: watch.module, record: watch.label(record, key), changes });
  }
  return out.slice(0, 50);
}
/** @param {WorkerEnv} env @param {string} stateKey @param {Profile} profile @param {string} userId @param {ReturnType<typeof auditContextForRequest>} context @param {AuditRow[]} rows @param {Map<string, Map<string, AuditRecord>>} before */
async function writeChangeAudits(env, stateKey, profile, userId, context, rows, before) {
  const entries = auditChangeEntries(rows, before);
  if (!entries.length) return;
  const actor = profile.name || profile.email || "System User";
  const role = profile.previewOf ? `${profile.previewOf} (previewing ${profile.role})` : profile.role || "Unknown";
  await Promise.all(entries.map((entry) => writeAuditTrace(env, stateKey, { actor, role, ...entry }, userId, context)));
}

/** Why an audit entry counts as sensitive ("" when routine). Shared by the list and summary endpoints. @param {AuditEntry} entry */
function auditSensitivity(entry) {
  const action = String(entry?.action || "");
  if (entry?.event === "signin-failed" || /failed sign-in/i.test(action)) return "Failed sign-in";
  if (Array.isArray(entry?.changes) && entry.changes.length) return "Changed a watched field";
  if (/^(exported|downloaded)\b/i.test(action)) return "Export";
  if (/price|discount|stock adjusted|edited stock|credit/i.test(action)) return "Money or stock";
  if (/role|permission|superadmin|password|invited user|archived user|disabled user|enabled user|forced device logout/i.test(action)) return "Access";
  if (/cancel|void|revert|restored|deleted|removed|clear/i.test(action)) return "Cancelled or removed";
  return "";
}
/** Hour (0–23) in Manila for a stored timestamp. @param {string} iso */
function manilaHour(iso) { return Number(new Date(iso).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" })) % 24; }
/** YYYY-MM-DD in Manila. @param {string | number | Date} value */
function manilaDay(value) { return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
/** @param {AuditEntry} entry */
function isSignInEntry(entry) { return entry?.event === "signin" || entry?.event === "signin-failed" || /^(logged in|signed in|failed sign-in)$/i.test(String(entry?.action || "")); }

/** Login endpoint: one audit entry per sign-in or failed attempt (with the device it came from). @param {WorkerEnv} env @param {Request} request @param {{ ok: boolean, email: string, profile?: Profile, userId?: string }} options */
async function recordSignInEvent(env, request, { ok, email, profile, userId }) {
  const context = auditContextForRequest(request);
  const stateKey = appStateKey(env);
  const entry = {
    date: manilaTimestamp(),
    user: ok ? profile?.name || email : email || "Unknown",
    role: ok ? profile?.role || "Unknown" : "—",
    action: ok ? "Signed in" : "Failed sign-in",
    module: "Authentication",
    record: String(email || "").slice(0, 200),
    event: ok ? "signin" : "signin-failed",
    email: String(email || "").slice(0, 200),
    device: context.device, browser: context.browser, ipAddress: context.ipAddress, userAgent: context.userAgent, serverCapturedAt: context.serverCapturedAt,
  };
  await supabaseFetch(env, "/rest/v1/app_records", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: userId || null }]),
  }).catch(() => null);
}

/** Counts behind the Audit Logs overview for the last `days` days (plus the same span before, for comparison). @param {WorkerEnv} env @param {number} days */
async function auditSummary(env, days) {
  const stateKey = appStateKey(env);
  const now = Date.now();
  const since = new Date(now - days * 86400000).toISOString();
  const prevSince = new Date(now - 2 * days * 86400000).toISOString();
  const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.logs&updated_at=gte.${encodeURIComponent(prevSince)}&select=data,updated_at&order=updated_at.desc`);
  const today = manilaDay(now);
  /** @type {Record<string, number>} */ const byDay = {};
  /** @type {Record<string, number>} */ const byModule = {};
  /** @type {Record<string, { user: string, role: string, events: number, sensitive: number, last: string }>} */ const byUser = {};
  for (let i = days - 1; i >= 0; i -= 1) byDay[manilaDay(now - i * 86400000)] = 0;
  /** @type {AuditEntry[]} */ const sensitive = [];
  /** @type {AuditEntry[]} */ const afterHours = [];
  /** @type {AuditEntry[]} */ const signins = [];
  let total = 0, todayCount = 0, prevSensitive = 0, failed = 0;
  for (const row of rows) {
    const entry = { ...row.data, updatedAt: row.updated_at };
    const reason = auditSensitivity(entry);
    if (row.updated_at < since) { if (reason) prevSensitive += 1; continue; }
    const system = entry.user === "System" || entry.module === "System";
    if (isSignInEntry(entry)) {
      if (signins.length < 300) signins.push(entry);
      if (entry.event === "signin-failed" || /failed/i.test(entry.action)) failed += 1;
    }
    if (system) continue;
    total += 1;
    const day = manilaDay(row.updated_at);
    if (day === today) todayCount += 1;
    if (day in byDay) byDay[day] += 1;
    byModule[entry.module || "Other"] = (byModule[entry.module || "Other"] || 0) + 1;
    const who = String(entry.user || "Unknown");
    const u = (byUser[who] ||= { user: who, role: String(entry.role || ""), events: 0, sensitive: 0, last: row.updated_at });
    u.events += 1;
    if (reason) { u.sensitive += 1; if (sensitive.length < 300) sensitive.push({ ...entry, sensitive: reason }); }
    const hour = manilaHour(row.updated_at);
    if ((hour >= 22 || hour < 6) && !isSignInEntry(entry)) { if (afterHours.length < 100) afterHours.push({ ...entry, sensitive: reason }); }
  }
  return {
    days, total, today: todayCount, failedSignIns: failed, prevSensitive,
    byDay: Object.entries(byDay).map(([day, count]) => ({ day, count })),
    byModule: Object.entries(byModule).map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count),
    byUser: Object.values(byUser).sort((a, b) => b.events - a.events),
    sensitive, afterHours, signins,
    truncated: rows.length >= 50000,
  };
}

/** @param {Request} request */
function auditContextForRequest(request) {
  const userAgent = request.headers.get("user-agent") || "";
  return { device: deviceName(userAgent), browser: browserName(userAgent), ipAddress: clientIp(request), userAgent, serverCapturedAt: new Date().toISOString() };
}

/** @param {any} entry @param {any} auditContext */
function enrichAuditLogEntry(entry, auditContext) {
  if (!entry || typeof entry !== "object") return entry;
  return { ...entry, device: auditContext.device, browser: auditContext.browser, ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent, serverCapturedAt: entry.serverCapturedAt || auditContext.serverCapturedAt };
}

/** @param {any} data @param {string} userId @param {string} stateKey @param {any} [allowedKeys] @param {any} [auditContext] */
function recordsFromState(data, userId, stateKey, allowedKeys = persistedKeys, auditContext = null) {
  const rows = [];
  for (const key of allowedKeys) {
    const value = data?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const record = key === "logs" && auditContext ? enrichAuditLogEntry(item, auditContext) : item;
        rows.push({ state_key: stateKey, module_name: key, record_key: recordKeyFor(key, record, index), data: record, updated_by: userId });
      });
    } else {
      rows.push({ state_key: stateKey, module_name: key, record_key: key, data: { value }, updated_by: userId });
    }
  }
  return dedupeRowsByRecordKey(rows);
}

// A single upsert statement that targets the same (module_name, record_key) twice is
// rejected outright by Postgres ("ON CONFLICT DO UPDATE command cannot affect row a
// second time"), taking the whole batch down with it. Two client-supplied records that
// resolve to the same derived key (e.g. an import with a repeated code) must never be
// allowed to reach that statement — collapse them here, keeping the last occurrence so
// the most recently supplied version of a record wins, matching normal upsert semantics.
/** @param {AppRecordRow[]} rows */
function dedupeRowsByRecordKey(rows) {
  const seen = new Map();
  const order = [];
  for (const row of rows) {
    const dedupeKey = `${row.module_name} ${row.record_key}`;
    if (!seen.has(dedupeKey)) order.push(dedupeKey);
    seen.set(dedupeKey, row);
  }
  return order.map((dedupeKey) => seen.get(dedupeKey));
}

/** @param {any} values */
function postgrestIn(values) {
  return `(${values.map((/** @type {any} */ value) => `"${String(value).replace(/"/g, "\\\"")}"`).join(",")})`;
}

function manilaTimestamp() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}

/** @param {any} score */
function gameBadgeForScore(score) {
  if (score >= 50000) return "Platinum";
  if (score >= 20000) return "Gold";
  if (score >= 8000) return "Silver";
  if (score >= 2000) return "Bronze";
  return null;
}

// Cumulative XP needed to REACH a given level (level 1 needs 0). Quadratic curve —
// each level costs more than the last, so early levels come quickly (rewarding a
// first run) while high levels take sustained, repeated play to "flex".
/** @param {any} level */
function gameXpForLevel(level) {
  return 1800 * (Math.max(level, 1) - 1) ** 2;
}
/** @param {any} xp */
function gameLevelForXp(xp) {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / 1800)) + 1;
}

/** @type {Record<string, any>} */
const GAME_BADGE_TIER = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

// Cosmetic runner skins — mirrors SKINS in public/scripts/game.js. The server is the
// authority for the leaderboard "flex": a skin is stored and shown only if the
// player's level (cumulative XP) or badge tier (best score) actually unlocks it, so a
// spoofed submit can't parade a skin that wasn't earned.
/** @type {Record<string, any>} */
const GAME_SKIN_RULES = {
  classic: () => true,
  hardhat: (/** @type {any} */ level) => level >= 3,
  shades: (/** @type {any} */ level) => level >= 6,
  cape: (/** @type {any} */ level, /** @type {any} */ tier) => tier >= 2,
  gold: (/** @type {any} */ level, /** @type {any} */ tier) => tier >= 3,
  platinum: (/** @type {any} */ level, /** @type {any} */ tier) => tier >= 4,
};
/** @param {string} id @param {any} level @param {any} badge */
function gameSkinAllowed(id, level, badge) {
  const rule = GAME_SKIN_RULES[id];
  return rule ? !!rule(level || 1, GAME_BADGE_TIER[badge] || 0) : false;
}
// Pick the skin to persist: the requested one if unlocked, else keep the stored one if
// it is still unlocked, else fall back to classic.
/** @param {any} requested @param {any} stored @param {any} level @param {any} badge */
function gameResolveSkin(requested, stored, level, badge) {
  if (requested && gameSkinAllowed(requested, level, badge)) return requested;
  if (stored && gameSkinAllowed(stored, level, badge)) return stored;
  return "classic";
}

// Writes directly to the "logs" module so a save's trail survives even if the
// save that produced it gets rejected — never routed through the same
// delete-then-insert path used for regular module state.
/** @param {WorkerEnv} env @param {string} stateKey @param {{ actor: any, role: any, action: string, module: any, record: any, changes?: { field: string, from: string, to: string }[] }} options @param {string} userId @param {any} context */
async function writeAuditTrace(env, stateKey, { actor, role, action, module, record, changes }, userId, context) {
  const entry = {
    date: manilaTimestamp(),
    user: actor || "System User",
    role: role || "Unknown",
    action,
    module: module || "System",
    record: record || "",
    ...(Array.isArray(changes) && changes.length ? { changes } : {}),
    device: context?.device,
    browser: context?.browser,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
    serverCapturedAt: context?.serverCapturedAt,
  };
  await supabaseFetch(env, "/rest/v1/app_records", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: userId || null }]),
  }).catch(() => null);
}

/** @param {any} value */
function money(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

/** @param {any} value */
function moneyWithCents(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

/** @param {any} date @param {any} days */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/** @param {Sale} sale */
function saleStatus(sale) {
  if (sale.status === "Cancelled") return "Cancelled";
  const balance = Number(sale.net || 0) - Number(sale.paid || 0);
  if (balance <= 0) return "Paid";
  const due = new Date(addDays(sale.date, sale.terms || 0)).getTime();
  const now = Date.now();
  if (due < now) return "Overdue";
  if (due - now <= 7 * 86400000) return "Near Due";
  if (Number(sale.paid || 0) > 0) return "Partially Paid";
  return "Unpaid";
}

// Mirrors expiresWithinMonths() in ui-utils.js: 6 calendar months from today (Manila date).
/** @param {string} expiry */
function expiresWithinSixMonths(expiry) {
  const [year, month, day] = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).split("-").map(Number);
  const limit = new Date(Date.UTC(year, month - 1 + 6, day)).toISOString().slice(0, 10);
  return String(expiry).slice(0, 10) <= limit;
}

/** @param {any} item */
function inventoryState(item) {
  const expiry = item.expiry && item.expiry !== "N/A" ? new Date(item.expiry).getTime() : null;
  if (expiry && expiry < Date.now()) return "Expired";
  if (expiry && expiresWithinSixMonths(item.expiry)) return "Near Expiry";
  if (Number(item.qty || 0) <= Math.ceil(Number(item.min || 0) * 0.5)) return "Critical";
  if (Number(item.qty || 0) < Number(item.min || 0)) return "Low Stock";
  return "Available";
}

/** @param {any} data @param {string} [branch] */
function generateReportsFromState(data, branch = "all") {
  const byBranch = (/** @type {any} */ rows, key = "branch") => branch === "all" ? rows : rows.filter((/** @type {any} */ row) => row[key] === branch || row.area === branch);
  const sales = byBranch(data.sales || [], "area");
  const inventory = byBranch(data.inventory || []);
  const totalSales = sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.net || 0), 0);
  const totalPaid = sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.paid || 0), 0);
  const overdue = sales.filter((/** @type {Sale} */ sale) => saleStatus(sale) === "Overdue").length;
  const lowStock = inventory.filter((/** @type {any} */ item) => ["Low Stock", "Critical"].includes(inventoryState(item))).length;
  return [
    { icon: "₱", title: "Sales by Territory", body: `Area, client, salesperson, SI/TS/DR, and item movement. ${money(totalSales)} current view.`, section: "sales", actionLabel: "Open Sales", rows: sales.map((/** @type {Sale} */ sale) => [sale.area, sale.client, sale.salesperson, sale.documentNo || sale.id, `${sale.qty || ""} ${sale.uom || ""} ${sale.item || ""}`.trim(), money(sale.net)]) },
    { icon: "●", title: "Collections & AR", body: `${money(totalPaid)} collected. ${overdue} overdue invoice/s.`, section: "collections", actionLabel: "Open Collections", rows: sales.map((/** @type {Sale} */ sale) => [sale.id, sale.client, saleStatus(sale), money(sale.paid), money(Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0)), addDays(sale.date, sale.terms || 0)]) },
    { icon: "▤", title: "Reagent Expiry", body: `${lowStock} low or critical stock records with lot and expiry tracking.`, section: "inventory", actionLabel: "Open Inventory", rows: inventory.map((/** @type {any} */ item) => [item.item, item.branch, item.lot, item.expiry, item.qty, inventoryState(item)]) },
    { icon: "◆", title: "Client Documents", body: "BIR, SEC, TIN, required permits, and account attachments.", section: "masterlists", actionLabel: "Open Masterlists", rows: (data.clients || []).map((/** @type {Client} */ client) => [client.name, client.area, client.tin, money(client.creditLimit), client.docs]) },
    { icon: "◇", title: "Supplier Payables", body: `${(data.payables || []).length} supplier payable records with payment method tracking.`, section: "payables", actionLabel: "Open Payables", rows: (data.payables || []).map((/** @type {Payable} */ payable) => [payable.supplier, payable.item, payable.method, money(payable.amount), money(payable.paid), money(Number(payable.amount || 0) - Number(payable.paid || 0)), payable.status]) },
    { icon: "◉", title: "Service & Warranty", body: "Equipment install, serial number, warranty, and customer support history.", section: "warranty", actionLabel: "Open Warranty", rows: (data.warranties || []).map((/** @type {any} */ warranty) => [warranty.client, warranty.equipment, warranty.serial, warranty.installDate, warranty.warrantyEnd, warranty.status]) },
    { icon: "◎", title: "Compliance Audit", body: `${(data.logs || []).length} traceable changes for corrections, exports, and approvals.`, section: "logs", actionLabel: "Open Audit Logs", rows: (data.logs || []).map((/** @type {any} */ log) => [log.date, log.user, log.module, log.action, log.record]) },
  ];
}

/** @param {any} value */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (/** @type {string} */ char) => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }))[char]);
}

/** @param {any} type */
function documentType(type) {
  return type === "DRS" ? "DR" : String(type || "SI");
}

/** @param {any} value */
function formMoney(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** @param {any} value */
function roundCurrency(value) { return Math.round(Number(value || 0) * 100) / 100; }
/** @param {number} gross */
function withholdingBaseFromGross(gross) { return roundCurrency(Number(gross || 0) / 1.12); }
/** @param {any} value */
function hasWithholding(value) { return value === true || Number(value || 0) > 0; }
/** @param {any[]} [items] */
function itemGross(items = []) { return items.reduce((sum, item) => sum + Number(item.amount || 0), 0); }

/** @param {any} value */
function formDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" });
}

/** @param {any} line */
function lineAmount(line) {
  return Number(line?.qty || 0) * Number(line?.price || 0);
}

/** @param {any} item */
function isEquipmentItem(item) {
  const category = String(item?.category || item?.classification || "").trim().toLowerCase();
  return category === "equipment";
}

/** @param {Sale} sale */
function saleTaxBreakdown(sale) {
  const subtotal = Number(sale.amount || 0) - Number(sale.discount || 0);
  const totalAmountDue = Number(sale.net || subtotal);
  const isSi = documentType(sale.type) === "SI";
  const totalSalesVatInclusive = isSi ? totalAmountDue : subtotal;
  const isVatable = isSi && sale.vatCode !== "NO VAT";
  const addVat = isVatable ? Math.max(totalSalesVatInclusive - totalSalesVatInclusive / 1.12, 0) : 0;
  return { totalSalesVatInclusive, amountNetVat: totalSalesVatInclusive - addVat, addVat, totalAmountDue };
}

/** @param {Profile} profile @param {Sale} sale */
function printableBranchAllowed(profile, sale) {
  const branch = String(profile?.branch || "all");
  return ["all", "Both", "All"].includes(branch) || sale.area === branch || sale.branch === branch;
}

// A saved custom template supplies { fields: { fieldKey: {left,top,width,align,fontSize} }, row: {left,right,top,height,spacing} }.
// Only properties actually present are emitted as inline style, so anything the user never touched keeps using the CSS default.
// Print-template overrides are stored verbatim and interpolated into a style attribute, so every
// value is coerced to a finite number (or allowlisted) — a stored string must never be able to
// close the attribute and inject markup.
/** @param {any} value */
function overrideNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round3(number) : null;
}

/** @param {any} o */
function fieldOverrideStyle(o) {
  if (!o) return "";
  const parts = [];
  const left = overrideNumber(o.left), top = overrideNumber(o.top), width = overrideNumber(o.width), fontSize = overrideNumber(o.fontSize);
  if (o.left != null && left != null) parts.push(`left:${left}in`);
  if (o.top != null && top != null) parts.push(`top:${top}in`);
  if (o.width != null && width != null) parts.push(`width:${width}in`);
  if (["left", "right", "center", "justify"].includes(String(o.align || ""))) parts.push(`text-align:${o.align}`);
  if (o.fontSize != null && fontSize != null) parts.push(`font-size:${fontSize}px`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

/** @param {any} row @param {number} index */
function rowOverrideStyle(row, index) {
  if (!row) return ` style="--row:${index}"`;
  const parts = [`--row:${index}`, `top:${round3(Number(row.top) || 0) + index * (Number(row.spacing) || 0)}in`];
  const left = overrideNumber(row.left), right = overrideNumber(row.right), height = overrideNumber(row.height);
  if (row.left != null && left != null) parts.push(`left:${left}in`);
  if (row.right != null && right != null) parts.push(`right:${right}in`);
  if (row.height != null && height != null) parts.push(`height:${height}in`);
  return ` style="${parts.join(";")}"`;
}

/** @param {any} value */
function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

/** @param {Sale} sale @param {any} variant @param {any} templateOverrides */
function printableRows(sale, variant, templateOverrides) {
  const lines = sale.lines?.length ? sale.lines : [{ item: sale.item, brand: sale.brand, qty: sale.qty, uom: sale.uom, price: Number(sale.amount || 0) / Math.max(Number(sale.qty || 1), 1), lot: "", expiry: "" }];
  const fields = templateOverrides?.fields || {};
  const row = templateOverrides?.row || null;
  return lines.slice(0, variant === "si" ? 10 : 8).map((/** @type {any} */ line, /** @type {any} */ index) => {
    const expiry = line.expiry && line.expiry !== "N/A" ? ` · Exp ${escapeHtml(line.expiry)}` : "";
    // Lot / expiry is its own positioned field (si-lot / ts-lot / dr-lot) so it can be moved
    // independently in the custom print-layout editor — no longer a <small> glued under the name.
    const lotText = `Lot ${escapeHtml(line.lot || "-")}${expiry}`;
    const name = `<span class="tmpl-name">${escapeHtml(line.item)}</span>`;
    const rowStyle = rowOverrideStyle(row, index);
    if (variant === "si") return `<div class="si-row"${rowStyle}><span class="si-item"${fieldOverrideStyle(fields["si-item"])}>${name}</span><span class="si-lot"${fieldOverrideStyle(fields["si-lot"])}>${lotText}</span><span class="si-qty"${fieldOverrideStyle(fields["si-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="si-price"${fieldOverrideStyle(fields["si-price"])}>${formMoney(line.price)}</span><span class="si-amount"${fieldOverrideStyle(fields["si-amount"])}>${formMoney(lineAmount(line))}</span></div>`;
    if (variant === "ts") return `<div class="ts-row"${rowStyle}><span class="ts-code"${fieldOverrideStyle(fields["ts-code"])}>${escapeHtml(line.code || "")}</span><span class="ts-item"${fieldOverrideStyle(fields["ts-item"])}>${name}</span><span class="ts-lot"${fieldOverrideStyle(fields["ts-lot"])}>${lotText}</span><span class="ts-qty"${fieldOverrideStyle(fields["ts-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="ts-amount"${fieldOverrideStyle(fields["ts-amount"])}>${formMoney(lineAmount(line))}</span></div>`;
    return `<div class="dr-row"${rowStyle}><span class="dr-qty"${fieldOverrideStyle(fields["dr-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="dr-item"${fieldOverrideStyle(fields["dr-item"])}>${name}</span><span class="dr-lot"${fieldOverrideStyle(fields["dr-lot"])}>${lotText}</span><span class="dr-price"${fieldOverrideStyle(fields["dr-price"])}></span><span class="dr-amount"${fieldOverrideStyle(fields["dr-amount"])}></span></div>`;
  }).join("");
}

const printableCompanyFooter = "MEDLANE DIAGNOSTIC SOLUTIONS, INC.<br>13 Gumamela St. Pilar Village, Las Piñas<br>Las Piñas City 1740<br>Tel. No. (02) 8836-2853 Email: receivables.mdsi@gmail.com";
/** @param {string} [title] */
function printableBrandHeader(title = "") {
  return `<header class="print-brand-header"><img src="/medlane.jpg" alt="Medlane Diagnostic Solutions" /><div><strong>MEDLANE DIAGNOSTIC SOLUTIONS, INC.</strong>${title ? `<span>${escapeHtml(title)}</span>` : ""}</div></header>`;
}
function printableFooter() {
  return `<div class="print-company-footer">${printableCompanyFooter}</div>`;
}
function templateBranding() {
  return `<img class="template-print-logo" src="/medlane.jpg" alt="Medlane Diagnostic Solutions" /><div class="template-print-footer">${printableCompanyFooter}</div>`;
}

/** @param {{ sale: any, client: any, approvals: any, preparedBy: any, noDate: any, templateOverrides: any }} options */
function printableInvoiceHtml({ sale, client, approvals, preparedBy, noDate, templateOverrides }) {
  const type = documentType(sale.type);
  const approvedBy = escapeHtml(approvals?.[type] || "ECTOSOC");
  const f = templateOverrides?.fields || {};
  const fs = (/** @type {any} */ key) => fieldOverrideStyle(f[key]);
  if (type === "TS") return `<section class="template-overlay template-ts">${noDate ? "" : `<span class="field ts-date"${fs("ts-date")}>${formDate(new Date().toISOString())}</span>`}<span class="field ts-po"${fs("ts-po")}>${escapeHtml(sale.po || "")}</span><span class="field ts-terms"${fs("ts-terms")}>Terms: ${Number(sale.terms || 30)} Days</span><span class="field ts-client"${fs("ts-client")}>${escapeHtml(sale.client)}</span><span class="field ts-address"${fs("ts-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "ts", templateOverrides)}<span class="field ts-tax-label"${fs("ts-tax-label")}>NOT VALID FOR CLAIMING OF INPUT TAX</span><span class="field ts-total"${fs("ts-total")}>${formMoney(sale.net || sale.amount || 0)}</span><span class="field ts-prepared"${fs("ts-prepared")}>${escapeHtml(preparedBy)}</span><span class="field ts-approved"${fs("ts-approved")}>${approvedBy}</span><span class="field ts-received"></span></section>`;
  if (type === "DR") return `<section class="template-overlay template-dr">${noDate ? "" : `<span class="field dr-date"${fs("dr-date")}>${formDate(new Date().toISOString())}</span>`}<span class="field dr-po"${fs("dr-po")}>${escapeHtml(sale.po || "")}</span><span class="field dr-terms"${fs("dr-terms")}>${Number(sale.terms || 30)} Days</span><span class="field dr-client"${fs("dr-client")}>${escapeHtml(sale.client)}</span><span class="field dr-address"${fs("dr-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "dr", templateOverrides)}<span class="field dr-prepared"${fs("dr-prepared")}>${escapeHtml(preparedBy)}</span><span class="field dr-recorded"${fs("dr-recorded")}></span><span class="field dr-approved"${fs("dr-approved")}>${approvedBy}</span><span class="field dr-received"${fs("dr-received")}></span></section>`;
  const breakdown = saleTaxBreakdown(sale);
  return `<section class="template-overlay template-si">${noDate ? "" : `<span class="field si-date"${fs("si-date")}>${formDate(sale.date)}</span>`}<span class="field si-po"${fs("si-po")}>${escapeHtml(sale.po || "")}</span><span class="field si-terms"${fs("si-terms")}>Terms of Payment ${Number(sale.terms || 30)} Days</span><span class="field si-sold"${fs("si-sold")}>${escapeHtml(sale.client)}</span><span class="field si-registered"${fs("si-registered")}>${escapeHtml(sale.client)}</span><span class="field si-tin"${fs("si-tin")}>${escapeHtml(client.tin || "")}</span><span class="field si-address"${fs("si-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "si", templateOverrides)}<span class="field si-total-sales"${fs("si-total-sales")}>${formMoney(breakdown.totalSalesVatInclusive)}</span><span class="field si-net-vat"${fs("si-net-vat")}>${formMoney(breakdown.amountNetVat)}</span><span class="field si-discount"${fs("si-discount")}>${formMoney(sale.discount || 0)}</span><span class="field si-vat"${fs("si-vat")}>${formMoney(breakdown.addVat)}</span><span class="field si-amount-due"${fs("si-amount-due")}>${formMoney(breakdown.totalAmountDue)}</span><span class="field si-prepared"${fs("si-prepared")}>${escapeHtml(preparedBy)}</span><span class="field si-approved"${fs("si-approved")}>${approvedBy}</span></section>`;
}

/** @param {any} request */
function paymentRequestPrintableHtml(request) {
  const items = request.items?.length ? request.items : [{ particulars: request.particulars || "", amount: request.amount || request.total || 0 }];
  // Collections created with the per-invoice itemized editor carry an explicit invoice + net
  // amount on every item; older/general payment requests only have flat particulars/amount
  // lines with one aggregate withholding deduction for the whole voucher.
  const perInvoice = items.length > 0 && items.every((/** @type {any} */ item) => item.invoice && item.netAmount != null);
  const chequeLines = request.paymentType === "Multiple Cheques" && Array.isArray(request.cheques) && request.cheques.length
    ? request.cheques.map((/** @type {{ reference?: string, chequeDate?: string }} */ cheque, /** @type {number} */ index) => `Check ${index + 1}: ${escapeHtml(cheque.reference || "-")} · ${escapeHtml(cheque.chequeDate || "-")}`).join("<br>")
    : "";
  const paymentDetails = request.paymentType === "Multiple Cheques" ? `<div><strong>PAYMENT DETAILS:</strong><br>Bank Name: ${escapeHtml(request.bank || "-")}<br>${chequeLines || `Check no: ${escapeHtml(request.cheque || "-")}<br>Date: ${escapeHtml(request.chequeDate || "-")}`}</div>` : ["Check", "Bank Transfer"].includes(request.paymentType) ? `<div><strong>PAYMENT DETAILS:</strong><br>Bank Name: ${escapeHtml(request.bank || "-")}<br>Account No.: ${escapeHtml(request.bankAccount || "-")}<br>Check no: ${escapeHtml(request.cheque || "-")}<br>Date: ${escapeHtml((request.paymentType === "Bank Transfer" ? request.transferDate : request.chequeDate) || "-")}</div>` : "";
  const metaNetAmount = request.netAmount ? `<span>Net Amount: <strong>${money(request.netAmount)}</strong></span>` : "";
  let tableHtml;
  let total;
  if (perInvoice) {
    total = items.reduce((/** @type {number} */ sum, /** @type {any} */ item) => sum + Number(item.netAmount || 0), 0);
    tableHtml = `<table><thead><tr><th>Invoice</th><th>Amount</th><th>VAT-excl. Base</th><th>WTax 5%</th><th>EWT 1%</th><th>Net Amount</th></tr></thead><tbody>${items.map((/** @type {any} */ item) => {
      // Withholding is computed off the invoice's gross amount due (falling back to the
      // collected amount for older records saved before amountDue was tracked per line), not
      // the cash collected — see paymentRequestRowDeductions in modules.js for why.
      const taxBase = withholdingBaseFromGross(Number(item.amountDue ?? item.amount ?? 0));
      const withholdingTax = hasWithholding(item.withholdingTax) ? roundCurrency(taxBase * 0.05) : 0;
      const expandedWithholdingTax = hasWithholding(item.expandedWithholdingTax) ? roundCurrency(taxBase * 0.01) : 0;
      return `<tr><td>${escapeHtml(item.invoice)}</td><td>${money(item.amount)}</td><td>${moneyWithCents(taxBase)}</td><td>${withholdingTax ? moneyWithCents(withholdingTax) : "-"}</td><td>${expandedWithholdingTax ? moneyWithCents(expandedWithholdingTax) : "-"}</td><td>${money(item.netAmount)}</td></tr>`;
    }).join("")}<tr><td colspan="5"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>`;
  } else {
    const oldWithholdingTax = Number(request.withholdingTax || 0);
    const oldExpandedWithholdingTax = Number(request.expandedWithholdingTax || 0);
    const gross = Number(request.gross || 0) || itemGross(items) || Number(request.total || 0) + oldWithholdingTax + oldExpandedWithholdingTax;
    const taxBase = withholdingBaseFromGross(gross);
    const withholdingTax = hasWithholding(request.withholdingTax) ? roundCurrency(taxBase * 0.05) : 0;
    const expandedWithholdingTax = hasWithholding(request.expandedWithholdingTax) ? roundCurrency(taxBase * 0.01) : 0;
    total = roundCurrency(Math.max(gross - withholdingTax - expandedWithholdingTax, 0));
    tableHtml = `<table><thead><tr><th>Date</th><th>Particulars</th><th>Amount</th></tr></thead><tbody>${items.map((/** @type {any} */ item, /** @type {any} */ index) => `<tr><td>${index === 0 ? escapeHtml(request.date) : ""}</td><td>${escapeHtml(item.particulars)}</td><td>${money(item.amount)}</td></tr>`).join("")}${withholdingTax ? `<tr><td colspan="2">Less: Withholding Tax 5%</td><td>${moneyWithCents(withholdingTax)}</td></tr>` : ""}${expandedWithholdingTax ? `<tr><td colspan="2">Less: Expanded Withholding Tax 1%</td><td>${moneyWithCents(expandedWithholdingTax)}</td></tr>` : ""}<tr><td colspan="2"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>`;
  }
  return `<section class="payment-request-print">${printableBrandHeader(request.cvNo)}<div class="pr-meta"><span>Client: <strong>${escapeHtml(request.employee)}</strong></span><span>Collector: <strong>${escapeHtml(request.preparedBy)}</strong></span><span>Date: <strong>${escapeHtml(request.date)}</strong></span>${metaNetAmount}</div><div class="pr-checks"><strong>Mode of Payment:</strong><span>${request.paymentType === "Cash" ? "[x]" : "[ ]"} Cash</span><span>${request.paymentType === "Check" ? "[x]" : "[ ]"} Check</span><span>${request.paymentType === "Multiple Cheques" ? "[x]" : "[ ]"} Multiple Cheques</span><span>${request.paymentType === "Bank Transfer" ? "[x]" : "[ ]"} Bank Transfer</span><span>${request.paymentType === "Debit Memo" ? "[x]" : "[ ]"} Debit Memo</span></div>${tableHtml}<p class="pr-instructions"><strong>Attach supporting official receipts, invoices, or billing statements before approval and release.</strong></p><footer><div>Prepared by:<br><strong>${escapeHtml(request.preparedBy)}</strong><br>${escapeHtml(request.preparedRole)}</div><div>Approved by:<br><strong>Maria Emma F. Llorin</strong><br>CEO</div>${paymentDetails}</footer>${printableFooter()}</section>`;
}

/** @param {any} record @param {any} type */
function financialRequestPrintableHtml(record, type) {
  const items = record.items?.length ? record.items : [{ particulars: record.item || record.requestNote || "Request", amount: record.amount || 0 }];
  const partyLabel = type === "payable" ? "Supplier" : "Requester";
  const partyValue = type === "payable" ? record.supplier : record.requester;
  const extraMeta = type === "payable"
    ? ""
    : `<span>Office: <strong>${escapeHtml(record.office || "-")}</strong></span><span>Type: <strong>${escapeHtml(record.type || "-")}</strong></span>`;
  const hasVendorColumn = items.some((/** @type {any} */ item) => item.vendor);
  const gross = Number(record.grossAmount || 0) || itemGross(items) || Number(record.amount || 0) + Number(record.withholdingTax1 || 0) + Number(record.withholdingTax2 || 0);
  const taxBase = withholdingBaseFromGross(gross);
  const withholdingTax1 = type === "payable" && hasWithholding(record.withholdingTax1) ? roundCurrency(taxBase * 0.01) : 0;
  const withholdingTax2 = type === "payable" && hasWithholding(record.withholdingTax2) ? roundCurrency(taxBase * 0.02) : 0;
  const netTotal = type === "payable" ? roundCurrency(Math.max(gross - withholdingTax1 - withholdingTax2, 0)) : Number(record.amount || 0);
  const withholdingRows = type === "payable" ? `${withholdingTax1 ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Less: Withholding 1%</td><td>${moneyWithCents(withholdingTax1)}</td></tr>` : ""}${withholdingTax2 ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Less: Withholding 2%</td><td>${moneyWithCents(withholdingTax2)}</td></tr>` : ""}` : "";
  const totalLabel = type === "payable" ? "Net Total" : "Total";
  return `<section class="payment-request-print">${printableBrandHeader(record.id)}<div class="pr-meta"><span>${partyLabel}: <strong>${escapeHtml(partyValue || "-")}</strong></span>${extraMeta}<span>Status: <strong>${escapeHtml(record.requestStatus || record.status || "-")}</strong></span></div><table><thead><tr>${hasVendorColumn ? "<th>Vendor</th>" : ""}<th>Particulars</th><th>Amount</th></tr></thead><tbody>${items.map((/** @type {any} */ item) => `<tr>${hasVendorColumn ? `<td>${escapeHtml(item.vendor || "-")}</td>` : ""}<td>${escapeHtml(item.particulars || "")}</td><td>${money(item.amount || 0)}</td></tr>`).join("")}${type === "payable" ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Gross Total</td><td>${money(gross)}</td></tr>` : ""}${withholdingRows}<tr><td${hasVendorColumn ? ' colspan="2"' : ""}><strong>${totalLabel}</strong></td><td><strong>${money(netTotal)}</strong></td></tr></tbody></table>${record.requestNote ? `<p class="pr-instructions"><strong>Notes:</strong> ${escapeHtml(record.requestNote)}</p>` : ""}<footer><div>Payment Method:<br><strong>${escapeHtml(record.method || "Not set")}</strong></div><div>Approved by:<br><strong>${escapeHtml(record.approvedBy || "Pending")}</strong></div></footer>${printableFooter()}</section>`;
}

/** @param {any} po */
function inventoryPoPrintableHtml(po) {
  const total = (po.lines || []).reduce((/** @type {number} */ sum, /** @type {any} */ line) => sum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0);
  return `<section class="payment-request-print inventory-po-print">${printableBrandHeader(po.id)}<div class="pr-meta"><span>Supplier: <strong>${escapeHtml(po.supplier)}</strong></span><span>Date: <strong>${escapeHtml(po.date)}</strong></span><span>Terms: <strong>${Number(po.terms || 30)} Days</strong></span></div><table><thead><tr><th>Qty.</th><th>U/M</th><th>Item Description</th><th>Lot</th><th>Expiry</th><th>Unit Cost</th><th>Disc. Amt</th><th>Total Amount</th></tr></thead><tbody>${(po.lines || []).map((/** @type {any} */ line) => { const discount = Number(line.discount || 0); const totalLine = Number(line.qty || 0) * Number(line.price || 0) - discount; return `<tr><td>${Number(line.qty || 0)}</td><td>${escapeHtml(line.uom || "")}</td><td>${escapeHtml(line.item)}<br><small>${escapeHtml(line.brand || "")}</small></td><td>${escapeHtml(line.lot || "-")}</td><td>${escapeHtml(line.expiry || "N/A")}</td><td>${money(line.price || 0)}</td><td>${money(discount)}</td><td>${money(totalLine)}</td></tr>`; }).join("")}<tr><td colspan="7"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>${printableFooter()}</section>`;
}

/** @param {any} transfer */
function transferRequestPrintableHtml(transfer) {
  const lines = transfer.lines || [];
  return `<section class="payment-request-print">${printableBrandHeader(transfer.id)}<div class="pr-meta"><span>From: <strong>${escapeHtml(transfer.from)}</strong></span><span>To: <strong>${escapeHtml(transfer.to)}</strong></span><span>Status: <strong>${escapeHtml(transfer.status || "-")}</strong></span><span>Requested by: <strong>${escapeHtml(transfer.requestedBy || "-")}</strong></span>${transfer.dispatchedAt ? `<span>Dispatched: <strong>${escapeHtml(transfer.dispatchedAt)}</strong></span>` : ""}</div><table><thead><tr><th>Item</th><th>Requested Qty</th><th>Requested Lot</th><th>Requested Expiry</th><th>Dispatched Qty</th><th>Dispatched Lot</th><th>Dispatched Expiry</th></tr></thead><tbody>${lines.map((/** @type {any} */ line) => `<tr><td>${escapeHtml(line.item)}<br><small>${escapeHtml(line.code || "")}</small></td><td>${Number(line.requestedQty || 0)}</td><td>${escapeHtml(line.requestedLot || "-")}</td><td>${escapeHtml(line.requestedExpiry || "N/A")}</td><td>${line.dispatchedQty != null ? Number(line.dispatchedQty) : "-"}</td><td>${escapeHtml(line.dispatchedLot || "-")}</td><td>${escapeHtml(line.dispatchedExpiry || "-")}</td></tr>`).join("")}</tbody></table><footer><div>Prepared by:<br><strong>${escapeHtml(transfer.requestedBy || "-")}</strong></div><div>Dispatched by:<br><strong>${escapeHtml(transfer.dispatchedBy || "Pending")}</strong></div></footer>${printableFooter()}</section>`;
}

/** @param {any} value */
function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

/** @param {any} report */
function productIssuePrintableHtml(report) {
  const selectedTypes = new Set(splitList(report.typeOfSupport));
  const selectedTopics = new Set(splitList(report.topicsDiscussed));
  const mark = (/** @type {any} */ on) => (on ? "X" : "");
  const rows = report.qcParameters?.length ? report.qcParameters : [];
  const paramRows = rows.slice(0, 12).map((/** @type {any} */ row, /** @type {any} */ index) => `<span class="field tsr-param-row" style="--row:${index}"><span class="field tsr-param-name">${escapeHtml(row.parameter || "")}</span><span class="field tsr-param-factor">${escapeHtml(row.factor || "")}</span><span class="field tsr-l1-range">${escapeHtml(row.l1Range || "")}</span><span class="field tsr-l1-result">${escapeHtml(row.l1Result || "")}</span><span class="field tsr-l1-p">${mark(row.l1P)}</span><span class="field tsr-l1-f">${mark(row.l1F)}</span><span class="field tsr-l2-range">${escapeHtml(row.l2Range || "")}</span><span class="field tsr-l2-result">${escapeHtml(row.l2Result || "")}</span><span class="field tsr-l2-p">${mark(row.l2P)}</span><span class="field tsr-l2-f">${mark(row.l2F)}</span><span class="field tsr-l3-range">${escapeHtml(row.l3Range || "")}</span><span class="field tsr-l3-result">${escapeHtml(row.l3Result || "")}</span><span class="field tsr-l3-p">${mark(row.l3P)}</span><span class="field tsr-l3-f">${mark(row.l3F)}</span></span>`).join("");
  return `<section class="template-overlay template-tsr">${templateBranding()}<span class="field tsr-company">${escapeHtml(report.companyName || "")}</span><span class="field tsr-address">${escapeHtml(report.address || "")}</span><span class="field tsr-contact-person">${escapeHtml(report.contactPerson || "")}</span><span class="field tsr-type-app">${selectedTypes.has("Application Troubleshooting") ? "X" : ""}</span><span class="field tsr-type-training">${selectedTypes.has("Training Support") ? "X" : ""}</span><span class="field tsr-type-tech">${selectedTypes.has("Technical Support") ? "X" : ""}</span><span class="field tsr-topic-theories">${selectedTopics.has("Theories and Principles") ? "X" : ""}</span><span class="field tsr-topic-operation">${selectedTopics.has("Unit Operation") ? "X" : ""}</span><span class="field tsr-topic-parameter">${selectedTopics.has("Parameter Prog.") ? "X" : ""}</span><span class="field tsr-topic-maintenance">${selectedTopics.has("Unit Maintenance") ? "X" : ""}</span><span class="field tsr-topic-basic">${selectedTopics.has("Basic Troubleshooting") ? "X" : ""}</span><span class="field tsr-topic-pm">${selectedTopics.has("PM and Calibration") ? "X" : ""}</span><span class="field tsr-equipment">${escapeHtml(report.equipment || "")}</span><span class="field tsr-serial">${escapeHtml(report.serialNo || "")}</span><span class="field tsr-concerns">${escapeHtml(report.concerns || "")}</span><span class="field tsr-actions">${escapeHtml(report.actionsTaken || "")}</span><span class="field tsr-l1-lot">${escapeHtml(report.qcLevel1Lot || "")}</span><span class="field tsr-l2-lot">${escapeHtml(report.qcLevel2Lot || "")}</span><span class="field tsr-l3-lot">${escapeHtml(report.qcLevel3Lot || "")}</span>${paramRows}<span class="field tsr-performed">${escapeHtml(report.performedBy || "")}</span><span class="field tsr-conforme">${escapeHtml(report.conforme || "")}</span></section>`;
}

/** @param {WorkerEnv} env */
async function storageUsage(env) {
  if (!env.DOCUMENTS_BUCKET) {
    return { configured: false, usedBytes: 0, objectCount: 0, truncated: false };
  }

  /** @type {string | undefined} */
  let cursor;
  let usedBytes = 0;
  let objectCount = 0;
  let truncated = false;

  do {
    const page = await env.DOCUMENTS_BUCKET.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      usedBytes += object.size || 0;
      objectCount += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
    truncated = Boolean(page.truncated);
  } while (cursor && objectCount < 10000);

  return { configured: true, usedBytes, objectCount, truncated };
}

/** @param {WorkerEnv} env */
async function activeMetadataUsage(env) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/storage_usage?bucket=eq.${encodeURIComponent(env.R2_BUCKET_NAME || "medlane-documents")}&select=used_bytes`);
    if (rows[0]) return Number(rows[0].used_bytes || 0);
    const files = await supabaseFetch(env, "/rest/v1/file_objects?deleted_at=is.null&select=size_bytes");
    return files.reduce((/** @type {number} */ sum, /** @type {any} */ row) => sum + Number(row.size_bytes || 0), 0);
  } catch {
    return null;
  }
}

/** @param {WorkerEnv} env @param {any} size */
async function reserveStorage(env, size) {
  return supabaseFetch(env, "/rest/v1/rpc/reserve_file_storage", {
    method: "POST",
    body: JSON.stringify({ bucket_name: env.R2_BUCKET_NAME || "medlane-documents", bytes_to_add: size, max_allowed: Number(env.MAX_R2_BYTES || 536870912000) }),
  });
}

/** @param {WorkerEnv} env @param {any} size */
async function releaseStorage(env, size) {
  return supabaseFetch(env, "/rest/v1/rpc/release_file_storage", {
    method: "POST",
    body: JSON.stringify({ bucket_name: env.R2_BUCKET_NAME || "medlane-documents", bytes_to_remove: size }),
  });
}

/** @param {any} name */
function safeFileName(name) {
  return String(name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 140) || "upload.bin";
}

/** @param {any} fileName @param {any} recordType */
function objectKeyFor(fileName, recordType) {
  const folder = safeFileName(recordType || "general").toLowerCase();
  return `uploads/${folder}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

/** @param {any} text */
async function gzipBytes(text) {
  const stream = new Blob([text], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {any} object */
async function gunzipText(object) {
  const stream = object.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** @param {WorkerEnv} env @param {string} [backupType] @param {any} [actor] */
async function createBackup(env, backupType = "manual", actor = null) {
  if (env.ENVIRONMENT !== "production") throw new Error("Backups are disabled outside production");
  if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
  const stateKey = appStateKey(env);
  // Skip `game-sessions` — single-use expiring tokens, nothing to restore, and it's the
  // one module that grows without bound.
  const records = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=not.in.${encodeURIComponent(postgrestIn(["game-sessions"]))}&select=module_name,record_key,data,updated_at&order=updated_at.asc`);
  const createdAt = new Date().toISOString();
  const payload = { app: "medlane", stateKey, backupType, mode: "compressed-full", sinceAt: null, createdAt, records };
  const bytes = await gzipBytes(JSON.stringify(payload));
  const objectKey = `backups/${stateKey}/${backupType}/${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json.gz`;
  await reserveStorage(env, bytes.byteLength);
  try {
    await env.DOCUMENTS_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { backupType, stateKey, records: String(records.length) } });
    const inserted = await supabaseFetch(env, "/rest/v1/backup_runs", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ state_key: stateKey, backup_type: backupType, mode: payload.mode, object_key: objectKey, records_count: records.length, size_bytes: bytes.byteLength, since_at: null, created_by: actor }),
    });
    await sendDiscordWebhook(env, { embeds: [{ title: "Backup Completed", color: 0x22c55e, fields: [{ name: "Type", value: backupType, inline: true }, { name: "Records", value: String(records.length), inline: true }, { name: "Size", value: `${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`, inline: true }], timestamp: new Date().toISOString() }] }).catch((error) => console.error(JSON.stringify({ message: "Discord backup notice failed", error: error.message })));
    return inserted[0];
  } catch (/** @type {any} */ error) {
    await releaseStorage(env, bytes.byteLength).catch(() => null);
    await env.DOCUMENTS_BUCKET.delete(objectKey).catch(() => null);
    await sendDiscordWebhook(env, { content: "Backup failed. Immediate review recommended.", embeds: [{ title: "Backup Failed", color: 0xef4b4f, description: String(error.message || error).slice(0, 500), fields: [{ name: "Type", value: backupType, inline: true }], timestamp: new Date().toISOString() }] }).catch(() => null);
    throw error;
  }
}

/** @param {WorkerEnv} env @param {string} key @param {any} actorId @param {any} auditContext */
async function restoreBackupObject(env, key, actorId, auditContext) {
  if (env.ENVIRONMENT !== "production") throw new Error("Restore is disabled outside production");
  if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
  const stateKey = appStateKey(env);
  const prefix = `backups/${stateKey}/`;
  if (!key.startsWith(prefix) || !key.endsWith(".json.gz")) throw new Error("Invalid backup object key");
  const object = await env.DOCUMENTS_BUCKET.get(key);
  if (!object) throw new Error("Backup object not found");
  const payload = JSON.parse(await gunzipText(object));
  if (!payload || payload.app !== "medlane" || payload.stateKey !== stateKey || !Array.isArray(payload.records)) throw new Error("Invalid Medlane backup payload");
  const records = payload.records
    .filter((/** @type {any} */ row) => (!row?.state_key || row.state_key === stateKey) && persistedKeys.includes(row.module_name) && row.module_name !== "logs")
    .map((/** @type {any} */ row) => ({ state_key: stateKey, module_name: row.module_name, record_key: String(row.record_key || recordKeyFor(row.module_name, row.data, 0)), data: row.data || {}, updated_by: actorId || null }));
  if (!records.length) throw new Error("Backup has no restorable app records");
  // Snapshot the current data BEFORE overwriting it with the older backup. This is not the
  // backup being restored — it is a full backup of whatever was live a moment ago, so the true
  // latest state can always be recovered no matter how many times a user restores an old
  // backup afterward (each restore snapshots what was live right before it, chaining back to
  // the original latest state).
  const preRestoreBackup = await createBackup(env, "pre-restore", actorId);
  const chunkSize = 300;
  for (let index = 0; index < records.length; index += chunkSize) {
    await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(records.slice(index, index + chunkSize)),
    });
  }
  // A restore replaces live data wholesale: any client still holding (or queueing) pre-restore
  // data must not be able to push it back over the restored records.
  await markDataReset(env, stateKey, actorId);
  await writeAuditTrace(env, stateKey, { actor: actorId || "System User", role: "Superadmin", action: "Restored backup object", module: "Backup", record: `${key} · ${records.length} records upserted · pre-restore safety backup ${preRestoreBackup.object_key}` }, actorId, auditContext);
  return { restoredRecords: records.length, objectKey: key, backupCreatedAt: payload.createdAt || null, preRestoreBackupKey: preRestoreBackup.object_key };
}

// ---- Automated alert / digest emails (threshold, approval-needed, daily/weekly digest) ----

const DIGEST_ROLE_RECIPIENTS = {
  thresholdInventory: ["Logistics", "Product Specialist"],
  thresholdCredit: ["Accounting", "Sales"],
  thresholdWarranty: ["Engineering", "Product Specialist"],
  approvalPo: ["Superadmin", "CEO"],
  approvalPaymentRequest: ["Superadmin", "CEO"],
  approvalPayable: ["Superadmin", "CEO"],
  approvalDemoSales: ["Sales"],
  approvalDemoLogistics: ["Logistics"],
  approvalDemoManagement: ["Superadmin", "CEO"],
  approvalProductIssue: ["Engineering"],
  digestBusiness: ["Accounting", "CEO", "Superadmin"],
  digestAuditLog: ["Superadmin", "CEO"],
};

const FIVE_MINUTE_MONITOR_CRON = "*/5 * * * *";

/** @param {any} dateStr */
function digestDaysUntil(dateStr) {
  if (!dateStr || dateStr === "N/A") return NaN;
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86400000);
}

/** @param {any} item */
function digestInventoryStatus(item) {
  const min = Number(item.min || 0);
  if (item.expiry && item.expiry !== "N/A" && digestDaysUntil(item.expiry) < 0) return "Expired";
  if (item.expiry && item.expiry !== "N/A" && expiresWithinSixMonths(item.expiry)) return "Near Expiry";
  if (item.qty <= Math.ceil(min * 0.5)) return "Critical";
  if (item.qty < min) return "Low Stock";
  return "Available";
}

/** @param {Sale} sale */
function digestSaleStatus(sale) {
  if (sale.status === "Cancelled") return "Cancelled";
  const balance = Number(sale.net || 0) - Number(sale.paid || 0);
  const dueIn = digestDaysUntil(addDays(sale.date, sale.terms));
  if (balance <= 0) return "Paid";
  if (dueIn < 0) return "Overdue";
  if (dueIn <= 7) return "Near Due";
  if (Number(sale.paid || 0) > 0) return "Partially Paid";
  return "Unpaid";
}

/** @param {any} clientName @param {Sale[]} sales */
function digestClientBalance(clientName, sales) {
  return sales.filter((/** @type {Sale} */ sale) => sale.client === clientName && sale.status !== "Cancelled").reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
}

const LARGE_TRANSACTION_THRESHOLD = 100000;

/** @param {any} po @param {Sale[]} sales */
function poFullyPaidServer(po, sales) {
  const linkedSales = sales.filter((/** @type {Sale} */ sale) => sale.po === po.id && sale.status !== "Cancelled");
  return linkedSales.length > 0 && linkedSales.every((/** @type {Sale} */ sale) => Number(sale.paid || 0) >= Number(sale.net || 0));
}

/** @param {any} po @param {Sale[]} sales */
function salesPoStatusServer(po, sales) {
  const lines = po.lines || [];
  const linkedSales = sales.filter((/** @type {Sale} */ sale) => sale.po === po.id && sale.status !== "Cancelled");
  if (!linkedSales.length) return "For Invoicing";
  const pendingQty = lines.reduce((/** @type {number} */ sum, /** @type {any} */ line) => {
    const served = linkedSales.flatMap((/** @type {Sale} */ sale) => sale.lines || []).filter((/** @type {SaleLine} */ saleLine) => (saleLine.code && line.code && saleLine.code === line.code) || saleLine.item === line.item).reduce((/** @type {any} */ lineSum, /** @type {SaleLine} */ saleLine) => lineSum + Number(saleLine.qty || 0), 0);
    return sum + Math.max(Number(line.qty || 0) - served, 0);
  }, 0);
  if (pendingQty > 0) return "Pending Orders";
  if (linkedSales.some((/** @type {Sale} */ sale) => sale.type === "SI")) return "Sales Invoice";
  if (linkedSales.some((/** @type {Sale} */ sale) => sale.type === "DR")) return "Delivery Receipt";
  return "Transmittal Slip";
}

const digestStateModules = ["inventory", "sales", "clients", "warranties", "inventoryPurchaseOrders", "inventoryDemoRequests", "pendingTransfers", "collectionContacts", "purchaseOrders", "paymentRequests", "payables", "replenishments", "productIssues", "payments", "imports", "reconHistory"];

// The mini-game's own records — never part of app state or reports. `game-sessions` grows
// one row per play and is never read outside /api/game/session/*; `game-scores` is served
// by /api/game/*. Loading these into every client's state was paging through thousands of
// dead session rows on each refresh.
const GAME_MODULES = ["game-sessions", "game-scores"];
// App-state blob exclusions: the game modules plus `logs` (fetched on its own paged endpoint).
const PERF_MODULE = "perf-snapshots";
// Data-reset marker: one row (record_key "marker", data { resetAt: ISO }) bumped whenever the
// live data is replaced wholesale — a backup restore here, or a manual maintenance wipe in SQL.
// Clients stamp every save with the server time their data was loaded at (`basedOn`); a save based
// on data loaded before the last reset is a stale snapshot (e.g. an unsent offline queue from
// before a wipe) and is refused, so it can't quietly re-upload records that were removed.
const RESET_MARKER_MODULE = "system-reset";
const NON_STATE_MODULES = ["logs", PERF_MODULE, RESET_MARKER_MODULE, ...GAME_MODULES];

/** @param {WorkerEnv} env @param {string} stateKey @returns {Promise<string | null>} */
async function dataResetAt(env, stateKey) {
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${RESET_MARKER_MODULE}&record_key=eq.marker&select=data`);
  const resetAt = rows[0]?.data?.resetAt;
  return resetAt && Number.isFinite(Date.parse(resetAt)) ? new Date(resetAt).toISOString() : null;
}

/** @param {WorkerEnv} env @param {string} stateKey @param {string | null} actorId */
async function markDataReset(env, stateKey, actorId) {
  const resetAt = new Date().toISOString();
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: RESET_MARKER_MODULE, record_key: "marker", data: { resetAt }, updated_by: actorId || null }]),
  });
  return resetAt;
}

// Refuses a save whose data was loaded before the last data reset. `basedOn` absent means an older
// cached client build — allowed, since those reload onto the new build via the app-version watch.
/** @param {WorkerEnv} env @param {string} stateKey @param {unknown} basedOn */
async function assertSaveNotStale(env, stateKey, basedOn) {
  if (!basedOn) return;
  const basedOnMs = Date.parse(String(basedOn));
  if (!Number.isFinite(basedOnMs)) return;
  const resetAt = await dataResetAt(env, stateKey);
  if (resetAt && basedOnMs < Date.parse(resetAt)) throw new Error(`APP_STATE_CONFLICT: STALE_SNAPSHOT — this save is based on data loaded before the system data was reset (${resetAt}). Reload and redo the change.`);
}
// Session tokens older than this are past every use (30-min expiry) and are swept.
const GAME_SESSION_TTL_MS = 3 * 60 * 60 * 1000;

// Historical/transactional modules whose row count only ever grows. /api/modules/state caps
// these to "still open/pending" records (any age) plus the most recent PAGINATED_MODULE_PAGE_SIZE
// closed/settled ones, instead of shipping every row ever created on every login. Older, closed
// history is fetched on demand via /api/modules/page ("Load previous"). Current inventory stock
// levels and every other module are not historical in this sense and are left untouched.
const PAGINATED_MODULES = ["sales", "purchaseOrders", "inventoryPurchaseOrders", "pendingTransfers", "payables", "payments", "paymentRequests"];
const PAGINATED_MODULE_PAGE_SIZE = 50;

// How much of a client PO's line quantity has been invoiced, computed from `sales` rows the
// same way the client's poServedQty()/poStatus() (public/scripts/modules.js) do — the PO's own
// stored `status` field is frozen at creation and never rewritten to a terminal value, so it
// cannot be used as a shortcut here.
/** @param {any} salesRows */
function buildServedQtyByPo(salesRows) {
  const map = new Map();
  for (const row of salesRows) {
    const sale = row.data;
    if (!sale || !sale.po || sale.status === "Cancelled") continue;
    let byCode = map.get(sale.po);
    if (!byCode) { byCode = new Map(); map.set(sale.po, byCode); }
    for (const line of sale.lines || []) {
      if (!line.code) continue;
      byCode.set(line.code, (byCode.get(line.code) || 0) + Number(line.qty || 0));
    }
  }
  return map;
}

/** @param {any} po @param {any} servedQtyByPo */
function purchaseOrderIsOpen(po, servedQtyByPo) {
  const byCode = servedQtyByPo.get(po?.id);
  const lines = po?.lines || [];
  let pending = 0;
  for (const line of lines) pending += Math.max(Number(line.qty || 0) - (byCode?.get(line.code) || 0), 0);
  // Epsilon tolerance matches poStatus()'s fractional-quantity floating-point guard.
  return pending > 1e-9;
}

// Per-module "still open" predicate (kept regardless of age/page) and sort value (what "most
// recent" and pagination cursors are measured against). pendingTransfers has no date field on
// the record itself, so it falls back to the row's own `updated_at` column.
/** @param {any} servedQtyByPo @returns {Record<string, any>} */
function paginatedModulePredicates(servedQtyByPo) {
  return {
    sales: {
      isOpen: (/** @type {any} */ data) => data?.status !== "Cancelled" && Number(data?.net || 0) - Number(data?.paid || 0) > 0,
      sortValue: (/** @type {any} */ data) => data?.date || "",
    },
    purchaseOrders: {
      isOpen: (/** @type {any} */ data) => purchaseOrderIsOpen(data, servedQtyByPo),
      sortValue: (/** @type {any} */ data) => data?.date || "",
    },
    inventoryPurchaseOrders: {
      isOpen: (/** @type {any} */ data) => !["Fully Received", "Cancelled"].includes(data?.status),
      sortValue: (/** @type {any} */ data) => data?.date || "",
    },
    pendingTransfers: {
      isOpen: (/** @type {any} */ data) => !["Received", "Cancelled"].includes(data?.status),
      sortValue: (/** @type {any} */ data, /** @type {any} */ updatedAt) => updatedAt || "",
    },
    payables: {
      isOpen: (/** @type {any} */ data) => data?.requestStatus !== "Cancelled" && !(data?.requestStatus === "Approved" && data?.paymentConfirmed === true),
      sortValue: (/** @type {any} */ data) => data?.date || "",
    },
    payments: {
      isOpen: (/** @type {any} */ data) => data?.collectionStatus !== "Deposited",
      sortValue: (/** @type {any} */ data) => data?.dateRecorded || data?.date || data?.postedDate || "",
    },
    paymentRequests: {
      isOpen: (/** @type {any} */ data) => !["Completed", "Cancelled"].includes(data?.requestStatus),
      sortValue: (/** @type {any} */ data) => data?.date || data?.createdAt || "",
    },
  };
}

// Trims the paginated modules in `rows` (app_records rows: {module_name, record_key, data,
// updated_at}) down to "open ∪ most recent PAGINATED_MODULE_PAGE_SIZE", leaving every other
// module untouched. Returns the trimmed row list plus per-module { hasMore, cursor } metadata
// for the client's "Load previous" control (cursor = the `before` value for /api/modules/page).
/** @param {AppRecordRow[]} rows */
function trimPaginatedModuleRows(rows) {
  const servedQtyByPo = buildServedQtyByPo(rows.filter((/** @type {any} */ row) => row.module_name === "sales"));
  const predicates = paginatedModulePredicates(servedQtyByPo);
  const byModule = new Map();
  for (const row of rows) {
    if (!PAGINATED_MODULES.includes(row.module_name)) continue;
    if (!byModule.has(row.module_name)) byModule.set(row.module_name, []);
    byModule.get(row.module_name).push(row);
  }
  /** @type {Record<string, any>} */
  const pagination = {};
  const kept = [];
  for (const moduleName of PAGINATED_MODULES) {
    const moduleRows = byModule.get(moduleName) || [];
    const { isOpen, sortValue } = predicates[moduleName];
    const sortOf = (/** @type {any} */ row) => sortValue(row.data, row.updated_at) || "";
    if (!moduleRows.length) { pagination[moduleName] = { hasMore: false, cursor: null }; continue; }
    const sortedDesc = [...moduleRows].sort((a, b) => sortOf(b).localeCompare(sortOf(a)));
    const recent = sortedDesc.slice(0, PAGINATED_MODULE_PAGE_SIZE);
    const recentKeys = new Set(recent.map((row) => row.record_key));
    const openRows = moduleRows.filter((/** @type {any} */ row) => !recentKeys.has(row.record_key) && isOpen(row.data));
    const finalRows = [...recent, ...openRows].sort((a, b) => sortOf(a).localeCompare(sortOf(b)));
    kept.push(...finalRows);
    pagination[moduleName] = { hasMore: finalRows.length < moduleRows.length, cursor: sortOf(recent[recent.length - 1]) || null };
  }
  const untouched = rows.filter((/** @type {any} */ row) => !PAGINATED_MODULES.includes(row.module_name));
  return { rows: [...untouched, ...kept], pagination };
}

/** @param {WorkerEnv} env @param {any} [modules] */
async function loadDigestState(env, modules = digestStateModules) {
  const stateKey = appStateKey(env);
  const chunks = [];
  for (let index = 0; index < modules.length; index += 5) chunks.push(modules.slice(index, index + 5));
  const results = await Promise.all(chunks.map((chunk) => supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(chunk))}&select=module_name,record_key,data`)));
  return stateFromRecords(results.flat());
}

/** @param {any} state */
function pendingSummaryFields(state) {
  const sales = state.sales || [];
  const salesPurchaseOrders = (state.purchaseOrders || []).filter((/** @type {any} */ po) => !["Sales Invoice", "Transmittal Slip", "Delivery Receipt"].includes(salesPoStatusServer(po, sales)) && !poFullyPaidServer(po, sales));
  const inventoryPurchaseOrders = (state.inventoryPurchaseOrders || []).filter((/** @type {any} */ po) => !/approved|fully received|cancelled/i.test(po.status || ""));
  const inventoryPoApproval = inventoryPurchaseOrders.filter((/** @type {any} */ po) => po.status === "Pending Approval");
  const transfers = (state.pendingTransfers || []).filter((/** @type {any} */ transfer) => !/received|cancelled/i.test(transfer.status || ""));
  const collectionContacts = (state.collectionContacts || []).filter((/** @type {any} */ contact) => ["Pending", "No Response", "Unreached", "Cheque Available"].includes(contact.status));
  // Payment requests awaiting approval are surfaced once, under "Pending Approvals" —
  // repeating them under "Collections" as well just duplicates the same rows and was
  // a big part of why this digest read as noisy.
  const collectionApprovals = (state.paymentRequests || []).filter((/** @type {PaymentRequest} */ request) => request.invoice && request.requestStatus === "Pending");
  const payables = (state.payables || []).filter((/** @type {Payable} */ payable) => (payable.requestStatus || payable.status) === "For Approval");
  const expenses = (state.replenishments || []).filter((/** @type {Replenishment} */ expense) => (expense.requestStatus || expense.status) === "For Approval");
  const PREVIEW_ROWS = 6;
  const field = (/** @type {any} */ emoji, /** @type {any} */ name, /** @type {any} */ rows, /** @type {(row: any) => string} */ mapper) => {
    if (!rows.length) return null;
    const preview = rows.slice(0, PREVIEW_ROWS).map((/** @type {any} */ row) => `▸ ${mapper(row)}`);
    return { name: `${emoji} ${name} (${rows.length})`, value: discordFieldValue(preview, 900, rows.length), inline: false };
  };
  return [
    field("📄", "Sales Purchase Orders", salesPurchaseOrders, (po) => `\`${po.id}\` — **${po.client || "No client"}** · ${salesPoStatusServer(po, sales)}`),
    field("📦", "Inventory Purchase Orders", inventoryPurchaseOrders, (po) => `\`${po.id}\` — **${po.supplier || "No supplier"}** · ${po.status || "Pending"}`),
    field("✅", "Pending Approvals", [...inventoryPoApproval, ...collectionApprovals], (/** @type {any} */ item) => item.supplier ? `Inventory PO \`${item.id}\` — **${item.supplier}**` : `Collection \`${item.cvNo || item.id || "Request"}\` — **${item.employee || item.invoice}**`),
    field("🚚", "Transfers", transfers, (transfer) => `\`${transfer.id}\` — **${transfer.item || "Items"}**, ${transfer.from || "-"} → ${transfer.to || "-"} · ${transfer.status || "Pending"}`),
    field("💰", "Collections", collectionContacts, (contact) => `**${contact.client || "Client"}** — ${contact.status}${contact.chequeInvoice ? ` (${contact.chequeInvoice})` : ""}`),
    field("💸", "Payables", payables, (payable) => `\`${payable.id || "Payable"}\` — **${payable.supplier || "Vendor"}**, ${money(payable.amount || payable.total || 0)} · ${payable.requestStatus || payable.status}`),
    field("🧾", "Expenses", expenses, (expense) => `\`${expense.id || "Expense"}\` — **${expense.type || "Expense"}**, ${money(expense.amount || expense.total || 0)} · ${expense.requestStatus || expense.status}`),
  ].filter(Boolean);
}

/** @param {any} state */
function detectThresholdsAndApprovals(state) {
  /** @type {Record<string, any>} */
  const sections = {};
  const pushSection = (/** @type {any} */ roles, /** @type {any} */ title, /** @type {any} */ lines) => {
    if (!lines.length) return;
    roles.forEach((/** @type {any} */ role) => {
      sections[role] ||= [];
      sections[role].push({ title, lines });
    });
  };

  const inventory = state.inventory || [];
  // Worst-first: the most urgent shortages/expiries are what digestSectionHtml's cap keeps
  // visible once a branch has dozens of low-stock or near-expiry lots.
  const lowStock = inventory.filter((/** @type {any} */ item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item))).sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.qty || 0) - Number(b.qty || 0));
  const nearExpiry = inventory.filter((/** @type {any} */ item) => digestInventoryStatus(item) === "Near Expiry").sort((/** @type {any} */ a, /** @type {any} */ b) => digestDaysUntil(a.expiry) - digestDaysUntil(b.expiry));
  if (lowStock.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdInventory, "Low / Critical Stock", lowStock.map((/** @type {any} */ item) => `${item.item} (${item.branch}) — ${item.qty} left, lot ${item.lot}`));
  if (nearExpiry.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdInventory, "Near-Expiry Stock", nearExpiry.map((/** @type {any} */ item) => `${item.item} (${item.branch}) — lot ${item.lot}, expires ${item.expiry} (${digestDaysUntil(item.expiry)}d)`));

  const sales = state.sales || [];
  const clients = state.clients || [];
  const overdue = sales.filter((/** @type {Sale} */ sale) => digestSaleStatus(sale) === "Overdue").sort((/** @type {any} */ a, /** @type {any} */ b) => Math.max(Number(b.net || 0) - Number(b.paid || 0), 0) - Math.max(Number(a.net || 0) - Number(a.paid || 0), 0));
  if (overdue.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdCredit, "Overdue Invoices", overdue.map((/** @type {Sale} */ sale) => `${sale.documentNo || sale.id} — ${sale.client}, ${money(Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0))} overdue`));
  const creditBreach = clients.filter((/** @type {Client} */ client) => Number(client.creditLimit || 0) > 0 && digestClientBalance(client.name, sales) > Number(client.creditLimit)).sort((/** @type {any} */ a, /** @type {any} */ b) => (digestClientBalance(b.name, sales) - Number(b.creditLimit)) - (digestClientBalance(a.name, sales) - Number(a.creditLimit)));
  if (creditBreach.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdCredit, "Credit Limit Breach", creditBreach.map((/** @type {Client} */ client) => `${client.name} — ${money(digestClientBalance(client.name, sales))} used / ${money(client.creditLimit)} limit`));

  const warranties = state.warranties || [];
  const warrantyEnding = warranties.filter((/** @type {any} */ item) => { const d = digestDaysUntil(item.warrantyEnd); return d >= 0 && d <= 30; });
  const warrantyExpired = warranties.filter((/** @type {any} */ item) => digestDaysUntil(item.warrantyEnd) < 0 || String(item.status || "").toLowerCase().includes("expired"));
  if (warrantyEnding.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdWarranty, "Warranty Ending Soon", warrantyEnding.map((/** @type {any} */ item) => `${item.client} — ${item.equipment} (${item.serial}), ends ${item.warrantyEnd}`));
  if (warrantyExpired.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdWarranty, "Warranty Expired", warrantyExpired.map((/** @type {any} */ item) => `${item.client} — ${item.equipment} (${item.serial})`));

  const inventoryPOs = state.inventoryPurchaseOrders || [];
  const poPending = inventoryPOs.filter((/** @type {any} */ po) => po.status === "Pending Approval");
  if (poPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPo, "Purchase Orders Awaiting Approval", poPending.map((/** @type {any} */ po) => `${po.id} — ${po.supplier}`));

  const paymentRequests = state.paymentRequests || [];
  const paymentPending = paymentRequests.filter((/** @type {PaymentRequest} */ request) => request.invoice && request.requestStatus === "Pending");
  if (paymentPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPaymentRequest, "Payments Received Awaiting Approval", paymentPending.map((/** @type {any} */ request) => `${request.cvNo} — ${request.invoice}, ${money(request.total)}`));

  const payables = state.payables || [];
  const payablesPending = payables.filter((/** @type {Payable} */ payable) => (payable.requestStatus || payable.status) === "For Approval");
  const replenishments = state.replenishments || [];
  const replenishmentsPending = replenishments.filter((/** @type {Replenishment} */ item) => (item.requestStatus || item.status) === "For Approval");
  const financialPending = [...payablesPending.map((/** @type {Payable} */ p) => `Payable — ${p.supplier}, ${money(p.amount)}`), ...replenishmentsPending.map((/** @type {Replenishment} */ r) => `Expense — ${r.type}, ${money(r.amount)}`)];
  if (financialPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPayable, "Payables / Expenses Awaiting Approval", financialPending);

  const demoRequests = state.inventoryDemoRequests || [];
  const demoSalesApproval = demoRequests.filter((/** @type {any} */ request) => request.status === "For Sales Approval");
  const demoLogisticsApproval = demoRequests.filter((/** @type {any} */ request) => request.status === "For Logistics Approval");
  if (demoLogisticsApproval.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalDemoLogistics, "Demo Requests Awaiting Logistics Approval (Consumables)", demoLogisticsApproval.map((/** @type {any} */ request) => `${request.id} — ${request.client}, ${request.lines?.length || 0} item(s)`));
  const demoManagementApproval = demoRequests.filter((/** @type {any} */ request) => request.status === "For Management Approval");
  if (demoSalesApproval.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalDemoSales, "Demo Requests Awaiting Sales Approval", demoSalesApproval.map((/** @type {any} */ request) => `${request.id} — ${request.client}, ${request.lines?.length || 0} item(s)`));
  if (demoManagementApproval.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalDemoManagement, "Demo Requests Awaiting Management Approval", demoManagementApproval.map((/** @type {any} */ request) => `${request.id} — ${request.client}, ${request.logisticsApprovedBy ? `logistics-approved by ${request.logisticsApprovedBy}` : request.salesApprovedBy ? `sales-approved by ${request.salesApprovedBy}` : `requested by ${request.requestedBy || "-"}`}`));

  const productIssues = state.productIssues || [];
  const passedIssues = productIssues.filter((/** @type {any} */ report) => ["Pass to Engineering", "Pass to Product Specialist"].includes(report.status));
  if (passedIssues.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalProductIssue, "Support Reports Awaiting Handoff", passedIssues.map((/** @type {any} */ report) => `${report.id} — ${report.companyName} (${report.status})`));

  return sections;
}

/** @param {any} state */
function computeBusinessMetrics(state) {
  const sales = (state.sales || []).filter((/** @type {Sale} */ sale) => sale.status !== "Cancelled");
  const payments = state.payments || [];
  const inventory = state.inventory || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const totalSales = sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.net || 0), 0);
  const totalCollected = sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.paid || 0), 0);
  const totalExpenses = [...payables, ...replenishments].reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
  const overdueCount = sales.filter((/** @type {Sale} */ sale) => digestSaleStatus(sale) === "Overdue").length;
  const pendingDeposit = payments.filter((/** @type {Payment} */ payment) => ["For Deposit", "For Deposit", "Posted Date"].includes(payment.collectionStatus)).length;
  const bounced = payments.filter((/** @type {Payment} */ payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce")).length;
  const lowStock = inventory.filter((/** @type {any} */ item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item))).length;
  const activeDemos = demoRequests.filter((/** @type {any} */ request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || "")).length;
  return {
    salesCount: sales.length,
    totalSales,
    totalCollected,
    openReceivables: Math.max(totalSales - totalCollected, 0),
    totalExpenses,
    overdueCount,
    pendingDeposit,
    bounced,
    lowStock,
    activeDemos,
  };
}

/** @param {any} state */
function buildBusinessSummaryLines(state) {
  const m = computeBusinessMetrics(state);
  return [
    `New/active invoices tracked: ${m.salesCount}`,
    `Total invoiced: ${money(m.totalSales)}`,
    `Total collected: ${money(m.totalCollected)}`,
    `Open receivables: ${money(m.openReceivables)}`,
    `Total business expenses (payables + expenses): ${money(m.totalExpenses)}`,
    `Overdue invoices: ${m.overdueCount}`,
    `Collections pending deposit: ${m.pendingDeposit}`,
    `Bounced payments: ${m.bounced}`,
    `Low / critical inventory: ${m.lowStock}`,
    `Active demo requests: ${m.activeDemos}`,
  ];
}

/** @param {any} state @param {any} sinceIso */
function financialDigestLines(state, sinceIso) {
  const since = new Date(sinceIso);
  const inPeriod = (/** @type {any} */ value) => value && new Date(value) >= since;
  const purchaseOrders = state.purchaseOrders || [];
  const inventoryPurchaseOrders = state.inventoryPurchaseOrders || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const openClientPos = purchaseOrders.filter((/** @type {any} */ po) => !/completed|cancelled|invoice/i.test(po.status || ""));
  const newClientPos = purchaseOrders.filter((/** @type {any} */ po) => inPeriod(po.date));
  const openInventoryPos = inventoryPurchaseOrders.filter((/** @type {any} */ po) => !/completed|cancelled|received/i.test(po.status || ""));
  const inventoryPoTotal = openInventoryPos.reduce((/** @type {number} */ sum, /** @type {any} */ po) => sum + (po.lines || []).reduce((/** @type {any} */ lineSum, /** @type {any} */ line) => lineSum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0), 0);
  const openPayables = payables.filter((/** @type {Payable} */ payable) => !/paid|approved|cancelled|rejected/i.test(payable.requestStatus || payable.status || ""));
  const pendingExpenses = replenishments.filter((/** @type {Replenishment} */ expense) => !/paid|approved|liquidated|cancelled|rejected/i.test(expense.requestStatus || expense.status || ""));
  const combinedExpenses = [...payables, ...replenishments];
  const activeDemos = demoRequests.filter((/** @type {any} */ request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  const newDemos = demoRequests.filter((/** @type {any} */ request) => inPeriod(request.date || request.demoDate));
  return [
    `Client purchase orders open: ${openClientPos.length}`,
    `Client purchase orders created: ${newClientPos.length}`,
    `Inventory purchase orders open: ${openInventoryPos.length} (${money(inventoryPoTotal)})`,
    `Payables for approval (approved counts as paid): ${openPayables.length} (${money(openPayables.reduce((/** @type {number} */ sum, /** @type {Payable} */ item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `Expenses pending/for approval: ${pendingExpenses.length} (${money(pendingExpenses.reduce((/** @type {number} */ sum, /** @type {Replenishment} */ item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `All expenses booked (payables + expenses): ${combinedExpenses.length} (${money(combinedExpenses.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `Demo requests active/created: ${activeDemos.length} active / ${newDemos.length} created`,
  ];
}

/** @param {number | Date} [value] */
function manilaMonthParts(value = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { key: `${map.year}-${map.month}`, label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date(value)) };
}

/** @param {any} value */
function recordMonthKey(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : manilaMonthParts(date).key;
}

/** @param {any} state @param {any} monthKey */
function dashboardAnalyticsFields(state, monthKey) {
  const sales = (state.sales || []).filter((/** @type {Sale} */ sale) => sale.status !== "Cancelled");
  const payments = state.payments || [];
  const inventory = state.inventory || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const monthSales = sales.filter((/** @type {Sale} */ sale) => recordMonthKey(sale.date) === monthKey);
  const monthPayments = payments.filter((/** @type {Payment} */ payment) => recordMonthKey(payment.dateRecorded || payment.date || payment.postedDate) === monthKey);
  const monthPayables = payables.filter((/** @type {Payable} */ payable) => recordMonthKey(payable.date) === monthKey);
  const monthExpenses = replenishments.filter((/** @type {Replenishment} */ expense) => recordMonthKey(expense.date) === monthKey);
  const totalSales = monthSales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.net || 0), 0);
  const totalCollected = monthPayments.reduce((/** @type {number} */ sum, /** @type {Payment} */ payment) => sum + Number(payment.amount || 0), 0);
  const openReceivables = Math.max(sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.net || 0), 0) - sales.reduce((/** @type {number} */ sum, /** @type {Sale} */ sale) => sum + Number(sale.paid || 0), 0), 0);
  const overdue = sales.filter((/** @type {Sale} */ sale) => digestSaleStatus(sale) === "Overdue");
  const lowStock = inventory.filter((/** @type {any} */ item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item)));
  const pendingPayables = monthPayables.filter((/** @type {Payable} */ payable) => ["For Approval", "Approved"].includes(payable.requestStatus || payable.status));
  const pendingExpenses = monthExpenses.filter((/** @type {Replenishment} */ expense) => ["For Approval", "Approved"].includes(expense.requestStatus || expense.status));
  const monthExpenseTotal = [...monthPayables, ...monthExpenses].reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
  const activeDemos = demoRequests.filter((/** @type {any} */ request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  return [
    { name: "💰 Sales", value: [`**Invoices this month:** ${monthSales.length}`, `**Month invoiced:** ${money(totalSales)}`, `**Open AR total:** ${money(openReceivables)}`].join("\n"), inline: true },
    { name: "🏦 Collections", value: [`**Collected this month:** ${money(totalCollected)}`, `**Deposits pending:** ${payments.filter((/** @type {Payment} */ payment) => ["For Deposit", "For Deposit", "Posted Date"].includes(payment.collectionStatus)).length}`, `**Overdue invoices:** ${overdue.length}`].join("\n"), inline: true },
    { name: "📦 Operations", value: [`**Low / critical stock:** ${lowStock.length}`, `**Business expenses this month:** ${monthPayables.length + monthExpenses.length}`, `**Expense amount:** ${money(monthExpenseTotal)}`].join("\n"), inline: true },
    { name: "⚠️ Attention", value: [`**Payables/expenses pending:** ${pendingPayables.length + pendingExpenses.length}`, `**Active demo requests:** ${activeDemos.length}`, `**Bounced payments:** ${payments.filter((/** @type {Payment} */ payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce")).length}`].join("\n"), inline: true },
  ];
}

// Builds the field set for the live Inventory Status Discord board: buckets every inventory
// row by digestInventoryStatus() into disposal/critical/low-stock/near-expiry, each sorted
// so the most urgent row (lowest qty, soonest expiry) leads the list — matches the same
// thresholds the Low/Critical Stock and Near-Expiry Stock digest sections already use, just
// scoped to their own channel instead of mixed into the general digest.
/** @param {any} inventory */
function inventoryStatusFields(inventory) {
  const disposal = inventory.filter((/** @type {any} */ item) => digestInventoryStatus(item) === "Expired").sort((/** @type {any} */ a, /** @type {any} */ b) => digestDaysUntil(a.expiry) - digestDaysUntil(b.expiry));
  const critical = inventory.filter((/** @type {any} */ item) => digestInventoryStatus(item) === "Critical").sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.qty || 0) - Number(b.qty || 0));
  const lowStock = inventory.filter((/** @type {any} */ item) => digestInventoryStatus(item) === "Low Stock").sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.qty || 0) - Number(b.qty || 0));
  const nearExpiry = inventory.filter((/** @type {any} */ item) => digestInventoryStatus(item) === "Near Expiry").sort((/** @type {any} */ a, /** @type {any} */ b) => digestDaysUntil(a.expiry) - digestDaysUntil(b.expiry));
  const flaggedCount = disposal.length + critical.length + lowStock.length + nearExpiry.length;
  const healthy = inventory.length - flaggedCount;

  const PREVIEW_ROWS = 10;
  // Every row renders the same two-line block so quantity and expiry are always in the same
  // spot and easy to scan: title line (item · branch · lot), then a labelled Qty / Exp line.
  const expiryTag = (/** @type {any} */ item) => {
    if (!item.expiry || item.expiry === "N/A") return "no expiry set";
    const days = digestDaysUntil(item.expiry);
    if (Number.isNaN(days)) return item.expiry;
    if (days < 0) return `${item.expiry} · expired ${Math.abs(days)}d ago`;
    if (days === 0) return `${item.expiry} · expires today`;
    return `${item.expiry} · in ${days}d`;
  };
  const rowLine = (/** @type {any} */ item) => {
    const title = `**${item.item || item.code || "Item"}** · ${item.branch || "-"}${item.lot ? ` · lot ${item.lot}` : ""}`;
    return `${title}\n   📦 Qty **${item.qty ?? 0} / ${item.min ?? 0}**   ⏳ Exp **${expiryTag(item)}**`;
  };
  const field = (/** @type {any} */ emoji, /** @type {any} */ name, /** @type {any} */ rows) => {
    if (!rows.length) return null;
    const preview = rows.slice(0, PREVIEW_ROWS).map((/** @type {any} */ row) => `▸ ${rowLine(row)}`);
    return { name: `${emoji} ${name} (${rows.length})`, value: discordFieldValue(preview, 950, rows.length), inline: false };
  };

  const fields = [
    field("⛔", "Expired", disposal),
    field("🔴", "Critical Stock", critical),
    field("🟠", "Low Stock", lowStock),
    field("⏳", "Near-Expiry Stock", nearExpiry),
    { name: "📊 Snapshot", value: [`**SKUs tracked:** ${inventory.length}`, `**Healthy stock:** ${healthy}`, `**Flagged:** ${flaggedCount}`].join("\n"), inline: false },
  ].filter(Boolean);
  return { fields, flaggedCount, criticalCount: disposal.length + critical.length };
}

/** @param {any} value */
function normalizeBranchName(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** @param {WorkerEnv} env @param {any} branchLabel @param {any} branchInventory */
async function postInventoryBranchBoard(env, branchLabel, branchInventory) {
  const { fields, flaggedCount, criticalCount } = inventoryStatusFields(branchInventory);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const description = flaggedCount
    ? `⚠️ **${flaggedCount} item${flaggedCount === 1 ? "" : "s"}** need attention (critical/low stock, near-expiry, or expired).\n🕒 **Latest update:** ${updatedAt} PHT`
    : `✨ All stock levels and expiry dates are clear.\n🕒 **Latest update:** ${updatedAt} PHT`;
  const embed = { title: `📦 Medlane Inventory Status — ${branchLabel}`, color: criticalCount ? 0xef4b4f : flaggedCount ? 0xf59e0b : 0x22c55e, description, fields, timestamp: new Date().toISOString() };
  const stateKey = `discord-inventory-${normalizeBranchName(branchLabel)}`;
  const stored = await monitoringState(env, stateKey).catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_INVENTORY_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
    if (edited?.edited) return; // edited in place; nothing to persist
    await recordSystemLog(env, { action: "Discord inventory edit failed", module: "Discord", record: `${branchLabel}: ${edited?.error?.message || "Unknown edit failure"}` });
    // Edit failed (message deleted/edited elsewhere, etc.) — clear the old message before
    // posting a fresh one below so a still-live message doesn't linger as a duplicate.
    await deleteDiscordWebhookMessage(env.DISCORD_INVENTORY_WEBHOOK_URL, stored.messageId).catch(() => null);
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_INVENTORY_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
  if (sent.error) return recordSystemLog(env, { action: "Discord inventory monitor failed", module: "Discord", record: `${branchLabel}: ${sent.error.message}` });
  if (sent.messageId) await saveMonitoringState(env, stateKey, { messageId: sent.messageId, updatedAt: new Date().toISOString() });
  else await recordSystemLog(env, { action: "Discord inventory message id missing", module: "Discord", record: `${branchLabel}: Discord post succeeded but did not return a message ID` });
}

// Deletes the Discord message and clears the tracked state for a branch board that no longer
// has a matching masterlist branch (removed, or renamed to a different normalized key) — so a
// stale board doesn't sit there forever showing data that stopped being true.
/** @param {WorkerEnv} env @param {any} branchKey */
async function removeInventoryBranchBoard(env, branchKey) {
  const stateKey = `discord-inventory-${branchKey}`;
  const stored = await monitoringState(env, stateKey).catch(() => ({}));
  if (!stored.messageId) return;
  await deleteDiscordWebhookMessage(env.DISCORD_INVENTORY_WEBHOOK_URL, stored.messageId).catch((error) => recordSystemLog(env, { action: "Discord inventory cleanup failed", module: "Discord", record: `${branchKey}: ${error.message}` }));
  await saveMonitoringState(env, stateKey, {}).catch((error) => recordSystemLog(env, { action: "Discord inventory state clear failed", module: "Discord", record: `${branchKey}: ${error.message}` }));
  await recordSystemLog(env, { action: "Discord inventory board removed", module: "Discord", record: `Branch board no longer in masterlist: ${branchKey}` }).catch(() => null);
}

/** @param {WorkerEnv} env */
async function runInventoryStatusMonitor(env) {
  if (!env.DISCORD_INVENTORY_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord inventory monitor skipped", module: "Discord", record: "DISCORD_INVENTORY_WEBHOOK_URL not configured" });
  /** @type {Record<string, any>} */
  const state = await loadDigestState(env, ["inventory", "platformBranches"]);
  const inventory = state.inventory || [];
  // Branch list comes from the masterlist (Settings > Branches), not a hardcoded pair, so a
  // newly added branch automatically gets its own board next tick with no code change. Falls
  // back to whatever branch names actually appear on inventory rows if masterlist is empty,
  // so this never silently produces zero boards.
  const configuredBranches = (state.platformBranches || []).filter(Boolean);
  const branches = configuredBranches.length ? configuredBranches : [...new Set(inventory.map((/** @type {any} */ item) => item.branch).filter(Boolean))].sort();
  const activeKeys = new Set(branches.map(normalizeBranchName));

  const registry = await monitoringState(env, "discord-inventory-branches").catch(() => ({}));
  const staleKeys = (registry.keys || []).filter((/** @type {any} */ key) => !activeKeys.has(key));

  await Promise.allSettled([
    ...branches.map((/** @type {any} */ branch) => postInventoryBranchBoard(env, branch, inventory.filter((/** @type {any} */ item) => normalizeBranchName(item.branch) === normalizeBranchName(branch)))),
    ...staleKeys.map((/** @type {any} */ key) => removeInventoryBranchBoard(env, key)),
  ]);
  await saveMonitoringState(env, "discord-inventory-branches", { keys: [...activeKeys] }).catch((error) => recordSystemLog(env, { action: "Discord inventory registry save failed", module: "Discord", record: error.message }));
}

const GAME_BADGE_EMOJI = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
/** @type {Record<string, any>} */
const GAME_SKIN_EMOJI = { hardhat: "👷", shades: "😎", cape: "🦸", gold: "👑", platinum: "🔷" };

/** @param {any} value @param {string} [fallback] */
function discordSafeText(value, fallback = "Player") {
  // Strip Discord markdown control chars so a player name can't italicise / spoiler the row.
  return webhookText(String(value ?? "").replace(/[*_~`|\\>]/g, ""), fallback).slice(0, 60);
}

// NOTE: expired `game-sessions` rows are intentionally NOT pruned — app_records deletes are blocked
// by the app_records_delete_guard trigger (see docs/migrations/2026-08-05-app-records-delete-guard.sql).

// One always-current "🏆 Luksong Medlane — Leaderboard" message in its own Discord channel,
// edited in place on the same 15-minute cadence as the inventory boards (skips the 18:00 hour
// reserved for digests/backups). Mirrors postInventoryBranchBoard: edit the tracked message,
// fall back to posting a fresh one and re-tracking its id.
/** @param {WorkerEnv} env */
async function runLuksongLeaderboardMonitor(env) {
  if (!env.DISCORD_LUKSONG_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord Luksong leaderboard skipped", module: "Discord", record: "DISCORD_LUKSONG_WEBHOOK_URL not configured" });
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-scores&select=data`);
  const entries = rows.map((/** @type {any} */ row) => row.data).filter((/** @type {any} */ entry) => entry && Number(entry.score) > 0)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => (b.score || 0) - (a.score || 0))
    .slice(0, 15);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const medal = (/** @type {any} */ i) => ["🥇", "🥈", "🥉"][i] || `**${i + 1}.**`;
  const lines = entries.map((/** @type {any} */ entry, /** @type {any} */ i) => {
    const badge = gameBadgeForScore(entry.score);
    const level = gameLevelForXp(entry.totalXp || 0);
    const skin = gameResolveSkin(null, entry.skin, level, badge);
    const skinTag = GAME_SKIN_EMOJI[skin] ? ` ${GAME_SKIN_EMOJI[skin]}` : "";
    return `${medal(i)} ${discordSafeText(entry.name)} — **${Number(entry.score || 0).toLocaleString("en-US")}** · Lv.${level}${badge ? ` ${GAME_BADGE_EMOJI[badge] || ""}` : ""}${skinTag}`;
  });
  const description = (entries.length
    ? `${lines.join("\n")}\n\n🕒 **Latest update:** ${updatedAt} PHT`
    : `No runs on the board yet — open **User Settings → Play Game** to set the first score.\n\n🕒 **Latest update:** ${updatedAt} PHT`).slice(0, 4000);
  const embed = { title: "🏆 Luksong Medlane — Leaderboard", color: 0x0077bd, description, timestamp: new Date().toISOString() };
  const stored = await monitoringState(env, "discord-luksong-leaderboard").catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_LUKSONG_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
    if (edited?.edited) return; // edited in place; nothing to persist
    await recordSystemLog(env, { action: "Discord Luksong leaderboard edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_LUKSONG_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
  if (sent.error) return recordSystemLog(env, { action: "Discord Luksong leaderboard failed", module: "Discord", record: sent.error.message });
  if (sent.messageId) await saveMonitoringState(env, "discord-luksong-leaderboard", { messageId: sent.messageId, updatedAt: new Date().toISOString() });
  else await recordSystemLog(env, { action: "Discord Luksong leaderboard message id missing", module: "Discord", record: "Post succeeded but no message ID returned" });
}

/** @param {any} ms */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** @param {any} error */
function isTransientJwtClockSkew(error) {
  return /jwt.*future|issued at future|not active|nbf/i.test(String(error?.message || error || ""));
}

/** @param {WorkerEnv} env */
async function checkSupabaseAppRecordsHealth(env) {
  const query = `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=module_name&limit=1`;
  try {
    requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    // supabaseFetch() already retries once on transient JWT clock-skew — a second failure
    // here means it isn't transient.
    await supabaseFetch(env, query);
    return { name: "Supabase app_records", ok: true };
  } catch (/** @type {any} */ error) {
    return { name: "Supabase app_records", ok: false, error: error.message };
  }
}

/** @param {WorkerEnv} env @param {string} path @param {any} name */
async function checkAssetPageHealth(env, path, name) {
  if (!env.ASSETS) return { name, ok: false, error: "ASSETS binding missing" };
  try {
    const response = await env.ASSETS.fetch(new Request(`https://medlane.local${path}`, { method: "GET" }));
    return { name, ok: response.ok, error: response.ok ? "" : `HTTP ${response.status}` };
  } catch (/** @type {any} */ error) {
    return { name, ok: false, error: error.message };
  }
}

// Backups only run weekly (Sun), monthly (1st), yearly (Jan 1) — never daily — so "stale" must
// be judged against that cadence, not a flat 24h window. A flat 24h threshold would report
// "stale" on 6 of every 7 days by design, not because anything is wrong.
const BACKUP_STALE_HOURS = 24 * 7;

/** @param {WorkerEnv} env */
async function backupStatus(env) {
  const rows = await supabaseFetch(env, `/rest/v1/backup_runs?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=id,backup_type,mode,object_key,records_count,size_bytes,created_at&order=created_at.desc&limit=1`);
  const latest = rows[0] || null;
  /** @type {number | null} */
  const ageHours = latest?.created_at ? (Date.now() - new Date(latest.created_at).getTime()) / 36e5 : null;
  return { latest, ageHours, stale: !latest || /** @type {number} */ (ageHours) > BACKUP_STALE_HOURS };
}

/** @param {WorkerEnv} env */
async function checkBackupFreshnessHealth(env) {
  try {
    const status = await backupStatus(env);
    return { name: "Backup freshness", ok: !status.stale, note: status.latest ? `Latest ${status.latest.backup_type} backup ${/** @type {number} */ (status.ageHours).toFixed(1)} hours ago` : "No successful backup recorded", error: status.stale ? `No successful backup in the last ${BACKUP_STALE_HOURS / 24} days` : "" };
  } catch (/** @type {any} */ error) {
    return { name: "Backup freshness", ok: false, error: error.message };
  }
}

/** @param {any} name @param {any} check */
async function timedHealthCheck(name, check) {
  const started = Date.now();
  try {
    const result = await check();
    return { name, ...result, durationMs: Date.now() - started };
  } catch (/** @type {any} */ error) {
    return { name, ok: false, error: error.message, durationMs: Date.now() - started };
  }
}

/** @param {any} name @param {any} ok @param {string} [error] */
function staticHealthCheck(name, ok, error = "") {
  return { name, ok, error: ok ? "" : error, durationMs: 0 };
}

/** @param {any} check */
function healthCheckLine(check) {
  const timing = typeof check.durationMs === "number" ? ` (${check.durationMs} ms)` : "";
  return `${check.ok ? "✅" : "❌"} **${check.name}**${timing}${check.note ? `\n↳ ${check.note}` : ""}${check.error ? `\n↳ ${check.error}` : ""}`;
}

/** @param {WorkerEnv} env @param {any} ok */
async function updateMonthlyUptime(env, ok) {
  const month = manilaMonthParts();
  const key = `api-health-uptime-${month.key}`;
  /** @type {Record<string, any>} */
  const state = await monitoringState(env, key).catch(() => ({}));
  const checks = Number(state.checks || 0) + 1;
  const successes = Number(state.successes || 0) + (ok ? 1 : 0);
  const failures = Number(state.failures || 0) + (ok ? 0 : 1);
  const updated = { monthKey: month.key, monthLabel: month.label, checks, successes, failures, uptimePercent: checks ? Number(((successes / checks) * 100).toFixed(2)) : 100, lastStatus: ok ? "ok" : "failed", lastCheckedAt: new Date().toISOString() };
  await saveMonitoringState(env, key, updated).catch((error) => recordSystemLog(env, { action: "Health uptime state save failed", module: "Monitoring", record: error.message }));
  return updated;
}

/** @param {WorkerEnv} env @param {any} recordKey */
async function monitoringState(env, recordKey) {
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.system-monitoring&record_key=eq.${encodeURIComponent(recordKey)}&select=data`);
  return rows[0]?.data || {};
}

/** @param {WorkerEnv} env @param {any} recordKey @param {any} state */
async function saveMonitoringState(env, recordKey, state) {
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ state_key: appStateKey(env), module_name: "system-monitoring", record_key: recordKey, data: state, updated_by: null }]),
  });
}

/** @param {WorkerEnv} env */
async function runApiHealthMonitor(env) {
  const checks = [];
  const started = Date.now();
  checks.push(await timedHealthCheck("Supabase app_records", () => checkSupabaseAppRecordsHealth(env)));
  checks.push(await timedHealthCheck("Landing page", () => checkAssetPageHealth(env, "/", "Landing page")));
  checks.push(await timedHealthCheck("Login page", () => checkAssetPageHealth(env, "/login", "Login page")));
  checks.push(await timedHealthCheck("Backup freshness", () => checkBackupFreshnessHealth(env)));
  checks.push(staticHealthCheck("R2 binding", Boolean(env.DOCUMENTS_BUCKET), "DOCUMENTS_BUCKET binding missing"));
  checks.push(staticHealthCheck("Supabase URL", Boolean(env.SUPABASE_URL), "SUPABASE_URL missing"));
  checks.push(staticHealthCheck("Supabase anon key", Boolean(env.SUPABASE_ANON_KEY), "SUPABASE_ANON_KEY missing"));
  checks.push(staticHealthCheck("Supabase service role", Boolean(env.SUPABASE_SERVICE_ROLE_KEY), "SUPABASE_SERVICE_ROLE_KEY missing"));
  const failed = checks.filter((check) => !check.ok);
  const checkRuntimeMs = Date.now() - started;
  const statusState = await monitoringState(env, "api-health-status").catch(() => ({}));
  const recovered = statusState.lastStatus === "failed" && !failed.length;
  const uptime = await updateMonthlyUptime(env, !failed.length);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const embed = { title: failed.length ? "🔴 Medlane API Health — Failed" : "🟢 Medlane API Health — OK", color: failed.length ? 0xef4b4f : 0x22c55e, description: failed.length ? "🚨 **Immediate review needed.** One or more API checks failed." : "✅ **All monitored API checks are healthy.**", fields: [{ name: "🕒 Latest Update", value: `**${updatedAt} PHT**`, inline: false }, { name: "⚡ Check Runtime", value: `**${checkRuntimeMs} ms**`, inline: true }, { name: "📈 Monthly Uptime", value: `**${uptime.uptimePercent.toFixed(2)}%** (${uptime.successes}/${uptime.checks} checks)`, inline: true }, { name: "🧪 Checks by Duration", value: checks.map(healthCheckLine).join("\n").slice(0, 1500), inline: false }], timestamp: new Date().toISOString() };
  if (env.DISCORD_HEALTH_WEBHOOK_URL) {
    const stored = await monitoringState(env, "discord-health").catch(() => ({}));
    if (stored.messageId) {
      const edited = await editDiscordWebhookMessage(env.DISCORD_HEALTH_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
      if (edited?.edited) { /* edited in place; nothing to persist */ }
      else {
        await recordSystemLog(env, { action: "Discord health edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
        stored.messageId = "";
      }
    }
    if (!stored.messageId) {
      const sent = await sendDiscordWebhookUrl(env, env.DISCORD_HEALTH_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
      if (sent.error) await recordSystemLog(env, { action: "Discord health monitor skipped/failed", module: "Discord", record: sent.error.message });
      else if (sent.messageId) await saveMonitoringState(env, "discord-health", { messageId: sent.messageId, updatedAt: new Date().toISOString() }).catch((error) => recordSystemLog(env, { action: "Discord health state save failed", module: "Discord", record: error.message }));
      else await recordSystemLog(env, { action: "Discord health message id missing", module: "Discord", record: "Discord post succeeded but did not return a message ID" });
    }
  } else await recordSystemLog(env, { action: "Discord health monitor skipped", module: "Discord", record: "DISCORD_HEALTH_WEBHOOK_URL not configured" });
  // Only persist on a real change (status flip or different failing checks). lastCheckedAt is
  // never read, and rewriting this row every 5 minutes was ~288 pointless writes/day.
  const nextFailedChecks = failed.map((check) => check.name);
  const statusChanged = statusState.lastStatus !== (failed.length ? "failed" : "ok")
    || JSON.stringify(statusState.failedChecks || []) !== JSON.stringify(nextFailedChecks);
  if (statusChanged) await saveMonitoringState(env, "api-health-status", { lastStatus: failed.length ? "failed" : "ok", lastCheckedAt: new Date().toISOString(), lastFailedAt: failed.length ? new Date().toISOString() : statusState.lastFailedAt || null, lastRecoveredAt: recovered ? new Date().toISOString() : statusState.lastRecoveredAt || null, failedChecks: failed.map((check) => check.name) }).catch((error) => recordSystemLog(env, { action: "Health status state save failed", module: "Monitoring", record: error.message }));
  if (failed.length) await sendDiscordWebhook(env, { content: "🚨 **Medlane API health check failed.**", embeds: [embed] });
  else if (recovered) await sendDiscordWebhook(env, { embeds: [{ title: "Medlane API Health Recovered", color: 0x22c55e, description: "All monitored API checks are back to OK after the previous failure.", fields: [{ name: "Recovered At", value: `**${updatedAt} PHT**`, inline: false }, { name: "Monthly Uptime", value: `${uptime.uptimePercent.toFixed(2)}%`, inline: true }], timestamp: new Date().toISOString() }] });
}

/** @param {WorkerEnv} env */
async function runDashboardAnalyticsMonitor(env) {
  if (!env.DISCORD_DASHBOARD_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord dashboard monitor skipped", module: "Discord", record: "DISCORD_DASHBOARD_WEBHOOK_URL not configured" });
  const cached = await monitoringState(env, "dashboard-analytics-cache").catch(() => ({}));
  const cacheAgeMs = cached.cachedAt ? Date.now() - new Date(cached.cachedAt).getTime() : Infinity;
  /** @type {Record<string, any>} */
  const state = cached.state && cacheAgeMs < 10 * 60 * 1000 ? cached.state : await loadDigestState(env, ["sales", "payments", "inventory", "payables", "replenishments"]);
  if (!cached.state || cacheAgeMs >= 10 * 60 * 1000) await saveMonitoringState(env, "dashboard-analytics-cache", { cachedAt: new Date().toISOString(), state }).catch((error) => recordSystemLog(env, { action: "Dashboard analytics cache save failed", module: "Monitoring", record: error.message }));
  const month = manilaMonthParts();
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const embed = { title: "📊 Medlane Dashboard & Analytics", color: 0x0077bd, description: `📅 **Current month:** ${month.label}\n🕒 **Latest update:** ${updatedAt} PHT`, fields: dashboardAnalyticsFields(state, month.key), timestamp: new Date().toISOString() };
  const stored = await monitoringState(env, "discord-dashboard").catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_DASHBOARD_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
    if (edited?.edited) return; // edited in place; nothing to persist
    await recordSystemLog(env, { action: "Discord dashboard edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
    // Edit failed (message deleted/edited elsewhere, etc.) — clear the old message before
    // posting a fresh one below so a still-live message doesn't linger as a duplicate.
    await deleteDiscordWebhookMessage(env.DISCORD_DASHBOARD_WEBHOOK_URL, stored.messageId).catch(() => null);
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_DASHBOARD_WEBHOOK_URL, { embeds: [embed], wait: true });
  if (sent.messageId) await saveMonitoringState(env, "discord-dashboard", { messageId: sent.messageId, updatedAt: new Date().toISOString() });
}

/** @param {WorkerEnv} env */
async function runPendingItemsMonitor(env) {
  if (!env.DISCORD_PENDING_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord pending monitor skipped", module: "Discord", record: "DISCORD_PENDING_WEBHOOK_URL not configured" });
  /** @type {Record<string, any>} */
  const state = await loadDigestState(env, ["sales", "purchaseOrders", "inventoryPurchaseOrders", "pendingTransfers", "collectionContacts", "paymentRequests", "payables", "replenishments"]);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fields = pendingSummaryFields(state);
  const totalPending = fields.reduce((sum, field) => sum + Number(/** @type {any} */ (field).name.match(/\((\d+)\)/)?.[1] || 0), 0);
  const description = totalPending
    ? `Items needing approval, receiving, collection follow-up, or action.\n🕒 **Latest update:** ${updatedAt} PHT\n📋 **${totalPending} pending item${totalPending === 1 ? "" : "s"}** across **${fields.length} categor${fields.length === 1 ? "y" : "ies"}**`
    : `✨ Nothing pending — all clear.\n🕒 **Latest update:** ${updatedAt} PHT`;
  const embed = { title: "📌 Medlane Pending Items", color: totalPending ? 0xf59e0b : 0x22c55e, description, fields, timestamp: new Date().toISOString() };
  const stored = await monitoringState(env, "discord-pending").catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_PENDING_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
    if (edited?.edited) return; // edited in place; nothing to persist
    await recordSystemLog(env, { action: "Discord pending edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_PENDING_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
  if (sent.error) return recordSystemLog(env, { action: "Discord pending monitor failed", module: "Discord", record: sent.error.message });
  if (sent.messageId) await saveMonitoringState(env, "discord-pending", { messageId: sent.messageId, updatedAt: new Date().toISOString() });
  else await recordSystemLog(env, { action: "Discord pending message id missing", module: "Discord", record: "Discord post succeeded but did not return a message ID" });
}

// Curated Giphy IDs (each verified to resolve at media.giphy.com/media/<id>/giphy.gif) so a
// greeting never links to a dead/removed GIF — an API-backed "random gif" lookup would need
// its own key/secret and an extra network call inside the once-per-day job for no real benefit
// at this pool size.
const BIRTHDAY_GIF_IDS = [
  "3o7TKGYmeY2kDqhdU4", "fYqbt5cWBEZhKhqy3I", "l2JJB3GtJDex2DXdC", "VXL7EEt3m97oSIZpj4",
  "iffUvWFEzzzP0frPtC", "ntretwLtH5GTZxS8lp", "rMsV3D1Fb7u2Va6KpC", "l0HlH5ru00SL0J1fy",
  "feio2yIUMtdqWjRiaF", "MbaKm0hJtu4AJpjUr9", "3oEduMKlE8nTJrEa3e", "3ohzdHb9vMEkpuEy40",
  "Sxp1NDnlaHJGWEVYRS", "nAELLSB7jV0wVejr1h", "wumLmqIVT4yDwsZiqD", "riVQBwB6yKFlNole29",
  "uu3iMsjJno9e6NTijg", "4e5N7SJFpgO9GaC6PO", "T8ZaX6VoICGFxnlNsh", "26FPzWY5I6WqElJC0",
  "3o6gaW2l0FJB0jt7MY",
];

function randomBirthdayGifUrl() {
  const id = BIRTHDAY_GIF_IDS[Math.floor(Math.random() * BIRTHDAY_GIF_IDS.length)];
  return `https://media.giphy.com/media/${id}/giphy.gif`;
}

// Runs once per day inside the 08:00 Manila hour (see runFiveMinuteScheduledTasks), retried
// every 15 minutes for the rest of the day on failure. Employee birthday is stored as an ISO
// "YYYY-MM-DD" string; comparing the "MM-DD" tail against today's Manila date catches the
// birthday regardless of what year the record was created in.
// `force` (used by the manual /api/discord/birthday-test trigger, which bypasses the once-per-
// day lock entirely) sends one synthetic test greeting when nobody's real birthday is today, so
// an admin can confirm the webhook is wired up correctly without waiting for one.
// Throws on anything that should make runOncePerPeriod retry on the next 15-minute tick
// (missing config, a failed Discord post); "no birthdays today" is a normal, non-retried result.
/** @param {WorkerEnv} env @param {{ force?: any }} options */
async function runBirthdayGreetings(env, { force = false } = {}) {
  if (!env.DISCORD_BIRTHDAY_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord birthday monitor skipped", module: "Discord", record: "DISCORD_BIRTHDAY_WEBHOOK_URL not configured" }).catch(() => null);
    throw new Error("DISCORD_BIRTHDAY_WEBHOOK_URL is not configured");
  }
  /** @type {Record<string, any>} */
  const state = await loadDigestState(env, ["employees"]);
  const todayKey = manilaScheduleParts(Date.now());
  const monthDay = `${todayKey.month}-${todayKey.day}`;
  let birthdays = (state.employees || []).filter((/** @type {any} */ employee) => !employee.archived && String(employee.birthday || "").slice(5) === monthDay);
  const isTest = force && !birthdays.length;
  if (isTest) birthdays = [{ name: "Test Employee" }];
  if (!birthdays.length) return { sent: false, reason: "No birthdays today" };
  const sentTo = [];
  for (const employee of birthdays) {
    const embed = {
      title: `🎉🎂 Happy Birthday${isTest ? " (Test Post)" : ""}, ${discordSafeText(employee.name, "Employee")}!`,
      description: isTest ? "This is a test post confirming the birthday webhook is configured correctly." : "Wishing you a great day from the whole Medlane team! 🎈",
      color: 0xf472b6,
      image: { url: randomBirthdayGifUrl() },
      timestamp: new Date().toISOString(),
    };
    const sent = await sendDiscordWebhookUrl(env, env.DISCORD_BIRTHDAY_WEBHOOK_URL, { embeds: [embed] }).catch((error) => ({ error }));
    if (sent?.error) await recordSystemLog(env, { action: "Discord birthday post failed", module: "Discord", record: `${employee.name}: ${sent.error.message}` });
    else sentTo.push(employee.name);
  }
  // Some, but not all, birthdays posted: return success (today is marked done) rather than
  // retrying — a retry would re-send the ones that already succeeded. The failed ones are
  // already visible in the audit log above.
  if (!sentTo.length) throw new Error("Discord post failed for every birthday today — see the audit log");
  await recordSystemLog(env, { action: "Discord birthday greetings sent", module: "Discord", record: sentTo.join(", ") });
  return { sent: true, recipients: sentTo, test: isTest };
}

// The @everyone has to stay in `content`: Discord doesn't ping mentions placed inside an embed.
/** @param {string} weekday @param {Date} now */
function odometerReminderMessage(weekday, now) {
  const isStart = weekday === "Mon";
  const date = now.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "short", day: "numeric", year: "numeric" });
  return {
    content: "@everyone",
    embeds: [{
      title: isStart ? "🚗 Start-of-Week Odometer Reminder" : "🚗 End-of-Week Odometer Reminder",
      description: isStart ? "Please post your odometer reading **now**." : "Please post your **closing** odometer reading **before you head out**.",
      color: isStart ? 0x0077bd : 0xf59e0b,
      fields: [{ name: "📝 What to post", value: `• Your ${isStart ? "" : "closing "}odometer reading\n• A photo of the odometer` }],
      footer: { text: `Medlane OS · ${date}` },
    }],
  };
}

// Posts the Monday (start-of-week) / Friday (end-of-week) odometer reminder, tagging @everyone.
// Throws on a missing webhook or failed post so runOncePerPeriod retries on the next tick.
/** @param {WorkerEnv} env @param {any} weekday */
async function runOdometerReminder(env, weekday) {
  if (!env.ODOMETER_DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord odometer reminder skipped", module: "Discord", record: "ODOMETER_DISCORD_WEBHOOK_URL not configured" }).catch(() => null);
    throw new Error("ODOMETER_DISCORD_WEBHOOK_URL is not configured");
  }
  const isStart = weekday === "Mon";
  await sendDiscordWebhookUrl(env, env.ODOMETER_DISCORD_WEBHOOK_URL, { ...odometerReminderMessage(weekday, new Date()), allowedMentions: { parse: ["everyone"] } });
  await recordSystemLog(env, { action: "Discord odometer reminder sent", module: "Discord", record: isStart ? "Start of week" : "End of week" }).catch(() => null);
  return { sent: true };
}

/** @param {WorkerEnv} env */
async function runFiveMinuteDiscordMonitors(env) {
  const scheduled = manilaScheduleParts(Date.now());
  /** @type {Promise<any>[]} */
  const tasks = [runApiHealthMonitor(env)];
  if (["00", "15", "30", "45"].includes(scheduled.minute)) tasks.push(runDashboardAnalyticsMonitor(env), runPendingItemsMonitor(env));
  await Promise.allSettled(tasks);
}

/** @param {any} value */
function manilaScheduleParts(value) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

// A single exact-tick match (minute === "00" && hour === "18") means one missed or delayed
// Cron Trigger invocation (Cloudflare does not guarantee an invocation for every tick — it can
// be skipped under load or during a deploy) silently drops that entire day's/week's/month's
// digest or backup with no error to log, because the `if` block is simply never entered.
// Instead, treat the whole 18:00 Manila hour as a tolerant window: try on every 5-minute tick
// inside it, but guard each job with a persisted "already ran for this period" flag so it only
// actually executes once per day/week/month/year and safely retries on the next tick if an
// earlier attempt in the same hour threw.
/** @param {any} scheduled */
function manilaPeriodKeys(scheduled) {
  const dayKey = `${scheduled.year}-${scheduled.month}-${scheduled.day}`;
  return { dayKey, monthKey: `${scheduled.year}-${scheduled.month}`, yearKey: scheduled.year };
}

// In-flight lock is treated as stale once this long passes with no heartbeat — an overlapping
// tick may then re-claim the job, assuming the earlier attempt was hard-killed. Heartbeat
// cadence is well under it so a job that is genuinely still running never looks stale.
const AUTOMATION_LOCK_MS = 6 * 60 * 1000;
const AUTOMATION_HEARTBEAT_MS = 2 * 60 * 1000;

/** @param {WorkerEnv} env @param {any} jobKey @param {any} periodKey */
async function claimAutomationPeriod(env, jobKey, periodKey) {
  const stateKey = `automation-once-${jobKey}`;
  /** @type {Record<string, any>} */
  const state = await monitoringState(env, stateKey).catch(() => ({}));
  if (state.lastPeriod === periodKey) return null; // already completed for this period
  // Hold an in-flight lock so two overlapping 5-minute invocations (or a retry landing while
  // the first attempt is still running) don't double-fire the job. runOncePerPeriod
  // heartbeats attemptAt while fn() runs, so the lock stays live for an arbitrarily long
  // job; it only goes stale (AUTOMATION_LOCK_MS with no heartbeat) when the invocation was
  // actually killed, and the next tick within the 18:00 window retries.
  const attemptAt = state.attemptPeriod === periodKey ? new Date(state.attemptAt || 0).getTime() : 0;
  if (attemptAt && Date.now() - attemptAt < AUTOMATION_LOCK_MS) return null;
  const claimed = { ...state, attemptPeriod: periodKey, attemptAt: new Date().toISOString() };
  await saveMonitoringState(env, stateKey, claimed).catch(() => null);
  return claimed;
}

/** @param {WorkerEnv} env @param {any} jobKey @param {any} periodKey @param {any} fn */
async function runOncePerPeriod(env, jobKey, periodKey, fn) {
  const claimed = await claimAutomationPeriod(env, jobKey, periodKey);
  if (!claimed) return null;
  const stateKey = `automation-once-${jobKey}`;
  let running = true;
  /** @type {((value?: any) => void) | undefined} */
  let stopHeartbeat;
  const heartbeatStopped = new Promise((resolve) => { stopHeartbeat = resolve; });
  // Refresh attemptAt on a fixed cadence for as long as fn() runs. An overlapping tick then
  // sees a live lock and does NOT start a second copy of a long digest/backup; a hard-killed
  // invocation stops heartbeating and the lock goes stale on its own. The sleep is raced
  // against heartbeatStopped so completion isn't delayed by up to a full interval.
  const heartbeat = (async () => {
    while (running) {
      await Promise.race([sleep(AUTOMATION_HEARTBEAT_MS), heartbeatStopped]);
      if (!running) break;
      await saveMonitoringState(env, stateKey, { ...claimed, attemptAt: new Date().toISOString() }).catch(() => null);
    }
  })();
  try {
    const result = await fn();
    // Mark completion only after fn() actually succeeds. If the invocation is hard-killed
    // mid-run (CPU / subrequest limit) the catch below never runs, but because completion
    // is not recorded here, the in-flight lock simply goes stale and the next tick retries —
    // instead of the job being lost for the whole day/week.
    await saveMonitoringState(env, stateKey, { lastPeriod: periodKey, completedAt: new Date().toISOString() }).catch(async (error) => {
      // If this write is silently lost, the job re-fires next period (a digest re-sends, a
      // backup runs twice) — never swallow it, make the failure visible instead.
      console.error(JSON.stringify({ message: "Automation completion flag not persisted", jobKey, periodKey, error: error.message }));
      await recordSystemLog(env, { action: "Automation completion not saved", module: "Automation", record: `${jobKey} (${periodKey}): ${error.message}` }).catch(() => null);
    });
    await recordSystemLog(env, { action: "Automation job completed", module: "Automation", record: `${jobKey} (${periodKey})` }).catch(() => null);
    return result;
  } catch (/** @type {any} */ error) {
    // Drop the in-flight lock so the next 5-minute tick within the same 18:00 hour retries
    // instead of waiting out the lock.
    await saveMonitoringState(env, stateKey, { attemptPeriod: null, attemptAt: null, lastAttemptAt: new Date().toISOString(), lastError: error.message }).catch(() => null);
    await recordSystemLog(env, { action: "Automation job failed", module: "Automation", record: `${jobKey} (${periodKey}): ${error.message}` }).catch(() => null);
    throw error;
  } finally {
    running = false;
    /** @type {(value?: any) => void} */ (stopHeartbeat)();
    await heartbeat.catch(() => {});
  }
}

// Within the 18:00 Manila hour, run at most ONE heavy job (digest or backup) per 5-minute
// invocation, in priority order. runOncePerPeriod persists a per-job completion flag, so
// once the daily digest is done the next tick falls through to the weekly digest, then the
// weekly backup, then the monthly/yearly backups. Previously every tick queued all of them
// together, so one Worker invocation ran two digests plus a full-database gzip backup at
// once, exhausted its CPU/subrequest budget, and died mid-run — leaving digests half-sent
// (and re-sending every ~10 min) and the weekly backup skipped for the whole week.
/** @param {WorkerEnv} env @param {any} jobs */
async function runNextPendingAutomationJob(env, jobs) {
  for (const [jobKey, periodKey, fn] of jobs) {
    /** @type {Record<string, any>} */
    const state = await monitoringState(env, `automation-once-${jobKey}`).catch(() => ({}));
    if (state.lastPeriod === periodKey) continue; // already completed this period
    // First still-pending job claims this tick. If it is currently in-flight in an
    // overlapping invocation, runOncePerPeriod returns null and we simply wait for the
    // next tick rather than starting a lower-priority heavy job alongside it.
    return runOncePerPeriod(env, jobKey, periodKey, fn);
  }
  return null;
}

// When the Discord boards refresh (Manila time): every 15 minutes in the day, hourly from 10 PM to
// 6 AM, and not at all on Saturday or Sunday. 6-7 PM is left to the digest and backup jobs. Each run
// reads the current data, so the 12:00 AM Monday run picks up everything done over the weekend.
/** @param {Record<string, string>} scheduled */
function boardMonitorsDue({ weekday, hour, minute }) {
  if (weekday === "Sat" || weekday === "Sun" || hour === "18") return false;
  const overnight = Number(hour) >= 22 || Number(hour) < 6;
  return overnight ? minute === "00" : ["00", "15", "30", "45"].includes(minute);
}

/** @param {any} event @param {WorkerEnv} env */
async function runFiveMinuteScheduledTasks(event, env) {
  // event.scheduledTime is documented as milliseconds, but this Worker has observed it
  // arrive in seconds (log samples decode to sane current dates only when read as seconds,
  // e.g. 1787484041 -> 2026-08-23, vs January 1970 as ms) — which parked every hour/weekday
  // gate below near the 1970 epoch and silently starved the 18:00 digest/backup block for
  // as long as this bug existed. Date.now() is unambiguous and just as accurate for a
  // minute/hour/weekday check, so use it instead of trusting scheduledTime's units.
  const scheduled = manilaScheduleParts(Date.now());
  const inDigestHour = scheduled.hour === "18";
  /** @type {Promise<any>[]} */
  const tasks = [runApiHealthMonitor(env)];
  // Hourly Supabase metrics sample for the Sunday performance report (skipped in the 18:00 digest hour).
  if (!inDigestHour && scheduled.minute === "00") tasks.push(runPerfSampler(env));
  // Keep the heavier analytics/pending/inventory monitors out of the 18:00 hour entirely —
  // that hour is reserved for the digest/backup jobs below, and stacking the monitors on the
  // same invocation is part of what used to blow the CPU/subrequest budget.
  if (boardMonitorsDue(scheduled)) tasks.push(runDashboardAnalyticsMonitor(env), runPendingItemsMonitor(env), runInventoryStatusMonitor(env), runLuksongLeaderboardMonitor(env));
  // 18:00 (6:00 PM) Asia/Manila is the only place digest/backup send time is configured. There
  // used to be separate "0 10 * * *" (daily digest) / "0 10 * * fri" (weekly digest) cron
  // strings, but wrangler.jsonc only ever registers the 5-minute cron, so those never actually
  // fired — this internal hour check is what has always driven the real sends.
  //
  // Digests and backups run in SEPARATE lanes on alternating 5-minute ticks: one Worker
  // invocation therefore never runs two heavy jobs, and a digest that keeps failing can't
  // starve the backups (or vice versa). Each lane runs at most one pending job per tick, in
  // priority order — runOncePerPeriod's completion flag advances the lane to the next job —
  // and every tick in that lane is a retry opportunity within the 18:00 window.
  if (inDigestHour) {
    const { dayKey, monthKey, yearKey } = manilaPeriodKeys(scheduled);
    const weekday = scheduled.weekday;
    const digestJobs = [];
    const backupJobs = [];
    if (!["Sat", "Sun"].includes(weekday)) digestJobs.push(["daily-digest", dayKey, () => runDailyDigest(env)]);
    if (weekday === "Sun") digestJobs.push(["weekly-perf-report", dayKey, () => runWeeklyPerfReport(env)]);
    if (weekday === "Fri") digestJobs.push(["weekly-digest", dayKey, () => runWeeklyDigest(env)]);
    if (weekday === "Fri") backupJobs.push(["weekly-backup", dayKey, () => createBackup(env, "weekly", null)]);
    if (scheduled.day === "01") backupJobs.push(["monthly-backup", monthKey, () => createBackup(env, "monthly", null)]);
    if (scheduled.month === "01" && scheduled.day === "01") backupJobs.push(["yearly-backup", yearKey, () => createBackup(env, "yearly", null)]);
    // ticks :00 :10 :20 :30 :40 :50 → digest lane; ticks :05 :15 :25 :35 :45 :55 → backup lane
    tasks.push(runNextPendingAutomationJob(env, Number(scheduled.minute) % 10 === 0 ? digestJobs : backupJobs));
  }
  // 08:00 Asia/Manila birthday greetings, retried every 15 minutes for the rest of the day if a
  // send fails (Discord outage, transient error, etc.) — runOncePerPeriod's completion flag
  // means it only actually posts once the greeting succeeds for today's dayKey, so a healthy
  // run still only fires the one 08:00 attempt.
  if (Number(scheduled.hour) >= 8 && ["00", "15", "30", "45"].includes(scheduled.minute)) {
    const { dayKey } = manilaPeriodKeys(scheduled);
    tasks.push(runOncePerPeriod(env, "birthday-greetings", dayKey, () => runBirthdayGreetings(env)));
  }
  // Mon/Fri 17:00 Asia/Manila odometer reminder. Retried on the :15/:30/:45 ticks of that same
  // hour if Discord fails, then dropped (a "start of week" ping at 6 PM would be misleading).
  if (scheduled.hour === "17" && ["Mon", "Fri"].includes(scheduled.weekday) && ["00", "15", "30", "45"].includes(scheduled.minute)) {
    const { dayKey } = manilaPeriodKeys(scheduled);
    tasks.push(runOncePerPeriod(env, "odometer-reminder", dayKey, () => runOdometerReminder(env, scheduled.weekday)));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status !== "rejected") continue;
    const message = result.reason?.message || String(result.reason);
    console.error(JSON.stringify({ message: "Five-minute scheduled task failed", error: message }));
    await recordSystemLog(env, { action: "Scheduled task failed", module: "System", record: message }).catch(() => null);
  }
}

/** @param {any} auditRows */
function backupDigestLines(auditRows) {
  const backupRows = auditRows.filter((/** @type {any} */ entry) => String(entry.module || "").toLowerCase() === "backup" || /backup/i.test(`${entry.action || ""} ${entry.record || ""}`));
  const completed = backupRows.filter((/** @type {any} */ entry) => /created|completed|success/i.test(`${entry.action || ""} ${entry.record || ""}`)).length;
  const failed = backupRows.filter((/** @type {any} */ entry) => /failed|error/i.test(`${entry.action || ""} ${entry.record || ""}`)).length;
  return [`Backups completed/logged: ${completed}`, `Backups failed/logged: ${failed}`];
}

// High-frequency housekeeping actions that dominate raw counts (dozens of times per digest
// period) without carrying any operational signal — dropped so the digest's audit section
// reflects actions someone would actually want to scan.
const DIGEST_AUDIT_NOISE_ACTIONS = new Set(["Saved app state (record count changed)", "Ignored destructive save cleanup", "Discord post sent", "Email sent"]);

/** @param {WorkerEnv} env @param {any} sinceIso */
async function auditLogDigestRows(env, sinceIso) {
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.logs&updated_at=gte.${encodeURIComponent(sinceIso)}&select=data&order=updated_at.desc&limit=200`);
  return rows.map((/** @type {any} */ row) => row.data).filter((/** @type {any} */ entry) => !DIGEST_AUDIT_NOISE_ACTIONS.has(entry.action));
}

// One pass over profiles + app users, resolving every wanted role at once, keyed by
// lower-cased email so a person is a single recipient even if they hold several digest
// roles. Returns Map<emailKey, { email, roles:Set }>. composeAndSendDigest then sends each
// person ONE combined email instead of one per role (a Superadmin used to get the business
// digest and the audit-log digest as two separate messages, every run).
/** @param {WorkerEnv} env @param {any} roles */
async function digestRecipients(env, roles) {
  const wanted = new Set(roles);
  const byEmail = new Map();
  const add = (/** @type {any} */ role, /** @type {any} */ email) => {
    if (!role || !email || !wanted.has(role)) return;
    const clean = String(email).trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email: clean, roles: new Set() });
    byEmail.get(key).roles.add(role);
  };
  const profiles = await supabaseFetch(env, "/rest/v1/profiles?select=email,role").catch(() => []);
  profiles.forEach((/** @type {any} */ row) => add(row.role, row.email));
  const stateKey = appStateKey(env);
  const appUsers = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.users&select=data`).catch(() => []);
  appUsers.forEach((/** @type {any} */ row) => { const user = row.data || {}; add(user.role, user.email); });
  return byEmail;
}

const DIGEST_COLORS = {
  navy: "#0b2f52",
  blue: "#1d6fa5",
  blueSoft: "#eaf4fb",
  blueBorder: "#c9e2f3",
  gold: "#c98a1f",
  success: "#157a3c",
  successSoft: "#e8f7ee",
  successBorder: "#bfe6cd",
  warn: "#b45309",
  warnSoft: "#fdf1e0",
  warnBorder: "#f3d9ac",
  critical: "#b91c1c",
  criticalSoft: "#fbe9e9",
  criticalBorder: "#f0c1c1",
  surface: "#f8fafc",
  card: "#ffffff",
  border: "#e1e8f2",
  muted: "#5b6b85",
  text: "#16233d",
};

/** @param {any} tone */
function digestToneColors(tone) {
  switch (tone) {
    case "good": return { fg: DIGEST_COLORS.success, bg: DIGEST_COLORS.successSoft, border: DIGEST_COLORS.successBorder };
    case "warn": return { fg: DIGEST_COLORS.warn, bg: DIGEST_COLORS.warnSoft, border: DIGEST_COLORS.warnBorder };
    case "critical": return { fg: DIGEST_COLORS.critical, bg: DIGEST_COLORS.criticalSoft, border: DIGEST_COLORS.criticalBorder };
    case "neutral": return { fg: DIGEST_COLORS.muted, bg: DIGEST_COLORS.surface, border: DIGEST_COLORS.border };
    default: return { fg: DIGEST_COLORS.blue, bg: DIGEST_COLORS.blueSoft, border: DIGEST_COLORS.blueBorder };
  }
}

/** @param {any} current @param {any} previous @param {{ invert?: any }} options */
function digestDeltaBadge(current, previous, { invert = false } = {}) {
  if (typeof previous !== "number" || Number.isNaN(previous)) {
    const colors = digestToneColors("neutral");
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">NEW</span>`;
  }
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : diff === 0 ? 0 : 100;
  const flat = Math.abs(diff) < 0.005 || Math.abs(pct) < 0.5;
  const dir = flat ? "flat" : diff > 0 ? "up" : "down";
  const good = flat ? null : invert ? dir === "down" : dir === "up";
  const tone = flat ? "neutral" : good ? "good" : "critical";
  const colors = digestToneColors(tone);
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
  const label = flat ? "flat vs last period" : `${arrow} ${Math.abs(pct).toFixed(1)}% vs last period`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">${escapeHtml(label)}</span>`;
}

const DIGEST_METRIC_CARDS = [
  { key: "salesCount", label: "Invoices Tracked", format: (/** @type {any} */ v) => String(v) },
  { key: "totalSales", label: "Total Invoiced", format: money, trend: true },
  { key: "totalCollected", label: "Total Collected", format: money, trend: true },
  { key: "openReceivables", label: "Open Receivables", format: money, trend: true, invert: true },
  { key: "totalExpenses", label: "Business Expenses", format: money, trend: true, invert: true },
  { key: "overdueCount", label: "Overdue Invoices", format: (/** @type {any} */ v) => String(v), tone: (/** @type {any} */ v) => (v > 0 ? "critical" : "good") },
  { key: "bounced", label: "Bounced Payments", format: (/** @type {any} */ v) => String(v), tone: (/** @type {any} */ v) => (v > 0 ? "critical" : "good") },
  { key: "lowStock", label: "Low / Critical Stock", format: (/** @type {any} */ v) => String(v), tone: (/** @type {any} */ v) => (v > 0 ? "warn" : "good") },
  { key: "pendingDeposit", label: "Pending Deposit", format: (/** @type {any} */ v) => String(v), tone: (/** @type {any} */ v) => (v > 0 ? "warn" : "good") },
  { key: "activeDemos", label: "Active Demo Requests", format: (/** @type {any} */ v) => String(v) },
];

/** @param {any} metrics @param {any} previous */
function digestStatCardsHtml(metrics, previous) {
  const cells = DIGEST_METRIC_CARDS.map(({ key, label, format, trend, invert, tone }) => {
    const value = metrics[key] ?? 0;
    const colors = digestToneColors(tone ? tone(value) : "default");
    const delta = trend ? digestDeltaBadge(value, previous?.[key], { invert }) : "";
    return `<td width="50%" valign="top" style="padding:6px;"><div style="border:1px solid ${DIGEST_COLORS.border};border-left:4px solid ${colors.fg};border-radius:14px;padding:14px 16px;background:${DIGEST_COLORS.card};"><span style="display:block;color:${DIGEST_COLORS.muted};font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(label)}</span><strong style="display:block;margin-top:6px;color:${DIGEST_COLORS.text};font-size:20px;line-height:1.2;">${escapeHtml(format(value))}</strong>${delta ? `<div style="margin-top:6px;">${delta}</div>` : ""}</div></td>`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells.slice(i, i + 2).join("")}</tr>`);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>`;
}

/** @param {any} metrics @param {any} taskFailures */
function digestAttentionBannerHtml(metrics, taskFailures) {
  const items = [
    { count: metrics.overdueCount, label: (/** @type {any} */ n) => `${n} overdue invoice${n === 1 ? "" : "s"} need follow-up` },
    { count: metrics.bounced, label: (/** @type {any} */ n) => `${n} bounced payment${n === 1 ? "" : "s"} to resolve` },
    { count: metrics.lowStock, label: (/** @type {any} */ n) => `${n} item${n === 1 ? "" : "s"} at low/critical stock` },
    { count: taskFailures, label: (/** @type {any} */ n) => `${n} scheduled task${n === 1 ? "" : "s"} failed in this period` },
  ].filter((item) => item.count > 0);
  if (!items.length) return `<div style="border:1px solid ${DIGEST_COLORS.successBorder};border-left:5px solid ${DIGEST_COLORS.success};border-radius:16px;padding:14px 18px;margin:0 0 22px;background:${DIGEST_COLORS.successSoft};color:${DIGEST_COLORS.success};font-weight:800;font-size:13.5px;">✅ No overdue invoices, bounced payments, stock shortages, or task failures this period.</div>`;
  const rows = items.map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item.label(item.count))}</li>`).join("");
  return `<div style="border:1px solid ${DIGEST_COLORS.criticalBorder};border-left:5px solid ${DIGEST_COLORS.critical};border-radius:16px;padding:14px 18px 12px;margin:0 0 22px;background:${DIGEST_COLORS.criticalSoft};"><strong style="display:block;color:${DIGEST_COLORS.critical};font-size:14px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">⚠ Needs Attention</strong><ul style="margin:0;padding-left:18px;color:#7a1f1f;font-size:13.5px;line-height:1.6;">${rows}</ul></div>`;
}

/** @type {Record<string, any>} */
const DIGEST_SECTION_STYLE = {
  "Low / Critical Stock": "warn",
  "Near-Expiry Stock": "warn",
  "Overdue Invoices": "critical",
  "Credit Limit Breach": "critical",
  "Warranty Ending Soon": "warn",
  "Warranty Expired": "critical",
};

// Discord-only: emoji per section title, used to make the daily/weekly digest embed
// scannable at a glance. Never applied to the email HTML (digestSectionHtml), which has
// its own color-coded styling via DIGEST_SECTION_STYLE above.
/** @type {Record<string, any>} */
const DIGEST_SECTION_EMOJI = {
  "Low / Critical Stock": "📦",
  "Near-Expiry Stock": "⏳",
  "Overdue Invoices": "⏰",
  "Credit Limit Breach": "🚫",
  "Warranty Ending Soon": "🛡️",
  "Warranty Expired": "⚠️",
  "Purchase Orders Awaiting Approval": "📋",
  "Payments Received Awaiting Approval": "💳",
  "Payables / Expenses Awaiting Approval": "💸",
  "Demo Requests Awaiting Sales Approval": "🧪",
  "Demo Requests Awaiting Management Approval": "🧪",
  "Support Reports Awaiting Handoff": "🛠️",
};

// Discord-only formatting: bullets each line and, for the common "<lead> — <detail>"
// shape most digest lines follow, bolds the lead so the record's identity pops out
// when scanning a field with several rows. Pure presentation — never mutates the
// source line, so the same lines array stays plain text for the email digest.
/** @param {any} line */
function discordBullet(line) {
  const dashIndex = line.indexOf(" — ");
  if (dashIndex === -1) return `▸ ${line}`;
  return `▸ **${line.slice(0, dashIndex)}** — ${line.slice(dashIndex + 3)}`;
}

// A branch with dozens of low-stock SKUs or near-expiry lots used to render every single one
// as its own bullet, making the section (and the whole email) scroll on forever. Each section
// is pre-sorted worst/most-urgent-first by its caller in detectThresholdsAndApprovals(), so
// capping here keeps exactly the rows someone would act on first, with a plain count for the
// rest — same pattern auditLogTableHtml() already uses for the audit section.
const DIGEST_SECTION_MAX_LINES = 8;

/** @param {any} sections */
function digestSectionHtml(sections) {
  return sections.map((/** @type {any} */ section) => {
    const colors = digestToneColors(DIGEST_SECTION_STYLE[section.title] || "default");
    const shown = section.lines.slice(0, DIGEST_SECTION_MAX_LINES);
    const overflow = section.lines.length - shown.length;
    const rows = shown.map((/** @type {any} */ line) => `<li style="margin:0 0 4px;">${escapeHtml(line)}</li>`).join("");
    const moreRow = overflow > 0 ? `<li style="margin:4px 0 0;list-style:none;margin-left:-18px;color:${DIGEST_COLORS.muted};font-weight:700;">+ ${overflow} more — open Medlane OS for the full list.</li>` : "";
    return `<div style="border:1px solid ${colors.border};border-left:4px solid ${colors.fg};border-radius:14px;padding:12px 16px;margin:0 0 14px;background:${DIGEST_COLORS.card};"><strong style="display:block;color:${colors.fg};font-size:13.5px;margin-bottom:6px;">${escapeHtml(section.title)} <span style="color:${DIGEST_COLORS.muted};font-weight:700;">(${section.lines.length})</span></strong><ul style="margin:0;padding-left:18px;color:${DIGEST_COLORS.text};font-size:13.5px;line-height:1.6;">${rows}${moreRow}</ul></div>`;
  }).join("");
}

/** @param {AppRecordRow[]} rows */
function auditLogTableHtml(rows) {
  if (!rows.length) return `<div style="border:1px solid ${DIGEST_COLORS.border};border-radius:16px;padding:16px;background:${DIGEST_COLORS.surface};color:${DIGEST_COLORS.muted};">No recorded actions in this period.</div>`;
  const truncated = rows.length >= 200;
  const byModule = rows.reduce((/** @type {Record<string, any>} */ acc, /** @type {any} */ entry) => { const key = entry.module || "Other"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const byAction = rows.reduce((/** @type {Record<string, any>} */ acc, /** @type {any} */ entry) => { const key = entry.action || "Action"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const moduleCards = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([module, count]) => `<td width="33%" valign="top" style="padding:5px;"><div style="padding:10px;border:1px solid ${DIGEST_COLORS.border};border-radius:14px;background:${DIGEST_COLORS.surface};"><span style="display:block;color:${DIGEST_COLORS.muted};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(module)}</span><strong style="display:block;margin-top:4px;color:${DIGEST_COLORS.blue};font-size:22px;">${count}</strong></div></td>`).join("");
  const topActions = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([action, count]) => { const failed = /fail|error/i.test(action); return `<li style="${failed ? `color:${DIGEST_COLORS.critical};` : ""}"><strong>${escapeHtml(action)}</strong> - ${count} time${count === 1 ? "" : "s"}${failed ? " ⚠" : ""}</li>`; }).join("");
  const recent = rows.slice(0, 12).map((/** @type {any} */ entry) => { const failed = /fail|error/i.test(`${entry.action || ""}`); const accent = failed ? DIGEST_COLORS.critical : DIGEST_COLORS.border; return `<div style="border:1px solid ${DIGEST_COLORS.border};border-left:3px solid ${accent};border-radius:14px;padding:12px 14px;margin:8px 0;background:${DIGEST_COLORS.card};"><div style="color:${DIGEST_COLORS.muted};font-size:12px;font-weight:800;">${escapeHtml(entry.date || "-")} · ${escapeHtml(entry.user || "System")} · ${escapeHtml(entry.role || "-")}</div><strong style="display:block;margin-top:5px;color:${failed ? DIGEST_COLORS.critical : DIGEST_COLORS.text};">${escapeHtml(entry.action || "Action")}</strong><div style="margin-top:4px;color:${DIGEST_COLORS.blue};font-weight:800;">${escapeHtml(entry.module || "-")}</div>${entry.record ? `<div style="margin-top:4px;color:#334155;">${escapeHtml(String(entry.record).slice(0, 180))}</div>` : ""}</div>`; }).join("");
  return `<div style="margin-bottom:14px;"><strong style="display:block;color:${DIGEST_COLORS.blue};font-size:16px;margin-bottom:8px;">Audit Summary</strong><p style="margin:0 0 12px;color:${DIGEST_COLORS.muted};">${rows.length} action${rows.length === 1 ? "" : "s"} recorded. Grouped below so the important activity is easier to scan.</p><table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>${moduleCards}</tr></table><ul style="margin:12px 0 0;padding-left:20px;">${topActions}</ul></div><div><strong style="display:block;color:${DIGEST_COLORS.blue};font-size:16px;margin:18px 0 8px;">Recent Activity Highlights</strong>${recent}</div>${truncated ? `<p style="color:${DIGEST_COLORS.muted};">Showing summary from the first 200 actions - see Audit Logs in Medlane OS for full history.</p>` : ""}`;
}

/** @param {{ title: any, bodyHtml: any }} options */
function digestEmailHtml({ title, bodyHtml }) {
  return brandedEmailHtml({ title, intro: "Operational summary, approvals, finance, and audit highlights from Medlane OS.", bodyHtml: bodyHtml || "<p>Nothing to report for this period.</p>" });
}

/** @param {WorkerEnv} env @param {any} periodLabel */
async function loadDigestSnapshot(env, periodLabel) {
  return monitoringState(env, `digest-snapshot-${periodLabel.toLowerCase()}`).catch(() => ({}));
}

/** @param {WorkerEnv} env @param {any} periodLabel @param {any} metrics */
async function saveDigestSnapshot(env, periodLabel, metrics) {
  await saveMonitoringState(env, `digest-snapshot-${periodLabel.toLowerCase()}`, { ...metrics, capturedAt: new Date().toISOString() }).catch((error) => recordSystemLog(env, { action: "Digest snapshot save failed", module: "Email", record: error.message }));
}

// Per-period delivery ledger for one digest. composeAndSendDigest can be retried inside the
// 18:00 window (an interrupted invocation, a transient throw) — this records which recipients
// already got this period's email and whether Discord was posted, so a retry only fills the
// gaps instead of re-blasting everyone. Keyed by periodLabel + Manila day; a new period
// resets it. `periodKey` here matches the dayKey runOncePerPeriod uses for the same run.
/** @param {any} periodLabel */
function digestProgressStateKey(periodLabel) {
  return `digest-progress-${String(periodLabel).toLowerCase()}`;
}

/** @param {WorkerEnv} env @param {any} periodLabel @param {any} periodKey */
async function loadDigestProgress(env, periodLabel, periodKey) {
  /** @type {Record<string, any>} */
  const state = await monitoringState(env, digestProgressStateKey(periodLabel)).catch(() => ({}));
  if (state.periodKey !== periodKey) return { periodKey, discordSent: false, sentEmails: new Set() };
  return { periodKey, discordSent: Boolean(state.discordSent), sentEmails: new Set(state.sentEmails || []) };
}

/** @param {WorkerEnv} env @param {any} periodLabel @param {any} progress */
async function saveDigestProgress(env, periodLabel, progress) {
  await saveMonitoringState(env, digestProgressStateKey(periodLabel), {
    periodKey: progress.periodKey,
    discordSent: Boolean(progress.discordSent),
    sentEmails: [...progress.sentEmails],
    updatedAt: new Date().toISOString(),
  }).catch((error) => console.error(JSON.stringify({ message: "Digest progress not persisted", periodLabel, error: error.message })));
}

/** @param {WorkerEnv} env @param {{ periodLabel: any, auditSinceIso: any, auditLimitLabel: any, force?: boolean }} options */
async function composeAndSendDigest(env, { periodLabel, auditSinceIso, auditLimitLabel, force = false }) {
  const periodKey = manilaPeriodKeys(manilaScheduleParts(Date.now())).dayKey;
  const progress = force
    ? { periodKey, discordSent: false, sentEmails: new Set() }
    : await loadDigestProgress(env, periodLabel, periodKey);
  if (force) await saveDigestProgress(env, periodLabel, progress); // wipe the ledger so a forced resend reaches everyone

  /** @type {Record<string, any>} */
  const state = await loadDigestState(env);
  /** @type {Record<string, any>} */
  const sections = detectThresholdsAndApprovals(state);
  const allRoles = new Set([...Object.keys(sections), ...DIGEST_ROLE_RECIPIENTS.digestBusiness, ...DIGEST_ROLE_RECIPIENTS.digestAuditLog]);
  const businessSummary = buildBusinessSummaryLines(state);
  const financialSummary = financialDigestLines(state, auditSinceIso);
  const auditRows = await auditLogDigestRows(env, auditSinceIso);

  const metrics = computeBusinessMetrics(state);
  const previousSnapshot = await loadDigestSnapshot(env, periodLabel);
  await saveDigestSnapshot(env, periodLabel, metrics);

  const taskFailures = auditRows.filter((/** @type {any} */ entry) => entry.action === "Scheduled task failed").length;
  const attentionHtml = digestAttentionBannerHtml(metrics, taskFailures);
  const statCardsHtml = digestStatCardsHtml(metrics, previousSnapshot);
  const operationalHtml = digestSectionHtml([{ title: `${periodLabel} Purchase Orders, Expenses & Backups`, lines: [...financialSummary, ...backupDigestLines(auditRows)] }]);
  const ctaHtml = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;"><tr><td style="border-radius:999px;background:${DIGEST_COLORS.navy};"><a href="${PUBLIC_APP_ORIGIN}/dashboard" style="display:inline-block;padding:13px 24px;color:#fff;text-decoration:none;font-weight:800;font-size:13.5px;border-radius:999px;">Open Medlane OS →</a></td></tr></table>`;

  // Post to Discord BEFORE the per-recipient email fan-out — the embed is built entirely
  // from data already in hand, so putting it first means a slow or interrupted email loop
  // can no longer stop the digest from reaching the channel. Guarded so a retry within the
  // same period does not double-post.
  /** @type {any} */
  let discordResult = { sent: false, reason: "Already posted for this period" };
  if (!progress.discordSent) {
    // Claim the Discord slot in the ledger BEFORE posting, and only post if that write
    // lands. The digest embed @everyone-pings the channel, so a duplicate is far worse
    // than a miss: if the ledger is briefly unreachable we skip this tick and a later one
    // retries, rather than posting now and risking a second post when the "sent" flag
    // fails to persist (the cause of the 18:00 + 18:30 double-post).
    progress.discordSent = true;
    let claimed = false;
    try {
      await saveMonitoringState(env, digestProgressStateKey(periodLabel), {
        periodKey: progress.periodKey, discordSent: true, sentEmails: [...progress.sentEmails], updatedAt: new Date().toISOString(),
      });
      claimed = true;
    } catch (/** @type {any} */ error) {
      console.error(JSON.stringify({ message: "Digest Discord claim not persisted — skipping post this tick", periodLabel, error: error.message }));
    }
    if (!claimed) {
      progress.discordSent = false;
      discordResult = { sent: false, reason: "Ledger write failed; a later tick retries" };
    } else {
      discordResult = await sendDiscordDigest(env, { periodLabel, state, sections, businessSummary, financialSummary, auditRows, auditLimitLabel, auditSinceIso }).catch(async (error) => {
        console.error(JSON.stringify({ message: "Discord digest failed", error: error.message }));
        await recordSystemLog(env, { action: "Discord digest failed (post claimed, not retried)", module: "Discord", record: `${periodLabel}: ${error.message}` }).catch(() => null);
        return { sent: false, reason: error.message };
      });
    }
  }

  const subject = `Medlane OS — ${periodLabel} Digest`;
  const recipients = await digestRecipients(env, allRoles);
  const snapshotByBody = new Map(); // one R2 snapshot per distinct body, shared by recipients with the same role mix
  for (const [emailKey, { email, roles }] of recipients) {
    if (progress.sentEmails.has(emailKey)) continue; // already delivered this period
    try {
      const roleList = [...roles];
      const parts = [];
      const seenTitles = new Set();
      const sectionBlocks = [];
      for (const role of roleList) for (const section of (sections[role] || [])) {
        if (seenTitles.has(section.title)) continue;
        seenTitles.add(section.title);
        sectionBlocks.push(section);
      }
      // A short, personalized "what actually needs you" line at the very top — the sections
      // below are role-scoped already, but without this a recipient has to read the whole
      // email to find out whether anything here is even their problem today.
      const isBusinessRecipient = roleList.some((role) => DIGEST_ROLE_RECIPIENTS.digestBusiness.includes(role));
      const isAuditRecipient = roleList.some((role) => DIGEST_ROLE_RECIPIENTS.digestAuditLog.includes(role));
      const totalFlagged = sectionBlocks.reduce((sum, section) => sum + section.lines.length, 0);
      const glanceParts = [];
      if (sectionBlocks.length) glanceParts.push(`<strong>${totalFlagged}</strong> item${totalFlagged === 1 ? "" : "s"} across <strong>${sectionBlocks.length}</strong> categor${sectionBlocks.length === 1 ? "y" : "ies"} need${sectionBlocks.length === 1 ? "s" : ""} your attention`);
      if (isBusinessRecipient && businessSummary.length) glanceParts.push("today's business summary");
      if (isAuditRecipient) glanceParts.push(`the ${auditLimitLabel} audit log`);
      // Same relevance check as the "nothing to send" guard below — only greet a recipient who
      // is about to see actual content, so the "nothing to report" skip-and-don't-retry path
      // further down stays a true no-op instead of becoming its own empty email.
      if (glanceParts.length) {
        parts.push(`<p style="margin:0 0 18px;color:${DIGEST_COLORS.muted};font-size:13px;">Viewing as <strong style="color:${DIGEST_COLORS.navy};">${escapeHtml(roleList.join(", "))}</strong> — ${glanceParts.map((part, index) => index === 0 ? part : index === glanceParts.length - 1 ? `, and ${part}` : `, ${part}`).join("")} below.</p>`);
      }
      if (sectionBlocks.length) parts.push(digestSectionHtml(sectionBlocks));
      if (isBusinessRecipient && businessSummary.length) {
        parts.push(attentionHtml);
        parts.push(`<h3 style="margin:18px 0 8px;color:${DIGEST_COLORS.navy};">${escapeHtml(`${periodLabel} Business Summary`)}</h3>${statCardsHtml}`);
        parts.push(operationalHtml);
      }
      if (isAuditRecipient) {
        parts.push(`<h3 style="margin:18px 0 8px;color:${DIGEST_COLORS.navy};">${escapeHtml(`${periodLabel} Audit Log (${auditLimitLabel})`)}</h3>${auditLogTableHtml(auditRows)}`);
      }
      if (!parts.length) { progress.sentEmails.add(emailKey); continue; } // nothing relevant to this recipient — don't retry them
      parts.push(ctaHtml);
      const bodyHtml = parts.join("");
      const html = digestEmailHtml({ title: `${periodLabel} Digest`, bodyHtml });
      if (!snapshotByBody.has(bodyHtml)) {
        snapshotByBody.set(bodyHtml, await saveDigestMessageSnapshot(env, { periodLabel, role: roleList.join(", "), subject, html }).catch(() => null));
      }
      await sendResendEmail(env, { to: email, subject, html, digestMessageId: snapshotByBody.get(bodyHtml) });
      progress.sentEmails.add(emailKey);
      await saveDigestProgress(env, periodLabel, progress);
    } catch (/** @type {any} */ error) {
      // Leave this recipient out of the ledger so the next retry picks them up; a single
      // failure must not stop the rest of the list.
      console.error(JSON.stringify({ message: "Digest email failed", email, error: error.message }));
      await recordSystemLog(env, { action: "Digest email failed", module: "Email", record: `${email}: ${error.message}` }).catch(() => null);
    }
  }
  return { discord: discordResult, recipients: recipients.size, sent: progress.sentEmails.size };
}

/** @param {WorkerEnv} env @param {{ periodLabel: any, state: any, sections: any, businessSummary: any, financialSummary: any, auditRows: any, auditLimitLabel: any, auditSinceIso: any }} options */
async function sendDiscordDigest(env, { periodLabel, state, sections, businessSummary, financialSummary, auditRows, auditLimitLabel, auditSinceIso }) {
  if (!env.DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord digest skipped", module: "Discord", record: `${periodLabel}: DISCORD_WEBHOOK_URL not configured` });
    return { sent: false, reason: "DISCORD_WEBHOOK_URL is not configured" };
  }
  const sales = state.sales || [];
  const clients = state.clients || [];
  const purchaseOrders = state.purchaseOrders || [];
  const payments = state.payments || [];
  const imports = state.imports || [];
  const reconHistory = state.reconHistory || [];
  const demoRequests = state.inventoryDemoRequests || [];

  const bouncedCheques = payments.filter((/** @type {Payment} */ payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce"));
  const pendingDeposits = payments.filter((/** @type {Payment} */ payment) => ["For Deposit", "For Deposit", "Posted Date"].includes(payment.collectionStatus));
  const largeSales = sales.filter((/** @type {Sale} */ sale) => sale.status !== "Cancelled" && Number(sale.net || 0) >= LARGE_TRANSACTION_THRESHOLD && new Date(sale.date) >= new Date(auditSinceIso));
  const largePayments = payments.filter((/** @type {Payment} */ payment) => Number(payment.amount || 0) >= LARGE_TRANSACTION_THRESHOLD && new Date(payment.dateRecorded || payment.dateCollected || 0) >= new Date(auditSinceIso));
  const blockedImports = imports.filter((/** @type {any} */ item) => /blocked|invalid|skipped|no valid/i.test(item.status || ""));
  const activeDemos = demoRequests.filter((/** @type {any} */ request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  const closedDemos = demoRequests.filter((/** @type {any} */ request) => /[Rr]eturned|To Sales/.test(request.status || "") && new Date(request.history?.at(-1)?.date || request.date || 0) >= new Date(auditSinceIso));
  const latestRecon = reconHistory[0];

  // These two "what's new since last digest" lookups are a nice-to-have, not core to the
  // digest — a failure here (e.g. a transient Supabase error) must never prevent the digest
  // embed itself from posting, so each is isolated with its own catch.
  /** @type {any[]} */
  const newlyPaidPoIds = await trackNewOccurrences(env, "discordKnownPaidPOs", purchaseOrders.filter((/** @type {any} */ po) => poFullyPaidServer(po, sales)).map((/** @type {any} */ po) => po.id)).catch(async (error) => {
    await recordSystemLog(env, { action: "Discord digest tracking failed", module: "Discord", record: `discordKnownPaidPOs: ${error.message}` }).catch(() => null);
    return [];
  });
  const newlyPaidPos = purchaseOrders.filter((/** @type {any} */ po) => newlyPaidPoIds.includes(po.id));
  const newClientNames = await trackNewOccurrences(env, "discordKnownClients", clients.map((/** @type {Client} */ client) => client.name)).catch(async (error) => {
    await recordSystemLog(env, { action: "Discord digest tracking failed", module: "Discord", record: `discordKnownClients: ${error.message}` }).catch(() => null);
    return [];
  });

  // Every threshold/approval category is routed to 2-3 roles (DIGEST_ROLE_RECIPIENTS), and
  // pushSection() pushes the same {title, lines} into each of those roles' lists — so without
  // deduping here, the exact same "Low / Critical Stock" list would show up as 2-3 separate,
  // identical fields. Collapse to one field per title, with all owning roles listed together.
  const mentionedRoleIds = new Set();
  const sectionsByTitle = new Map();
  Object.entries(sections).forEach(([role, roleSections]) => {
    (digestRoleMentions[role] || []).forEach((/** @type {any} */ id) => mentionedRoleIds.add(id));
    roleSections.forEach((/** @type {any} */ section) => {
      if (!sectionsByTitle.has(section.title)) sectionsByTitle.set(section.title, { section, roles: new Set() });
      sectionsByTitle.get(section.title).roles.add(role);
    });
  });

  const fields = [];
  let flaggedCount = 0;
  sectionsByTitle.forEach(({ section, roles }) => {
    flaggedCount += section.lines.length;
    const emoji = DIGEST_SECTION_EMOJI[section.title] || "🔔";
    fields.push({ name: `${emoji} ${section.title} (${section.lines.length}) · ${[...roles].join(", ")}`, value: discordFieldValue(section.lines.map(discordBullet), 300, section.lines.length) });
  });
  if (businessSummary.length) fields.push({ name: `📊 ${periodLabel} Business Summary`, value: discordFieldValue(businessSummary.map(discordBullet), 300) });
  if (financialSummary.length) fields.push({ name: "💼 Payables, Expenses & POs", value: discordFieldValue(financialSummary.map(discordBullet), 300) });
  if (pendingDeposits.length) fields.push({ name: `🏦 Collections Pending Deposit (${pendingDeposits.length})`, value: discordFieldValue(pendingDeposits.map((/** @type {any} */ p) => discordBullet(`${p.receiptNo} — ${p.client}, ${money(p.amount)} (${p.collectionStatus})`)), 300, pendingDeposits.length) });
  if (bouncedCheques.length) fields.push({ name: `🔴 Bounced Cheques (${bouncedCheques.length})`, value: discordFieldValue(bouncedCheques.map((/** @type {any} */ p) => discordBullet(`${p.receiptNo} — ${p.client}, ${money(p.amount)}`)), 300, bouncedCheques.length) });
  fields.push({ name: "🗄️ Backup Status", value: discordFieldValue(backupDigestLines(auditRows).map(discordBullet), 300) });
  const largeTransactionLines = [...largeSales.map((/** @type {any} */ s) => `Invoice ${s.documentNo || s.id} — ${s.client}, ${money(s.net)}`), ...largePayments.map((/** @type {any} */ p) => `Payment ${p.receiptNo} — ${p.client}, ${money(p.amount)}`)];
  if (largeTransactionLines.length) fields.push({ name: `💰 Large Transactions (≥ ${money(LARGE_TRANSACTION_THRESHOLD)}) (${largeTransactionLines.length})`, value: discordFieldValue(largeTransactionLines.map(discordBullet), 300, largeTransactionLines.length) });
  const demoLines = [...activeDemos.slice(0, 6).map((/** @type {any} */ request) => `${request.id} — ${request.client} (${request.status})`), ...closedDemos.slice(0, 4).map((/** @type {any} */ request) => `${request.id} — ${request.client} closed as ${request.status}`)];
  if (demoLines.length) fields.push({ name: `🧪 Demo Requests (${activeDemos.length + closedDemos.length})`, value: discordFieldValue(demoLines.map(discordBullet), 300, activeDemos.length + closedDemos.length) });
  if (newlyPaidPos.length) fields.push({ name: `✅ Purchase Orders Fully Paid (${newlyPaidPos.length})`, value: discordFieldValue(newlyPaidPos.map((/** @type {any} */ po) => discordBullet(`${po.id} — ${po.client}`)), 300, newlyPaidPos.length) });
  if (newClientNames.length) fields.push({ name: `🆕 New Clients Onboarded (${newClientNames.length})`, value: discordFieldValue(newClientNames.map((name) => `▸ ${name}`), 300, newClientNames.length) });
  // Import Issues are excluded from the Daily Discord post (too noisy day-to-day); still surfaced on the Weekly digest.
  if (blockedImports.length && periodLabel !== "Daily") fields.push({ name: `📥 Import Issues (${blockedImports.length})`, value: discordFieldValue(blockedImports.map((/** @type {any} */ item) => discordBullet(`${item.date} ${item.module} ${item.file} — ${item.status}`)), 300, blockedImports.length) });
  if (latestRecon?.high > 0) fields.push({ name: "🧭 Reconciliation Risk", value: `${latestRecon.high} high-severity finding${latestRecon.high === 1 ? "" : "s"} (${latestRecon.date || "latest run"})` });
  fields.push({ name: `📜 Audit Log (${auditLimitLabel})`, value: `${auditRows.length} recorded action${auditRows.length === 1 ? "" : "s"} — see the Audit Logs page for details.` });

  if (!fields.length) return { sent: false, reason: "Nothing to report — no digest fields were generated" };
  const color = latestRecon?.high > 0 || bouncedCheques.length ? 0xef4b4f : sectionsByTitle.size ? 0xf59e0b : 0x22c55e;
  // Discord caps a single embed at 6000 total characters and 25 fields; stay well under both.
  const budgetedFields = [];
  let charBudget = 5300;
  for (const field of fields) {
    const cost = field.name.length + field.value.length;
    if (budgetedFields.length >= 24 || charBudget - cost < 0) { budgetedFields.push({ name: "More", value: `${fields.length - budgetedFields.length} additional item(s) omitted — see the app for full details.` }); break; }
    budgetedFields.push(field);
    charBudget -= cost;
  }
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const description = [
    flaggedCount ? `⚠️ **${flaggedCount} item${flaggedCount === 1 ? "" : "s"}** flagged for attention across **${sectionsByTitle.size} categor${sectionsByTitle.size === 1 ? "y" : "ies"}**.` : "✨ Nothing flagged — all thresholds clear.",
    `🕒 **${periodLabel} digest** · ${auditLimitLabel} · generated ${updatedAt} PHT`,
  ].join("\n");
  const mentionContent = ["@everyone", ...[...mentionedRoleIds].map((id) => `<@&${id}>`)].join(" ");
  return sendDiscordWebhook(env, { content: mentionContent, allowedMentions: { parse: ["everyone"], roles: [...mentionedRoleIds] }, embeds: [{ title: `Medlane OS — ${periodLabel} Digest`, description, color, fields: budgetedFields, timestamp: new Date().toISOString() }] });
}

// No daily digest goes out on Saturday or Sunday, so Monday's reaches back to Friday's.
/** @param {string} weekday */
function dailyDigestHours(weekday) {
  return weekday === "Mon" ? 72 : 24;
}

/** @param {WorkerEnv} env @param {{ force?: any }} options */
async function runDailyDigest(env, { force = false } = {}) {
  const hours = dailyDigestHours(manilaScheduleParts(Date.now()).weekday);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return composeAndSendDigest(env, { periodLabel: "Daily", auditSinceIso: since, auditLimitLabel: `last ${hours} hours`, force });
}

// ---- Weekly Supabase performance report -------------------------------------------------
// Hourly samples are stored one app_records row per Manila day (perf-snapshots / day-YYYY-MM-DD,
// up to 24 samples), so a week is 7 small rows and app_records deletes (blocked) are never needed.
/** @param {any} ms */
function manilaDayKey(ms) {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** @param {WorkerEnv} env @param {any} dayCount */
async function loadPerfSamples(env, dayCount) {
  const keys = Array.from({ length: dayCount }, (_, i) => `day-${manilaDayKey(Date.now() - i * 86400000)}`);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.${PERF_MODULE}&record_key=in.${encodeURIComponent(postgrestIn(keys))}&select=record_key,data`);
  return rows.flatMap((/** @type {any} */ row) => row.data?.samples || []);
}

/** @param {WorkerEnv} env */
async function runPerfSampler(env) {
  if (!hasAccessToken(env)) return null; // report email explains the missing token
  const sample = await collectSample(env);
  const recordKey = `day-${manilaDayKey(Date.now())}`;
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${PERF_MODULE}&record_key=eq.${recordKey}&select=data`);
  const samples = [...(rows[0]?.data?.samples || []), sample].slice(-30);
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: PERF_MODULE, record_key: recordKey, data: { samples }, updated_by: null }]),
  });
  // Audit-log only when the set of failing sections changes, so a persistent problem is logged once, not hourly.
  const previous = Object.keys(samples.at(-2)?.errors || {}).sort().join(",");
  const current = Object.keys(sample.errors).sort().join(",");
  if (current !== previous) {
    await recordSystemLog(env, current
      ? { action: "Performance sample partial", module: "Monitoring", record: Object.entries(sample.errors).map(([k, v]) => `${k}: ${v}`).join(" | ") }
      : { action: "Performance sampling recovered", module: "Monitoring", record: "All Supabase metric sections collected" });
  }
  return sample;
}

/** @param {WorkerEnv} env @param {{ force?: boolean, onlyTo?: any }} options */
async function runWeeklyPerfReport(env, { force = false, onlyTo = "" } = {}) {
  const dayKey = manilaPeriodKeys(manilaScheduleParts(Date.now())).dayKey;
  const ledgerKey = `perf-report-sent-${dayKey}`;
  const ledger = force || onlyTo ? {} : await monitoringState(env, ledgerKey).catch(() => ({}));
  const sentTo = new Set(ledger.sent || []);
  const all = await loadPerfSamples(env, 14);
  const cutoff = Date.now() - 7 * 86400000;
  const samples = all.filter((/** @type {any} */ entry) => new Date(entry.t).getTime() >= cutoff);
  const prevSamples = all.filter((/** @type {any} */ entry) => new Date(entry.t).getTime() < cutoff);
  const details = hasAccessToken(env) ? await collectLiveDetails(env) : null;
  const report = await buildWeeklyReport({ samples, prevSamples, details });
  const tokenNote = hasAccessToken(env) ? "" : `<div style="background:#fff4e8;border-left:4px solid #b4561a;padding:8px 12px;margin:8px 0;font-size:13px;"><strong>SUPABASE_ACCESS_TOKEN is not set on the Worker</strong>, so no performance data is being collected. Add it with <code>wrangler secret put SUPABASE_ACCESS_TOKEN</code>.</div>`;
  const html = brandedEmailHtml({ title: "Weekly Supabase Performance", intro: "Database, connections, Auth, Storage and Realtime health for the past 7 days, with Friday and Saturday highlighted.", bodyHtml: tokenNote + report.bodyHtml });
  const messageId = await saveDigestMessageSnapshot(env, { periodLabel: "Performance", role: "Superadmin, CEO", subject: report.subject, html }).catch(() => null);

  const recipients = onlyTo ? new Map([[onlyTo.toLowerCase(), { email: onlyTo }]]) : await digestRecipients(env, ["Superadmin", "CEO"]);
  let failed = 0;
  for (const [emailKey, { email }] of recipients) {
    if (sentTo.has(emailKey)) continue;
    try {
      await sendResendEmail(env, { to: email, subject: report.subject, html, digestMessageId: messageId });
      sentTo.add(emailKey);
      if (!onlyTo) await saveMonitoringState(env, ledgerKey, { sent: [...sentTo] }).catch(() => null);
    } catch (/** @type {any} */ error) {
      failed += 1;
      await recordSystemLog(env, { action: "Performance report email failed", module: "Email", record: `${email}: ${error.message}` }).catch(() => null);
    }
  }
  await recordSystemLog(env, { action: "Weekly performance report", module: "Monitoring", record: `${report.sampleCount} samples, ${report.warnCount} warning(s)${report.warnCount ? `: ${report.recommendationTitles.join("; ")}` : ""}; sent to ${sentTo.size}/${recipients.size}`, extra: messageId ? { digestMessageId: messageId } : undefined });
  if (failed) throw new Error(`${failed} performance report email(s) failed; will retry`);
  return { recipients: recipients.size, sent: sentTo.size, samples: report.sampleCount, warnings: report.warnCount };
}

/** @param {WorkerEnv} env @param {{ force?: any }} options */
async function runWeeklyDigest(env, { force = false } = {}) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return composeAndSendDigest(env, { periodLabel: "Weekly", auditSinceIso: since, auditLimitLabel: "last 7 days", force });
}

export default {
  async scheduled(/** @type {any} */ event, /** @type {any} */ env, /** @type {any} */ ctx) {
    if (env.ENVIRONMENT !== "production") return;
    ctx.waitUntil(runFiveMinuteScheduledTasks(event, env).catch((error) => console.error(JSON.stringify({ message: "Scheduled tasks failed", cron: event.cron || FIVE_MINUTE_MONITOR_CRON, error: error.message }))));
  },
  async fetch(/** @type {any} */ request, /** @type {any} */ env, /** @type {any} */ ctx) {
    const url = new URL(request.url);
    try {

      // Live-update socket. Browsers can't set Authorization on a WebSocket, so the access token
      // arrives as the second Sec-WebSocket-Protocol value (["medlane-live", token] — kept out of
      // the URL so it never reaches request logs) and the app session id as a query param. Both
      // are checked exactly like a normal API call before the connection is handed to the
      // (hibernating) LiveHub Durable Object.
      if (url.pathname === "/api/live") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "Expected WebSocket" }, { status: 426 });
        if (!env.LIVE_HUB) return json({ error: "Live updates are not configured" }, { status: 503 });
        const protocols = (request.headers.get("sec-websocket-protocol") || "").split(",").map((/** @type {any} */ part) => part.trim());
        if (protocols[0] !== "medlane-live" || !protocols[1]) return json({ error: "Authentication required" }, { status: 401 });
        const authHeaders = new Headers({ authorization: `Bearer ${protocols[1]}` });
        const sid = url.searchParams.get("sid");
        if (sid) authHeaders.set("x-medlane-session-id", sid);
        await authenticatedProfile(new Request(request.url, { headers: authHeaders }), env);
        const stub = env.LIVE_HUB.get(env.LIVE_HUB.idFromName(appStateKey(env)));
        return stub.fetch(new Request("https://live-hub/connect", request));
      }

      if (url.pathname === "/api/health") {
        if (request.method !== "GET") return methodNotAllowed();
        const supabaseUrl = env.SUPABASE_URL ? new URL(env.SUPABASE_URL) : null;
        return json({
          ok: true,
          app: "medlane",
          r2Configured: Boolean(env.DOCUMENTS_BUCKET),
          supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
          supabaseHost: supabaseUrl?.hostname || null,
          supabasePath: supabaseUrl?.pathname || null,
          supabaseAnonKeyConfigured: Boolean(env.SUPABASE_ANON_KEY),
          supabaseAnonKeyPrefix: env.SUPABASE_ANON_KEY ? `${env.SUPABASE_ANON_KEY.slice(0, 12)}...` : null,
          supabaseAnonKeyHash: await shortHash(env.SUPABASE_ANON_KEY),
          supabaseSecretConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        });
      }

      if (url.pathname === "/api/version") {
        if (request.method !== "GET") return methodNotAllowed();
        // Cloudflare stamps a fresh, unique version id on every `wrangler deploy` — no manual
        // bump needed. The client polls this and force-logs-out on a mismatch so a tab left open
        // across a deploy (someone who steps away or never refreshes) can't keep running stale
        // code past a bug fix or security patch.
        return json({ version: env.CF_VERSION_METADATA?.id || "" });
      }

      if (url.pathname === "/auth/continue") {
        if (request.method !== "GET") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL"]);
        const token = url.searchParams.get("token") || "";
        const type = url.searchParams.get("type") || "";
        if (!token || !["invite", "recovery", "magiclink", "signup"].includes(type)) {
          return new Response("This link is invalid or has expired.", { status: 400 });
        }
        const redirectTo = `${requestOrigin(request)}/?login=1`;
        const target = `${supabaseBaseUrl(env)}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;
        return Response.redirect(target, 302);
      }

      if (url.pathname === "/api/auth/login") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { email, password } = await request.json();
        const throttle = await loginThrottle(env, request, "check", email);
        if (throttle.blocked) {
          return json({ error: `Too many failed sign-in attempts. Try again in ${Math.ceil(throttle.retryAfter / 60)} minute(s).` }, { status: 429, headers: { "retry-after": String(throttle.retryAfter) } });
        }
        const authResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const session = await authResponse.json().catch(() => null);
        if (!authResponse.ok) {
          const authError = session?.error_description || session?.msg || session?.error || "Invalid email or password";
          if (authResponse.status === 400 || authResponse.status === 401 || authResponse.status === 422) {
            await loginThrottle(env, request, "fail", email);
            ctx.waitUntil(recordSignInEvent(env, request, { ok: false, email: String(email || "").trim().toLowerCase() }));
          }
          const debug = url.searchParams.get("debug") === "1";
          console.error(JSON.stringify({ message: "Supabase login failed", authError, status: authResponse.status }));
          return json({ error: authError, ...(debug ? { supabaseStatus: authResponse.status, supabaseResponse: session, supabaseHost: new URL(env.SUPABASE_URL).hostname, supabasePath: new URL(env.SUPABASE_URL).pathname, authUrl: `${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, anonKeyHash: await shortHash(env.SUPABASE_ANON_KEY) } : {}) }, { status: 401 });
        }
        await loginThrottle(env, request, "reset", email);
        const user = await profileForUser(env, session.user.id, email);
        const appSession = await createAppSession(env, request, session.user.id);
        ctx.waitUntil(recordSignInEvent(env, request, { ok: true, email: String(email || "").trim().toLowerCase(), profile: user, userId: session.user.id }));
        return json({ session: { ...session, app_session_id: appSession?.id || null }, user });
      }

      if (url.pathname === "/api/auth/refresh") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { refreshToken } = await request.json().catch(() => ({}));
        if (!refreshToken) return json({ error: "Refresh token is required" }, { status: 400 });
        const refreshResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const session = await refreshResponse.json().catch(() => null);
        if (!refreshResponse.ok || !session?.access_token) {
          // 401 tells the client this login is finished, so keep it to Supabase really refusing the
          // token. Its outages and rate limits are temporary, and the client should just try again.
          if (refreshResponse.ok || refreshResponse.status >= 500 || refreshResponse.status === 429) return json({ error: "The sign-in service is temporarily unavailable" }, { status: 503 });
          const authError = session?.error_description || session?.msg || session?.error || "Session refresh failed";
          return json({ error: authError }, { status: 401 });
        }
        const user = await profileForUser(env, session.user.id, session.user.email).catch(() => null);
        return json({ session, user });
      }

      if (url.pathname === "/api/auth/forgot-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
        const { email: rawEmail } = await request.json().catch(() => ({}));
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        // Always answer with the same 200 body regardless of whether the account exists, so this
        // endpoint can't be used to probe which emails are registered. Failures are logged server-side.
        try {
          const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,full_name`);
          if (profiles[0]) {
            const options = { redirect_to: `${requestOrigin(request)}/?login=1` };
            const recoveryPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/generate_link", {
              method: "POST",
              body: JSON.stringify({ type: "recovery", email, options }),
            }).catch((error) => ({ _error: error.message }));
            const recovery = extractLinkResult(recoveryPayload);
            if (recovery?.actionLink) {
              const fullName = profiles[0].full_name || email;
              const delivery = await sendResendEmail(env, {
                to: email,
                subject: "Reset your Medlane OS password",
                html: passwordResetEmailHtml({ fullName, email, actionLink: wrapAuthActionLink(recovery.actionLink, requestOrigin(request)), origin: requestOrigin(request) }),
              }).catch((error) => ({ sent: false, reason: error.message }));
              await recordSystemLog(env, delivery.sent
                ? { action: "Sent password reset email", module: "Authentication", record: email }
                : { action: "Password reset email not sent", module: "Authentication", record: `${email}: ${delivery.reason || "unknown error"}` });
            } else {
              await recordSystemLog(env, { action: "Password reset link generation failed", module: "Authentication", record: `${email}: ${recoveryPayload?._error || "no action_link returned"}` });
            }
          }
        } catch (/** @type {any} */ error) {
          await recordSystemLog(env, { action: "Password reset request errored", module: "Authentication", record: `${email}: ${error.message}` }).catch(() => null);
        }
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/me") {
        if (request.method !== "GET") return methodNotAllowed();
        const { profile } = await authenticatedProfile(request, env);
        return json({ user: { ...profile, previewableRoles: previewableRolesFor(profile.previewOf || profile.role) } });
      }

      if (url.pathname === "/api/app-state") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/app_state?key=eq.${encodeURIComponent(appStateKey(env))}&select=data,updated_at,revision`);
          return json({ data: rows[0]?.data || null, updatedAt: rows[0]?.updated_at || null, revision: rows[0]?.revision || 0 });
        }
        if (request.method === "PUT") {
          requireWriteAccess(profile);
          const { data, revision } = await request.json();
          const rows = await supabaseFetch(env, "/rest/v1/rpc/update_app_state", {
            method: "POST",
            body: JSON.stringify({ expected_revision: Number(revision || 0), next_data: data, actor: authUser.id, state_key: appStateKey(env) }),
          });
          return json({ ok: true, revision: rows[0]?.revision, updatedAt: rows[0]?.updated_at });
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/auth/set-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { accessToken, password } = await request.json();
        if (!accessToken) return json({ error: "Invite or reset token is required" }, { status: 400 });
        const policyError = passwordPolicyError(password);
        if (policyError) return json({ error: policyError }, { status: 400 });
        const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return json({ error: payload?.msg || payload?.message || payload?.error || "Password setup failed" }, { status: 400 });
        if (payload?.id) await markPasswordConfirmed(env, payload.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/password-kyc/keep") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser } = await authenticatedProfile(request, env);
        await markPasswordConfirmed(env, authUser.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/theme") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser } = await authenticatedProfile(request, env);
        const { theme } = await request.json();
        if (!["light", "dark"].includes(theme)) return json({ error: "Theme must be \"light\" or \"dark\"" }, { status: 400 });
        await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ theme_preference: theme }),
        });
        return json({ ok: true, theme });
      }

      if (url.pathname === "/api/auth/change-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { token, user } = await authenticatedUser(request, env);
        const { currentPassword, newPassword } = await request.json();
        if (!currentPassword) return json({ error: "Current password is required" }, { status: 400 });
        const policyError = passwordPolicyError(newPassword);
        if (policyError) return json({ error: policyError }, { status: 400 });
        const verifyResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, password: currentPassword }),
        });
        if (!verifyResponse.ok) return json({ error: "Current password is incorrect" }, { status: 401 });
        const updateResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        });
        const payload = await updateResponse.json().catch(() => null);
        if (!updateResponse.ok) return json({ error: payload?.msg || payload?.message || payload?.error || "Password update failed" }, { status: 400 });
        await markPasswordConfirmed(env, user.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/logs" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const { action, module, record } = await request.json();
        if (!action) return json({ error: "Action is required" }, { status: 400 });
        const context = auditContextForRequest(request);
        const entry = {
          date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }),
          user: profile.name || profile.email || "System User",
          // While previewing, the audit trail still names the real role behind the action.
          role: profile.previewOf ? `${profile.previewOf} (previewing ${profile.role})` : profile.role || "Unknown",
          action,
          module: module || "",
          record: record || "",
          device: context.device,
          browser: context.browser,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          serverCapturedAt: context.serverCapturedAt,
        };
        await supabaseFetch(env, "/rest/v1/app_records", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: authUser.id }]),
        });
        return json({ ok: true }, { status: 201 });
      }

      if (url.pathname === "/api/logs/digest-message" && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        if (!["Superadmin", "CEO"].includes(profile.role) && (!profile.customPermissions?.view?.includes("logs") || (ROLE_BLOCKED_MODULES[profile.role] || []).includes("logs"))) return json({ error: "You do not have permission to view audit logs" }, { status: 403 });
        const snapshot = await readDigestMessageSnapshot(env, url.searchParams.get("id"));
        if (!snapshot) return json({ error: "Digest message not found or no longer retained" }, { status: 404 });
        return json({ html: snapshot.html, subject: snapshot.meta.subject || "", role: snapshot.meta.role || "", periodLabel: snapshot.meta.periodLabel || "", createdAt: snapshot.meta.createdAt || "" });
      }

      if (url.pathname === "/api/logs/summary" && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        if (!["Superadmin", "CEO"].includes(profile.role) && (!profile.customPermissions?.view?.includes("logs") || (ROLE_BLOCKED_MODULES[profile.role] || []).includes("logs"))) return json({ error: "You do not have permission to view audit logs" }, { status: 403 });
        const days = Math.min(Math.max(Math.round(Number(url.searchParams.get("days")) || 7), 1), 30);
        return json(await auditSummary(env, days));
      }

      if (url.pathname === "/api/logs" && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        if (!["Superadmin", "CEO"].includes(profile.role) && (!profile.customPermissions?.view?.includes("logs") || (ROLE_BLOCKED_MODULES[profile.role] || []).includes("logs"))) return json({ error: "You do not have permission to view audit logs" }, { status: 403 });
        const stateKey = appStateKey(env);
        const now = new Date();
        const dateFrom = url.searchParams.get("dateFrom") || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const dateTo = url.searchParams.get("dateTo") || now.toISOString();
        const roleFilter = url.searchParams.get("role") || "";
        const moduleFilter = url.searchParams.get("module") || "";
        const userFilter = (url.searchParams.get("user") || "").trim().toLowerCase();
        const before = url.searchParams.get("before") || "";
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
        const modules = moduleFilter ? moduleFilter.split(",").map((m) => m.trim()).filter(Boolean) : null;
        const matchesFilters = (/** @type {any} */ entry) => (!roleFilter || entry.role === roleFilter) && (!modules || modules.includes(entry.module)) && (!userFilter || String(entry.user || "").trim().toLowerCase() === userFilter);
        // A narrow filter (e.g. one module) can match only a small fraction of raw
        // audit rows in any given window. Fetching one flat batch and filtering it
        // in-memory could yield an empty page — with matches only a few windows
        // further back — while still reporting a nextCursor from the raw rows, so
        // "no records" would flip to populated results on the very next Load More.
        // Keep expanding the raw-row window until the page is full or the range
        // (or a sane iteration cap) is exhausted, so a page is only ever empty when
        // there's genuinely nothing left to show.
        const entries = [];
        let cursor = before || dateTo;
        let exhausted = false;
        for (let iteration = 0; iteration < 10 && entries.length < limit; iteration++) {
          const batchSize = limit * 4;
          let query = `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.logs&updated_at=gte.${encodeURIComponent(dateFrom)}&updated_at=lt.${encodeURIComponent(cursor)}`;
          query += `&select=data,updated_at&order=updated_at.desc&limit=${batchSize}`;
          const rows = await supabaseFetch(env, query);
          if (!rows.length) { exhausted = true; break; }
          for (const row of rows) {
            const entry = { ...row.data, updatedAt: row.updated_at };
            const reason = auditSensitivity(entry);
            if (reason) entry.sensitive = reason;
            if (matchesFilters(entry)) entries.push(entry);
          }
          cursor = rows[rows.length - 1].updated_at;
          if (rows.length < batchSize) { exhausted = true; break; }
        }
        const nextCursor = exhausted ? null : cursor;
        return json({ entries: entries.slice(0, limit), nextCursor });
      }

      // Live updates without a page refresh: every record (visible to this user) updated at or after
      // `since`, plus the next cursor. The client polls this every few seconds and merges rows in
      // place. The window deliberately overlaps by a few seconds (merges are idempotent) so a
      // write that committed slightly out of updated_at order is never skipped.
      if (url.pathname === "/api/modules/changes" && request.method === "GET") {
        const { profile } = await authenticatedProfileCached(request, env);
        const stateKey = appStateKey(env);
        const sinceMs = Date.parse(url.searchParams.get("since") || "");
        if (!Number.isFinite(sinceMs)) return json({ error: "A valid `since` timestamp is required" }, { status: 400 });
        const since = new Date(sinceMs - 10000).toISOString();
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&updated_at=gte.${encodeURIComponent(since)}&module_name=not.in.${encodeURIComponent(postgrestIn([...NON_STATE_MODULES, "branch", "masterTab", "logs"]))}&select=module_name,record_key,data,updated_at&order=updated_at.asc`);
        const visible = filterRecordsForProfile(rows, profile, "view");
        const cursor = rows.length ? rows[rows.length - 1].updated_at : new Date(sinceMs).toISOString();
        return json({ rows: visible.map((/** @type {any} */ { module_name, record_key, data }) => ({ module: module_name, key: record_key, data: withStockBase(module_name, record_key, data) })), cursor });
      }

      // "Load previous" — older records for one module that /api/modules/state trimmed out,
      // strictly before `before` (that module's sort value from trimPaginatedModuleRows():
      // data.date for most modules, updated_at for pendingTransfers). Response rows are shaped
      // identically to /api/modules/changes so the client can merge them with mergeLiveChanges().
      if (url.pathname === "/api/modules/page" && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const moduleName = url.searchParams.get("module") || "";
        if (!PAGINATED_MODULES.includes(moduleName)) return json({ error: `Unsupported module: ${moduleName}` }, { status: 400 });
        const before = url.searchParams.get("before") || "";
        if (!before) return json({ error: "A `before` cursor is required" }, { status: 400 });
        const limit = Math.min(Number(url.searchParams.get("limit")) || PAGINATED_MODULE_PAGE_SIZE, 200);
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${encodeURIComponent(moduleName)}&select=module_name,record_key,data,updated_at&order=updated_at.asc`);
        const { sortValue } = paginatedModulePredicates(new Map())[moduleName];
        const sortOf = (/** @type {any} */ row) => sortValue(row.data, row.updated_at) || "";
        const older = rows.filter((/** @type {any} */ row) => sortOf(row) < before).sort((/** @type {any} */ a, /** @type {any} */ b) => sortOf(b).localeCompare(sortOf(a)));
        const page = older.slice(0, limit);
        const visible = filterRecordsForProfile(page, profile, "view");
        return json({
          rows: visible.map((/** @type {any} */ { module_name, record_key, data }) => ({ module: module_name, key: record_key, data: withStockBase(module_name, record_key, data) })),
          nextCursor: page.length ? sortOf(page[page.length - 1]) : null,
          hasMore: older.length > limit,
        });
      }

      if (url.pathname === "/api/modules/state") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        if (request.method === "GET") {
          // The mini-game keeps its own records (`game-sessions` grows one row per play and
          // is never part of app state; `game-scores` is served by /api/game/*) — excluding
          // them here keeps this load, which every client runs, from paging through
          // thousands of dead session rows.
          // Shared read: everyone loading within STATE_SNAPSHOT_MAX_AGE_MS gets the same database
          // read (see sharedStateSnapshot); only the per-person permission filter runs per request.
          const { trimmedRows, pagination, changesCursor, loadedAt, resetAt } = await sharedStateSnapshot(env, stateKey);
          return json({ data: stateFromRecords(filterRecordsForProfile(trimmedRows, profile, "view").map(withStockBaseRow)), revision: Date.now(), changesCursor, pagination, loadedAt, resetAt });
        }
        if (request.method === "PUT") {
          requireWriteAccess(profile);
          const { data, basedOn } = await request.json();
          await assertSaveNotStale(env, stateKey, basedOn);
          const keys = writableKeys(profile);
          if (!keys.length) throw new Error("You do not have permission to edit production data");
          // Only replace modules the client actually included in this save. A key
          // that's simply absent from `data` (a stale or partial client snapshot —
          // e.g. an old tab, or a client-side bug that dropped a field) must never
          // be treated as "empty this module out": that previously deleted whatever
          // module the client's local copy happened not to have loaded, even though
          // nothing about that module was ever intentionally changed.
          const presentKeys = keys.filter((key) => data?.[key] !== undefined && key !== "logs");
          const auditContext = auditContextForRequest(request);
          const rows = recordsFromState(data, authUser.id, stateKey, presentKeys, auditContext);
          const stockBases = takeStockBases(rows);
          const runStateSave = async () => {
          await rebaseStockRows(env, stateKey, rows, stockBases);
          const actor = profile.name || profile.email || "System User";

          if (presentKeys.length) {
            // Circuit breaker: compare how many records each affected module has
            // right now against how many this save is about to leave it with.
            // A save that would wipe out a module that had a meaningful number of
            // records is almost always a stale/partial client snapshot clobbering
            // real data (the exact bug that previously erased the database), not
            // an intentional bulk delete — refuse it and log full context instead
            // of silently applying it.
            const eventModules = presentKeys.filter((key) => DISCORD_EVENT_MODULES.includes(key));
            const masterlistModulesPresent = !["Superadmin", "CEO"].includes(profile.role) ? presentKeys.filter((key) => ["clients", "items", "suppliers", "employees", "banks"].includes(key)) : [];
            const masterlistRecordKeys = masterlistModulesPresent.length ? rows.filter((row) => masterlistModulesPresent.includes(row.module_name)).map((row) => row.record_key) : [];
            const checkInventoryStock = !["Admin", "Superadmin", "CEO"].includes(profile.role) && presentKeys.includes("inventory") && !presentKeys.includes("sales") && !presentKeys.includes("pendingTransfers");
            const inventoryRecordKeys = checkInventoryStock ? rows.filter((row) => row.module_name === "inventory").map((row) => row.record_key) : [];
            const poRows = presentKeys.includes("purchaseOrders") ? rows.filter((row) => row.module_name === "purchaseOrders") : [];

            // None of these reads depend on each other, so fire them together instead of
            // one `await` at a time — this used to be up to 4 sequential Supabase round
            // trips before the save could even start.
            const [beforeRows, eventBeforeRows, storedMasterRows, storedStock] = await Promise.all([
              supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(presentKeys))}&select=module_name,record_key`),
              // The Discord poster diffs before/after status, so it needs the *complete* stored
              // set of the event modules (paged), not the single capped page the circuit-breaker
              // counts above tolerate — a truncated read would make an existing record look new.
              eventModules.length
                ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(eventModules))}&select=module_name,record_key,data`)
                : Promise.resolve([]),
              // Only the specific rows this save touches need their stored `archived` flag
              // checked — not every masterlist record in the company. A full-module fetch
              // here used to cost as much as the login-time state load, on every save.
              masterlistRecordKeys.length
                ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(masterlistModulesPresent))}&record_key=in.${encodeURIComponent(postgrestIn(masterlistRecordKeys))}&select=module_name,record_key,data`)
                : Promise.resolve([]),
              // Only the incoming inventory rows need their stored qty/expiry checked — not
              // the entire inventory table, which grows with every SKU/lot the company has ever
              // stocked. A full-module fetch here used to run on every non-admin inventory save.
              inventoryRecordKeys.length
                ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&record_key=in.${encodeURIComponent(postgrestIn(inventoryRecordKeys))}&select=record_key,data`)
                : Promise.resolve([]),
            ]);
            /** @type {Record<string, any>} */
            const beforeCounts = {};
            /** @type {Record<string, any>} */
            const beforeKeysByModule = {};
            for (const row of beforeRows) {
              beforeCounts[row.module_name] = (beforeCounts[row.module_name] || 0) + 1;
              beforeKeysByModule[row.module_name] ||= new Set();
              beforeKeysByModule[row.module_name].add(row.record_key);
            }
            /** @type {Record<string, any>} */
            const afterCounts = {};
            /** @type {Record<string, any>} */
            const incomingKeysByModule = {};
            for (const row of rows) {
              afterCounts[row.module_name] = (afterCounts[row.module_name] || 0) + 1;
              incomingKeysByModule[row.module_name] ||= new Set();
              incomingKeysByModule[row.module_name].add(row.record_key);
            }

            // Toggling a masterlist record's `archived` flag is CEO/Superadmin-only, even
            // through this bulk state PUT. Diff each incoming masterlist record against the
            // stored row and reject any archived-flag transition by a non-admin actor.
            if (masterlistModulesPresent.length) {
              const storedArchived = new Map();
              for (const row of storedMasterRows) storedArchived.set(`${row.module_name}|${row.record_key}`, Boolean(row.data && row.data.archived));
              for (const row of rows) {
                if (!masterlistModulesPresent.includes(row.module_name)) continue;
                const wasArchived = storedArchived.get(`${row.module_name}|${row.record_key}`) || false;
                if (Boolean(row.data && row.data.archived) !== wasArchived) throw new Error("Only CEO or Superadmin can archive or restore masterlist records");
              }
            }

            // Editing a stored stock row's quantity or expiry is Admin/CEO/Superadmin-only, even
            // through this bulk state PUT. New rows, and changes bundled with a stock-moving flow
            // (`sales` invoicing, `pendingTransfers`), are unaffected.
            if (checkInventoryStock) {
              const storedStockByKey = new Map(storedStock.map((/** @type {any} */ row) => [row.record_key, row.data || {}]));
              for (const row of rows) {
                if (row.module_name !== "inventory") continue;
                const prev = storedStockByKey.get(row.record_key);
                if (!prev) continue;
                if (Number(prev.qty || 0) !== Number(row.data?.qty || 0) || String(prev.expiry || "") !== String(row.data?.expiry || "")) {
                  throw new Error("Only Admin, CEO, or Superadmin can edit stock quantity or expiry");
                }
              }
            }

            // These are all independent assertions against already-stored data — run them
            // together instead of one at a time. (validateNewSaleRows needs beforeKeysByModule
            // to know which sales rows are new, which is why it waits until after the fetch
            // above instead of joining it.)
            const newSaleRows = presentKeys.includes("sales")
              ? rows.filter((row) => row.module_name === "sales" && !(beforeKeysByModule.sales || new Set()).has(row.record_key))
              : [];
            await Promise.all([
              newSaleRows.length ? validateNewSaleRows(env, stateKey, profile, newSaleRows, rows.filter((row) => row.module_name === "sales")) : null,
              poRows.length ? assertPurchaseOrderClientsNotArchived(env, stateKey, poRows) : null,
              assertMasterlistUnique(env, stateKey, rows, { replaceModules: true }),
              assertFinancialApprovalAllowed(env, stateKey, profile, rows),
              assertDemoRequestTransitionsAllowed(env, stateKey, profile, rows),
              assertSupportReportChangesAllowed(env, stateKey, profile, rows),
              assertCalendarEventChangesAllowed(env, stateKey, profile, rows),
              assertCreditApprovalAllowed(env, stateKey, profile, rows),
              assertMigratedStockAllowed(env, stateKey, profile, rows),
            ]);

            const wipedModules = presentKeys.filter((key) => (beforeCounts[key] || 0) > 0 && (afterCounts[key] || 0) === 0);
            const seededModules = env.ENVIRONMENT === "production" ? Object.entries(defaultSeedSignature).filter(([key, count]) => presentKeys.includes(key) && (beforeCounts[key] || 0) === 0 && (afterCounts[key] || 0) === count).map(([key]) => key) : [];
            const defaultSeedBurst = seededModules.length >= 3;

            if (defaultSeedBurst) {
              const deltaSummary = presentKeys.map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
              await writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "BLOCKED save — default masterlist seed detected",
                module: "System",
                record: `${deltaSummary}. Seeded modules: ${seededModules.join(", ")}.`,
              }, authUser.id, auditContext);
              throw new Error(`Save blocked: this looks like bundled default masterlist data being written to production. Restore from Backup instead. This attempt has been recorded in Audit Logs.`);
            }

            if (rows.length) {
              await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
                method: "POST",
                headers: { prefer: "resolution=merge-duplicates,return=minimal" },
                body: JSON.stringify(rows),
              });
            }

            // Everything below is informational (audit trail + Discord notification), not
            // something the already-durable save needs to wait on. Firing them after the
            // response via ctx.waitUntil — instead of 1-3 more sequential awaits — is what
            // used to make an otherwise-fast save look slow.
            const missingSummary = presentKeys.map((key) => {
              const beforeKeys = beforeKeysByModule[key] || new Set();
              const incomingKeys = incomingKeysByModule[key] || new Set();
              const missing = [...beforeKeys].filter((recordKey) => !incomingKeys.has(recordKey));
              return missing.length ? `${key}: preserved ${missing.length} existing record(s) absent from save` : "";
            }).filter(Boolean).join(", ");
            // Trace every save so a future incident can be pinpointed to the exact
            // user, time, and modules touched — only note modules whose record
            // count actually changed, to keep routine content-only edits quiet.
            const changedSummary = presentKeys.filter((key) => (beforeCounts[key] || 0) !== (afterCounts[key] || 0)).map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
            const auditWrites = [];
            if (wipedModules.length) {
              const deltaSummary = presentKeys.map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
              auditWrites.push(writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Preserved existing records omitted from save payload",
                module: "System",
                record: `${deltaSummary}. Omitted modules preserved: ${wipedModules.join(", ")}.`,
              }, authUser.id, auditContext));
            }
            if (missingSummary) {
              auditWrites.push(writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Ignored destructive save cleanup",
                module: "System",
                record: missingSummary,
              }, authUser.id, auditContext));
            }
            if (changedSummary) {
              auditWrites.push(writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Saved app state (record count changed)",
                module: "System",
                record: changedSummary,
              }, authUser.id, auditContext));
            }
            if (auditWrites.length) ctx.waitUntil(Promise.all(auditWrites));
            // Same reasoning as /api/modules/records: this already swallows its own errors and
            // runs its posts in parallel, so it doesn't need to hold up the response.
            ctx.waitUntil(postRecordEventsToDiscord(env, profile, eventBeforeRows, rows));
          }
          return json({ ok: true, savedRecords: rows.length, revision: Date.now(), stock: savedStockQty(rows) });
          };
          // `return await` (not a bare return) so a rejection lands in the catch below and gets its
          // proper 403/409/422 status instead of escaping as a generic 500 the client would queue.
          return await (presentKeys.includes("inventory") ? withStockLock(env, stateKey, runStateSave) : runStateSave());
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/memos" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireMemoAdmin(profile);
        const body = await request.json().catch(() => ({}));
        const title = String(body.title || "").trim();
        const bodyText = String(body.body || "").trim();
        if (!title) return json({ error: "Memo title is required" }, { status: 400 });
        if (!bodyText) return json({ error: "Memo body is required" }, { status: 400 });
        const audience = body.audience === "all" ? "all" : (Array.isArray(body.audience) ? [...new Set(body.audience.filter(Boolean))] : []);
        if (audience !== "all" && !audience.length) return json({ error: "Select at least one role or All Roles" }, { status: 400 });
        const stateKey = appStateKey(env);
        const existing = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.memos&select=record_key`);
        // Memo numbers are entered manually (the client pre-fills a suggested next number, but
        // the user can override it) — validate it here too, since the client's suggestion can
        // race with another admin posting at the same time.
        const requestedId = String(body.id || "").trim();
        if (!requestedId) return json({ error: "Memo number is required" }, { status: 400 });
        if (existing.some((/** @type {any} */ row) => row.record_key.toLowerCase() === requestedId.toLowerCase())) return json({ error: `${requestedId} is already in use. Enter a different memo number.` }, { status: 409 });
        const id = requestedId;
        const memo = {
          id, title, body: bodyText,
          eventDate: String(body.eventDate || "").trim(),
          eventTime: String(body.eventTime || "").trim(),
          place: String(body.place || "").trim(),
          attachments: Array.isArray(body.attachments) ? body.attachments.filter((/** @type {any} */ item) => item?.id && item?.file_name) : [],
          audience,
          createdBy: profile.name || profile.email || "System User",
          createdByRole: profile.role,
          createdAt: new Date().toISOString(),
          acknowledgments: [],
        };
        await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "memos", record_key: id, data: memo, updated_by: authUser.id }]),
        });
        await writeAuditTrace(env, stateKey, { actor: profile.name, role: profile.role, action: "Posted memo", module: "Memos", record: `${id}: ${title}` }, authUser.id, auditContextForRequest(request));
        await postMemoToDiscord(env, memo).catch(() => null);
        return json({ ok: true, memo }, { status: 201 });
      }

      if (/^\/api\/memos\/[^/]+\/acknowledge$/.test(url.pathname) && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const stateKey = appStateKey(env);
        // Single RPC round trip (atomic read-check-write in Postgres) instead of a separate
        // SELECT then POST -- see docs/migrations/2026-09-16-acknowledge-memo-rpc.sql.
        const rows = await supabaseFetch(env, "/rest/v1/rpc/acknowledge_memo", {
          method: "POST",
          body: JSON.stringify({
            p_state_key: stateKey,
            p_record_key: id,
            p_email: cleanEmail(profile.email),
            p_name: profile.name || profile.email || "System User",
            p_role: profile.role,
            p_at: manilaTimestamp(),
            p_actor: authUser.id,
          }),
        });
        const memo = rows[0]?.data;
        if (!memo) return json({ error: "Memo not found" }, { status: 404 });
        return json({ ok: true, memo });
      }

      if (url.pathname === "/api/game/session/start" && request.method === "POST") {
        const { authUser } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const token = crypto.randomUUID();
        await supabaseFetch(env, "/rest/v1/app_records", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "game-sessions", record_key: token, data: { userId: authUser.id, startedAt: Date.now(), used: false }, updated_by: authUser.id }]),
        });
        return json({ token }, { status: 201 });
      }

      if (url.pathname === "/api/game/score" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const body = await request.json().catch(() => ({}));
        // The client only ever reports a candidate score — this endpoint is the sole
        // authority over what actually gets saved. A single-use session token (minted
        // by /api/game/session/start when the run began) proves a run of a given
        // duration actually happened, so a submission replayed from devtools/console
        // (calling this endpoint directly with a huge score, no token, or a reused
        // token) is rejected or clamped to what that duration could plausibly earn.
        const token = String(body.token || "");
        if (!token) return json({ error: "Missing game session token. Start a new game to submit a score." }, { status: 400 });
        const sessionRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-sessions&record_key=eq.${encodeURIComponent(token)}&select=data`);
        const gameSession = sessionRows[0]?.data;
        if (!gameSession || gameSession.userId !== authUser.id) return json({ error: "Invalid game session token. Start a new game to submit a score." }, { status: 400 });
        // Idempotent replay: if the run was already scored under this token, hand back the same
        // result instead of an error. This is what lets the client safely retry when a response
        // was lost after the server had already saved (the #1 way a genuine high score "wasn't
        // saved" — it was, the client just never heard back and gave up).
        if (gameSession.used) {
          if (gameSession.result) return json({ ...gameSession.result, replayed: true });
          return json({ error: "That game session was already used. Play again to submit a score." }, { status: 400 });
        }
        const elapsedMs = Date.now() - Number(gameSession.startedAt || 0);
        if (elapsedMs > 30 * 60 * 1000) return json({ error: "Game session expired. Play again to submit a score." }, { status: 400 });
        // Claim the token up front so two overlapping submits of the same token can't both run
        // the scoring path and double-count XP. The result is written back onto it at the end;
        // a retry that lands here sees used:true and replays that stored result.
        await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "game-sessions", record_key: token, data: { ...gameSession, used: true }, updated_by: authUser.id }]),
        });
        const elapsedSeconds = Math.max(elapsedMs / 1000, 0.5);
        // Top speed and spawn-rate difficulty both now scale with score (see game.js),
        // pushing the realistic ceiling to roughly ~185 pts/sec at max difficulty —
        // keep this comfortably above that so genuine high-skill runs never get clamped.
        const maxPlausibleScore = Math.ceil(elapsedSeconds * 230) + 30;
        const score = Math.min(Math.max(0, Math.floor(Number(body.score) || 0)), maxPlausibleScore);
        let result;
        try {
          const existingRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-scores&record_key=eq.${encodeURIComponent(authUser.id)}&select=data`);
          const existing = existingRows[0]?.data || null;
          const isNewBest = !existing || score > existing.score;
          const best = isNewBest ? score : existing.score;
          // XP is cumulative across every run (grinding builds level even without a new
          // best), while best/date only move on an actual personal best.
          const prevTotalXp = Number(existing?.totalXp || 0);
          const prevLevel = gameLevelForXp(prevTotalXp);
          const totalXp = prevTotalXp + score;
          const level = gameLevelForXp(totalXp);
          const badge = gameBadgeForScore(best);
          const skin = gameResolveSkin(body.skin != null ? String(body.skin) : null, existing?.skin, level, badge);
          const entry = {
            name: profile.name || profile.email || "System User",
            score: best,
            date: isNewBest ? manilaTimestamp() : (existing?.date || manilaTimestamp()),
            totalXp,
            level,
            skin,
          };
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{ state_key: stateKey, module_name: "game-scores", record_key: authUser.id, data: entry, updated_by: authUser.id }]),
          });
          result = { ok: true, best, isNewBest, badge, skin, totalXp, level, leveledUp: level > prevLevel, xpToNextLevel: gameXpForLevel(level + 1) - totalXp };
        } catch (/** @type {any} */ scoreError) {
          // The score write failed after we claimed the token — release the claim so the
          // client's automatic retry can actually go through instead of hitting "already used".
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{ state_key: stateKey, module_name: "game-sessions", record_key: token, data: { ...gameSession, used: false }, updated_by: authUser.id }]),
          }).catch(() => null);
          throw scoreError;
        }
        // Store the result on the (already-claimed) token so a later retry can replay it instead
        // of erroring. If this write is lost the score still persisted; the retry just gets the
        // "already used" message rather than the celebratory card — the best/XP are safe.
        await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "game-sessions", record_key: token, data: { ...gameSession, used: true, result }, updated_by: authUser.id }]),
        }).catch(() => null);
        return json(result);
      }

      if (url.pathname === "/api/game/score/me" && request.method === "GET") {
        const { authUser } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-scores&record_key=eq.${encodeURIComponent(authUser.id)}&select=data`);
        const data = rows[0]?.data || {};
        const best = data.score || 0;
        const totalXp = Number(data.totalXp || 0);
        const level = gameLevelForXp(totalXp);
        const badge = gameBadgeForScore(best);
        return json({ best, badge, totalXp, level, xpToNextLevel: gameXpForLevel(level + 1) - totalXp, skin: gameResolveSkin(null, data.skin, level, badge) });
      }

      // Persist a cosmetic skin choice without a run — validated the same way as a
      // score submit, so an un-earned skin never lands on the leaderboard.
      if (url.pathname === "/api/game/skin" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const body = await request.json().catch(() => ({}));
        const wanted = String(body.skin || "classic");
        if (!GAME_SKIN_RULES[wanted]) return json({ error: "Unknown skin." }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-scores&record_key=eq.${encodeURIComponent(authUser.id)}&select=data`);
        const existing = rows[0]?.data || null;
        // Nothing to store for a never-played player choosing the default skin.
        if (!existing && wanted === "classic") return json({ ok: true, skin: "classic" });
        const best = existing?.score || 0;
        const totalXp = Number(existing?.totalXp || 0);
        const level = gameLevelForXp(totalXp);
        const badge = gameBadgeForScore(best);
        if (!gameSkinAllowed(wanted, level, badge)) return json({ error: "That skin isn't unlocked yet." }, { status: 403 });
        const entry = {
          name: profile.name || profile.email || "System User",
          score: best,
          date: existing?.date || manilaTimestamp(),
          totalXp,
          level,
          skin: wanted,
        };
        await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "game-scores", record_key: authUser.id, data: entry, updated_by: authUser.id }]),
        });
        return json({ ok: true, skin: wanted });
      }

      if (url.pathname === "/api/game/leaderboard" && request.method === "GET") {
        await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const byLevel = url.searchParams.get("by") === "level";
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.game-scores&select=data`);
        const entries = rows.map((/** @type {any} */ row) => row.data).filter(Boolean)
          .sort((/** @type {any} */ a, /** @type {any} */ b) => byLevel ? (b.totalXp || 0) - (a.totalXp || 0) : (b.score || 0) - (a.score || 0))
          .slice(0, 20)
          .map((/** @type {any} */ entry) => {
            const badge = gameBadgeForScore(entry.score);
            const level = gameLevelForXp(entry.totalXp || 0);
            return { ...entry, badge, level, skin: gameResolveSkin(null, entry.skin, level, badge) };
          });
        return json({ entries });
      }

      if (url.pathname === "/api/modules/records") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireWriteAccess(profile);
        const stateKey = appStateKey(env);
        const body = await request.json().catch(() => ({}));
        await assertSaveNotStale(env, stateKey, body.basedOn);
        const records = body.records && typeof body.records === "object" ? body.records : {};
        const recordKeys = body.recordKeys && typeof body.recordKeys === "object" ? body.recordKeys : {};
        const allowedKeys = new Set(writableKeys(profile));
        // Invoicing deducts stock, so buildSale() bundles the touched `inventory` rows with the
        // sale. A role that can invoice but has no Inventory module (e.g. Accounting) may write
        // those rows only as part of a sale save — validated below to be limited to the sale's
        // own item codes and to quantity/lot changes, so this is not a general stock-edit grant.
        const saleScopedInventory = !allowedKeys.has("inventory") && allowedKeys.has("sales") && Array.isArray(records.sales) && records.sales.length > 0;
        /** @type {any[]} */
        let rows = [];
        for (const [key, value] of Object.entries(records)) {
          if (!allowedKeys.has(key) && !(key === "inventory" && saleScopedInventory)) throw new Error(`You do not have permission to edit ${key}`);
          if (!Array.isArray(value)) throw new Error(`Per-record saves require an array for ${key}`);
          value.forEach((record, index) => rows.push({ state_key: stateKey, module_name: key, record_key: String(recordKeys[key]?.[index] || recordKeyFor(key, record, index)), data: record, updated_by: authUser.id }));
        }
        rows = dedupeRowsByRecordKey(rows);
        const stockBases = takeStockBases(rows);
        const runRecordSave = async () => {
        await rebaseStockRows(env, stateKey, rows, stockBases);

        const saleCodes = saleScopedInventory ? new Set(records.sales.flatMap((/** @type {Sale} */ sale) => (sale?.lines || []).map((/** @type {any} */ line) => String(line?.code || ""))).filter(Boolean)) : null;
        const saleStockRows = saleScopedInventory ? rows.filter((row) => row.module_name === "inventory") : [];

        // Archiving / restoring a masterlist record is CEO/Superadmin-only. The per-module
        // permission check above only gates *editing* the module, not flipping the `archived`
        // flag, so enforce that specific transition here by diffing against the stored row.
        const MASTERLIST_ARCHIVE_MODULES = ["clients", "items", "suppliers", "employees", "banks"];
        const archiveCandidateRows = rows.filter((row) => MASTERLIST_ARCHIVE_MODULES.includes(row.module_name));
        const checkMasterlistArchive = archiveCandidateRows.length && !["Superadmin", "CEO"].includes(profile?.role);
        /** @type {Record<string, any>} */
        const archiveKeysByModule = {};
        if (checkMasterlistArchive) for (const row of archiveCandidateRows) (archiveKeysByModule[row.module_name] ||= []).push(row.record_key);

        // Directly correcting a stored stock row's quantity or expiry (the Inventory → Stocks
        // "Edit" dialog) is Admin/CEO/Superadmin-only. The "inventory" module permission gates
        // receiving/transfers for Logistics et al., but a manual stock correction is a higher bar.
        // Legit stock-moving flows bundle a companion record (invoicing → `sales`, transfers →
        // `pendingTransfers`); the correction dialog sends `inventory` alone, so skip the guard
        // when a companion is present. A brand-new stock row (no stored match) also passes through.
        const stockMovementCompanions = new Set(["sales", "pendingTransfers"]);
        const incomingStockRows = rows.filter((row) => row.module_name === "inventory");
        const hasStockMovementCompanion = rows.some((row) => stockMovementCompanions.has(row.module_name));
        const checkStockEdit = incomingStockRows.length && !hasStockMovementCompanion && !["Admin", "CEO", "Superadmin"].includes(profile?.role);

        // This is the real invoice-creation path (buildSale -> persistRecords -> here), not
        // /api/modules/state's bulk PUT — so the new-sale integrity checks belong here.
        const incomingSaleRows = rows.filter((row) => row.module_name === "sales");

        // A submitted client PO can be edited only until it has invoices/DRs against it. This
        // is the pure PO-edit path (no sales in the same payload); invoicing re-saves the PO
        // row unchanged alongside its sale and is not affected. Reject when a stored PO already
        // has a non-cancelled referencing sale AND its lines/client/date actually changed —
        // guards against a stale client bypassing the client-side served check (spec FR-011).
        const incomingPoRows = rows.filter((row) => row.module_name === "purchaseOrders");
        const checkPoEditLock = incomingPoRows.length && !incomingSaleRows.length;

        const eventModules = [...new Set(rows.map((row) => row.module_name).filter((key) => DISCORD_EVENT_MODULES.includes(key)))];

        // Wave 1: every read below is independent of the others — none of them depend on each
        // other's result — so they're fired together instead of one `await` at a time. This
        // endpoint is the shared save path for nearly every module (sales, transfers, payment
        // requests, masterlist edits, PO edits, ...), so shaving round trips here speeds up every
        // itemized/many-row submit in the app, including PO saves. (The PO-edit-lock check still
        // needs a second, sequential read below — it only knows which sales rows to look for once
        // it knows which incoming PO rows are edits of an existing PO, i.e. once storedPoRows below
        // has resolved.)
        const [saleScopedStock, existingSaleRows, storedPoRows, beforeRows, masterlistStoredRows, stockEditStoredStock, auditBefore] = await Promise.all([
          saleStockRows.length
            ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&record_key=in.${encodeURIComponent(postgrestIn(saleStockRows.map((row) => row.record_key)))}&select=record_key,data`)
            : Promise.resolve([]),
          incomingSaleRows.length
            ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.sales&record_key=in.${encodeURIComponent(postgrestIn(incomingSaleRows.map((row) => row.record_key)))}&select=record_key`)
            : Promise.resolve([]),
          checkPoEditLock
            ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.purchaseOrders&record_key=in.${encodeURIComponent(postgrestIn(incomingPoRows.map((row) => row.record_key)))}&select=record_key,data`)
            : Promise.resolve([]),
          eventModules.length
            ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(eventModules))}&select=module_name,record_key,data`)
            : Promise.resolve([]),
          // One fetch per touched masterlist module (kept separate per module, not combined into
          // one `module_name=in.(...)&record_key=in.(...)` query — two different modules can share
          // a record_key, which a combined IN/IN filter can't tell apart) — independent of each
          // other, so still run together.
          checkMasterlistArchive
            ? Promise.all(Object.entries(archiveKeysByModule).map(async ([moduleName, keys]) => {
                const stored = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${encodeURIComponent(moduleName)}&record_key=in.${encodeURIComponent(postgrestIn(keys))}&select=record_key,data`);
                return stored.map((/** @type {any} */ entry) => ({ moduleName, ...entry }));
              })).then((groups) => groups.flat())
            : Promise.resolve([]),
          checkStockEdit
            ? supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&record_key=in.${encodeURIComponent(postgrestIn(incomingStockRows.map((row) => row.record_key)))}&select=record_key,data`)
            : Promise.resolve([]),
          // Stored copies of watched records, for the audit trail's before → after.
          auditBeforeRows(env, stateKey, rows),
          incomingPoRows.length ? assertPurchaseOrderClientsNotArchived(env, stateKey, incomingPoRows) : Promise.resolve(),
          assertMasterlistUnique(env, stateKey, rows),
          assertFinancialApprovalAllowed(env, stateKey, profile, rows),
          assertDemoRequestTransitionsAllowed(env, stateKey, profile, rows),
              assertSupportReportChangesAllowed(env, stateKey, profile, rows),
              assertCalendarEventChangesAllowed(env, stateKey, profile, rows),
          assertCreditApprovalAllowed(env, stateKey, profile, rows),
          assertMigratedStockAllowed(env, stateKey, profile, rows),
        ]);

        if (saleScopedInventory) {
          const storedStockByKey = new Map(saleScopedStock.map((/** @type {any} */ entry) => [entry.record_key, entry.data || {}]));
          for (const row of saleStockRows) {
            const incoming = row.data || {};
            if (!(/** @type {Set<string>} */ (saleCodes)).has(String(incoming.code || ""))) throw new Error("You do not have permission to edit inventory");
            const prev = storedStockByKey.get(row.record_key);
            if (!prev) continue;
            const { qty: _prevQty, lot: _prevLot, ...prevRest } = prev;
            const { qty: _nextQty, lot: _nextLot, ...nextRest } = incoming;
            if (JSON.stringify(prevRest, Object.keys(prevRest).sort()) !== JSON.stringify(nextRest, Object.keys(nextRest).sort())) throw new Error("You do not have permission to edit inventory");
          }
        }

        // A client with any Purchase Order on file can't be archived (any role, incl. CEO/Superadmin).
        const clientsBeingArchived = archiveCandidateRows.filter((row) => row.module_name === "clients" && row.data?.archived && row.data?.name).map((row) => row.data.name);
        if (clientsBeingArchived.length) {
          const poClientRows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.purchaseOrders&select=data`);
          const allPoData = [...poClientRows.map((/** @type {any} */ r) => r.data), ...incomingPoRows.map((r) => r.data)].filter((d) => d?.client);
          for (const name of clientsBeingArchived) {
            const ids = [...new Set(allPoData.filter((d) => d.client === name).map((d) => d.id).filter(Boolean))];
            if (ids.length) throw new Error(`${name} has an existing purchase order (${ids.slice(0, 5).join(", ")}${ids.length > 5 ? `, +${ids.length - 5} more` : ""}) and cannot be archived.`);
          }
        }

        if (checkMasterlistArchive) {
          const storedArchivedByKey = new Map();
          for (const entry of masterlistStoredRows) storedArchivedByKey.set(`${entry.moduleName}|${entry.record_key}`, Boolean(entry.data && entry.data.archived));
          for (const row of archiveCandidateRows) {
            const wasArchived = storedArchivedByKey.get(`${row.module_name}|${row.record_key}`) || false;
            const willBeArchived = Boolean(row.data && row.data.archived);
            if (wasArchived !== willBeArchived) throw new Error("Only CEO or Superadmin can archive or restore masterlist records");
          }
        }

        if (checkStockEdit) {
          const storedStockByKey = new Map(stockEditStoredStock.map((/** @type {any} */ entry) => [entry.record_key, entry.data || {}]));
          for (const row of incomingStockRows) {
            const prev = storedStockByKey.get(row.record_key);
            if (!prev) continue;
            const qtyChanged = Number(prev.qty || 0) !== Number(row.data?.qty || 0);
            const expiryChanged = String(prev.expiry || "") !== String(row.data?.expiry || "");
            if (qtyChanged || expiryChanged) throw new Error("Only Admin, CEO, or Superadmin can edit stock quantity or expiry");
          }
        }

        if (incomingSaleRows.length) {
          const existingSaleKeys = new Set(existingSaleRows.map((/** @type {any} */ row) => row.record_key));
          const newSaleRows = incomingSaleRows.filter((row) => !existingSaleKeys.has(row.record_key));
          if (newSaleRows.length) await validateNewSaleRows(env, stateKey, profile, newSaleRows, incomingSaleRows);
        }

        if (checkPoEditLock) {
          const storedPoByKey = new Map(storedPoRows.map((/** @type {any} */ row) => [row.record_key, row.data || {}]));
          const editedPoRows = incomingPoRows.filter((row) => storedPoByKey.has(row.record_key));
          if (editedPoRows.length) {
            // Narrowed to sales referencing one of these specific PO ids instead of scanning the
            // entire sales table (which only ever grows) — editing a submitted PO used to pull
            // every invoice the company has ever issued just to check whether this one PO is locked.
            const poIdFilter = postgrestIn(editedPoRows.map((row) => row.record_key));
            const saleRows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.sales&data->>po=in.${encodeURIComponent(poIdFilter)}&select=data`);
            const lockedPoIds = new Set(saleRows.map((/** @type {any} */ row) => row.data).filter((/** @type {Sale} */ sale) => sale && sale.po && sale.status !== "Cancelled").map((/** @type {Sale} */ sale) => sale.po));
            for (const row of editedPoRows) {
              if (!lockedPoIds.has(row.record_key)) continue;
              const stored = storedPoByKey.get(row.record_key);
              const incoming = row.data || {};
              const structurallyChanged =
                JSON.stringify(stored.lines || []) !== JSON.stringify(incoming.lines || []) ||
                String(stored.client || "") !== String(incoming.client || "") ||
                String(stored.date || "") !== String(incoming.date || "");
              if (structurallyChanged) throw new Error(`${row.record_key} already has invoices or delivery receipts against it and can no longer be edited.`);
            }
          }
        }

        if (rows.length) {
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(rows),
          });
          // Discord posts here already swallow their own errors and run in parallel internally
          // (Promise.allSettled) — pure notification, so it doesn't need to block the response.
          // This is the shared save path for nearly every module, so this alone removes a
          // meaningful chunk of latency (and "Failed to fetch" exposure) from every itemized submit.
          ctx.waitUntil(postRecordEventsToDiscord(env, profile, beforeRows, rows));
          ctx.waitUntil(writeChangeAudits(env, stateKey, profile, authUser.id, auditContextForRequest(request), rows, auditBefore).catch(() => null));
        }
        return json({ ok: true, savedRecords: rows.length, revision: Date.now(), stock: savedStockQty(rows) });
        };
        return await (rows.some((row) => row.module_name === "inventory") ? withStockLock(env, stateKey, runRecordSave) : runRecordSave());
      }

      if (url.pathname.startsWith("/api/purchase-orders/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const poId = decodeURIComponent(segments[2] || "");
        const action = segments[3] || "";
        if (request.method !== "POST") return methodNotAllowed();
        if (!poId || !["approve", "advance", "cancel"].includes(action)) return json({ error: "Unknown purchase order action" }, { status: 404 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const poRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(poId)}&select=data`);
        const po = poRows[0]?.data;
        if (!po) return json({ error: "Purchase order not found" }, { status: 404 });
        const by = profile.name || profile.email || "System User";
        const timestamp = poTimestamp();
        po.history = po.history || [];

        if (action === "approve") {
          requirePoApprover(profile);
          // Idempotent short-circuit: a retried approve (client resend after a dropped response)
          // lands here once the first attempt already went through, so it returns success instead
          // of the confusing "Cannot approve ... status Approved" error.
          if (po.status === "Approved") return json({ ok: true, po });
          if (po.status !== "Pending Approval") throw new Error(`Cannot approve a purchase order with status "${po.status}"`);
          po.status = "Approved";
          po.approvedBy = by;
          po.approvedAt = shortDate();
          po.history.push({ date: timestamp, status: "Approved", note: `Approved by ${by}.`, by });
        } else if (action === "advance") {
          requirePoReceiver(profile);
          /** @type {Record<string, any>} */
          const next = poNextStatus[po.status];
          if (!next) throw new Error(`Cannot advance a purchase order with status "${po.status}"`);
          po.status = next;
          po.history.push({ date: timestamp, status: next, note: `Marked ${next} by ${by}.`, by });
        } else if (action === "cancel") {
          requirePoReceiver(profile);
          if (po.status === "Cancelled") return json({ ok: true, po });
          if (!poCancellableStatuses.includes(po.status)) throw new Error(`Cannot cancel a purchase order with status "${po.status}"`);
          const body = await request.json().catch(() => ({}));
          po.status = "Cancelled";
          po.cancelledBy = by;
          po.cancelledAt = shortDate();
          po.history.push({ date: timestamp, status: "Cancelled", note: String(body.reason || "").trim() || "Order cancelled.", by });
        }

        await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(poId)}`, {
          method: "PATCH",
          body: JSON.stringify({ data: po, updated_by: authUser.id }),
        });
        if (action === "approve") {
          // Discord post already swallows its own errors — it's pure notification, so it doesn't
          // need to block the response. waitUntil lets the Worker finish sending it (including
          // Discord's rate-limit backoff) after the client already has its answer.
          ctx.waitUntil(postWorkflowEventToDiscord(env, profile, {
            title: "Inventory Purchase Order Approved", color: 0x22c55e, label: `Inventory PO approved ${poId}`,
            fields: [
              { name: "PO", value: webhookText(po.id || poId), inline: true },
              { name: "Supplier", value: webhookText(po.supplier), inline: true },
              { name: "Total", value: money(inventoryPoTotal(po)), inline: true },
              { name: "Branch", value: webhookText(po.branch), inline: true },
            ],
          }));
        }
        return json({ ok: true, po });
      }

      if (url.pathname === "/api/stock-receipts" || url.pathname.startsWith("/api/stock-receipts/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const receiptId = segments[2] ? decodeURIComponent(segments[2]) : "";
        const action = segments[3] || "";
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const by = profile.name || profile.email || "System User";
        const timestamp = poTimestamp();

        if (!receiptId) {
          requirePoReceiver(profile);
          const body = await request.json().catch(() => ({}));
          const poId = body.poId ? String(body.poId).trim() : "";
          // The PO lookup/duplicate-check and the items lookup are independent reads — running them
          // together instead of one after another cuts a full network round trip off every submit,
          // which matters most on itemized receipts where the extra latency made a transient network
          // blip (cold Worker, wifi handoff) more likely to surface as "Failed to fetch".
          const [po, openReceipt, itemRows] = await Promise.all([
            poId
              ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(poId)}&select=data`).then((rows) => rows[0]?.data || null)
              : Promise.resolve(null),
            poId
              ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.stockReceipts&select=data`).then((rows) => rows.map((/** @type {any} */ row) => row.data).find((/** @type {any} */ entry) => entry.poId === poId && entry.status === "Pending Approval") || null)
              : Promise.resolve(null),
            supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.items&select=data`),
          ]);
          if (poId) {
            if (!po) return json({ error: "Purchase order not found" }, { status: 404 });
            if (!["For Receiving", "Partially Received"].includes(po.status)) throw new Error(`Cannot receive stock for a purchase order with status "${po.status}"`);
            if (openReceipt) throw new Error(`${poId} already has a stock receipt (${openReceipt.id}) awaiting approval.`);
          }
          const items = itemRows.map((/** @type {any} */ row) => row.data);
          const lines = validateReceivingLines(po, Array.isArray(body.lines) ? body.lines : [], items);
          const { orderNumber, dateReceived, source } = validateReceivingMeta(body);
          // Accept a client-generated id so a retried submit (network blip after the server already
          // committed) safely re-upserts the same record instead of creating a duplicate receipt.
          const clientId = typeof body.id === "string" ? body.id.trim() : "";
          const receipt = {
            id: /^SR-[A-Z0-9]{1,24}-[A-Z0-9]{1,24}$/i.test(clientId) ? clientId : `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            poId: po?.id || null,
            supplier: po?.supplier || "",
            status: "Pending Approval",
            orderNumber,
            dateReceived,
            source,
            lines,
            submittedBy: by,
            submittedByUser: profile.email || "",
            submittedAt: timestamp,
            history: [{ date: timestamp, status: "Pending Approval", note: `Submitted for approval by ${by}.`, by }],
          };
          const receiptRecords = recordsFromState({ stockReceipts: [receipt] }, authUser.id, stateKey, ["stockReceipts"]);
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(receiptRecords) });
          return json({ ok: true, receipt });
        }

        if (!["approve", "cancel", "edit"].includes(action)) return json({ error: "Unknown stock receipt action" }, { status: 404 });
        const receiptRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.stockReceipts&record_key=eq.${encodeURIComponent(receiptId)}&select=data`);
        const receipt = receiptRows[0]?.data;
        if (!receipt) return json({ error: "Stock receipt not found" }, { status: 404 });
        receipt.history = receipt.history || [];

        if (action === "cancel") {
          requireStockReceiptApprover(profile);
          if (receipt.status === "Cancelled") return json({ ok: true, receipt });
          if (receipt.status !== "Pending Approval") throw new Error(`Cannot cancel a stock receipt with status "${receipt.status}"`);
          const body = await request.json().catch(() => ({}));
          const reason = String(body.reason || "").trim();
          if (!reason) throw new Error("A cancellation reason is required");
          receipt.status = "Cancelled";
          receipt.cancelledBy = by;
          receipt.cancelledAt = shortDate();
          receipt.cancelReason = reason;
          receipt.history.push({ date: timestamp, status: "Cancelled", note: reason, by });
          const records = recordsFromState({ stockReceipts: [receipt] }, authUser.id, stateKey, ["stockReceipts"]);
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(records) });
          return json({ ok: true, receipt });
        }

        if (action === "edit") {
          requireStockReceiptApprover(profile);
          if (receipt.status !== "Pending Approval") throw new Error(`Cannot edit a stock receipt with status "${receipt.status}"`);
          const body = await request.json().catch(() => ({}));
          const [po, itemRows] = await Promise.all([
            receipt.poId
              ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(receipt.poId)}&select=data`).then((rows) => rows[0]?.data || null)
              : Promise.resolve(null),
            supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.items&select=data`),
          ]);
          const items = itemRows.map((/** @type {any} */ row) => row.data);
          receipt.lines = validateReceivingLines(po, Array.isArray(body.lines) ? body.lines : [], items);
          const { orderNumber, dateReceived, source } = validateReceivingMeta(body);
          receipt.orderNumber = orderNumber;
          receipt.dateReceived = dateReceived;
          receipt.source = source;
          receipt.history.push({ date: timestamp, status: "Pending Approval", note: `Edited by ${by}.`, by });
          const records = recordsFromState({ stockReceipts: [receipt] }, authUser.id, stateKey, ["stockReceipts"]);
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(records) });
          return json({ ok: true, receipt });
        }

        requireStockReceiptApprover(profile);
        // Idempotent short-circuit: a retried approve (client resend after a dropped response)
        // lands here once the first attempt already posted to inventory, so it returns the
        // already-approved receipt instead of throwing "Cannot approve ... status Approved".
        if (receipt.status === "Approved") {
          const po = receipt.poId
            ? (await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(receipt.poId)}&select=data`))[0]?.data || null
            : null;
          return json({ ok: true, receipt, po });
        }
        if (receipt.status !== "Pending Approval") throw new Error(`Cannot approve a stock receipt with status "${receipt.status}"`);
        // Posting a receipt rewrites stock rows, so it holds the same stock lock as invoice saves.
        return await withStockLock(env, stateKey, async () => {
        // The PO lookup and the inventory lookup are independent reads — running them together
        // shaves a full round trip off every approval, which matters most on itemized receipts
        // where the extra latency made a transient network blip more likely to surface as
        // "Failed to fetch".
        const [po, invRows] = await Promise.all([
          receipt.poId
            ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(receipt.poId)}&select=data`).then((rows) => rows[0]?.data || null)
            : Promise.resolve(null),
          supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&select=record_key,data`),
        ]);
        if (receipt.poId) {
          if (!po) return json({ error: "Purchase order not found" }, { status: 404 });
          if (!["For Receiving", "Partially Received"].includes(po.status)) throw new Error(`Cannot approve this stock receipt: ${po.id} is no longer ready for receiving (status "${po.status}").`);
          po.history = po.history || [];
        }
        const inventory = invRows.map((/** @type {any} */ row) => row.data);
        const totalReceived = applyReceivingLines(po, receipt.lines, inventory);
        receipt.status = "Approved";
        receipt.approvedBy = by;
        receipt.approvedAt = shortDate();
        receipt.history.push({ date: timestamp, status: "Approved", note: `Approved by ${by}. Posted ${totalReceived} unit(s) across ${receipt.lines.length} line(s).`, by });
        if (po) {
          const fullyReceived = (po.lines || []).every((/** @type {any} */ line) => Number(line.receivedQty || 0) >= Number(line.qty || 0));
          po.status = fullyReceived ? "Fully Received" : "Partially Received";
          if (fullyReceived) { po.receivedBy = by; po.receivedAt = shortDate(); }
          po.history.push({ date: timestamp, status: po.status, note: `Received ${totalReceived} unit(s) across ${receipt.lines.length} line(s) via ${receipt.id}.`, by });
        }
        // These three writes touch separate records (inventory, the receipt, the PO) with no
        // ordering dependency between them, so running them together instead of one after another
        // cuts the remaining latency roughly by half.
        const invRecords = recordsFromState({ inventory }, authUser.id, stateKey, ["inventory"]);
        const receiptRecords = recordsFromState({ stockReceipts: [receipt] }, authUser.id, stateKey, ["stockReceipts"]);
        await Promise.all([
          invRecords.length ? supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(invRecords) }) : Promise.resolve(),
          supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(receiptRecords) }),
          po ? supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(po.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ data: po, updated_by: authUser.id }),
          }) : Promise.resolve(),
        ]);
        // Discord post already swallows its own errors and is pure notification, so it doesn't
        // need to block the response — waitUntil lets the Worker finish sending it after the
        // client already has its answer.
        ctx.waitUntil(postWorkflowEventToDiscord(env, profile, {
          title: "Stock Receipt Approved", color: 0x22c55e, label: `Stock receipt approved ${receipt.id}`,
          fields: [
            { name: "Receipt", value: webhookText(receipt.id), inline: true },
            { name: "PO", value: webhookText(receipt.poId || "—"), inline: true },
            { name: "Supplier", value: webhookText(receipt.supplier), inline: true },
            { name: "Units Posted", value: webhookText(totalReceived), inline: true },
            { name: "PO Status", value: webhookText(po?.status || "—"), inline: true },
          ],
        }));
        return json({ ok: true, receipt, po });
        });
      }

      if (url.pathname === "/api/reports") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!profile.customPermissions?.view?.includes("reports") && !["Superadmin", "CEO"].includes(profile.role)) throw new Error("You do not have permission to view reports");
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=not.in.${encodeURIComponent(postgrestIn(GAME_MODULES))}&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(filterRecordsForProfile(rows, profile, "view"));
        return json({ reports: generateReportsFromState(state, url.searchParams.get("branch") || "all") });
      }

      if (url.pathname === "/api/printables/invoice") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "sales", "view")) throw new Error("You do not have permission to print invoices");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Invoice ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=in.${encodeURIComponent(postgrestIn(["sales", "clients", "invoiceApprovals", "printTemplates"]))}&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const sale = (state.sales || []).find((/** @type {any} */ item) => item.id === id || item.documentNo === id);
        if (!sale || !printableBranchAllowed(profile, sale)) return json({ error: "Invoice not found" }, { status: 404 });
        const type = documentType(sale.type);
        const customTemplate = (state.printTemplates || []).find((/** @type {any} */ t) => t.type === type) || null;
        const useCustom = url.searchParams.get("template") === "custom" && customTemplate;
        return json({
          id: sale.id,
          documentNo: sale.documentNo || sale.id,
          type,
          title: `Print ${type} ${sale.documentNo || sale.id}`,
          description: url.searchParams.get("noDate") === "1" ? "Server-rendered data-only overlay without date. Load the physical template in the printer before printing." : "Server-rendered data-only overlay for the pre-printed form. Load the physical template in the printer before printing.",
          hasCustomTemplate: Boolean(customTemplate),
          html: printableInvoiceHtml({ sale, client: (state.clients || []).find((/** @type {Client} */ client) => client.name === sale.client) || {}, approvals: state.invoiceApprovals || {}, preparedBy: profile.name || "System User", noDate: url.searchParams.get("noDate") === "1", templateOverrides: useCustom ? customTemplate : null }),
        });
      }

      if (url.pathname === "/api/printables/payment-request") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "paymentRequests", "view")) throw new Error("You do not have permission to print payment requests");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Payment request ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.paymentRequests&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const requestRecord = (state.paymentRequests || []).find((/** @type {any} */ item) => item.cvNo === id || item.id === id);
        if (!requestRecord) return json({ error: "Payment request not found" }, { status: 404 });
        return json({ id: requestRecord.cvNo || requestRecord.id, title: requestRecord.cvNo || requestRecord.id, html: paymentRequestPrintableHtml(requestRecord) });
      }

      if (url.pathname === "/api/printables/transfer") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "pendingTransfers", "view")) throw new Error("You do not have permission to print transfer requests");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Transfer ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.pendingTransfers&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const transfer = (state.pendingTransfers || []).find((/** @type {any} */ item) => item.id === id);
        if (!transfer) return json({ error: "Transfer request not found" }, { status: 404 });
        return json({ id: transfer.id, title: `Transfer Request ${transfer.id}`, description: `${transfer.from} to ${transfer.to} · ${transfer.status || "-"}`, html: transferRequestPrintableHtml(transfer) });
      }

      if (url.pathname === "/api/printables/inventory-po") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "inventoryPurchaseOrders", "view")) throw new Error("You do not have permission to print inventory purchase orders");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Inventory PO ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.inventoryPurchaseOrders&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const po = (state.inventoryPurchaseOrders || []).find((/** @type {any} */ item) => item.id === id);
        if (!po) return json({ error: "Inventory PO not found" }, { status: 404 });
        return json({ id: po.id, title: `Purchase Order ${po.id}`, description: `${po.supplier} · Terms ${po.terms || 30} days`, html: inventoryPoPrintableHtml(po) });
      }

      if (url.pathname === "/api/printables/product-issue") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "productIssues", "view")) throw new Error("You do not have permission to print support reports");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Report ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.productIssues&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const report = (state.productIssues || []).find((/** @type {any} */ item) => item.id === id);
        if (!report) return json({ error: "Support report not found" }, { status: 404 });
        return json({ id: report.id, title: `Technical Support Report ${report.id}`, description: `${report.companyName || "Client"} · ${report.status || "Open"}`, html: productIssuePrintableHtml(report) });
      }

      if (url.pathname === "/api/printables/financial-request") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        const type = String(url.searchParams.get("type") || "").trim();
        const key = type === "payable" ? "payables" : type === "expense" ? "replenishments" : "";
        if (!key) return json({ error: "Invalid financial request type" }, { status: 400 });
        if (!canAccessKey(profile, key, "view")) throw new Error("You do not have permission to print this request");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Request ID is required" }, { status: 400 });
        const rows = await supabaseFetchAll(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.${encodeURIComponent(key)}&select=module_name,record_key,data&order=updated_at.asc`);
        /** @type {Record<string, any>} */
        const state = stateFromRecords(rows);
        const record = (state[key] || []).find((/** @type {any} */ item) => item.id === id);
        if (!record) return json({ error: "Request not found" }, { status: 404 });
        const titleType = type === "payable" ? "Payable" : "Expense";
        return json({ id: record.id, title: `${titleType} Request ${record.id}`, description: `${record.supplier || record.requester || "Request"} · ${money(record.amount)}`, html: financialRequestPrintableHtml(record, type) });
      }

      if (url.pathname === "/api/users") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        requireUserAdmin(profile);
        const [profiles, permissions, authPayload] = await Promise.all([
          supabaseFetch(env, "/rest/v1/profiles?select=*"),
          supabaseFetch(env, "/rest/v1/module_permissions?select=user_id,module_key,can_view,can_edit"),
          supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000").catch(() => ({ users: [] })),
        ]);
        const authUsers = authPayload.users || [];
        const profileById = new Map(profiles.map((/** @type {any} */ item) => [item.id, item]));
        const authById = new Map(authUsers.map((/** @type {any} */ item) => [item.id, item]));
        const permissionByUser = permissions.reduce((/** @type {any} */ map, /** @type {any} */ item) => {
          map.set(item.user_id, [...(map.get(item.user_id) || []), item]);
          return map;
        }, new Map());
        const ids = new Set([...profileById.keys(), ...authById.keys()]);
        const users = [...ids].map((id) => userFromProfileAndAuth(profileById.get(id), authById.get(id), permissionByUser.get(id) || []));
        return json({ users: users.sort((a, b) => String(a.email || a.name).localeCompare(String(b.email || b.name))) });
      }

      if (url.pathname === "/api/users/invite") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const body = await request.json();
        const email = cleanEmail(body.email);
        const fullName = String(body.name || "").trim();
        const role = String(body.role || "").trim();
        const branch = "all";
        const view = Array.isArray(body.modules) ? body.modules.filter(Boolean) : roleModules[/** @type {AppRole} */ (role)] || [];
        const edit = Array.isArray(body.editModules) ? body.editModules.filter((/** @type {any} */ module) => view.includes(module)) : view;
        if (!fullName) return json({ error: "Name is required" }, { status: 400 });
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (!validRole(role)) return json({ error: "Invalid role" }, { status: 400 });
        const existingProfiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
        const existingAuthUser = await findAuthUserForProfileOrEmail(env, existingProfiles[0], email);

        if (existingProfiles.length && existingAuthUser && userStatusFromAuth(existingAuthUser) === "Active") {
          // A real, fully-registered user already exists: return it as-is instead of re-inviting.
          const existingPermissions = await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(existingProfiles[0].id)}&select=user_id,module_key,can_view,can_edit`);
          const existingUser = userFromProfileAndAuth(existingProfiles[0], existingAuthUser, existingPermissions);
          return json({ user: existingUser, existing: true, emailDelivery: { sent: false, reason: "User profile already exists" } });
        }

        if (existingProfiles.length && !existingAuthUser) {
          // Orphaned profile row left over from a deletion that only removed the Supabase Auth
          // account (e.g. deleted directly in the Supabase dashboard instead of through this app).
          // Clean it up so the invite below can create a fresh, consistent account for this email.
          await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(existingProfiles[0].id)}`, { method: "DELETE" }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(existingProfiles[0].id)}`, { method: "DELETE" }).catch(() => null);
        }

        let authUser = existingAuthUser;
        let actionLink = "";
        let linkError = "";
        if (!authUser) {
          const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch, origin: requestOrigin(request) });
          authUser = generated.authUser;
          actionLink = generated.actionLink;
          linkError = generated.linkError || "";
        } else {
          const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch, origin: requestOrigin(request) }).catch((error) => ({ _error: error.message }));
          authUser = generated?.authUser || authUser;
          actionLink = generated?.actionLink || "";
          linkError = generated?._error || generated?.linkError || "";
        }
        if (!authUser?.id) throw new Error("Could not create or find the Supabase user account");

        if (authUser.banned_until) {
          // Re-inviting a previously disabled/archived account must lift the ban — otherwise the
          // invite link works but the account still can't sign in afterward.
          await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
            method: "PUT",
            body: JSON.stringify({ ban_duration: "none", user_metadata: { ...(authUser.user_metadata || {}), disabled_reason: "", disabled_at: "" } }),
          });
          authUser = { ...authUser, banned_until: null };
        }

        await supabaseFetch(env, "/rest/v1/profiles?on_conflict=id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ id: authUser.id, email, full_name: fullName, role, branch, is_superadmin: role === "Superadmin" }),
        });
        await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(authUser.id)}`, { method: "DELETE" }).catch(() => null);
        if (view.length) {
          await supabaseFetch(env, "/rest/v1/module_permissions", {
            method: "POST",
            body: JSON.stringify(view.map((/** @type {any} */ moduleKey) => ({ user_id: authUser.id, module_key: moduleKey, can_view: true, can_edit: edit.includes(moduleKey) }))),
          });
        }
        const emailDelivery = actionLink ? await sendResendEmail(env, { to: email, subject: "Welcome to Medlane OS - activate your account", html: brandedInviteEmailHtml({ fullName, email, role, actionLink: wrapAuthActionLink(actionLink, requestOrigin(request)), origin: requestOrigin(request) }) }).catch((error) => ({ sent: false, reason: error.message })) : { sent: false, reason: linkError ? `Invitation link could not be generated: ${linkError}` : "Invitation link could not be generated" };
        return json({ user: { id: authUser.id, name: fullName, email, role, branch, modules: view, customPermissions: { enabled: true, view, edit }, superadminPermissions: role === "Superadmin", access: `${role} with ${view.length} view / ${edit.length} edit modules`, inviteStatus: emailDelivery.sent ? "Invited" : "Email Not Sent" }, emailDelivery }, { status: 201 });
      }

      if (url.pathname === "/api/users/invite/resend") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const { actionLink, fullName, role } = await resolveInviteLink(env, email, requestOrigin(request));
        const emailDelivery = await sendResendEmail(env, { to: email, subject: "Your Medlane OS invitation link", html: brandedInviteEmailHtml({ fullName, email, role, actionLink: wrapAuthActionLink(actionLink, requestOrigin(request)), origin: requestOrigin(request) }) }).catch((error) => ({ sent: false, reason: error.message }));
        return json({ ok: true, emailDelivery });
      }

      if (url.pathname === "/api/users/invite/link") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const { actionLink } = await resolveInviteLink(env, email, requestOrigin(request));
        return json({ actionLink });
      }

      if (url.pathname === "/api/users/set-password") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, password } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const policyError = passwordPolicyError(password);
        if (policyError) return json({ error: policyError }, { status: 400 });
        const target = await findAuthUserByEmail(env, email);
        if (!target?.id) return json({ error: "Supabase Auth user not found" }, { status: 404 });
        await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, {
          method: "PUT",
          body: JSON.stringify({ password, email_confirm: true }),
        });
        return json({ ok: true });
      }

      if (url.pathname === "/api/users/status") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, disabled, reason = "" } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot disable your own account" }, { status: 400 });
        if (disabled && !String(reason).trim()) return json({ error: "Disable reason is required" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`);
        const authPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000");
        const target = await findAuthUserForProfileOrEmail(env, profiles[0], email) || (authPayload.users || []).find((/** @type {any} */ user) => cleanEmail(user.email) === email);
        if (!target?.id) return json({ error: "Supabase Auth user not found" }, { status: 404 });
        await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, {
          method: "PUT",
          body: JSON.stringify({ ban_duration: disabled ? "876000h" : "none", user_metadata: { ...(target.user_metadata || {}), disabled_reason: disabled ? String(reason).trim() : "", disabled_at: disabled ? new Date().toISOString() : "" } }),
        });
        return json({ ok: true, disabled: Boolean(disabled), reason: disabled ? String(reason).trim() : "" });
      }

      if (url.pathname === "/api/users/superadmin") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, granted } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot change your own Superadmin permission" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,role,base_role`);
        const target = profiles[0];
        if (!target) return json({ error: "User profile not found" }, { status: 404 });
        // Every permission gate in this app checks profiles.role directly, so granting
        // "Superadmin permissions" has to actually set role = 'Superadmin' (not just a
        // cosmetic flag) to have any real effect. base_role remembers what to restore
        // on revoke — it's part of the schema for exactly this, previously unused.
        if (granted) {
          if (target.role === "Superadmin") return json({ ok: true, granted: true, role: target.role });
          await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}`, {
            method: "PATCH",
            headers: { prefer: "return=minimal" },
            body: JSON.stringify({ role: "Superadmin", base_role: target.base_role || target.role, is_superadmin: true }),
          });
          // profileForUser() prefers any existing module_permissions rows over role
          // defaults, so a leftover custom permission set (from before this grant)
          // would keep the user capped at their old module list despite role =
          // Superadmin. Clear it so they fall back to the full Superadmin module set.
          await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(target.id)}`, { method: "DELETE" }).catch(() => null);
          ctx.waitUntil(writeAuditTrace(env, appStateKey(env), { actor: profile.name || profile.email, role: profile.role, action: "Role changed", module: "Users", record: email, changes: [{ field: "Role", from: auditValue(target.role), to: "Superadmin" }] }, authUser.id, auditContextForRequest(request)));
          return json({ ok: true, granted: true, role: "Superadmin" });
        }
        const superadmins = await supabaseFetch(env, `/rest/v1/profiles?role=eq.Superadmin&select=id`);
        if (target.role === "Superadmin" && superadmins.length <= 1) return json({ error: "At least one Superadmin must remain" }, { status: 400 });
        const restoredRole = target.base_role || "Admin";
        await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ role: restoredRole, base_role: null, is_superadmin: false }),
        });
        ctx.waitUntil(writeAuditTrace(env, appStateKey(env), { actor: profile.name || profile.email, role: profile.role, action: "Role changed", module: "Users", record: email, changes: [{ field: "Role", from: auditValue(target.role), to: restoredRole }] }, authUser.id, auditContextForRequest(request)));
        return json({ ok: true, granted: false, role: restoredRole });
      }

      if (url.pathname === "/api/users/reset-permissions") {
        const { authUser: actingUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
        const target = profiles[0];
        if (!target) return json({ error: "User profile not found" }, { status: 404 });
        // userFromProfileAndAuth() prefers any existing module_permissions rows over the
        // role's current default module list, so a row set saved at invite time never
        // picks up a module added to the role later (see roleModules). Clearing those rows
        // is how a user falls back onto the live role defaults — same trick already used
        // by the Superadmin grant above.
        const priorModules = await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(target.id)}&select=module_key,can_view`).catch(() => []);
        await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(target.id)}`, { method: "DELETE" }).catch(() => null);
        ctx.waitUntil(writeAuditTrace(env, appStateKey(env), { actor: profile.name || profile.email, role: profile.role, action: "Reset user permissions to role defaults", module: "Users", record: `${email} · ${target.role}`, changes: [{ field: "Modules", from: priorModules.length ? auditValue(priorModules.filter((/** @type {{ module_key: string, can_view: boolean }} */ m) => m.can_view).map((/** @type {{ module_key: string, can_view: boolean }} */ m) => m.module_key).join(", ")) : "Role defaults", to: "Role defaults" }] }, actingUser.id, auditContextForRequest(request)));
        const authUser = await findAuthUserForProfileOrEmail(env, target, email);
        const updatedUser = userFromProfileAndAuth(target, authUser, []);
        return json({ user: updatedUser });
      }

      if (url.pathname === "/api/users/delete") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, confirmation } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot delete your own account" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
        const authPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000");
        const target = await findAuthUserForProfileOrEmail(env, profiles[0], email) || (authPayload.users || []).find((/** @type {any} */ user) => cleanEmail(user.email) === email);
        const fullName = userDisplayName(profiles[0], target, email);
        if (String(confirmation || "").trim() !== fullName) return json({ error: `Type the user's full name exactly: ${fullName}` }, { status: 400 });
        const userId = profiles[0]?.id || target?.id;
        const blockers = await userDeleteBlockers(env, { id: userId, email, name: fullName });
        if (blockers.length) return json({ error: `Cannot delete user with active or linked records: ${blockers.join(", ")}` }, { status: 409 });
        // app_state/app_records/file_objects keep a nullable "who last touched this"
        // reference to profiles.id. Deleting the profile (directly, or via cascade from
        // the Auth admin delete below) fails on that foreign key unless those references
        // are cleared first — the audit rows themselves are preserved, just detached.
        if (userId) {
          await supabaseFetch(env, `/rest/v1/app_state?updated_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ updated_by: null }) }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/app_records?updated_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ updated_by: null }) }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/file_objects?uploaded_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ uploaded_by: null }) }).catch(() => null);
        }
        // Delete the Supabase Auth account first so failures here are not silently
        // hidden. If this throws, the profile/permissions rows are left intact so
        // the delete can be retried, and the frontend surfaces a real error instead
        // of reporting success while the Auth user (and its email) stays registered.
        if (target?.id) {
          await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, { method: "DELETE" });
        }
        if (userId) await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
        if (profiles[0]?.id) await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(profiles[0].id)}`, { method: "DELETE" }).catch(() => null);
        return json({ ok: true });
      }

      if (url.pathname === "/api/users/sessions") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        requireUserAdmin(profile);
        let userId = String(url.searchParams.get("userId") || "").trim();
        const email = cleanEmail(url.searchParams.get("email"));
        if (!userId && email) {
          const matches = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`);
          userId = matches[0]?.id || "";
        }
        if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ sessions: [], user: null });
        const rows = await supabaseFetch(env, `/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,device_name,browser,ip_address,created_at,last_seen_at,revoked_at&order=last_seen_at.desc`);
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role`);
        return json({ user: profiles[0] || null, sessions: rows.map((/** @type {any} */ row) => ({ ...row, profile: profiles[0] || null })) });
      }

      if (url.pathname === "/api/users/sessions/revoke") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { sessionId } = await request.json();
        if (!/^[0-9a-f-]{36}$/i.test(String(sessionId || ""))) return json({ error: "Invalid session id" }, { status: 400 });
        await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_by: authUser.id }),
        });
        return json({ ok: true });
      }

      if (url.pathname === "/api/backups") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/backup_runs?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=id,backup_type,mode,object_key,records_count,size_bytes,since_at,created_at&order=created_at.desc&limit=100`);
          return json({ backups: rows });
        }
        if (request.method === "POST") {
          const { backupType = "manual" } = await request.json().catch(() => ({}));
          if (!["manual", "weekly", "monthly", "yearly"].includes(backupType)) return json({ error: "Invalid backup type" }, { status: 400 });
          const backup = await createBackup(env, backupType, authUser.id);
          return json({ backup }, { status: 201 });
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/perf/run" && request.method === "POST") {
        const { profile } = await authenticatedProfile(request, env);
        requireDigestAdmin(profile);
        const { action = "report", force = false, testSend = true } = await request.json().catch(() => ({}));
        if (action === "sample") {
          if (!hasAccessToken(env)) return json({ error: "SUPABASE_ACCESS_TOKEN is not set on the Worker" }, { status: 400 });
          const sample = await runPerfSampler(env);
          return json({ ok: true, errors: sample?.errors || {}, sections: Object.keys(sample || {}).filter((k) => !["t", "errors"].includes(k)) });
        }
        if (action !== "report") return json({ error: "Invalid action" }, { status: 400 });
        // Default is a test send to the caller only; testSend:false sends to all Superadmin/CEO.
        const result = await runWeeklyPerfReport(env, { force: Boolean(force), onlyTo: testSend === false ? "" : profile.email });
        return json({ ok: true, ...result, testSend: testSend !== false });
      }

      if (url.pathname === "/api/digest/run" && request.method === "POST") {
        const { profile } = await authenticatedProfile(request, env);
        requireDigestAdmin(profile);
        const { periodLabel = "Daily", force = false } = await request.json().catch(() => ({}));
        if (!["Daily", "Weekly"].includes(periodLabel)) return json({ error: "Invalid periodLabel" }, { status: 400 });
        // Default run is idempotent per Manila day (a scheduled retry won't double-send); pass
        // force:true to wipe that ledger and deliberately resend this period to everyone.
        //
        // Not forced: shares the SAME claimAutomationPeriod lock (jobKey + dayKey) the 18:00
        // scheduled run uses, so a manual click that lands while the scheduled run is still
        // in-flight is held off instead of racing it — composeAndSendDigest's own ledger check
        // only catches ALREADY-saved recipients, not ones the other run is mid-way through
        // sending to, which is what let some roles receive the daily digest twice.
        const jobKey = periodLabel === "Weekly" ? "weekly-digest" : "daily-digest";
        const { dayKey } = manilaPeriodKeys(manilaScheduleParts(Date.now()));
        const runJob = () => (periodLabel === "Weekly" ? runWeeklyDigest(env, { force: Boolean(force) }) : runDailyDigest(env, { force: Boolean(force) }));
        const result = force ? await runJob() : await runOncePerPeriod(env, jobKey, dayKey, runJob);
        if (!force && result === null) return json({ ok: true, skipped: true, reason: "Already sent or currently in progress for this period — use force to resend.", recipients: 0, sent: 0, discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL), discord: { sent: false, reason: "Skipped — digest already ran for this period" } });
        return json({ ok: true, forced: Boolean(force), recipients: result?.recipients ?? null, sent: result?.sent ?? null, discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL), discord: result?.discord || { sent: false, reason: "Unknown" } });
      }

      // Bypasses the once-per-day cron lock entirely (unlike /api/digest/run's force flag,
      // which just wipes a ledger) — this always fires immediately so an admin can confirm
      // DISCORD_BIRTHDAY_WEBHOOK_URL works right after setting it, without waiting for 08:00
      // Manila or a real birthday.
      if (url.pathname === "/api/discord/birthday-test" && request.method === "POST") {
        const { profile } = await authenticatedProfile(request, env);
        requireDigestAdmin(profile);
        try {
          const result = await runBirthdayGreetings(env, { force: true });
          return json({ ok: true, ...result });
        } catch (/** @type {any} */ error) {
          return json({ ok: false, error: error.message }, { status: 502 });
        }
      }

      if (url.pathname === "/api/backups/status" && request.method === "GET") {
        await authenticatedProfile(request, env);
        if (env.ENVIRONMENT !== "production") return json({ latest: null, ageHours: null, stale: true, message: "Backups are disabled outside production" });
        const status = await backupStatus(env);
        return json(status);
      }

      if (url.pathname === "/api/backups/objects" && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const prefix = `backups/${appStateKey(env)}/`;
        const cursor = url.searchParams.get("cursor") || undefined;
        const listed = await env.DOCUMENTS_BUCKET.list({ prefix, cursor, limit: 100 });
        return json({ objects: listed.objects.map((/** @type {any} */ object) => ({ key: object.key, size: object.size, uploaded: object.uploaded, customMetadata: object.customMetadata || {} })), cursor: listed.truncated ? listed.cursor : null, truncated: listed.truncated });
      }

      if (url.pathname === "/api/backups/object" && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const key = String(url.searchParams.get("key") || "");
        const prefix = `backups/${appStateKey(env)}/`;
        if (!key.startsWith(prefix) || !key.endsWith(".json.gz")) return json({ error: "Invalid backup object key" }, { status: 400 });
        const object = await env.DOCUMENTS_BUCKET.get(key);
        if (!object) return json({ error: "Backup object not found" }, { status: 404 });
        return new Response(object.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${safeFileName(key.split("/").pop() || "medlane-backup.json.gz")}"`, "cache-control": "private, max-age=60" } });
      }

      if (url.pathname === "/api/backups/restore" && request.method === "POST") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Restore is disabled outside production" }, { status: 403 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        const body = await request.json().catch(() => ({}));
        let key = String(body.key || "");
        if (!key && body.id) {
          const rows = await supabaseFetch(env, `/rest/v1/backup_runs?id=eq.${encodeURIComponent(String(body.id))}&state_key=eq.${encodeURIComponent(appStateKey(env))}&select=object_key`);
          key = rows[0]?.object_key || "";
        }
        if (!key) return json({ error: "Backup object key is required" }, { status: 400 });
        const result = await restoreBackupObject(env, key, authUser.id, auditContextForRequest(request));
        return json({ ok: true, restore: result });
      }

      if (url.pathname.startsWith("/api/backups/") && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const rows = await supabaseFetch(env, `/rest/v1/backup_runs?id=eq.${encodeURIComponent(id)}&state_key=eq.${encodeURIComponent(appStateKey(env))}&select=*`);
        if (!rows[0]) return json({ error: "Backup not found" }, { status: 404 });
        const object = await env.DOCUMENTS_BUCKET.get(rows[0].object_key);
        if (!object) return json({ error: "Backup object not found" }, { status: 404 });
        return new Response(object.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="medlane-${rows[0].backup_type}-${rows[0].created_at.slice(0, 10)}.json.gz"`, "cache-control": "private, max-age=60" } });
      }

      if (url.pathname === "/api/storage/usage") {
        if (request.method !== "GET") return methodNotAllowed();
        await authenticatedProfile(request, env);
        const maxBytes = Number(env.MAX_R2_BYTES || 536870912000);
        const metadataBytes = await activeMetadataUsage(env);
        const usage = metadataBytes === null ? await storageUsage(env) : { configured: true, usedBytes: metadataBytes, objectCount: null, truncated: false };
        return json({ ...usage, maxBytes, remainingBytes: Math.max(maxBytes - usage.usedBytes, 0) });
      }

      if (url.pathname === "/api/files") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, "/rest/v1/file_objects?deleted_at=is.null&select=*&order=uploaded_at.desc");
          const visible = rows.filter((/** @type {any} */ row) => canAccessKey(profile, fileRecordTypeKey[row.record_type], "view"));
          return json({ files: visible });
        }
        if (request.method !== "POST") return methodNotAllowed();
        requireWriteAccess(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "File is required" }, { status: 400 });
        const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 26214400);
        if (file.size > maxUploadBytes) return json({ error: `File is too large. Max upload is ${Math.floor(maxUploadBytes / 1048576)} MB.` }, { status: 413 });
        const maxBytes = Number(env.MAX_R2_BYTES || 536870912000);
        const recordType = String(form.get("recordType") || "general");
        const recordId = String(form.get("recordId") || "");
        const objectKey = objectKeyFor(file.name, recordType);
        await reserveStorage(env, file.size);
        let inserted;
        try {
          await env.DOCUMENTS_BUCKET.put(objectKey, file.stream(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
            customMetadata: { uploadedBy: authUser.id, recordType, recordId },
          });
          inserted = await supabaseFetch(env, "/rest/v1/file_objects?select=*", {
            method: "POST",
            headers: { prefer: "return=representation" },
            body: JSON.stringify({ bucket: env.R2_BUCKET_NAME || "medlane-documents", object_key: objectKey, file_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size, record_type: recordType, record_id: recordId || null, uploaded_by: authUser.id }),
          });
        } catch (/** @type {any} */ error) {
          await releaseStorage(env, file.size).catch(() => null);
          await env.DOCUMENTS_BUCKET.delete(objectKey).catch(() => null);
          throw error;
        }
        return json({ file: inserted[0] }, { status: 201 });
      }

      if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const rows = await supabaseFetch(env, `/rest/v1/file_objects?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*`);
        if (!rows[0]) return json({ error: "File not found" }, { status: 404 });
        if (!canAccessKey(profile, fileRecordTypeKey[rows[0].record_type], "view")) throw new Error("You do not have permission to access this file");
        const object = await env.DOCUMENTS_BUCKET.get(rows[0].object_key);
        if (!object) return json({ error: "R2 object not found" }, { status: 404 });
        // Stored MIME type is client-declared, so only a short list of passive types is ever served
// inline; anything else (html, svg, js...) is forced to download as opaque bytes. nosniff + a
// sandboxing CSP keep even an inline file from running script in the app origin.
        const inlineSafe = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i.test(String(rows[0].mime_type || ""));
        return new Response(object.body, { headers: { "content-type": inlineSafe ? rows[0].mime_type : "application/octet-stream", "content-disposition": `${inlineSafe ? "inline" : "attachment"}; filename="${safeFileName(rows[0].file_name)}"`, "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'", "cache-control": `private, max-age=${Number(env.DOWNLOAD_CACHE_SECONDS || 300)}` } });
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, { status: 404 });
      }

      if (["/", "/index.html", "/login", "/login/", "/dashboard", "/dashboard/"].includes(url.pathname) || url.pathname.toLowerCase().endsWith(".mp3")) {
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        headers.set("cache-control", "no-cache, must-revalidate");
        const page = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        return /text\/html/i.test(headers.get("content-type") || "") ? stampAssetUrls(page, env) : page;
      }

      return env.ASSETS.fetch(request);
    } catch (/** @type {any} */ error) {
      console.error(JSON.stringify({ message: error.message, path: url.pathname }));
      const status = /Authentication required|Invalid or expired|Invalid app session|SESSION_REVOKED|SESSION_EXPIRED_12H/.test(error.message) ? 401 : /No Medlane profile|permission|^Only |cannot approve/.test(error.message) ? 403 : /can no longer be edited|already in use|Duplicate/.test(error.message) ? 409 : /^Invoice [^:]+: |^Calendar event|calendar events as yourself|^Stock changed:/.test(error.message) ? 422 : /^Stock is busy/.test(error.message) ? 503 : /MEMO_NOT_FOUND/.test(error.message) ? 404 : /APP_STATE_CONFLICT/.test(error.message) ? 409 : /STORAGE_LIMIT_REACHED/.test(error.message) ? 409 : 500;
      return json({ error: error.message || "Server error" }, { status });
    }
  },
};

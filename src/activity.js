// User activity log rules, shared by the Worker and the tests. Pure functions only.
//
// Every audit entry the app writes (app_records "logs") is also appended to activity_log, a
// table the database itself keeps append-only (no UPDATE / DELETE / TRUNCATE for anyone). Each row
// carries the entry plus what the page filters on: the kind of action, and why it's flagged.

/** @typedef {"signin" | "created" | "edited" | "approved" | "voided" | "stock" | "exported" | "access" | "other"} ActivityKind */
/** @typedef {{ knownDevice?: boolean | null, recentFailures?: number }} FlagContext */

export const ACTIVITY_KIND_LABELS = /** @type {Record<ActivityKind, string>} */ ({
  signin: "Sign-in", created: "Created", edited: "Edited", approved: "Approved", voided: "Voided", stock: "Stock", exported: "Exported", access: "Access", other: "Other",
});
export const ACTIVITY_TABS = /** @type {const} */ (["all", "changes", "approvals", "signins", "exports", "flagged"]);
export const ACTIVITY_TAB_LABELS = { all: "All activity", changes: "Changes", approvals: "Approvals", signins: "Sign-ins", exports: "Exports & access", flagged: "Flagged" };
/** Which kinds each tab shows (Flagged is by flag, not kind). */
export const ACTIVITY_TAB_KINDS = /** @type {Record<string, ActivityKind[]>} */ ({
  changes: ["created", "edited", "voided", "stock"], approvals: ["approved"], signins: ["signin"], exports: ["exported", "access"],
});
export const FAILED_SIGNIN_WINDOW_MS = 15 * 60 * 1000;
export const FAILED_SIGNIN_THRESHOLD = 3;

/** @param {any} entry */
export function isSignIn(entry) {
  return entry?.event === "signin" || entry?.event === "signin-failed" || /^(logged in|signed in|failed sign-in)$/i.test(String(entry?.action || ""));
}
/** @param {any} entry */
export function isFailedSignIn(entry) {
  return entry?.event === "signin-failed" || /^failed sign-in$/i.test(String(entry?.action || ""));
}

/** The Action pill: what kind of thing happened. Order matters (a cancelled export is a void). @param {any} entry @returns {ActivityKind} */
export function activityKind(entry) {
  const action = String(entry?.action || "");
  const module = String(entry?.module || "");
  if (isSignIn(entry)) return "signin";
  if (/\b(void|voided|cancel|cancelled|canceled|cancellation)\b/i.test(action)) return "voided";
  if (/\b(export|exported|download|downloaded)\b/i.test(action)) return "exported";
  if (/\b(approv|approved|approve|rejected|reject|returned for)/i.test(action)) return "approved";
  if (/role|permission|password|invite|session|signed out|log ?out|device|disabled user|enabled user|archived user|deactivated|reactivated|superadmin|preview/i.test(action)) return "access";
  if (/stock|received|receiving|transfer|adjust|dispos|count/i.test(action) || (/inventory/i.test(module) && /edited|changed|updated/i.test(action))) return "stock";
  if (/^(created|added|submitted|new|posted|uploaded|recorded|issued|raised)\b/i.test(action)) return "created";
  if ((Array.isArray(entry?.changes) && entry.changes.length) || /edit|updat|chang|saved|set |renam|moved|marked/i.test(action)) return "edited";
  return "other";
}

const REASON_FIELD = /^reason$/i;
const EMPTY_REASON = new Set(["", "—", "-", "(none)", "none", "n/a"]);
const CLIENT_OR_FINANCIAL = /client|customer|masterlist|financial|receivable|\bar\b|collection|sales|invoice|payable|expense|payment|cheque|bank|ledger|statement|aging|revenue|report/i;

/**
 * Why an entry is flagged, or "" when it isn't.
 * - a sign-in from a device or browser this person hasn't signed in from before (when there is
 *   earlier history to compare with);
 * - the 3rd and later failed sign-in for one account within 15 minutes;
 * - voids and cancellations;
 * - stock adjustments without a reason;
 * - exports of client or financial lists (confirmed 18 Nov 2026).
 * @param {any} entry @param {FlagContext} [context]
 */
export function flagReason(entry, context = {}) {
  const kind = activityKind(entry);
  if (kind === "signin") {
    if (isFailedSignIn(entry)) {
      const n = Number(context.recentFailures || 0);
      return n >= FAILED_SIGNIN_THRESHOLD ? `${n} failed sign-ins for this account within 15 minutes.` : "";
    }
    if (context.knownDevice === false) return `Signed in from a new device or browser (${[entry.browser, entry.device].filter(Boolean).join(" on ") || "unknown device"}).`;
    return "";
  }
  if (kind === "voided") return "Void or cancellation — check it was intended.";
  if (kind === "stock" && /adjust|edited stock|stock edit|qty|quantity|corrected/i.test(String(entry.action || ""))) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const reason = changes.find((/** @type {any} */ change) => REASON_FIELD.test(String(change?.field || "")));
    const given = String(entry.reason ?? reason?.to ?? "").trim().toLowerCase();
    if (EMPTY_REASON.has(given)) return "Stock adjusted without a reason.";
    return "";
  }
  if (kind === "exported" && CLIENT_OR_FINANCIAL.test(`${entry.action || ""} ${entry.module || ""} ${entry.record || ""}`)) return "Export of a client or financial list.";
  return "";
}

/**
 * The activity_log row for one audit entry (an app_records "logs" row).
 * @param {{ record_key: string, state_key: string, data: any, updated_by?: string | null, updated_at?: string }} source
 * @param {FlagContext} [context] @param {Date} [now]
 */
export function activityRow(source, context = {}, now = new Date()) {
  const entry = source.data && typeof source.data === "object" ? source.data : {};
  const at = Date.parse(String(entry.serverCapturedAt || source.updated_at || ""));
  const text = (/** @type {unknown} */ value, max = 300) => String(value ?? "").slice(0, max);
  return {
    source_key: text(source.record_key, 200),
    state_key: text(source.state_key, 100),
    created_at: new Date(Number.isFinite(at) ? at : now.getTime()).toISOString(),
    user_id: source.updated_by || null,
    actor: text(entry.user || "Unknown", 200),
    role: text(entry.role, 100),
    email: text(entry.email, 200).toLowerCase(),
    action: text(entry.action, 300),
    module: text(entry.module, 100),
    record: text(entry.record, 500),
    kind: activityKind(entry),
    flag_reason: flagReason(entry, context) || null,
    device: text(entry.device, 100),
    browser: text(entry.browser, 100),
    location: text(entry.location, 150),
    ip_address: text(entry.ipAddress, 100),
    data: entry,
  };
}

/**
 * Flags need history: replays entries oldest first, remembering each person's devices and recent
 * failed sign-ins (used for the one-time copy of older logs, and in the tests).
 * @param {{ record_key: string, state_key: string, data: any, updated_by?: string | null, updated_at?: string }[]} sources oldest first
 * @param {{ devices?: Map<string, Set<string>>, failures?: Map<string, number[]> }} [memory]
 */
export function activityRowsInOrder(sources, memory = {}) {
  const devices = memory.devices || new Map();
  const failures = memory.failures || new Map();
  return sources.map((source) => {
    const entry = source.data || {};
    /** @type {FlagContext} */
    const context = {};
    const at = Date.parse(String(entry.serverCapturedAt || source.updated_at || "")) || 0;
    if (isSignIn(entry)) {
      const who = String(source.updated_by || entry.email || entry.user || "").toLowerCase();
      if (isFailedSignIn(entry)) {
        const key = String(entry.email || entry.record || who).toLowerCase();
        const recent = (failures.get(key) || []).filter((/** @type {number} */ t) => at - t < FAILED_SIGNIN_WINDOW_MS);
        recent.push(at);
        failures.set(key, recent);
        context.recentFailures = recent.length;
      } else {
        const seen = devices.get(who);
        const device = deviceKey(entry);
        context.knownDevice = seen ? seen.has(device) : null;
        if (!seen) devices.set(who, new Set([device])); else seen.add(device);
      }
    }
    return activityRow(source, context);
  });
}

/** "Chrome|macOS" — what counts as the same device for the new-device flag. @param {any} entry */
export function deviceKey(entry) { return `${entry?.browser || "?"}|${entry?.device || "?"}`; }

// ---- Reading -------------------------------------------------------------------------------------

/** @param {string} tab @returns {(typeof ACTIVITY_TABS)[number]} */
export function activityTab(tab) { return /** @type {any} */ (ACTIVITY_TABS.includes(/** @type {any} */ (tab)) ? tab : "all"); }

/**
 * Whose activity this person may read. Superadmin: everyone. CEO: everyone, view-only. Everyone
 * else: only their own (their user id, plus failed sign-ins on their email).
 * @param {{ id: string, email?: string, role?: string }} profile
 * @returns {{ all: boolean, readOnly: boolean }}
 */
export function activityScope(profile) {
  if (profile?.role === "Superadmin") return { all: true, readOnly: false };
  if (profile?.role === "CEO") return { all: true, readOnly: true };
  return { all: false, readOnly: true };
}

/** Strips what PostgREST's or=() / ilike syntax would read as operators. @param {string} q */
export function activitySearchTerm(q) {
  return String(q || "").replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * PostgREST query string (no leading ?) for one page of activity_log.
 * @param {{ stateKey: string, profile: { id: string, email?: string, role?: string }, tab?: string, q?: string, user?: string, page?: number, size?: number, since?: string }} options
 */
export function activityQuery({ stateKey, profile, tab = "all", q = "", user = "", page = 1, size = 25, since = "" }) {
  const p = new URLSearchParams();
  p.set("state_key", `eq.${stateKey}`);
  const scope = activityScope(profile);
  /** @type {string[]} */
  const anyOf = [];
  if (!scope.all) {
    const mine = [`user_id.eq.${profile.id}`];
    // Quoted, so an email containing "," or ")" can't break out of this or=() group.
    if (profile.email) mine.push(`email.eq."${String(profile.email).toLowerCase().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    anyOf.push(mine.join(","));
  } else if (user) {
    p.set("actor", `eq.${user}`);
  }
  const active = activityTab(tab);
  if (active === "flagged") p.set("flag_reason", "not.is.null");
  else if (active !== "all") p.set("kind", `in.(${ACTIVITY_TAB_KINDS[active].join(",")})`);
  const term = activitySearchTerm(q);
  if (term) anyOf.push(`actor.ilike.*${term}*,action.ilike.*${term}*,record.ilike.*${term}*,module.ilike.*${term}*`);
  // Two "any of" groups must both hold: PostgREST takes that as and=(or(…),or(…)).
  if (anyOf.length === 1) p.set("or", `(${anyOf[0]})`);
  else if (anyOf.length > 1) p.set("and", `(${anyOf.map((group) => `or(${group})`).join(",")})`);
  if (since) p.set("created_at", `gte.${since}`);
  const pageSize = [10, 25, 50].includes(Number(size)) ? Number(size) : 25;
  const current = Math.max(1, Math.floor(Number(page) || 1));
  p.set("select", "id,created_at,user_id,actor,role,email,action,module,record,kind,flag_reason,device,browser,location,ip_address,data");
  p.set("order", "created_at.desc,id.desc");
  p.set("limit", String(pageSize));
  p.set("offset", String((current - 1) * pageSize));
  return { query: p.toString(), page: current, size: pageSize };
}

/** The page shape the browser gets. @param {any[]} rows @param {number | null} total @param {{ page: number, size: number }} paging */
export function activityPage(rows, total, { page, size }) {
  const count = total ?? rows.length;
  const pages = Math.max(1, Math.ceil(count / size));
  return {
    page, size, pages, total: count,
    items: rows.map((row) => ({
      id: String(row.id), at: row.created_at, user: row.actor, role: row.role, action: row.action, module: row.module, record: row.record,
      kind: row.kind, kindLabel: ACTIVITY_KIND_LABELS[/** @type {ActivityKind} */ (row.kind)] || "Other", flag: row.flag_reason || "",
      device: [row.browser, row.device].filter(Boolean).join(" on "), location: row.location || "", ip: row.ip_address || "",
      changes: Array.isArray(row.data?.changes) ? row.data.changes.slice(0, 60) : [],
    })),
  };
}

// Account settings rules shared by the Worker endpoints, the notification generator and the tests:
// per-user preferences (user_preferences) and notification settings (notification_settings).
// Pure functions only — no fetch, no env.

/** @typedef {"approvals" | "stock" | "money" | "service" | "recon" | "security"} AlertType */
/** @typedef {{ type: AlertType, label: string, sub: string, inApp: boolean, email: boolean, locked: boolean }} NotificationSetting */

/**
 * The alert types on Account settings → Notifications. `modules` are the module keys whose
 * alerts this type carries: a type is only offered (and only delivered) when the user can view
 * at least one of them. Security has none and is always shown, always on.
 * @type {{ type: AlertType, label: string, sub: string, modules: string[], email: boolean }[]}
 */
export const ALERT_TYPES = [
  { type: "approvals", label: "Approvals waiting for me", sub: "POs, bills, expenses and discounts", modules: ["purchase-orders", "payables", "replenishments", "inventory", "invoicing"], email: true },
  { type: "stock", label: "Stock alerts", sub: "Below reorder point, expiring or expired lots", modules: ["inventory", "item-forecast"], email: false },
  { type: "money", label: "Money alerts", sub: "Overdue bills, bounced checks, large payments", modules: ["collections", "payables", "receivables-tracker", "replenishments"], email: true },
  { type: "service", label: "Service tickets", sub: "New tickets and missed response times", modules: ["product-issues", "warranty"], email: false },
  { type: "recon", label: "Recon results", sub: "New differences after each run", modules: ["reconciliation"], email: false },
  { type: "security", label: "Security alerts", sub: "New sign-ins and password changes · always on", modules: [], email: true },
];
export const ALERT_TYPE_KEYS = ALERT_TYPES.map((item) => item.type);

/** Alert types the user can receive, given the modules they can view. @param {string[]} modules @returns {AlertType[]} */
export function alertTypesFor(modules) {
  const can = new Set(modules || []);
  return ALERT_TYPES.filter((item) => !item.modules.length || item.modules.some((key) => can.has(key))).map((item) => item.type);
}

/**
 * Effective settings for the alert types this user can receive. Missing rows use the defaults
 * (everything in-app; email only for approvals, money and security). Security is forced on.
 * @param {{ alert_type: string, in_app: boolean, email: boolean }[]} rows @param {string[]} modules
 * @returns {NotificationSetting[]}
 */
export function resolveNotificationSettings(rows, modules) {
  const saved = new Map((rows || []).map((row) => [row.alert_type, row]));
  const allowed = new Set(alertTypesFor(modules));
  return ALERT_TYPES.filter((item) => allowed.has(item.type)).map((item) => {
    const locked = item.type === "security";
    const row = saved.get(item.type);
    return {
      type: item.type, label: item.label, sub: item.sub, locked,
      inApp: locked ? true : row ? Boolean(row.in_app) : true,
      email: locked ? true : row ? Boolean(row.email) : item.email,
    };
  });
}

/** Validates one toggle from the settings matrix. Throws on a locked or unknown change. @param {any} body @param {string[]} modules */
export function notificationSettingPatch(body, modules) {
  const type = String(body?.type || "");
  const channel = String(body?.channel || "");
  if (!ALERT_TYPE_KEYS.includes(/** @type {AlertType} */ (type))) throw new Error("Unknown alert type");
  if (!["inApp", "email"].includes(channel)) throw new Error("Channel must be inApp or email");
  if (typeof body?.value !== "boolean") throw new Error("Value must be true or false");
  if (type === "security") throw new Error("Security alerts are always on");
  if (!alertTypesFor(modules).includes(/** @type {AlertType} */ (type))) throw new Error("Your role doesn't receive this alert type");
  return { type: /** @type {AlertType} */ (type), channel: /** @type {"inApp" | "email"} */ (channel), value: /** @type {boolean} */ (body.value) };
}

// ---- Delivery decisions ------------------------------------------------------------------------

/** "HH:MM" (or "HH:MM:SS") → minutes after midnight, or null. @param {unknown} value */
export function minutesOf(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const h = Number(match[1]); const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Minutes after midnight in Manila (the Worker runs in UTC). @param {Date} now */
export function manilaMinutes(now) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Manila" }).formatToParts(now);
  const get = (/** @type {string} */ type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
}

/** True inside [start, end) Manila time; handles windows that cross midnight (20:00–07:00). @param {Date} now @param {string} start @param {string} end */
export function inQuietHours(now, start, end) {
  const s = minutesOf(start); const e = minutesOf(end);
  if (s === null || e === null || s === e) return false;
  const t = manilaMinutes(now);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * What to deliver for one notification to one user.
 * - Nothing when the user's role can't receive this alert type at all.
 * - Security alerts: always in-app and email, quiet hours or not.
 * - Otherwise follow the switches; during quiet hours email waits unless the alert is urgent.
 * @param {{ type: AlertType, urgent?: boolean }} notice
 * @param {{ settings: NotificationSetting[], prefs: { quietHoursEnabled: boolean, quietStart: string, quietEnd: string } }} user
 * @param {Date} [now]
 * @returns {{ inApp: boolean, email: boolean, emailHeldForQuietHours: boolean }}
 */
export function deliveryFor(notice, user, now = new Date()) {
  const none = { inApp: false, email: false, emailHeldForQuietHours: false };
  if (notice.type === "security") return { inApp: true, email: true, emailHeldForQuietHours: false };
  const setting = user.settings.find((item) => item.type === notice.type);
  if (!setting) return none;
  const quiet = Boolean(user.prefs.quietHoursEnabled) && inQuietHours(now, user.prefs.quietStart, user.prefs.quietEnd);
  const held = setting.email && quiet && !notice.urgent;
  return { inApp: setting.inApp, email: setting.email && !held, emailHeldForQuietHours: held };
}

// ---- Preferences -------------------------------------------------------------------------------

export const WELCOME_MODES = ["daily", "every", "off"];
export const START_PAGES = ["dashboard", "inventory", "sales", "last"];
export const ROWS_PER_PAGE = [10, 25, 50];

/** Defaults for someone without a user_preferences row yet. */
export const PREFERENCE_DEFAULTS = Object.freeze({
  displayName: "", avatar: "", sound: true, welcome: "daily", startPage: "dashboard", rowsPerPage: 10,
  defaultBranch: "all", dailySummary: true, quietHoursEnabled: true, quietStart: "20:00", quietEnd: "07:00",
  passwordChangedAt: "",
});

/** user_preferences row (or nothing) → the camelCase object the browser gets. @param {any} row */
export function preferencesFromRow(row) {
  if (!row) return { ...PREFERENCE_DEFAULTS };
  const hhmm = (/** @type {unknown} */ value, /** @type {string} */ fallback) => { const m = minutesOf(value); return m === null ? fallback : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  return {
    displayName: String(row.display_name || ""),
    avatar: String(row.avatar_data || ""),
    sound: row.sound_enabled !== false,
    welcome: WELCOME_MODES.includes(row.welcome_mode) ? row.welcome_mode : PREFERENCE_DEFAULTS.welcome,
    startPage: START_PAGES.includes(row.start_page) ? row.start_page : PREFERENCE_DEFAULTS.startPage,
    rowsPerPage: ROWS_PER_PAGE.includes(Number(row.rows_per_page)) ? Number(row.rows_per_page) : PREFERENCE_DEFAULTS.rowsPerPage,
    defaultBranch: String(row.default_branch || "all"),
    dailySummary: row.daily_summary !== false,
    quietHoursEnabled: row.quiet_hours_enabled !== false,
    quietStart: hhmm(row.quiet_start, PREFERENCE_DEFAULTS.quietStart),
    quietEnd: hhmm(row.quiet_end, PREFERENCE_DEFAULTS.quietEnd),
    passwordChangedAt: row.password_changed_at ? String(row.password_changed_at) : "",
  };
}

const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const AVATAR_MAX_LENGTH = 120000;

/**
 * Validates a preferences change from the browser and returns the user_preferences columns to
 * write. Unknown keys are rejected so a typo can't silently do nothing.
 * @param {Record<string, unknown>} patch @param {{ branches: string[] | null }} context branches null = any name (the browser only offers real ones)
 */
export function preferencePatchColumns(patch, { branches }) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(patch || {})) {
    switch (key) {
      case "displayName": {
        const name = String(value ?? "").trim();
        if (name.length > 40) throw new Error("Display name can be at most 40 characters");
        out.display_name = name; break;
      }
      case "avatar": {
        const data = String(value ?? "");
        if (data && (!AVATAR_PATTERN.test(data) || data.length > AVATAR_MAX_LENGTH)) throw new Error("Photo must be a JPEG, PNG or WebP under 90 KB");
        out.avatar_data = data || null; break;
      }
      case "sound": case "dailySummary": case "quietHoursEnabled":
        if (typeof value !== "boolean") throw new Error(`${key} must be true or false`);
        out[{ sound: "sound_enabled", dailySummary: "daily_summary", quietHoursEnabled: "quiet_hours_enabled" }[key]] = value; break;
      case "welcome":
        if (!WELCOME_MODES.includes(String(value))) throw new Error("Welcome screen must be daily, every or off");
        out.welcome_mode = value; break;
      case "startPage":
        if (!START_PAGES.includes(String(value))) throw new Error("Unknown start page");
        out.start_page = value; break;
      case "rowsPerPage":
        if (!ROWS_PER_PAGE.includes(Number(value))) throw new Error("Rows per page must be 10, 25 or 50");
        out.rows_per_page = Number(value); break;
      case "defaultBranch": {
        const branch = String(value || "all");
        if (branch.length > 60 || (branch !== "all" && branches && !branches.includes(branch))) throw new Error("Unknown branch");
        out.default_branch = branch; break;
      }
      case "quietStart": case "quietEnd": {
        const m = minutesOf(value);
        if (m === null) throw new Error("Quiet hours must be a time like 20:00");
        out[key === "quietStart" ? "quiet_start" : "quiet_end"] = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; break;
      }
      default: throw new Error(`Unknown preference: ${key}`);
    }
  }
  if (!Object.keys(out).length) throw new Error("Nothing to save");
  return out;
}

/**
 * Philippine mobile number in a consistent "+63 9XX XXX XXXX" form, "" when blank, or null when
 * it isn't a PH mobile (accepts 09XX…, 9XX…, 639XX…, +63 9XX… with spaces/dashes).
 * @param {unknown} value
 */
export function normalizePhMobile(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^9\d{9}$/.test(digits)) return null;
  return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Validates the Profile tab's save. @param {any} body */
export function profilePatch(body) {
  const fullName = String(body?.fullName ?? "").trim().replace(/\s+/g, " ");
  if (!fullName) throw new Error("Full name is required");
  if (fullName.length > 80) throw new Error("Full name can be at most 80 characters");
  const phone = normalizePhMobile(body?.phone);
  if (phone === null) throw new Error("Enter a Philippine mobile number, e.g. 0917 123 4567");
  const displayName = String(body?.displayName ?? "").trim();
  if (displayName.length > 40) throw new Error("Display name can be at most 40 characters");
  return { fullName, phone, displayName };
}

// ---- Password age ------------------------------------------------------------------------------

export const PASSWORD_MAX_AGE_DAYS = 90;
export const PASSWORD_WARN_DAYS = 8;

/**
 * Days since the password was last changed and whether to warn (within 8 days of 90, or past).
 * Falls back to the account's creation when it has never been changed through the app.
 * @param {string | null | undefined} changedAt @param {string | null | undefined} fallback @param {Date} [now]
 */
export function passwordAge(changedAt, fallback, now = new Date()) {
  const from = changedAt || fallback;
  const time = from ? new Date(from).getTime() : NaN;
  if (!Number.isFinite(time)) return { days: null, dueInDays: null, status: /** @type {"ok" | "due-soon" | "overdue" | "unknown"} */ ("unknown") };
  const days = Math.max(0, Math.floor((now.getTime() - time) / 86400000));
  const dueInDays = PASSWORD_MAX_AGE_DAYS - days;
  const status = dueInDays <= 0 ? "overdue" : dueInDays <= PASSWORD_WARN_DAYS ? "due-soon" : "ok";
  return { days, dueInDays, status: /** @type {"ok" | "due-soon" | "overdue" | "unknown"} */ (status) };
}

/**
 * Whether the Welcome screen shows for this sign-in. "daily" skips it when the previous sign-in
 * was on the same Manila calendar day.
 * @param {string} mode @param {string | null | undefined} previousSignInAt @param {Date} [now]
 */
export function welcomeShowsNow(mode, previousSignInAt, now = new Date()) {
  if (mode === "off") return false;
  if (mode === "every" || !previousSignInAt) return true;
  const day = (/** @type {Date} */ date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const previous = new Date(previousSignInAt);
  return !Number.isFinite(previous.getTime()) || day(previous) !== day(now);
}

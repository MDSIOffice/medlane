// Notification rules shared by the Worker (generation, fan-out, the Notifications page and its
// emails) and the tests. Pure functions only — no fetch, no env.
//
// Where notifications come from:
//  - "manual" notices people's actions create (app_records module "notifications", id NTF-…);
//  - "generated" standing alerts (low stock, overdue invoices, approvals waiting …), computed here
//    on the server from the stored records by generateNotices(), id GEN-<key>.
// Each one is copied into user_notifications once per person who may see it (planFanOut), which
// holds that person's own read state and email status.

import { deliveryFor, inQuietHours } from "./account.js";
import "../public/scripts/support-rules.js";

/** @typedef {import("./account.js").AlertType} AlertType */
/** @typedef {AlertType | "general"} NoticeCategory */
/**
 * @typedef {{ id: string, key?: string, generated?: boolean, type?: string, message?: string, section?: string,
 *   record?: string, createdAt?: string, targetUser?: string, audience?: string[], category?: NoticeCategory, urgent?: boolean }} Notice
 */
/** @typedef {{ id: string, email: string, role: string, modules: string[], settings: import("./account.js").NotificationSetting[], prefs: { quietHoursEnabled: boolean, quietStart: string, quietEnd: string, dailySummary?: boolean } }} NoticeUser */
/**
 * @typedef {{ user_id: string, notice_id: string, alert_type: NoticeCategory, title: string, message: string, section: string,
 *   record: string, urgent: boolean, in_app: boolean, created_at: string, read_at?: string | null, email_status: EmailStatus, emailed_at?: string | null }} UserNoticeRow
 */
/** @typedef {"none" | "pending" | "held" | "sent" | "failed" | "skipped"} EmailStatus */

export const ARCHIVE_DAYS = 90;
/** Email only what's new: older notices (or a person's first batch) are never emailed. */
export const EMAIL_FRESH_MS = 60 * 60 * 1000;
export const NOTIFICATION_TABS = /** @type {const} */ (["all", "unread", "approvals", "stock", "money", "service", "security"]);
export const NOTIFICATION_TAB_LABELS = { all: "All", unread: "Unread", approvals: "Approvals", stock: "Stock", money: "Money", service: "Service", security: "Security" };

const MANAGEMENT = ["Superadmin", "CEO"];
const SECURITY_SECTIONS = ["users", "backup", "security", "logs"];
const SECURITY_WORDS = /user|account|permission|password|security|audit|login|logout|session|sign-?in/i;
// Something waiting for someone's approval — not "your request was approved".
const APPROVAL_WORDS = /for approval|awaiting approval|waiting for (your |an? )?approval|needs? (your |an? )?approval|pending approval|approval request|to approve/i;
/** @type {Record<string, AlertType>} */
const SECTION_CATEGORY = {
  inventory: "stock", "item-forecast": "stock",
  collections: "money", payables: "money", "receivables-tracker": "money", invoicing: "money",
  replenishments: "approvals", "purchase-orders": "approvals",
  "product-issues": "service", warranty: "service",
  reconciliation: "recon",
};

/** Which Notifications tab (and which Account settings row) a notice belongs to. @param {Notice} notice @returns {NoticeCategory} */
export function noticeCategory(notice) {
  if (notice?.category) return notice.category;
  const section = String(notice?.section || "");
  const text = `${notice?.type || ""} ${notice?.message || ""}`;
  if (SECURITY_SECTIONS.includes(section) || SECURITY_WORDS.test(text)) return "security";
  if (APPROVAL_WORDS.test(text) && section !== "reconciliation") return "approvals";
  return SECTION_CATEGORY[section] || "general";
}

/**
 * Whether one notice is meant for this person (same rules as canSeeNotification in
 * public/scripts/ui-utils.js):
 * - a notice addressed to one account (targetUser) is only ever theirs;
 * - Superadmin and CEO see everything else;
 * - security/system notices are management-only;
 * - a notice addressed to roles (audience) is for those roles only, whatever their modules;
 * - otherwise you need view access to the notice's module.
 * @param {{ email?: string, role?: string, modules?: string[] }} profile @param {Notice} notice
 */
export function noticeVisibleTo(profile, notice) {
  if (!notice || typeof notice !== "object") return false;
  const email = String(profile?.email || "").toLowerCase();
  if (notice.targetUser) return Boolean(email) && String(notice.targetUser).toLowerCase() === email;
  const role = String(profile?.role || "");
  if (MANAGEMENT.includes(role)) return true;
  if (noticeCategory(notice) === "security") return false;
  if (Array.isArray(notice.audience)) return notice.audience.includes(role);
  const section = String(notice.section || "notifications");
  return section === "notifications" || (profile?.modules || []).includes(section);
}

// ---- Generated alerts --------------------------------------------------------------------------

/** "YYYY-MM-DD" in Manila. @param {Date} now */
export function manilaDay(now) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).format(now);
}
/** Whole days from Manila today to a YYYY-MM-DD (or parsable) date; NaN when there's none. @param {unknown} date @param {Date} now */
export function daysFromToday(date, now) {
  const text = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return NaN;
  return Math.round((Date.parse(`${text}T00:00:00Z`) - Date.parse(`${manilaDay(now)}T00:00:00Z`)) / 86400000);
}
/** @param {unknown} date @param {number} days */
function addDaysIso(date, days) {
  const text = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return new Date(Date.parse(`${text}T00:00:00Z`) + (Number(days) || 0) * 86400000).toISOString().slice(0, 10);
}
/** @param {number} n @param {string} one @param {string} [many] */
function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }
/** @param {any[]} items @param {(item: any) => unknown} pick */
function ids(items, pick) { return items.map(pick).map((v) => String(v || "").trim()).filter(Boolean).join("|"); }

/** Supplier POs that are still on their way in (mirrors the browser's PO receiving alert). */
const SUPPLIER_PO_OPEN = ["Approved", "Sent to Supplier", "In Transit", "For Receiving", "Partially Received"];

/**
 * The standing alerts, computed from the stored records. Each has a stable id (GEN-<key>) and a
 * `record` list of the items it covers, so the fan-out can tell when new items join it.
 * @param {Record<string, any[]>} state @param {Date} [now]
 * @returns {Notice[]}
 */
export function generateNotices(state, now = new Date()) {
  const list = (/** @type {string} */ key) => (Array.isArray(state?.[key]) ? state[key] : []);
  /** @type {Notice[]} */
  const out = [];
  /** @param {string} key @param {NoticeCategory} category @param {string} type @param {string} message @param {string} section @param {string} record @param {{ urgent?: boolean, audience?: string[], targetUser?: string }} [extra] */
  const add = (key, category, type, message, section, record, extra = {}) => out.push({ id: `GEN-${key}`, key, generated: true, category, type, message, section, record, ...extra });

  const stock = list("inventory").filter((item) => Number(item.qty || 0) > 0);
  const expired = stock.filter((item) => daysFromToday(item.expiry, now) < 0);
  const nearExpiry = stock.filter((item) => { const d = daysFromToday(item.expiry, now); return d >= 0 && d <= 180; });
  const low = list("inventory").filter((item) => Number(item.min || 0) > 0 && Number(item.qty || 0) < Number(item.min) && !(daysFromToday(item.expiry, now) < 0));
  const lot = (/** @type {any} */ item) => item.lot || item.serial || item.code;
  if (low.length) add("inventory-low-stock", "stock", "Low Stock", `${plural(low.length, "inventory lot")} ${low.length === 1 ? "is" : "are"} below the reorder point.`, "inventory", ids(low, lot));
  if (nearExpiry.length) add("inventory-near-expiry", "stock", "Near Expiry", `${plural(nearExpiry.length, "inventory lot")} ${nearExpiry.length === 1 ? "expires" : "expire"} within 6 months — sell or transfer first (FEFO).`, "inventory", ids(nearExpiry, lot));
  if (expired.length) add("inventory-expired", "stock", "Expired", `${plural(expired.length, "expired lot")} still in stock ${expired.length === 1 ? "needs" : "need"} disposal review.`, "inventory", ids(expired, lot));
  const transfers = list("pendingTransfers").filter((t) => t.status === "For Receiving");
  if (transfers.length) add("inventory-transfer-receiving", "stock", "Transfer Receiving", `${plural(transfers.length, "stock transfer")} waiting for receiving.`, "inventory", ids(transfers, (t) => t.id));
  const incoming = list("inventoryPurchaseOrders").filter((po) => SUPPLIER_PO_OPEN.includes(po.status));
  if (incoming.length) add("inventory-po-receiving", "stock", "PO Receiving", `${plural(incoming.length, "supplier PO")} on the way in, waiting for receiving.`, "inventory", ids(incoming, (po) => po.id));

  const open = list("sales").filter((sale) => sale.status !== "Cancelled" && Number(sale.net || 0) - Number(sale.paid || 0) > 0.005);
  const dueIn = (/** @type {any} */ sale) => daysFromToday(addDaysIso(sale.date, sale.terms), now);
  const overdue = open.filter((sale) => dueIn(sale) < 0);
  const nearDue = open.filter((sale) => { const d = dueIn(sale); return d >= 0 && d <= 7; });
  const doc = (/** @type {any} */ sale) => sale.documentNo || sale.id;
  if (overdue.length) add("ar-overdue", "money", "Overdue AR", `${plural(overdue.length, "invoice")} ${overdue.length === 1 ? "is overdue and needs" : "are overdue and need"} collection follow-up.`, "receivables-tracker", ids(overdue, doc));
  if (nearDue.length) add("ar-near-due", "money", "Near Due AR", `${plural(nearDue.length, "invoice")} ${nearDue.length === 1 ? "is" : "are"} due within 7 days.`, "receivables-tracker", ids(nearDue, doc));
  const payments = list("payments");
  const bounced = payments.filter((p) => /bounce/i.test(String(p.collectionStatus || "")));
  const forDeposit = payments.filter((p) => ["Cheque", "Multiple Cheques"].includes(p.method) && ["For Deposit", "Posted Date"].includes(p.collectionStatus));
  const receipt = (/** @type {any} */ p) => p.receiptNo || p.id;
  if (bounced.length) add("collections-cheques-bounced", "money", "Bounced Cheque", `${plural(bounced.length, "bounced cheque")} ${bounced.length === 1 ? "needs" : "need"} immediate escalation.`, "collections", ids(bounced, receipt), { urgent: true });
  if (forDeposit.length) add("collections-cheques-deposit", "money", "Cheque Deposit", `${plural(forDeposit.length, "cheque")} waiting for deposit or claim date.`, "collections", ids(forDeposit, receipt));

  const payableState = (/** @type {any} */ p) => (p.paymentConfirmed || p.status === "Paid" ? "paid" : String(p.requestStatus || p.status || "") === "Cancelled" ? "cancelled" : String(p.requestStatus || p.status || "") === "Approved" ? "approved" : "approval");
  const awaiting = list("payables").filter((p) => payableState(p) === "approval" && Number(p.amount || 0) - Number(p.paid || 0) > 0.005);
  const payablesOverdue = awaiting.filter((p) => daysFromToday(p.dueDate, now) < 0);
  // Only Superadmin/CEO approve payables (Accounting can never approve them).
  if (awaiting.length) add("payables-approval", "approvals", "Payables Approval", `${plural(awaiting.length, "supplier bill")} waiting for approval.`, "payables", ids(awaiting, (p) => p.id), { audience: MANAGEMENT });
  if (payablesOverdue.length) add("payables-overdue", "money", "Overdue Bills", `${plural(payablesOverdue.length, "supplier bill")} ${payablesOverdue.length === 1 ? "is" : "are"} past due.`, "payables", ids(payablesOverdue, (p) => p.id));
  const expenses = list("replenishments").filter((item) => !["Approved", "Cancelled", "Returned", "Paid"].includes(String(item.requestStatus || item.status || "")));
  if (expenses.length) add("expenses-approval", "approvals", "Expense Approval", `${plural(expenses.length, "expense request")} waiting for approval.`, "replenishments", ids(expenses, (e) => e.id), { audience: [...MANAGEMENT, "Admin"] });
  const credit = list("pendingCreditInvoices").filter((r) => r.status === "Pending");
  if (credit.length) add("credit-invoices-approval", "approvals", "Credit Limit Approval", `${plural(credit.length, "over-limit invoice")} waiting for approval.`, "invoicing", ids(credit, (r) => r.id), { audience: [...MANAGEMENT, "Admin"] });
  const supplierPoApproval = list("inventoryPurchaseOrders").filter((po) => po.status === "Pending Approval");
  if (supplierPoApproval.length) add("supplier-po-approval", "approvals", "Supplier PO Approval", `${plural(supplierPoApproval.length, "supplier PO")} waiting for approval.`, "purchase-orders", ids(supplierPoApproval, (po) => po.id), { audience: MANAGEMENT });

  const issues = list("productIssues").filter((r) => r.status === "Open");
  if (issues.length) add("product-issues-open", "service", "Open Tickets", `${plural(issues.length, "support ticket")} ${issues.length === 1 ? "is" : "are"} open.`, "product-issues", ids(issues, (r) => r.id));
  // Support tickets past a response-time target: the assigned engineer and Superadmin hear about it.
  const Rules = /** @type {any} */ (globalThis).SupportRules;
  const targets = Rules.targetsFrom(list("supportSettings").find((r) => r.id === "support-settings")?.targets);
  const MISSED = /** @type {Record<string, string>} */ ({ response: "response time", onsite: "on-site visit", fix: "fix time" });
  for (const report of list("productIssues")) {
    const facts = Rules.ticketFacts(report, { now: now.getTime(), targets });
    if (!facts.open || facts.sla !== "breach") continue;
    const message = `${Rules.PRIORITY_LABELS[facts.priority]} ticket ${report.id} for ${report.companyName || "a client"} missed its ${MISSED[facts.clock] || "target"}.`;
    if (report.engineerEmail) add(`support-breach-${report.id}`, "service", "Response Time Breached", message, "product-issues", String(report.id), { urgent: true, targetUser: String(report.engineerEmail).toLowerCase() });
    add(`support-breach-${report.id}-superadmin`, "service", "Response Time Breached", message, "product-issues", String(report.id), { urgent: true, audience: ["Superadmin"] });
  }
  const warrantyEnding = list("warranties").filter((w) => { const d = daysFromToday(w.warrantyEnd, now); return d >= 0 && d <= 60; });
  if (warrantyEnding.length) add("warranty-ending", "service", "Warranty Ending", `${plural(warrantyEnding.length, "warranty", "warranties")} end within 60 days.`, "warranty", ids(warrantyEnding, (w) => w.serial || w.id || w.client));
  return out;
}

// ---- Fan-out -------------------------------------------------------------------------------------

/** @param {string} record */
function recordSet(record) { return new Set(String(record || "").split("|").filter(Boolean)); }

/**
 * What to write to user_notifications for these notices and people.
 * - New for someone: inserted when they'd get it in-app or by email (Account settings), with an
 *   email status of pending / held (quiet hours) / none. Old notices and a person's very first
 *   batch are never emailed ("skipped"), so turning this on doesn't flood inboxes.
 * - Already there: the wording is refreshed; when new items join a generated alert it becomes
 *   unread again and moves to the top (no second email).
 * @param {Notice[]} notices @param {NoticeUser[]} users
 * @param {Map<string, Map<string, { message: string, record: string, title: string }>>} existing by user id, then notice id
 * @param {Date} [now]
 */
export function planFanOut(notices, users, existing, now = new Date()) {
  /** @type {UserNoticeRow[]} */
  const inserts = [];
  /** @type {{ user_id: string, notice_id: string, patch: Record<string, unknown> }[]} */
  const updates = [];
  const nowIso = now.toISOString();
  for (const user of users) {
    const mine = existing.get(user.id) || new Map();
    const firstBatch = mine.size === 0;
    for (const notice of notices) {
      if (!noticeVisibleTo(user, notice)) continue;
      const category = noticeCategory(notice);
      const title = String(notice.type || "Notification");
      const message = String(notice.message || "");
      const record = String(notice.record || "");
      const had = mine.get(notice.id);
      if (had) {
        if (had.message === message && had.record === record && had.title === title) continue;
        const before = recordSet(had.record);
        const grew = [...recordSet(record)].some((item) => !before.has(item));
        updates.push({ user_id: user.id, notice_id: notice.id, patch: { title, message, record, ...(grew ? { read_at: null, created_at: nowIso } : {}) } });
        continue;
      }
      const delivery = category === "general" ? { inApp: true, email: false, emailHeldForQuietHours: false } : deliveryFor({ type: category, urgent: notice.urgent }, user, now);
      if (!delivery.inApp && !delivery.email && !delivery.emailHeldForQuietHours) continue;
      const createdAt = notice.generated ? nowIso : String(notice.createdAt || nowIso);
      const fresh = now.getTime() - Date.parse(createdAt) <= EMAIL_FRESH_MS;
      const wantsEmail = delivery.email || delivery.emailHeldForQuietHours;
      /** @type {EmailStatus} */
      const emailStatus = !wantsEmail ? "none" : (!fresh || (firstBatch && notice.generated)) ? "skipped" : delivery.email ? "pending" : "held";
      inserts.push({
        user_id: user.id, notice_id: notice.id, alert_type: category, title, message, section: String(notice.section || "notifications"), record,
        urgent: Boolean(notice.urgent), in_app: delivery.inApp, created_at: createdAt, read_at: null, email_status: emailStatus,
      });
    }
  }
  return { inserts, updates };
}

/**
 * The rows to email this person now: pending ones, plus ones held for quiet hours once those end.
 * Security alerts were never held. @param {UserNoticeRow[]} rows @param {NoticeUser} user @param {Date} [now]
 */
export function emailsDue(rows, user, now = new Date()) {
  const quiet = Boolean(user.prefs.quietHoursEnabled) && inQuietHours(now, user.prefs.quietStart, user.prefs.quietEnd);
  return rows.filter((row) => row.email_status === "pending" || (row.email_status === "held" && (!quiet || row.urgent || row.alert_type === "security")));
}

/**
 * The 07:00 daily summary for one person: their unread notices from the last 24 hours. Empty when
 * they turned the summary off or there's nothing. @param {UserNoticeRow[]} rows @param {NoticeUser} user @param {Date} [now]
 */
export function dailySummaryRows(rows, user, now = new Date()) {
  if (user.prefs.dailySummary === false) return [];
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  return rows.filter((row) => row.in_app && !row.read_at && Date.parse(row.created_at) >= since);
}

// ---- The Notifications page ----------------------------------------------------------------------

/** Notices older than this are archived (not listed, pruned). @param {Date} [now] */
export function archiveCutoffIso(now = new Date()) {
  return new Date(now.getTime() - ARCHIVE_DAYS * 86400000).toISOString();
}

/**
 * Today / Yesterday / Earlier this week (Monday-based, Manila) / Older.
 * @param {string} iso @param {Date} [now]
 */
export function dayGroup(iso, now = new Date()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Older";
  const diff = daysFromToday(manilaDay(at), now);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  const weekday = (Date.parse(`${manilaDay(now)}T00:00:00Z`) / 86400000 + 3) % 7; // 0 = Monday
  if (diff < 0 && -diff <= weekday) return "Earlier this week";
  return "Older";
}

/** @param {string} tab @returns {(typeof NOTIFICATION_TABS)[number]} */
export function notificationTab(tab) {
  return /** @type {any} */ (NOTIFICATION_TABS.includes(/** @type {any} */ (tab)) ? tab : "all");
}

/** @param {UserNoticeRow} row @param {string} tab */
export function rowInTab(row, tab) {
  if (tab === "all") return true;
  if (tab === "unread") return !row.read_at;
  return row.alert_type === tab;
}

/**
 * One page of the Notifications list, newest first, grouped by day, with the count for each tab.
 * `rows` are this person's in-app rows from the last 90 days.
 * @param {UserNoticeRow[]} rows @param {{ tab?: string, page?: number, size?: number, now?: Date }} [options]
 */
export function notificationPage(rows, { tab = "all", page = 1, size = 10, now = new Date() } = {}) {
  const active = notificationTab(tab);
  const cutoff = archiveCutoffIso(now);
  const live = rows.filter((row) => row.in_app && row.created_at >= cutoff).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  /** @type {Record<string, { total: number, unread: number }>} */
  const counts = {};
  for (const key of NOTIFICATION_TABS) {
    const inTab = live.filter((row) => rowInTab(row, key));
    counts[key] = { total: inTab.length, unread: inTab.filter((row) => !row.read_at).length };
  }
  const filtered = live.filter((row) => rowInTab(row, active));
  const pageSize = [10, 25, 50].includes(Number(size)) ? Number(size) : 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  const items = filtered.slice((current - 1) * pageSize, current * pageSize).map((row) => ({
    id: row.notice_id, category: row.alert_type, title: row.title, message: row.message, section: row.section, record: row.record,
    urgent: Boolean(row.urgent), createdAt: row.created_at, read: Boolean(row.read_at), group: dayGroup(row.created_at, now),
  }));
  return { tab: active, page: current, size: pageSize, pages, total: filtered.length, unread: counts.all.unread, counts, items };
}

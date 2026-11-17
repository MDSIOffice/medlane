import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationSettings, PREFERENCE_DEFAULTS } from "../src/account.js";
import {
  noticeCategory, noticeVisibleTo, generateNotices, planFanOut, emailsDue, dailySummaryRows,
  dayGroup, notificationPage, archiveCutoffIso, daysFromToday,
} from "../src/notifications.js";

// 2026-11-18 is a Wednesday. 10:00 Manila = 02:00 UTC.
const NOW = new Date("2026-11-18T02:00:00Z");
const ALL_MODULES = ["inventory", "item-forecast", "collections", "payables", "receivables-tracker", "replenishments", "purchase-orders", "invoicing", "product-issues", "warranty", "reconciliation", "users", "logs"];

/** @param {string} role @param {string[]} modules @param {Partial<typeof PREFERENCE_DEFAULTS>} [prefs] @param {any[]} [settingRows] */
function user(role, modules, prefs = {}, settingRows = []) {
  return { id: `u-${role}`, email: `${role.toLowerCase().replace(/ /g, "")}@medlane.test`, role, modules, settings: resolveNotificationSettings(settingRows, modules), prefs: { ...PREFERENCE_DEFAULTS, quietHoursEnabled: false, ...prefs } };
}

// ---- permission filtering ----------------------------------------------------------------------

test("a notice for one account is only that account's — not even Superadmin sees it", () => {
  const notice = { id: "NTF-1", type: "Password changed", message: "Your password was changed", targetUser: "sales@medlane.test" };
  assert.equal(noticeVisibleTo({ email: "SALES@medlane.test", role: "Sales", modules: [] }, notice), true);
  assert.equal(noticeVisibleTo({ email: "boss@medlane.test", role: "Superadmin", modules: ALL_MODULES }, notice), false);
});

test("Superadmin and CEO see everything that isn't addressed to someone else", () => {
  const notice = { id: "NTF-2", type: "Login", message: "New sign-in from Chrome", section: "users" };
  assert.equal(noticeVisibleTo({ role: "CEO", modules: [] }, notice), true);
  assert.equal(noticeVisibleTo({ role: "Superadmin", modules: [] }, notice), true);
});

test("security and system notices never reach other roles, even with the module", () => {
  for (const notice of [
    { id: "a", type: "Backup", message: "Backup done", section: "backup" },
    { id: "b", type: "Account", message: "Permission changed for Ana", section: "inventory" },
  ]) assert.equal(noticeVisibleTo({ role: "Admin", modules: ["backup", "inventory", "users"] }, notice), false);
});

test("a notice addressed to roles goes to those roles only, whatever their modules", () => {
  const notice = { id: "c", type: "New PO", message: "PO-12 needs invoicing", section: "invoicing", audience: ["Accounting"] };
  assert.equal(noticeVisibleTo({ role: "Accounting", modules: [] }, notice), true);
  assert.equal(noticeVisibleTo({ role: "Sales", modules: ["invoicing"] }, notice), false);
});

test("otherwise you need view access to the notice's module", () => {
  const notice = { id: "d", type: "Low Stock", message: "3 lots low", section: "inventory" };
  assert.equal(noticeVisibleTo({ role: "Logistics", modules: ["inventory"] }, notice), true);
  assert.equal(noticeVisibleTo({ role: "Accounting", modules: ["collections"] }, notice), false);
  assert.equal(noticeVisibleTo({ role: "Accounting", modules: [] }, { id: "e", message: "General notice" }), true);
});

test("notices are sorted into the page's tabs", () => {
  assert.equal(noticeCategory({ id: "1", type: "Low Stock", section: "inventory" }), "stock");
  assert.equal(noticeCategory({ id: "2", type: "Bounced Cheque", section: "collections" }), "money");
  assert.equal(noticeCategory({ id: "3", type: "Expense", message: "EXP-4 is waiting for approval", section: "replenishments" }), "approvals");
  assert.equal(noticeCategory({ id: "4", type: "Password", message: "Password changed" }), "security");
  assert.equal(noticeCategory({ id: "5", type: "Ticket", section: "product-issues" }), "service");
  assert.equal(noticeCategory({ id: "6", type: "Memo", section: "memos" }), "general");
  assert.equal(noticeCategory({ id: "8", type: "Demo approved", message: "Your demo request was approved" }), "general");
  assert.equal(noticeCategory({ id: "7", category: "money", section: "inventory" }), "money");
});

// ---- generation ----------------------------------------------------------------------------------

test("standing alerts are generated from the stored records with stable ids", () => {
  const state = {
    inventory: [
      { code: "A", lot: "L1", qty: 2, min: 10, expiry: "2027-12-01" },
      { code: "B", lot: "L2", qty: 5, min: 0, expiry: "2026-12-20" },
      { code: "C", lot: "L3", qty: 4, min: 0, expiry: "2026-10-01" },
      { code: "D", lot: "L4", qty: 0, min: 0, expiry: "2026-10-01" },
    ],
    sales: [
      { documentNo: "SI-1", date: "2026-10-01", terms: 30, net: 100, paid: 0 },
      { documentNo: "SI-2", date: "2026-11-01", terms: 20, net: 100, paid: 0 },
      { documentNo: "SI-3", date: "2026-10-01", terms: 30, net: 100, paid: 100 },
      { documentNo: "SI-4", date: "2026-10-01", terms: 30, net: 100, paid: 0, status: "Cancelled" },
    ],
    payments: [{ receiptNo: "OR-1", collectionStatus: "Bounced" }],
    payables: [{ id: "PAY-1", amount: 500, status: "For Approval", dueDate: "2026-11-01" }, { id: "PAY-2", amount: 500, status: "Approved" }],
    replenishments: [{ id: "EXP-1", requestStatus: "Pending" }, { id: "EXP-2", requestStatus: "Approved" }],
    warranties: [{ serial: "SN-1", warrantyEnd: "2026-12-01" }, { serial: "SN-2", warrantyEnd: "2027-12-01" }],
  };
  const byKey = Object.fromEntries(generateNotices(state, NOW).map((n) => [n.key, n]));
  assert.equal(byKey["inventory-low-stock"].record, "L1");
  assert.equal(byKey["inventory-near-expiry"].record, "L2");
  assert.equal(byKey["inventory-expired"].record, "L3", "empty lots aren't flagged");
  assert.equal(byKey["ar-overdue"].record, "SI-1");
  assert.equal(byKey["ar-near-due"].record, "SI-2");
  assert.equal(byKey["collections-cheques-bounced"].urgent, true);
  assert.deepEqual(byKey["payables-approval"].audience, ["Superadmin", "CEO"]);
  assert.equal(byKey["payables-overdue"].record, "PAY-1");
  assert.equal(byKey["expenses-approval"].record, "EXP-1");
  assert.equal(byKey["warranty-ending"].record, "SN-1");
  assert.equal(byKey["inventory-low-stock"].id, "GEN-inventory-low-stock");
  assert.deepEqual(generateNotices({}, NOW), []);
});

test("payable approvals only go to Superadmin/CEO, never Accounting", () => {
  const [notice] = generateNotices({ payables: [{ id: "PAY-1", amount: 5, status: "For Approval" }] }, NOW);
  assert.equal(noticeVisibleTo({ role: "Accounting", modules: ["payables"] }, notice), false);
  assert.equal(noticeVisibleTo({ role: "CEO", modules: [] }, notice), true);
});

// ---- notification settings respected -----------------------------------------------------------

const lowStock = { id: "GEN-inventory-low-stock", generated: true, category: /** @type {const} */ ("stock"), type: "Low Stock", message: "2 lots", section: "inventory", record: "L1|L2" };
const fresh = (/** @type {any} */ n) => ({ ...n, createdAt: NOW.toISOString() });
const seen = () => new Map([["u-Logistics", new Map([["NTF-old", { message: "", record: "", title: "" }]])]]);

test("in-app off and email off: nothing is delivered", () => {
  const u = user("Logistics", ["inventory"], {}, [{ alert_type: "stock", in_app: false, email: false }]);
  assert.equal(planFanOut([lowStock], [u], seen(), NOW).inserts.length, 0);
});

test("in-app on, email off (the stock default): listed, not emailed", () => {
  const [row] = planFanOut([lowStock], [user("Logistics", ["inventory"])], seen(), NOW).inserts;
  assert.equal(row.in_app, true);
  assert.equal(row.email_status, "none");
});

test("email on outside quiet hours: emailed now", () => {
  const u = user("Logistics", ["inventory"], {}, [{ alert_type: "stock", in_app: false, email: true }]);
  const [row] = planFanOut([fresh({ ...lowStock, generated: false, id: "NTF-9" })], [u], seen(), NOW).inserts;
  assert.equal(row.in_app, false);
  assert.equal(row.email_status, "pending");
});

test("quiet hours hold the email until they end; urgent and security alerts aren't held", () => {
  const night = new Date("2026-11-18T14:00:00Z"); // 22:00 Manila
  const u = user("Accounting", ["collections"], { quietHoursEnabled: true, quietStart: "20:00", quietEnd: "07:00" });
  const bounced = { id: "NTF-b", type: "Bounced Cheque", category: /** @type {const} */ ("money"), section: "collections", createdAt: night.toISOString() };
  const deposit = { ...bounced, id: "NTF-d", type: "Cheque Deposit" };
  const password = { id: "NTF-p", type: "Password changed", targetUser: u.email, createdAt: night.toISOString() };
  const existing = new Map([[u.id, new Map([["x", { message: "", record: "", title: "" }]])]]);
  const rows = planFanOut([{ ...bounced, urgent: true }, deposit, password], [u], existing, night).inserts;
  const status = Object.fromEntries(rows.map((r) => [r.notice_id, r.email_status]));
  assert.deepEqual(status, { "NTF-b": "pending", "NTF-d": "held", "NTF-p": "pending" });
  // At 22:00 only the pending ones go; at 07:30 the held one goes too.
  assert.deepEqual(emailsDue(rows, u, night).map((r) => r.notice_id).sort(), ["NTF-b", "NTF-p"]);
  assert.deepEqual(emailsDue(rows, u, new Date("2026-11-18T23:30:00Z")).map((r) => r.notice_id).sort(), ["NTF-b", "NTF-d", "NTF-p"]);
});

test("security alerts are always delivered, even with every switch saved off", () => {
  const u = user("Sales", [], {}, [{ alert_type: "security", in_app: false, email: false }]);
  const [row] = planFanOut([{ id: "NTF-s", type: "New sign-in", targetUser: u.email, createdAt: NOW.toISOString() }], [u], seen(), NOW).inserts;
  assert.equal(row.in_app, true);
  assert.equal(row.email_status, "pending");
});

test("a role that can't receive a type gets nothing for it", () => {
  const u = user("HR", ["memos"]);
  assert.equal(planFanOut([{ ...lowStock, audience: ["HR"] }], [u], new Map(), NOW).inserts.length, 0);
});

test("old notices and someone's first batch of standing alerts are never emailed", () => {
  const u = user("Accounting", ["collections"]);
  const old = { id: "NTF-old2", type: "Bounced", category: /** @type {const} */ ("money"), section: "collections", createdAt: "2026-11-10T00:00:00Z" };
  const gen = { id: "GEN-collections-cheques-bounced", generated: true, category: /** @type {const} */ ("money"), type: "Bounced", section: "collections", record: "OR-1" };
  const rows = planFanOut([old, gen], [u], new Map(), NOW).inserts;
  assert.deepEqual(rows.map((r) => r.email_status), ["skipped", "skipped"]);
});

test("a generated alert that gains items becomes unread again; a rewording alone doesn't", () => {
  const u = user("Logistics", ["inventory"]);
  const existing = new Map([[u.id, new Map([[lowStock.id, { title: "Low Stock", message: "1 lot", record: "L1" }]])]]);
  const grew = planFanOut([lowStock], [u], existing, NOW).updates[0];
  assert.equal(grew.patch.read_at, null);
  assert.equal(grew.patch.created_at, NOW.toISOString());
  const shrank = planFanOut([{ ...lowStock, record: "L1", message: "1 lot left" }], [u], existing, NOW).updates[0];
  assert.equal("read_at" in shrank.patch, false);
  assert.equal(planFanOut([{ ...lowStock, record: "L1", message: "1 lot" }], [u], existing, NOW).updates.length, 0);
});

test("the daily summary lists unread in-app notices from the last 24 hours, unless turned off", () => {
  const rows = /** @type {any[]} */ ([
    { notice_id: "a", in_app: true, read_at: null, created_at: "2026-11-17T23:00:00Z" },
    { notice_id: "b", in_app: true, read_at: "2026-11-18T00:00:00Z", created_at: "2026-11-17T23:00:00Z" },
    { notice_id: "c", in_app: true, read_at: null, created_at: "2026-11-16T00:00:00Z" },
    { notice_id: "d", in_app: false, read_at: null, created_at: "2026-11-17T23:00:00Z" },
  ]);
  assert.deepEqual(dailySummaryRows(rows, user("Sales", []), NOW).map((r) => r.notice_id), ["a"]);
  assert.deepEqual(dailySummaryRows(rows, user("Sales", [], { dailySummary: false }), NOW), []);
});

// ---- the page --------------------------------------------------------------------------------

test("days group as Today, Yesterday, Earlier this week and Older (Manila)", () => {
  assert.equal(dayGroup("2026-11-17T16:30:00Z", NOW), "Today"); // 00:30 Manila on the 18th
  assert.equal(dayGroup("2026-11-17T15:30:00Z", NOW), "Yesterday"); // 23:30 Manila on the 17th
  assert.equal(dayGroup("2026-11-16T03:00:00Z", NOW), "Earlier this week"); // Monday
  assert.equal(dayGroup("2026-11-15T03:00:00Z", NOW), "Older"); // Sunday, last week
  assert.equal(dayGroup("not a date", NOW), "Older");
  assert.equal(daysFromToday("2026-11-19", NOW), 1);
});

/** @param {number} n */
function rows(n) {
  return Array.from({ length: n }, (_, i) => /** @type {any} */ ({
    notice_id: `N${i}`, alert_type: i % 2 ? "stock" : "money", title: "t", message: "m", section: "inventory", record: "", urgent: false,
    in_app: true, created_at: new Date(NOW.getTime() - i * 3600000).toISOString(), read_at: i % 3 ? null : NOW.toISOString(), email_status: "none",
  }));
}

test("the page is newest first with counts per tab and the unread total", () => {
  const page = notificationPage(rows(23), { now: NOW });
  assert.equal(page.items[0].id, "N0");
  assert.equal(page.counts.all.total, 23);
  assert.equal(page.counts.stock.total, 11);
  assert.equal(page.counts.money.total, 12);
  assert.equal(page.counts.unread.total, page.unread);
  assert.equal(page.unread, 23 - 8);
  const unread = notificationPage(rows(23), { tab: "unread", size: 50, now: NOW });
  assert.ok(unread.items.every((item) => !item.read));
});

test("pagination edge cases: empty, exact multiple, past the end, junk input", () => {
  const empty = notificationPage([], { now: NOW });
  assert.deepEqual([empty.page, empty.pages, empty.total, empty.items.length], [1, 1, 0, 0]);
  const exact = notificationPage(rows(20), { page: 2, now: NOW });
  assert.deepEqual([exact.page, exact.pages, exact.items.length], [2, 2, 10]);
  const past = notificationPage(rows(21), { page: 99, now: NOW });
  assert.deepEqual([past.page, past.items.length, past.items[0].id], [3, 1, "N20"]);
  const junk = notificationPage(rows(5), { page: /** @type {any} */ ("x"), size: 7, tab: "nope", now: NOW });
  assert.deepEqual([junk.page, junk.size, junk.tab], [1, 10, "all"]);
});

test("notices older than 90 days are archived off the page", () => {
  const list = rows(2);
  list[1].created_at = new Date(NOW.getTime() - 91 * 86400000).toISOString();
  assert.equal(notificationPage(list, { now: NOW }).total, 1);
  assert.ok(archiveCutoffIso(NOW) < NOW.toISOString());
});

// Notifications on the Worker: each person gets their own copy of the notices they may see
// (user_notifications), reads only their own, marks read only their own, and the cron's generated
// alerts and emails follow Account settings.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv } from "./helpers/load-worker.mjs";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SALES = "11111111-1111-4111-8111-111111111111";
const ACCT = "22222222-2222-4222-8222-222222222222";
const CEO = "33333333-3333-4333-8333-333333333333";
const SESSION = { [SALES]: "aaaaaaaa-0000-4000-8000-000000000001", [ACCT]: "aaaaaaaa-0000-4000-8000-000000000002", [CEO]: "aaaaaaaa-0000-4000-8000-000000000003" };
const minutesAgo = (/** @type {number} */ m) => new Date(Date.now() - m * 60000).toISOString();
let run = 0;

function fakeSupabase({ manual = [], generated = [], settings = [], prefs = [], state = {} } = {}) {
  const db = {
    profiles: [
      { id: SALES, email: "sales@example.com", full_name: "Sam Sales", role: "Sales", branch: "all", created_at: "2026-01-01T00:00:00Z" },
      { id: ACCT, email: "acct@example.com", full_name: "Ana Acct", role: "Accounting", branch: "all", created_at: "2026-01-01T00:00:00Z" },
      { id: CEO, email: "ceo@example.com", full_name: "Cy Ceo", role: "CEO", branch: "all", created_at: "2026-01-01T00:00:00Z" },
    ],
    sessions: Object.entries(SESSION).map(([user_id, id]) => ({ id, user_id, created_at: minutesAgo(5), last_seen_at: minutesAgo(1), revoked_at: null })),
    notices: /** @type {any[]} */ ([]),
    monitoring: /** @type {Record<string, any>} */ ({ "generated-notices": { notices: generated } }),
    emails: /** @type {any[]} */ ([]),
  };
  /** @param {URL} url */
  const filters = (url) => [...url.searchParams.entries()].filter(([key]) => !["select", "order", "limit", "on_conflict", "offset"].includes(key));
  /** @param {any} row @param {URL} url */
  const matches = (row, url) => filters(url).every(([key, value]) => {
    const v = row[key];
    if (value === "is.null") return v === null || v === undefined;
    if (value === "is.true") return v === true;
    if (value.startsWith("eq.")) return String(v) === value.slice(3);
    if (value.startsWith("gte.")) return String(v) >= value.slice(4);
    if (value.startsWith("lt.")) return String(v) < value.slice(3);
    if (value.startsWith("in.")) return value.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
    return true;
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const path = url.pathname;
    if (path === "/auth/v1/user") {
      const token = String(/** @type {any} */ (init.headers)?.authorization || "");
      const id = token.includes("acct") ? ACCT : token.includes("ceo") ? CEO : SALES;
      return Response.json({ id, email: db.profiles.find((p) => p.id === id)?.email });
    }
    if (path === "/emails" || url.hostname === "api.resend.com") { db.emails.push(body); return Response.json({ id: `em-${db.emails.length}` }); }
    if (path === "/rest/v1/app_sessions") return Response.json(db.sessions.filter((row) => matches(row, url)));
    if (path === "/rest/v1/profiles") return Response.json(db.profiles.filter((row) => matches(row, url)));
    if (path === "/rest/v1/module_permissions") return Response.json([]);
    if (path === "/rest/v1/user_preferences") return Response.json(prefs.filter((row) => matches(row, url)));
    if (path === "/rest/v1/notification_settings") return Response.json(settings.filter((row) => matches(row, url)));
    if (path === "/rest/v1/user_notifications") {
      if (method === "POST") {
        for (const row of body) if (!db.notices.some((n) => n.user_id === row.user_id && n.notice_id === row.notice_id)) db.notices.push({ ...row });
        return new Response(null, { status: 201 });
      }
      const rows = db.notices.filter((row) => matches(row, url));
      if (method === "PATCH") { rows.forEach((row) => Object.assign(row, body)); return Response.json(rows); }
      if (method === "DELETE") { db.notices = db.notices.filter((row) => !rows.includes(row)); return new Response(null, { status: 204 }); }
      return Response.json(rows);
    }
    if (path === "/rest/v1/app_records") {
      const module = url.searchParams.get("module_name");
      if (method === "POST") {
        for (const row of body) if (row.module_name === "system-monitoring") db.monitoring[row.record_key] = row.data;
        return new Response(null, { status: 201 });
      }
      if (module === "eq.notifications") return Response.json(manual.map((data) => ({ module_name: "notifications", record_key: data.id, data })));
      if (module === "eq.system-monitoring") { const key = url.searchParams.get("record_key")?.slice(3) || ""; return Response.json(db.monitoring[key] ? [{ data: db.monitoring[key] }] : []); }
      if (module?.startsWith("in.")) {
        const wanted = module.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
        return Response.json(Object.entries(state).filter(([key]) => wanted.includes(key)).flatMap(([key, list]) => /** @type {any[]} */ (list).map((data, i) => ({ module_name: key, record_key: `${key}-${i}`, data }))));
      }
      return Response.json([]);
    }
    return Response.json([]);
  };
  return db;
}

const ctx = { waitUntil: (/** @type {Promise<any>} */ p) => p };
/** Each test gets its own state key, so the per-isolate sync throttle never carries over. */
const freshEnv = () => ({ ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key", APP_STATE_KEY: `notif-test-${++run}`, RESEND_API_KEY: "re_test" });
/** @param {any} env @param {string} path @param {{ method?: string, body?: any, as?: string }} [options] */
const call = (env, path, { method = "GET", body, as = SALES } = {}) => worker.default.fetch(new Request(`https://app.test${path}`, {
  method, headers: { authorization: `Bearer ${as === ACCT ? "acct" : as === CEO ? "ceo" : "sales"}`, "x-medlane-session-id": SESSION[as], "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env, ctx);

const MANUAL = [
  { id: "NTF-po", type: "New PO", message: "PO-7 needs invoicing", section: "invoicing", audience: ["Accounting"], createdAt: minutesAgo(10) },
  { id: "NTF-mine", type: "Demo approved", message: "Your demo request was approved", targetUser: "sales@example.com", createdAt: minutesAgo(9) },
  { id: "NTF-theirs", type: "Demo approved", message: "Someone else's", targetUser: "other@example.com", createdAt: minutesAgo(8) },
  { id: "NTF-sec", type: "Permission changed", message: "Permission changed for Ana", section: "users", createdAt: minutesAgo(7) },
  { id: "NTF-stock", type: "Transfer", message: "TR-3 sent to Naga", section: "inventory", createdAt: minutesAgo(6) },
];
const GENERATED = [
  { id: "GEN-ar-overdue", key: "ar-overdue", generated: true, category: "money", type: "Overdue AR", message: "2 invoices overdue", section: "receivables-tracker", record: "SI-1|SI-2" },
  { id: "GEN-payables-approval", key: "payables-approval", generated: true, category: "approvals", type: "Payables Approval", message: "1 bill", section: "payables", record: "PAY-1", audience: ["Superadmin", "CEO"] },
];

describe("notification permission filtering", () => {
  test("each person gets only the notices meant for them", async () => {
    const env = freshEnv();
    fakeSupabase({ manual: MANUAL, generated: GENERATED });
    /** @param {string} as */
    const ids = async (as) => (await (await call(env, "/api/notifications?size=50", { as })).json()).items.map((/** @type {any} */ i) => i.id).sort();
    assert.deepEqual(await ids(SALES), ["NTF-mine", "NTF-stock"]);
    assert.deepEqual(await ids(ACCT), ["GEN-ar-overdue", "NTF-po", "NTF-stock"]);
    assert.deepEqual(await ids(CEO), ["GEN-ar-overdue", "GEN-payables-approval", "NTF-po", "NTF-sec", "NTF-stock"]);
  });

  test("the page counts tabs, groups by day and pages on the server", async () => {
    const env = freshEnv();
    fakeSupabase({ manual: MANUAL, generated: GENERATED });
    const page = await (await call(env, "/api/notifications?tab=all&size=10&page=1", { as: CEO })).json();
    assert.equal(page.counts.all.total, 5);
    assert.equal(page.counts.approvals.total, 1);
    assert.equal(page.counts.money.total, 2, "overdue AR + the invoicing notice");
    assert.equal(page.counts.security.total, 1);
    assert.equal(page.unread, 5);
    assert.equal(page.items[0].group, "Today");
    const second = await (await call(env, "/api/notifications?tab=all&size=10&page=2", { as: CEO })).json();
    assert.equal(second.page, 1, "past the last page clamps to it");
  });
});

describe("per-person read state", () => {
  test("marking read changes only my copy", async () => {
    const env = freshEnv();
    const db = fakeSupabase({ manual: MANUAL });
    await call(env, "/api/notifications", { as: SALES });
    await call(env, "/api/notifications", { as: ACCT });
    const res = await call(env, "/api/notifications/read", { method: "POST", body: { ids: ["NTF-stock"] }, as: SALES });
    assert.equal((await res.json()).changed, 1);
    assert.ok(db.notices.find((n) => n.user_id === SALES && n.notice_id === "NTF-stock").read_at);
    assert.equal(db.notices.find((n) => n.user_id === ACCT && n.notice_id === "NTF-stock").read_at, null);
    assert.equal((await (await call(env, "/api/notifications/unread", { as: SALES })).json()).unread, 1);
    assert.equal((await (await call(env, "/api/notifications/unread", { as: ACCT })).json()).unread, 2);
    // …and back to unread.
    await call(env, "/api/notifications/read", { method: "POST", body: { ids: ["NTF-stock"], read: false }, as: SALES });
    assert.equal(db.notices.find((n) => n.user_id === SALES && n.notice_id === "NTF-stock").read_at, null);
  });

  test("mark all read applies to the tab being looked at", async () => {
    const env = freshEnv();
    const db = fakeSupabase({ manual: MANUAL, generated: GENERATED });
    await call(env, "/api/notifications", { as: CEO });
    await call(env, "/api/notifications/read-all", { method: "POST", body: { tab: "money" }, as: CEO });
    const unread = db.notices.filter((n) => n.user_id === CEO && !n.read_at).map((n) => n.notice_id).sort();
    // NTF-po is an invoicing notice, so it's on the Money tab too.
    assert.deepEqual(unread, ["GEN-payables-approval", "NTF-sec", "NTF-stock"]);
    const bad = await call(env, "/api/notifications/read-all", { method: "POST", body: { tab: "everything" }, as: CEO });
    assert.equal(bad.status, 400);
    const none = await call(env, "/api/notifications/read", { method: "POST", body: { ids: [] }, as: CEO });
    assert.equal(none.status, 400);
  });
});

describe("cron: generation and emails follow Account settings", () => {
  test("generated alerts reach the right people, once; emails respect the switches", async () => {
    const env = freshEnv();
    const state = { payments: [{ receiptNo: "OR-9", collectionStatus: "Bounced" }], inventory: [{ code: "A", lot: "L1", qty: 1, min: 5 }] };
    // Accounting turned money email off; CEO keeps the default (money email on).
    const db = fakeSupabase({ state, settings: [{ user_id: ACCT, alert_type: "money", in_app: true, email: false }] });
    // Someone who already has notifications isn't on their "first batch", so fresh alerts are emailed.
    db.notices.push({ user_id: CEO, notice_id: "NTF-old", alert_type: "general", title: "", message: "", record: "", in_app: true, created_at: minutesAgo(600), read_at: null, email_status: "none" });
    db.notices.push({ user_id: ACCT, notice_id: "NTF-old", alert_type: "general", title: "", message: "", record: "", in_app: true, created_at: minutesAgo(600), read_at: null, email_status: "none" });
    const result = await worker.runNotificationGeneration(env);
    assert.equal(result.generated, 2);
    const of = (/** @type {string} */ user) => Object.fromEntries(db.notices.filter((n) => n.user_id === user && n.notice_id.startsWith("GEN-")).map((n) => [n.notice_id, n.email_status]));
    assert.deepEqual(of(CEO), { "GEN-collections-cheques-bounced": "pending", "GEN-inventory-low-stock": "none" });
    assert.deepEqual(of(ACCT), { "GEN-collections-cheques-bounced": "none", "GEN-inventory-low-stock": "none" });
    assert.deepEqual(of(SALES), { "GEN-inventory-low-stock": "none" });
    // Running again adds nothing.
    assert.equal((await worker.runNotificationGeneration(env)).inserted, 0);
    // The email run sends the CEO one email and marks it sent.
    const sent = await worker.runNotificationEmails(env);
    assert.equal(sent.sent, 1);
    assert.equal(db.emails.length, 1);
    assert.deepEqual(db.emails[0].to, ["ceo@example.com"]);
    assert.equal(db.notices.find((n) => n.user_id === CEO && n.notice_id === "GEN-collections-cheques-bounced").email_status, "sent");
    assert.equal((await worker.runNotificationEmails(env)).sent, 0);
  });

  test("the 90-day archive is pruned", async () => {
    const env = freshEnv();
    const db = fakeSupabase();
    db.notices.push({ user_id: CEO, notice_id: "OLD", created_at: new Date(Date.now() - 91 * 86400000).toISOString() });
    db.notices.push({ user_id: CEO, notice_id: "NEW", created_at: minutesAgo(1) });
    await worker.pruneUserNotifications(env);
    assert.deepEqual(db.notices.map((n) => n.notice_id), ["NEW"]);
  });
});

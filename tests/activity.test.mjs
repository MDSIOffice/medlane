import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activityKind, flagReason, activityRow, activityRowsInOrder, activityScope, activityQuery, activityPage, activitySearchTerm, activityTab,
} from "../src/activity.js";

const at = (/** @type {string} */ iso) => ({ serverCapturedAt: iso });
const src = (/** @type {number} */ i, /** @type {any} */ data, /** @type {string | null} */ user = "u1") => ({ record_key: `logs-${i}`, state_key: "production", data, updated_by: user, updated_at: data.serverCapturedAt });

test("each entry gets the Action pill the page filters on", () => {
  const cases = /** @type {[any, string][]} */ ([
    [{ action: "Signed in", event: "signin" }, "signin"],
    [{ action: "Failed sign-in", event: "signin-failed" }, "signin"],
    [{ action: "Created sales invoice" }, "created"],
    [{ action: "Saved collection", changes: [{ field: "Amount", from: "1", to: "2" }] }, "edited"],
    [{ action: "Approved payable" }, "approved"],
    [{ action: "Rejected expense request" }, "approved"],
    [{ action: "Voided invoice" }, "voided"],
    [{ action: "Cancelled PO" }, "voided"],
    [{ action: "Stock adjusted", module: "Inventory" }, "stock"],
    [{ action: "Received transfer" }, "stock"],
    [{ action: "Exported clients CSV" }, "exported"],
    [{ action: "Changed role", module: "Users" }, "access"],
    [{ action: "Signed out a session" }, "access"],
    [{ action: "Viewed dashboard" }, "other"],
  ]);
  for (const [entry, kind] of cases) assert.equal(activityKind(entry), kind, entry.action);
});

test("flag: sign-in from a new device or browser, only when there's history to compare", () => {
  const entry = { action: "Signed in", event: "signin", browser: "Safari", device: "iPhone" };
  assert.match(flagReason(entry, { knownDevice: false }), /new device or browser \(Safari on iPhone\)/);
  assert.equal(flagReason(entry, { knownDevice: true }), "");
  assert.equal(flagReason(entry, { knownDevice: null }), "", "first sign-in on record isn't flagged");
});

test("flag: the 3rd and later failed sign-ins within 15 minutes", () => {
  const entry = { action: "Failed sign-in", event: "signin-failed", email: "a@x.ph" };
  assert.equal(flagReason(entry, { recentFailures: 2 }), "");
  assert.match(flagReason(entry, { recentFailures: 3 }), /^3 failed sign-ins/);
  assert.match(flagReason(entry, { recentFailures: 5 }), /^5 failed/);
});

test("flag: voids, stock adjustments without a reason, and client/financial exports", () => {
  assert.match(flagReason({ action: "Voided invoice SI-1" }), /Void or cancellation/);
  assert.match(flagReason({ action: "Stock adjusted", module: "Inventory", changes: [{ field: "Qty", from: "5", to: "3" }] }), /without a reason/);
  assert.match(flagReason({ action: "Stock adjusted", module: "Inventory", changes: [{ field: "Reason", from: "—", to: "(none)" }] }), /without a reason/);
  assert.equal(flagReason({ action: "Stock adjusted", module: "Inventory", changes: [{ field: "Reason", from: "—", to: "Broken in transit" }] }), "");
  assert.equal(flagReason({ action: "Received transfer TR-1" }), "", "receiving isn't an adjustment");
  assert.match(flagReason({ action: "Exported clients CSV", module: "Masterlists" }), /client or financial list/);
  assert.match(flagReason({ action: "Downloaded report", module: "Reports", record: "Collections & AR" }), /client or financial list/);
  assert.equal(flagReason({ action: "Exported", module: "Calendar", record: "team schedule" }), "");
  assert.equal(flagReason({ action: "Created sales invoice" }), "");
});

test("replaying history flags the new device and the failed-sign-in burst", () => {
  const rows = activityRowsInOrder([
    src(1, { action: "Signed in", event: "signin", browser: "Chrome", device: "macOS", ...at("2026-11-10T01:00:00Z") }),
    src(2, { action: "Signed in", event: "signin", browser: "Chrome", device: "macOS", ...at("2026-11-11T01:00:00Z") }),
    src(3, { action: "Signed in", event: "signin", browser: "Safari", device: "iPhone", ...at("2026-11-12T01:00:00Z") }),
    src(4, { action: "Failed sign-in", event: "signin-failed", email: "a@x.ph", ...at("2026-11-12T02:00:00Z") }, null),
    src(5, { action: "Failed sign-in", event: "signin-failed", email: "a@x.ph", ...at("2026-11-12T02:05:00Z") }, null),
    src(6, { action: "Failed sign-in", event: "signin-failed", email: "a@x.ph", ...at("2026-11-12T02:09:00Z") }, null),
    src(7, { action: "Failed sign-in", event: "signin-failed", email: "a@x.ph", ...at("2026-11-12T03:00:00Z") }, null),
  ]);
  assert.deepEqual(rows.map((r) => Boolean(r.flag_reason)), [false, false, true, false, false, true, false]);
  assert.equal(rows[5].email, "a@x.ph");
  assert.equal(rows[0].created_at, "2026-11-10T01:00:00.000Z");
  assert.equal(rows[0].source_key, "logs-1");
});

test("an activity row keeps the full entry, including before → after", () => {
  const changes = [{ field: "Price", from: "100", to: "90" }];
  const row = activityRow(src(9, { user: "Ana", role: "Sales", action: "Edited sale", module: "Sales", record: "SI-9", changes, browser: "Edge", device: "Windows", location: "Naga, Bicol", ...at("2026-11-18T01:00:00Z") }));
  assert.equal(row.kind, "edited");
  assert.equal(row.actor, "Ana");
  assert.equal(row.location, "Naga, Bicol");
  assert.deepEqual(row.data.changes, changes);
  assert.equal(row.flag_reason, null);
});

// ---- access ------------------------------------------------------------------------------------

test("Superadmin sees everyone, CEO everyone read-only, other roles only themselves", () => {
  assert.deepEqual(activityScope({ id: "1", role: "Superadmin" }), { all: true, readOnly: false });
  assert.deepEqual(activityScope({ id: "1", role: "CEO" }), { all: true, readOnly: true });
  for (const role of ["Admin", "Accounting", "Sales", "Logistics", "HR"]) assert.deepEqual(activityScope({ id: "1", role }), { all: false, readOnly: true });
  const mine = new URLSearchParams(activityQuery({ stateKey: "production", profile: { id: "u-9", email: "Ana@X.ph", role: "Sales" }, user: "Somebody Else" }).query);
  assert.equal(mine.get("or"), "(user_id.eq.u-9,email.eq.ana@x.ph)");
  assert.equal(mine.get("actor"), null, "a Sales user can't filter to someone else");
  const boss = new URLSearchParams(activityQuery({ stateKey: "production", profile: { id: "u-1", role: "Superadmin" }, user: "Ana Cruz" }).query);
  assert.equal(boss.get("or"), null);
  assert.equal(boss.get("actor"), "eq.Ana Cruz");
});

test("tabs, search and paging become one server query", () => {
  const p = (/** @type {any} */ o) => new URLSearchParams(activityQuery({ stateKey: "production", profile: { id: "u-1", role: "Superadmin" }, ...o }).query);
  assert.equal(p({ tab: "changes" }).get("kind"), "in.(created,edited,voided,stock)");
  assert.equal(p({ tab: "exports" }).get("kind"), "in.(exported,access)");
  assert.equal(p({ tab: "flagged" }).get("flag_reason"), "not.is.null");
  assert.equal(p({ tab: "bogus" }).get("kind"), null);
  assert.equal(p({ q: "SI-1" }).get("or"), "(actor.ilike.*SI-1*,action.ilike.*SI-1*,record.ilike.*SI-1*,module.ilike.*SI-1*)");
  const own = new URLSearchParams(activityQuery({ stateKey: "production", profile: { id: "u-2", role: "HR" }, q: "memo" }).query);
  assert.equal(own.get("or"), null);
  assert.equal(own.get("and"), "(or(user_id.eq.u-2),or(actor.ilike.*memo*,action.ilike.*memo*,record.ilike.*memo*,module.ilike.*memo*))");
  assert.equal(activitySearchTerm("a,b)(*c%"), "a b c");
  assert.equal(activityTab("signins"), "signins");
});

test("pagination edge cases: first page, page size, junk input, past the end", () => {
  const q = (/** @type {any} */ o) => activityQuery({ stateKey: "s", profile: { id: "u", role: "Superadmin" }, ...o });
  assert.deepEqual([q({}).page, q({}).size, new URLSearchParams(q({}).query).get("offset")], [1, 25, "0"]);
  const third = q({ page: 3, size: 10 });
  assert.equal(new URLSearchParams(third.query).get("offset"), "20");
  assert.equal(new URLSearchParams(third.query).get("limit"), "10");
  assert.deepEqual([q({ page: "x", size: 7 }).page, q({ page: "x", size: 7 }).size], [1, 25]);
  assert.deepEqual([q({ page: -4 }).page], [1]);
  const empty = activityPage([], 0, { page: 1, size: 25 });
  assert.deepEqual([empty.pages, empty.total, empty.items.length], [1, 0, 0]);
  assert.equal(activityPage([], 51, { page: 3, size: 25 }).pages, 3);
});

// ---- append-only, in the database ---------------------------------------------------------------

test("the migration makes activity_log append-only in the database itself", () => {
  const sql = readFileSync(new URL("../docs/migrations/2026-11-18-activity-log.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on table activity_log from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant select, insert on table activity_log to service_role;/);
  assert.doesNotMatch(sql, /grant[^;]*\b(update|delete|truncate)\b[^;]*activity_log/i);
  assert.match(sql, /before update or delete on activity_log\s+for each row execute function activity_log_is_append_only\(\)/);
  assert.match(sql, /before truncate on activity_log\s+for each statement execute function activity_log_is_append_only\(\)/);
  assert.match(sql, /raise exception 'activity_log is append-only/);
  assert.doesNotMatch(sql, /for (update|delete) using/i, "no RLS policy that would allow changes");
});

test("the Worker only ever reads from or inserts into activity_log", () => {
  const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const calls = [...source.matchAll(/\/rest\/v1\/activity_log[^`"]*[`"][^)]*\)/g)].map((m) => m[0]);
  assert.ok(calls.length >= 3);
  assert.ok(!/activity_log[\s\S]{0,400}method: "(PATCH|DELETE|PUT)"/.test(source), "no PATCH/DELETE/PUT near an activity_log path");
  assert.ok(!/activity_log[^\n]*merge-duplicates/.test(source), "inserts never merge (that would be an UPDATE)");
});

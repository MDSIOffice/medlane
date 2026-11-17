// Calendar on the server: events tied to a module or branch only reach people who can access them,
// all-day events and types are checked, and the private iCal feed only works with a valid,
// current link for an active account.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, as } from "./helpers/load-worker.mjs";

beforeEach(() => mockSupabase());

const day = (offset) => new Date(Date.now() + 8 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const events = [
  { id: "EVT-lunch", title: "Team lunch", date: day(2), time: "12:00", createdByUser: "boss@x.ph" },
  { id: "EVT-pm", title: "PM: Lab C · Zybio Z5", date: day(3), time: "09:00", source: "warranty-pm", module: "warranty", branch: "Naga", assigneeEmail: "eng@x.ph", assigneeName: "Engineer 2" },
  { id: "EVT-cash", title: "PDC due", date: day(4), time: "", allDay: true, type: "moneyin", branch: "Las Pinas" },
  { id: "EVT-old", title: "Long ago", date: day(-90), time: "09:00" },
  { id: "EVT-gone", title: "Removed", date: day(5), time: "09:00", removed: true },
];

describe("who sees which events", () => {
  const rows = events.map((e) => ({ module_name: "calendarEvents", record_key: e.id, data: e }));
  const sales = { id: "s", role: "Sales", email: "s@x.ph", branch: "Las Pinas", customPermissions: { enabled: true, view: ["calendar", "sales"], edit: ["calendar"] } };
  const engineer = { id: "e", role: "Engineering", email: "eng@x.ph", branch: "Naga", customPermissions: { enabled: true, view: ["calendar", "warranty"], edit: ["calendar"] } };
  const accounting = { id: "a", role: "Accounting", email: "a@x.ph", branch: "Las Pinas", customPermissions: { enabled: true, view: ["calendar", "collections"], edit: [] } };
  const keys = (/** @type {any} */ profile) => worker.filterRecordsForProfile(rows, profile, "view").map((r) => r.record_key).sort();

  test("module and branch events are filtered per person; removed events still go out so pages drop them", () => {
    assert.deepEqual(keys(sales), ["EVT-gone", "EVT-lunch", "EVT-old"]);
    assert.deepEqual(keys(engineer), ["EVT-gone", "EVT-lunch", "EVT-old", "EVT-pm"]);
    assert.deepEqual(keys(accounting), ["EVT-cash", "EVT-gone", "EVT-lunch", "EVT-old"]);
    assert.equal(keys(as("CEO")).length, 5);
    assert.deepEqual(keys({ ...sales, customPermissions: { enabled: true, view: ["sales"], edit: [] } }), [], "no Calendar, no events");
  });
});

describe("saving events", () => {
  const me = { id: "u1", role: "Sales", email: "s@x.ph", customPermissions: { enabled: true, view: ["calendar"], edit: ["calendar"] } };
  const event = (data) => row("calendarEvents", data.id, { createdByUser: "s@x.ph", title: "Visit", date: day(1), time: "09:00", ...data });
  test("all-day events need no time; types must be known", async () => {
    await worker.assertCalendarEventChangesAllowed(env, STATE, me, [event({ id: "E1", time: "", allDay: true, type: "internal", note: "Bring the forms" })]);
    await assert.rejects(worker.assertCalendarEventChangesAllowed(env, STATE, me, [event({ id: "E2", time: "" })]), /valid time/);
    await assert.rejects(worker.assertCalendarEventChangesAllowed(env, STATE, me, [event({ id: "E3", type: "party" })]), /Unknown calendar event type/);
  });
});

describe("iCal feed", () => {
  const userId = "11111111-2222-3333-4444-555555555555";
  /** Fake Supabase: the feed record, the auth user, the profile and the events. */
  const backend = ({ feed = { version: "a1b2c3d4", enabled: true }, banned = false, profile = { role: "Engineering", branch: "Naga" }, permissions = [{ module_key: "calendar", can_view: true, can_edit: true }, { module_key: "warranty", can_view: true, can_edit: false }] } = {}) => {
    globalThis.fetch = async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("/auth/v1/admin/users/")) return Response.json({ id: userId, email: "eng@x.ph", ...(banned ? { banned_until: "2999-01-01" } : {}) });
      if (url.includes("/rest/v1/profiles")) return Response.json([{ id: userId, email: "eng@x.ph", full_name: "Engineer 2", ...profile }]);
      if (url.includes("/rest/v1/module_permissions")) return Response.json(permissions);
      if (url.includes("module_name=eq.calendarFeeds")) return Response.json(feed ? [{ record_key: userId, data: feed }] : []);
      if (url.includes("module_name=eq.calendarEvents")) return Response.json(events.map((e) => ({ record_key: e.id, data: e })));
      return Response.json([]);
    };
  };
  const token = async (version = "a1b2c3d4") => `${userId}.${version}.${await worker.calendarFeedSignature(env, userId, version)}`;

  test("a valid link returns what that person sees: recent, not removed, allowed modules and branch", async () => {
    backend();
    const ics = await worker.calendarFeedIcs(env, await token());
    assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
    assert.match(ics, /X-WR-CALNAME:Medlane · Engineer 2/);
    assert.match(ics, /SUMMARY:Team lunch/);
    assert.match(ics, /SUMMARY:PM: Lab C · Zybio Z5/);
    assert.ok(!/PDC due|Long ago|Removed/.test(ics), "no Collections module, too old, removed");
  });

  test("a wrong signature, a replaced or turned-off link, or a deactivated account gets nothing", async () => {
    backend();
    assert.equal(await worker.calendarFeedIcs(env, `${userId}.a1b2c3d4.forged`), null);
    assert.equal(await worker.calendarFeedIcs(env, "not-a-token"), null);
    assert.equal(await worker.calendarFeedIcs(env, `${(await token()).replace(userId, "99999999-2222-3333-4444-555555555555")}`), null, "signature is bound to the user");
    backend({ feed: { version: "ffffffff", enabled: true } });
    assert.equal(await worker.calendarFeedIcs(env, await token()), null, "a new link replaced this one");
    backend({ feed: { version: "a1b2c3d4", enabled: false } });
    assert.equal(await worker.calendarFeedIcs(env, await token()), null, "turned off");
    backend({ banned: true });
    assert.equal(await worker.calendarFeedIcs(env, await token()), null, "deactivated");
  });

  test("the signature depends on the server secret", async () => {
    const a = await worker.calendarFeedSignature(env, userId, "a1b2c3d4");
    const b = await worker.calendarFeedSignature({ ...env, CALENDAR_FEED_SECRET: "other" }, userId, "a1b2c3d4");
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  });
});

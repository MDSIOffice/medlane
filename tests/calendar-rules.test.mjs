// Calendar rules (public/scripts/calendar-rules.js, a plain browser script that also sets
// globalThis.CalendarRules, which is how the Worker and these tests use it).
import test from "node:test";
import assert from "node:assert/strict";
import "../public/scripts/calendar-rules.js";

const C = /** @type {any} */ (globalThis).CalendarRules;

test("month grid: 6 weeks, Monday first, weekends marked", () => {
  const grid = C.monthGrid(2026, 11);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, "2026-10-26", "1 Nov 2026 is a Sunday: the grid starts on the Monday before");
  assert.equal(grid.find((d) => d.date === "2026-11-01").weekend, true);
  assert.equal(grid.find((d) => d.date === "2026-11-02").weekend, false);
  assert.equal(grid.filter((d) => d.inMonth).length, 30);
  assert.equal(C.monthGrid(2026, 6)[0].date, "2026-06-01", "a month starting on Monday starts the grid");
});

test("event types: stored type, else service for visits/PMs, else internal", () => {
  assert.equal(C.typeOf({ type: "moneyin" }), "moneyin");
  assert.equal(C.typeOf({ source: "warranty-pm" }), "service");
  assert.equal(C.typeOf({ title: "Visit: Lab C · Zybio Z5 (TSR-1)" }), "service", "older visit events by title");
  assert.equal(C.typeOf({ type: "party", title: "Team lunch" }), "internal");
  assert.equal(C.typeInfo("service").color, "#7C5CC4");
});

test("permissions: module and branch events are only visible to people who can access them", () => {
  const pm = { id: "1", source: "warranty-pm", branch: "Naga", title: "PM" };
  const delivery = { id: "2", type: "deliveries", branch: "Las Pinas", title: "Deliver" };
  const lunch = { id: "3", title: "Team lunch" };
  const sales = { role: "Sales", email: "s@x.ph", modules: ["calendar", "sales"], branch: "Las Piñas" };
  const nagaEngineer = { role: "Engineering", email: "e@x.ph", modules: ["calendar", "warranty", "product-issues"], branch: "Naga" };
  assert.equal(C.visibleTo(lunch, sales), true);
  assert.equal(C.visibleTo(delivery, sales), true, "accents and case don't matter");
  assert.equal(C.visibleTo(pm, sales), false, "no Warranty module");
  assert.equal(C.visibleTo(pm, nagaEngineer), true);
  assert.equal(C.visibleTo(delivery, nagaEngineer), false, "no Sales module");
  assert.equal(C.visibleTo({ ...pm, branch: "Las Pinas" }, nagaEngineer), false, "other branch");
  assert.equal(C.visibleTo({ ...pm, branch: "Las Pinas" }, { ...nagaEngineer, branch: "all" }), true);
  assert.equal(C.visibleTo({ ...pm, assigneeEmail: "S@x.ph" }, sales), true, "assigned to them");
  assert.equal(C.visibleTo({ ...delivery, createdByUser: "e@x.ph" }, nagaEngineer), true, "they added it");
  assert.equal(C.visibleTo(pm, { role: "CEO" }), true);
  assert.equal(C.visibleTo({ ...lunch, removed: true }, { role: "CEO" }), false);
});

test("next 2 weeks: grouped by day, all-day first, nothing outside the window", () => {
  const events = [
    { id: "a", date: "2026-11-18", time: "14:00", title: "B" },
    { id: "b", date: "2026-11-18", time: "", allDay: true, title: "Month-end" },
    { id: "c", date: "2026-11-18", time: "09:00", title: "A" },
    { id: "d", date: "2026-12-01", time: "09:00", title: "Last day" },
    { id: "e", date: "2026-12-02", time: "09:00", title: "Too late" },
    { id: "f", date: "2026-11-17", time: "09:00", title: "Yesterday" },
    { id: "g", date: "2026-11-20", time: "09:00", title: "Removed", removed: true },
  ];
  const days = C.agenda(events, "2026-11-18", 14);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-18", "2026-12-01"]);
  assert.deepEqual(days[0].events.map((e) => e.id), ["b", "c", "a"]);
});

test("conflicts: one person twice within 90 minutes, or two service visits at one branch at once", () => {
  const e = (id, date, time, extra = {}) => ({ id, date, time, title: id, ...extra });
  const found = C.conflicts([
    e("v1", "2026-11-20", "09:00", { assigneeEmail: "e1@x.ph", assigneeName: "Engineer 1" }),
    e("v2", "2026-11-20", "10:00", { assigneeEmail: "E1@x.ph" }),
    e("v3", "2026-11-20", "11:20", { assigneeEmail: "e1@x.ph" }),
    e("p1", "2026-11-21", "09:00", { source: "warranty-pm", branch: "Naga" }),
    e("p2", "2026-11-21", "09:00", { source: "support-visit", branch: "naga" }),
    e("l1", "2026-11-21", "09:00", { branch: "Naga" }),
    e("old", "2026-11-01", "09:00", { assigneeEmail: "e1@x.ph" }),
  ], "2026-11-18");
  assert.deepEqual(found.map((c) => [c.a.id, c.b.id, c.reason]), [["v1", "v2", "person"], ["v2", "v3", "person"], ["p1", "p2", "branch"]]);
  assert.equal(found[0].who, "Engineer 1");
});

test("iCal: valid feed, Manila times in UTC, escaped and folded text, all-day events", () => {
  const ics = C.toIcs([
    { id: "EVT-1", date: "2026-11-20", time: "09:30", title: "PM: Lab C, Zybio Z5; serial 1", note: "Bring the probe\nand gloves", branch: "Naga", source: "warranty-pm", assigneeName: "Engineer 2" },
    { id: "EVT-2", date: "2026-11-30", allDay: true, time: "", title: "Month-end close ".repeat(8) },
    { id: "EVT-3", date: "2026-11-21", time: "10:00", title: "Removed", removed: true },
  ], { name: "Medlane · Engineer 2", now: new Date("2026-11-18T00:00:00Z") });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART:20261120T013000Z\r\nDTEND:20261120T023000Z/);
  assert.match(ics, /SUMMARY:PM: Lab C\\, Zybio Z5\\; serial 1/);
  assert.match(ics, /DESCRIPTION:Bring the probe\\nand gloves\\nFor Engineer 2/);
  assert.match(ics, /CATEGORIES:Service & installs/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201/);
  assert.ok(!ics.includes("Removed"));
  assert.ok(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75), "lines folded at 75 octets");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
});

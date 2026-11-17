import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const check = worker.assertCalendarEventChangesAllowed;
const me = (role) => ({ ...as(role, ["calendar"]), email: "ana@medlane.test" });
const event = (extra = {}) => ({ id: "EVT-1", title: "Client visit", date: "2099-01-05", time: "09:00", createdBy: "Ana", createdByUser: "ana@medlane.test", ...extra });
beforeEach(() => mockSupabase());

describe("calendar event department", () => {
  test("a new event is stamped with the creator's real role", async () => {
    const rows = [row("calendarEvents", "EVT-1", event({ createdByRole: "CEO" }))];
    await check(env, STATE, me("Sales"), rows);
    assert.equal(rows[0].data.createdByRole, "Sales");
  });
  test("an existing event keeps the department it was created under", async () => {
    mockSupabase({ calendarEvents: [stored("EVT-1", event({ createdByRole: "Sales" }))] });
    const rows = [row("calendarEvents", "EVT-1", event({ title: "Moved visit", createdByRole: "Accounting" }))];
    await check(env, STATE, me("Sales"), rows);
    assert.equal(rows[0].data.createdByRole, "Sales");
  });
  test("the owner is always whoever made it, and it never changes", async () => {
    const mine = [row("calendarEvents", "EVT-9", event({ id: "EVT-9", createdBy: "Someone else", createdByUser: "" }))];
    await check(env, STATE, { ...me("Sales"), name: "Ana Cruz" }, mine);
    assert.deepEqual([mine[0].data.createdByUser, mine[0].data.createdBy], ["ana@medlane.test", "Ana Cruz"]);
    // Management adding "as" someone else still becomes the owner themselves.
    const boss = [row("calendarEvents", "EVT-8", event({ id: "EVT-8", createdBy: "Joy", createdByUser: "joy@medlane.test" }))];
    await check(env, STATE, { ...as("CEO"), email: "ceo@medlane.test", name: "The CEO" }, boss);
    assert.deepEqual([boss[0].data.createdByUser, boss[0].data.createdBy, boss[0].data.createdByRole], ["ceo@medlane.test", "The CEO", "CEO"]);
    // Editing an event (even by management) keeps its owner.
    mockSupabase({ calendarEvents: [stored("EVT-1", event({ createdByRole: "Sales" }))] });
    const edited = [row("calendarEvents", "EVT-1", event({ title: "Moved", createdBy: "The CEO", createdByUser: "ceo@medlane.test", createdByRole: "CEO" }))];
    await check(env, STATE, { ...as("CEO"), email: "ceo@medlane.test", name: "The CEO" }, edited);
    assert.deepEqual([edited[0].data.createdByUser, edited[0].data.createdBy, edited[0].data.createdByRole], ["ana@medlane.test", "Ana", "Sales"]);
  });
  test("two people's new events are checked independently", async () => {
    const rows = [row("calendarEvents", "EVT-1", event()), row("calendarEvents", "EVT-2", event({ id: "EVT-2", createdByUser: "joy@medlane.test" }))];
    await assert.rejects(check(env, STATE, me("Sales"), rows), /only add calendar events as yourself/);
  });
});

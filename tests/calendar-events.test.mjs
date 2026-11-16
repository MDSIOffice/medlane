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
  test("two people's new events are checked independently", async () => {
    const rows = [row("calendarEvents", "EVT-1", event()), row("calendarEvents", "EVT-2", event({ id: "EVT-2", createdByUser: "joy@medlane.test" }))];
    await assert.rejects(check(env, STATE, me("Sales"), rows), /only add calendar events as yourself/);
  });
});

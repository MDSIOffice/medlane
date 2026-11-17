// Warranty on the server: unit dates/contract values are checked, claims move forward one step at
// a time with a non-negative part cost, and the PM interval settings are management-only.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

beforeEach(() => mockSupabase());
const check = worker.assertWarrantyChangesAllowed;
const claim = (id, data) => row("warrantyClaims", id, { id, serial: "Z5-1", partCost: 1000, status: "Open", ...data });

test("installed units: dates must be dates, a PM can't be logged in the future, contract status is known", async () => {
  await check(env, STATE, as("Admin"), [row("warranties", "Z5-1", { serial: "Z5-1", installDate: "2025-01-01", warrantyEnd: "2027-01-01", lastPm: "2026-10-01", contractStatus: "quoted" })]);
  await check(env, STATE, as("Admin"), [row("warranties", "OLD", { serial: "OLD", status: "Active", service: "" })]);
  await assert.rejects(check(env, STATE, as("Admin"), [row("warranties", "Z5-1", { warrantyEnd: "01/01/2027" })]), /warrantyEnd of unit Z5-1 must be a date/);
  await assert.rejects(check(env, STATE, as("Admin"), [row("warranties", "Z5-1", { lastPm: "2099-01-01" })]), /can't be in the future/);
  await assert.rejects(check(env, STATE, as("Admin"), [row("warranties", "Z5-1", { contractStatus: "maybe" })]), /Unknown service contract status/);
});

test("a new claim starts Open with a part cost of zero or more", async () => {
  await check(env, STATE, as("Admin"), [claim("WC-2026-001", {})]);
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-2026-001", { status: "Credited" })]), /must start as Open/);
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-2026-001", { partCost: -1 })]), /zero or more/);
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-2026-001", { partCost: "abc" })]), /zero or more/);
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-2026-001", { status: "Paid" })]), /Unknown status/);
});

test("claims move forward one step at a time; Superadmin/CEO can correct", async () => {
  mockSupabase({ warrantyClaims: [stored("WC-1", { id: "WC-1", status: "Open", partCost: 1000 })] });
  await check(env, STATE, as("Admin"), [claim("WC-1", { status: "Part received" })]);
  await check(env, STATE, as("Admin"), [claim("WC-1", { status: "Open", rma: "RMA-55" })], "same step, other fields");
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-1", { status: "Credited" })]), /can't move from Open to Credited/);
  await check(env, STATE, as("CEO"), [claim("WC-1", { status: "Credited" })]);
});

test("a credited claim is locked", async () => {
  mockSupabase({ warrantyClaims: [stored("WC-1", { id: "WC-1", serial: "Z5-1", partCost: 1000, status: "Credited" })] });
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-1", { status: "Credited", partCost: 5 })]), /credited and can't be changed/);
  await assert.rejects(check(env, STATE, as("Admin"), [claim("WC-1", { status: "Open" })]), /can't move/);
});

test("PM intervals: Superadmin, CEO and Admin change them; claims follow Warranty edit access", () => {
  for (const role of ["Superadmin", "CEO", "Admin"]) assert.equal(worker.canAccessKey(as(role, ["warranty"]), "warrantySettings", "edit"), true, role);
  assert.equal(worker.canAccessKey(as("Sales", ["warranty"]), "warrantySettings", "edit"), false);
  assert.equal(worker.canAccessKey(as("Sales", ["warranty"]), "warrantySettings", "view"), true);
  assert.equal(worker.canAccessKey(as("Sales", ["warranty"]), "warrantyClaims", "edit"), true);
  assert.equal(worker.canAccessKey(as("Sales", []), "warrantyClaims", "view"), false);
});

// ---- Alerts: warranty ending and preventive maintenance -----------------------------------------
import { generateNotices, noticeVisibleTo } from "../src/notifications.js";

test("alerts: warranty ending without an active contract, PM overdue (urgent) and PM due, unless already booked", () => {
  const now = new Date("2026-11-18T09:00:00+08:00");
  const state = {
    warranties: [
      { serial: "A", model: "Zybio Z5", client: "Lab C", warrantyEnd: "2026-12-29", lastPm: "2026-10-01" },
      { serial: "B", model: "VEDA8900", client: "Clinic B", warrantyEnd: "2026-12-01", contractStatus: "active", contractEnd: "2027-12-01", lastPm: "2026-10-01" },
      { serial: "C", model: "EXU 500", client: "Diag D", warrantyEnd: "2025-01-01", lastPm: "2026-07-01" },
      { serial: "D", model: "EXC 200", client: "Hosp A", warrantyEnd: "2028-01-01", lastPm: "2026-07-01", pmScheduledFor: "2026-11-25" },
      { serial: "E", model: "Zybio Z5", client: "Hosp E", warrantyEnd: "2028-01-01", lastPm: "2026-08-25" },
      { serial: "F", model: "VEDA8900", client: "Lab F", warrantyEnd: "2028-01-01", lastPm: "2026-08-20" },
    ],
    warrantySettings: [{ id: "warranty-settings", pmMonths: { VEDA8900: 6 } }],
  };
  const byKey = Object.fromEntries(generateNotices(state, now).map((n) => [n.key, n]));
  assert.equal(byKey["warranty-ending"].record, "A", "B has an active contract");
  assert.equal(byKey["warranty-ending"].message, "Zybio Z5 at Lab C: warranty ends 29 Dec 2026 and no service contract has been quoted.");
  assert.equal(byKey["warranty-pm-overdue"].record, "C", "D is overdue but booked");
  assert.equal(byKey["warranty-pm-overdue"].urgent, true);
  assert.equal(byKey["warranty-pm-overdue"].message, "EXU 500 at Diag D is overdue for preventive maintenance (was due 1 Oct 2026) and no visit is booked.");
  assert.equal(byKey["warranty-pm-due"].record, "E", "F's model is every 6 months, so not due yet");
  assert.ok(!byKey["warranty-pm-due"].urgent);

  // Same units two days later: same message, so it is not sent again.
  const later = Object.fromEntries(generateNotices(state, new Date("2026-11-20T09:00:00+08:00")).map((n) => [n.key, n]));
  assert.equal(later["warranty-pm-overdue"].message, byKey["warranty-pm-overdue"].message);

  // Who gets them: Warranty module holders and management; not Engineering without Warranty.
  const pm = byKey["warranty-pm-overdue"];
  assert.equal(noticeVisibleTo({ email: "a@x.ph", role: "Admin", modules: ["warranty"] }, pm), true);
  assert.equal(noticeVisibleTo({ email: "c@x.ph", role: "CEO", modules: [] }, pm), true);
  assert.equal(noticeVisibleTo({ email: "e@x.ph", role: "Engineering", modules: ["product-issues"] }, pm), false);

  // Booking the PM clears the alert.
  state.warranties[2].pmScheduledFor = "2026-11-21";
  assert.ok(!generateNotices(state, now).some((n) => n.key === "warranty-pm-overdue"));
});

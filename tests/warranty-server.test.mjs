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

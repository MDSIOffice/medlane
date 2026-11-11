// Server guard for the inventory migration import: new stock rows flagged `migrated` must point at an
// active Products-masterlist item, have a positive quantity, a branch and a valid expiry.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const { assertMigratedStockAllowed: check } = worker;
const item = (code, extra = {}) => stored(code, { code, name: `Item ${code}`, ...extra });
const stock = (over = {}) => ({ code: "RGT-1", item: "Item RGT-1", branch: "Las Pinas", lot: "", serial: "", expiry: "2027-06-30", qty: 25, migrated: true, ...over });
const stockRow = (data, key = `${data.code}|${data.branch}|lot`) => row("inventory", key, data);
const run = (profile, ...stocks) => check(env, STATE, profile, stocks.map((data) => stockRow(data)));

beforeEach(() => mockSupabase({ items: [item("RGT-1"), item("OLD-1", { archived: true })], inventory: [] }));

describe("inventory migration import", () => {
  test("a valid row for a masterlist product passes", async () => { await run(as("Superadmin"), stock()); });
  test("no expiry (N/A) and decimal quantity pass", async () => { await run(as("CEO"), stock({ expiry: "N/A", qty: 0.5 })); });
  test("item code match is case-insensitive", async () => { await run(as("Superadmin"), stock({ code: "rgt-1" })); });
  test("a product not in the masterlist is refused", async () => {
    await assert.rejects(run(as("Superadmin"), stock({ code: "NOPE-9" })), /not an active item in the Products masterlist/);
  });
  test("an archived product is refused", async () => {
    await assert.rejects(run(as("Superadmin"), stock({ code: "OLD-1" })), /not an active item/);
  });
  for (const qty of [0, -5, "abc"]) {
    test(`quantity ${JSON.stringify(qty)} is refused`, async () => {
      await assert.rejects(run(as("Superadmin"), stock({ qty })), /quantity must be greater than zero/);
    });
  }
  test("a missing branch is refused", async () => {
    await assert.rejects(run(as("Superadmin"), stock({ branch: "" })), /branch is required/);
  });
  test("a non-date expiry is refused", async () => {
    await assert.rejects(run(as("Superadmin"), stock({ expiry: "next year" })), /expiry must be a date/);
  });
  test("someone without import rights cannot create migrated stock", async () => {
    await assert.rejects(run(as("Logistics", ["inventory"]), stock()), /requires Imports edit permission/);
  });
  test("Imports edit permission is enough", async () => { await run(as("Admin", ["imports", "inventory"]), stock()); });
  test("one bad row refuses the whole save", async () => {
    await assert.rejects(run(as("Superadmin"), stock(), stock({ code: "NOPE-9", lot: "B" })), /not an active item/);
  });
  test("the same product as different lots in one import is allowed", async () => {
    await run(as("Superadmin"), stock({ lot: "A" }), stock({ code: "rgt-1", lot: "B", expiry: "2028-01-31" }));
  });
  test("the same product and lot twice for one branch in one import is refused", async () => {
    await assert.rejects(run(as("Superadmin"), stock({ lot: "A" }), stock({ code: "rgt-1", lot: "a", qty: 2 })), /more than once/);
  });
  test("the same product for two different branches in one save is allowed", async () => {
    await run(as("Superadmin"), stock(), stock({ branch: "Naga" }));
  });
  test("an existing migrated row (later invoiced/edited) is not re-checked", async () => {
    mockSupabase({ items: [], inventory: [stored("RGT-1|Las Pinas|lot", stock())] });
    await run(as("Logistics", ["inventory"]), stock({ qty: 3 }));
  });
  test("ordinary (non-migrated) stock rows are untouched by this guard", async () => {
    const calls = mockSupabase({ items: [] });
    await run(as("Logistics", ["inventory"]), stock({ migrated: false, code: "ANYTHING" }));
    assert.equal(calls.length, 0);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

const { auditChangeEntries, auditSensitivity, isSignInEntry } = worker;
const r = (module_name, record_key, data) => ({ module_name, record_key, data });
const before = (entries) => new Map(Object.entries(entries).map(([moduleName, records]) => [moduleName, new Map(Object.entries(records))]));

describe("watched-field changes", () => {
  test("a selling price edit records before and after", () => {
    const out = auditChangeEntries([r("items", "G78", { code: "G78", name: "HBA1C", price: 8250 })], before({ items: { G78: { code: "G78", name: "HBA1C", price: 8500 } } }));
    assert.equal(out.length, 1);
    assert.equal(out[0].action, "Price changed");
    assert.deepEqual(out[0].changes, [{ field: "Selling price", from: "8500", to: "8250" }]);
  });
  test("unchanged watched fields write nothing", () => {
    assert.deepEqual(auditChangeEntries([r("items", "G78", { price: 10, name: "x" })], before({ items: { G78: { price: 10, name: "y" } } })), []);
  });
  test("a direct stock edit records the quantity and the reason", () => {
    const old = { item: "FOB", lot: "218289", branch: "Naga", qty: 7, history: [] };
    const out = auditChangeEntries([r("inventory", "k1", { ...old, qty: 6, history: [{ reason: "Damaged" }] })], before({ inventory: { k1: old } }));
    assert.equal(out[0].action, "Stock adjusted");
    assert.deepEqual(out[0].changes, [{ field: "Quantity", from: "7", to: "6" }, { field: "Reason", from: "—", to: "Damaged" }]);
  });
  test("stock moved by an invoice is not reported as an adjustment", () => {
    const out = auditChangeEntries([r("sales", "SI-1", { documentNo: "SI-1" }), r("inventory", "k1", { qty: 5 })], before({ inventory: { k1: { qty: 7 } } }));
    assert.deepEqual(out, []);
  });
  test("a new invoice with a discount is recorded; one without is not", () => {
    assert.equal(auditChangeEntries([r("sales", "SI-2", { documentNo: "SI-2", discount: 500 })], before({}))[0].action, "Discount applied");
    assert.deepEqual(auditChangeEntries([r("sales", "SI-3", { documentNo: "SI-3", discount: 0 })], before({})), []);
  });
  test("a receipt date edit is recorded", () => {
    const out = auditChangeEntries([r("payments", "CR-1", { receiptNo: "CR-1", dateRecorded: "2026-11-08", amount: 100 })], before({ payments: { "CR-1": { receiptNo: "CR-1", dateRecorded: "2026-11-07", amount: 100 } } }));
    assert.deepEqual(out[0].changes, [{ field: "Receipt date", from: "2026-11-07", to: "2026-11-08" }]);
  });
  test("other modules are ignored", () => {
    assert.deepEqual(auditChangeEntries([r("calendarEvents", "E1", { title: "x" })], before({})), []);
  });
});

describe("sensitivity", () => {
  for (const [action, expected] of [["Exported client history (CSV)", "Export"], ["Price changed", "Money or stock"], ["Role changed", "Access"], ["Cancelled invoice", "Cancelled or removed"], ["Created invoice", ""], ["Approved expense", ""]]) {
    test(`${action} → ${expected || "routine"}`, () => assert.equal(auditSensitivity({ action }), expected));
  }
  test("failed sign-ins and watched changes are sensitive", () => {
    assert.equal(auditSensitivity({ action: "Failed sign-in", event: "signin-failed" }), "Failed sign-in");
    assert.equal(auditSensitivity({ action: "Invoice edited", changes: [{ field: "Total", from: "1", to: "2" }] }), "Changed a watched field");
  });
  test("old and new sign-in entries are both recognised", () => {
    assert.ok(isSignInEntry({ action: "Logged in" }));
    assert.ok(isSignInEntry({ action: "Signed in", event: "signin" }));
    assert.ok(!isSignInEntry({ action: "Created invoice" }));
  });
});

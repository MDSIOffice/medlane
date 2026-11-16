// Recon checks: one pass, one fail and (where the check has inputs that can be missing) one
// can't-run fixture per check, plus the difference-merge rules.
import test from "node:test";
import assert from "node:assert/strict";
import { runRecon, dataFromRows, mergeDifferences, RECON_CHECKS, setPath, getPath, sameValue } from "../src/recon.js";

const NOW = new Date("2026-11-16T03:00:00Z"); // 11:00 Manila
const TODAY = "2026-11-16";

/** Builds a data object from { module: [records] }, keyed like the Worker loads them. */
function data(modules) {
  const rows = [];
  for (const [module, records] of Object.entries(modules)) for (const record of records) {
    const key = module === "inventory" ? [record.code, record.branch, record.lot || record.serial || "lot"].join("|") : String(record.id || record.documentNo || record.cvNo || record.code || record.name);
    rows.push({ module_name: module, record_key: key, data: structuredClone(record) });
  }
  return dataFromRows(rows);
}
/** Runs one check. */
function run(id, modules) {
  const out = runRecon(data(modules), { now: NOW, only: [id] });
  return { ...out.results[id], rows: out.rows };
}
const pass = (id, modules) => { const r = run(id, modules); assert.equal(r.status, "pass", `${id} should pass: ${JSON.stringify(r.rows.map((x) => x.title))}`); return r; };
const fail = (id, modules, n = 1) => { const r = run(id, modules); assert.equal(r.status, "diff", `${id} should find differences`); assert.equal(r.rows.length, n); return r; };
const cantRun = (id, modules) => { const r = run(id, modules); assert.equal(r.status, "cant"); assert.ok(r.reason.length > 10, "a reason is given"); return r; };

const item = (code, extra = {}) => ({ code, name: `Item ${code}`, cost: 100, price: 150, ...extra });
const stock = (code, qty, extra = {}) => ({ code, item: `Item ${code}`, branch: "Main", lot: "L1", qty, ...extra });

test("k1 stock movements add up", () => {
  cantRun("k1", { inventory: [stock("A", 5)] });
  const baseline = { id: "movement-baseline", at: "2026-11-10T00:00:00.000Z", qty: { "A|Main|L1": 10 } };
  pass("k1", { reconSettings: [baseline], inventory: [stock("A", 7)], stockMovements: [{ id: "m1", at: "2026-11-11T00:00:00.000Z", key: "A|Main|L1", delta: -3, source: { type: "invoice" } }] });
  const r = fail("k1", { items: [item("A")], reconSettings: [baseline], inventory: [stock("A", 6)], stockMovements: [{ id: "m1", at: "2026-11-11T00:00:00.000Z", key: "A|Main|L1", delta: -3 }] });
  assert.equal(r.rows[0].amount, 100);
  assert.equal(r.rows[0].fix.ops[0].op, "movement"); // no count: accept, stock unchanged
  // A later count agreeing with the movement log offers to correct on hand instead.
  const counted = fail("k1", { items: [item("A")], reconSettings: [baseline], inventory: [stock("A", 6)], stockMovements: [{ id: "m1", at: "2026-11-11T00:00:00.000Z", key: "A|Main|L1", delta: -3 }], stockCounts: [{ id: "c1", branch: "Main", status: "Posted", at: "2026-11-12T00:00:00.000Z", lines: [{ code: "A", lot: "L1", system: 6, counted: 7 }] }] });
  assert.deepEqual(counted.rows[0].fix.ops.map((op) => op.op), ["movement", "stock"]);
  assert.equal(counted.rows[0].fix.ops[1].after, 7);
});

test("k2 transfers sent = received", () => {
  pass("k2", { pendingTransfers: [] }); // nothing received yet is a pass with 0 checked
  pass("k2", { pendingTransfers: [{ id: "T1", status: "Received", lines: [{ code: "A", dispatchedQty: 4, receivedQty: 4 }] }] });
  const r = fail("k2", { items: [item("A")], pendingTransfers: [{ id: "T1", status: "Received", from: "Main", to: "Cebu", lines: [{ code: "A", dispatchedQty: 4, receivedQty: 3 }] }] });
  assert.equal(r.rows[0].title, "Transfer arrived short");
  assert.equal(r.rows[0].fix.kind, "open");
});

test("k3 physical count = system", () => {
  cantRun("k3", { stockCounts: [{ id: "c1", status: "Draft", branch: "Main", lines: [] }] });
  pass("k3", { stockCounts: [{ id: "c1", status: "Posted", branch: "Main", at: "2026-11-12", lines: [{ code: "A", lot: "L1", system: 5, counted: 5 }] }] });
  const r = fail("k3", { items: [item("A")], inventory: [stock("A", 5)], stockCounts: [{ id: "c1", status: "Posted", branch: "Main", at: "2026-11-12", lines: [{ code: "A", lot: "L1", system: 5, counted: 3 }] }] });
  assert.equal(r.rows[0].fix.ops[0].after, 3);
  assert.equal(r.rows[0].fix.ops[1].field, "lines.0.adjusted");
  pass("k3", { inventory: [stock("A", 3)], stockCounts: [{ id: "c1", status: "Posted", branch: "Main", at: "2026-11-12", lines: [{ code: "A", lot: "L1", system: 5, counted: 3, adjusted: true }] }] });
});

test("k4 no expired stock available", () => {
  pass("k4", { inventory: [stock("A", 5, { expiry: "2027-01-01" }), stock("B", 0, { expiry: "2026-01-01" })] });
  const r = fail("k4", { items: [item("A")], inventory: [stock("A", 5, { expiry: "2026-11-15" })] });
  assert.equal(r.rows[0].fix.ops[0].after, 0);
  assert.equal(r.rows[0].amount, 500);
});

test("k5 every adjustment has a reason", () => {
  pass("k5", { inventory: [stock("A", 5, { history: [{ at: "2026-11-12", by: "x", changes: ["qty 4 → 5"], reason: "Found in storeroom" }] })] });
  fail("k5", { inventory: [stock("A", 5, { history: [{ at: "2026-11-12", by: "x", changes: ["qty 4 → 5"] }] })] });
  fail("k5", { stockMovements: [{ id: "m1", key: "A|Main|L1", code: "A", at: "2026-11-12", delta: 2, before: 3, after: 5, source: { type: "unattributed" } }] });
});

test("k6 PO = received = billed", () => {
  cantRun("k6", { payables: [{ id: "B1", amount: 100 }] });
  const po = { id: "SPO-1", supplier: "S", status: "Partially Received", lines: [{ code: "A", qty: 10, receivedQty: 8, price: 100 }] };
  pass("k6", { inventoryPurchaseOrders: [po], payables: [{ id: "B1", poId: "SPO-1", amount: 800 }] });
  const r = fail("k6", { inventoryPurchaseOrders: [po], payables: [{ id: "B1", poId: "SPO-1", amount: 1000 }] });
  assert.equal(r.rows[0].amount, 200);
  fail("k6", { payables: [{ id: "B1", poId: "SPO-404", amount: 1000 }] });
});

test("k7 item cost = latest PO cost", () => {
  const pos = [{ id: "SPO-1", status: "Fully Received", date: "2026-10-01", lines: [{ code: "A", price: 90 }] }, { id: "SPO-2", status: "Fully Received", date: "2026-11-01", lines: [{ code: "A", price: 110 }] }];
  pass("k7", { items: [item("A", { cost: 110 })], inventoryPurchaseOrders: pos });
  const r = fail("k7", { items: [item("A", { cost: 100 })], inventory: [stock("A", 5)], inventoryPurchaseOrders: pos });
  assert.equal(r.rows[0].fix.ops[0].after, 110);
  assert.equal(r.rows[0].amount, 50);
  pass("k7", { items: [item("A", { cost: 100 })], inventoryPurchaseOrders: [{ ...pos[1], status: "Cancelled" }] });
});

test("k8 bills are consistent", () => {
  pass("k8", { payables: [{ id: "B1", amount: 100, paid: 100, requestStatus: "Approved", paymentConfirmed: true }] });
  fail("k8", { payables: [{ id: "B1", amount: 100, paid: 120, requestStatus: "Approved" }] });
  fail("k8", { payables: [{ id: "B1", amount: 100, requestStatus: "Pending", paymentConfirmed: true }] });
  fail("k8", { payables: [{ id: "B1", amount: -5, requestStatus: "Pending" }] });
});

test("k9 completed client POs are fully invoiced", () => {
  const po = { id: "PO-1", client: "C", status: "Completed", lines: [{ code: "A", qty: 5, price: 200 }] };
  pass("k9", { purchaseOrders: [po], sales: [{ documentNo: "SI-1", po: "PO-1", lines: [{ code: "A", qty: 5 }] }] });
  const r = fail("k9", { purchaseOrders: [po], sales: [{ documentNo: "SI-1", po: "PO-1", lines: [{ code: "A", qty: 3 }] }] });
  assert.equal(r.rows[0].amount, 400);
  pass("k9", { purchaseOrders: [{ ...po, completedType: "Closed short" }], sales: [] });
  fail("k9", { purchaseOrders: [po], sales: [{ documentNo: "SI-1", po: "PO-1", status: "Cancelled", lines: [{ code: "A", qty: 5 }] }] });
});

test("k10 invoice math is correct", () => {
  pass("k10", { sales: [{ documentNo: "SI-1", lines: [{ qty: 2, price: 112 }], amount: 224, discount: 24, net: 200 }] });
  fail("k10", { sales: [{ documentNo: "SI-1", lines: [{ qty: 2, price: 112 }], amount: 230, discount: 0, net: 230 }] });
  fail("k10", { sales: [{ documentNo: "SI-1", lines: [{ qty: 2, price: 112 }], amount: 224, discount: 24, net: 210 }] });
  pass("k10", { sales: [{ documentNo: "DR-1", type: "DR", lines: [{ qty: 2, price: 112 }], amount: 0, net: 0 }] });
});

test("k11 no gaps in invoice numbers", () => {
  cantRun("k11", { sales: [{ documentNo: "SI-1" }] });
  const settings = (extra = {}) => ({ id: "settings", invoiceSeries: [{ id: "main", prefix: "SI-", start: 1, ...extra }] });
  pass("k11", { reconSettings: [settings()], sales: [{ documentNo: "SI-1" }, { documentNo: "SI-2" }, { documentNo: "SI-3" }] });
  const r = fail("k11", { reconSettings: [settings()], sales: [{ documentNo: "SI-1" }, { documentNo: "SI-4" }] });
  assert.equal(r.rows[0].ref, "SI-2, SI-3");
  assert.equal(r.rows[0].fix.ops.length, 2);
  assert.equal(r.rows[0].fix.needsNote, true);
  pass("k11", { reconSettings: [settings({ voided: { 2: { reason: "Spoiled" }, 3: { reason: "Spoiled" } } })], sales: [{ documentNo: "SI-1" }, { documentNo: "SI-4" }] });
});

test("k12 prices match the price list", () => {
  cantRun("k12", { items: [item("A", { price: 0 })] });
  pass("k12", { items: [item("A")], sales: [{ documentNo: "SI-1", date: "2026-11-10", lines: [{ code: "A", qty: 1, price: 150 }] }] });
  const r = fail("k12", { items: [item("A")], sales: [{ documentNo: "SI-1", date: "2026-11-10", lines: [{ code: "A", qty: 2, price: 120 }] }] });
  assert.equal(r.rows[0].amount, 60);
  // The client's own price list governs; older invoices are outside the 90-day window.
  pass("k12", { items: [item("A")], clients: [{ name: "C", priceList: "Hospital" }], priceLists: [{ id: "pl1", name: "Hospital", discountPct: 20 }], sales: [{ documentNo: "SI-1", client: "C", date: "2026-11-10", lines: [{ code: "A", qty: 1, price: 120 }] }] });
  pass("k12", { items: [item("A")], sales: [{ documentNo: "SI-1", date: "2026-01-10", lines: [{ code: "A", qty: 1, price: 1 }] }] });
  pass("k12", { items: [item("A", { quotedPerDeal: true, price: 150 })], sales: [{ documentNo: "SI-1", date: "2026-11-10", lines: [{ code: "A", qty: 1, price: 1 }] }] });
});

test("k13 receivables are consistent", () => {
  pass("k13", { sales: [{ documentNo: "SI-1", net: 100, paid: 100 }] });
  fail("k13", { sales: [{ documentNo: "SI-1", net: 100, paid: 120 }] });
  fail("k13", { sales: [{ documentNo: "SI-1", status: "Cancelled", net: 100, paid: 50 }] });
});

test("k14 invoice balances are correct", () => {
  pass("k14", { sales: [{ documentNo: "SI-1", net: 100, paid: 60 }], payments: [{ id: "p1", invoice: "SI-1", amount: 60 }, { id: "p2", invoice: "SI-1", amount: 40, appliedToInvoice: false }] });
  const r = fail("k14", { sales: [{ documentNo: "SI-1", net: 100, paid: 100 }], payments: [{ id: "p1", invoice: "SI-1", amount: 60 }] });
  assert.equal(r.rows[0].fix.ops[0].after, 60);
  const migrated = pass("k14", { sales: [{ documentNo: "SI-1", net: 100, paid: 100, migrated: true }] });
  assert.match(migrated.note, /imported/);
});

test("k15 every receipt is fully applied", () => {
  pass("k15", { paymentRequests: [{ cvNo: "CV-1", requestStatus: "Approved", total: 300 }], payments: [{ id: "p1", paymentRequestCvNo: "CV-1", amount: 100 }, { id: "p2", paymentRequestCvNo: "CV-1", amount: 200 }] });
  const r = fail("k15", { paymentRequests: [{ cvNo: "CV-1", requestStatus: "Approved", total: 300 }], payments: [{ id: "p1", paymentRequestCvNo: "CV-1", amount: 100 }] });
  assert.equal(r.rows[0].amount, 200);
  pass("k15", { paymentRequests: [{ cvNo: "CV-1", requestStatus: "Pending", total: 300 }] });
});

test("k16 deposits match the bank", () => {
  const deposit = (id, amount, date) => ({ id, receiptNo: `OR-${id}`, amount, collectionStatus: "Deposited", statusHistory: [{ status: "Deposited", date }] });
  cantRun("k16", { payments: [deposit("1", 100, "2026-11-10")] });
  cantRun("k16", { payments: [deposit("1", 100, "2026-11-10")], bankStatements: [{ id: "s1", from: "2026-10-01", to: "2026-10-31", lines: [] }] });
  const statement = (lines) => ({ id: "s1", from: "2026-11-01", to: "2026-11-15", lines });
  pass("k16", { payments: [deposit("1", 100, "2026-11-10")], bankStatements: [statement([{ date: "2026-11-11", amount: 100 }])] });
  pass("k16", { payments: [deposit("1", 100, "2026-11-10"), deposit("2", 50, "2026-11-10")], bankStatements: [statement([{ date: "2026-11-10", amount: 150 }])] });
  fail("k16", { payments: [deposit("1", 100, "2026-11-10")], bankStatements: [statement([{ date: "2026-11-10", amount: 90 }])] });
});

test("k17 cash on hand = undeposited cash", () => {
  const cash = { id: "p1", method: "Cash", amount: 500, collectionStatus: "For Deposit" };
  cantRun("k17", { payments: [cash], cashCounts: [{ id: "cc1", date: "2026-11-15", amount: 500 }] });
  pass("k17", { payments: [cash, { id: "p2", method: "Check", amount: 900 }], cashCounts: [{ id: "cc1", date: TODAY, amount: 500 }] });
  const r = fail("k17", { payments: [cash], cashCounts: [{ id: "cc1", date: TODAY, amount: 450 }] });
  assert.equal(r.rows[0].title, "Cash on hand is short");
});

test("k18 items have a cost and price", () => {
  pass("k18", { items: [item("A"), item("B", { price: 0, quotedPerDeal: true }), item("C", { cost: 0, archived: true })] });
  const r = fail("k18", { items: [item("A", { cost: 0 }), item("B", { price: 0 })], inventoryPurchaseOrders: [{ id: "SPO-1", status: "Fully Received", date: "2026-11-01", lines: [{ code: "A", price: 80 }] }] }, 2);
  const noCost = r.rows.find((row) => row.key === "no-cost");
  assert.equal(noCost.fix.kind, "apply");
  assert.equal(noCost.fix.ops[0].after, 80);
});

test("k19 no duplicate clients", () => {
  pass("k19", { clients: [{ name: "Alpha Lab", tin: "123-456-789" }, { name: "Beta Clinic", tin: "987-654-321" }] });
  const r = fail("k19", {
    clients: [{ name: "Alpha Lab Inc.", tin: "123-456-789-000" }, { name: "Alpha Lab", tin: "123456789" }],
    sales: [{ documentNo: "SI-1", client: "Alpha Lab Inc." }, { documentNo: "SI-2", client: "Alpha Lab Inc." }, { documentNo: "SI-3", client: "Alpha Lab" }],
    paymentRequests: [{ cvNo: "CV-1", employee: "Alpha Lab" }],
  });
  const ops = r.rows[0].fix.ops;
  assert.ok(ops.some((op) => op.module === "sales" && op.key === "SI-3" && op.after === "Alpha Lab Inc."));
  assert.ok(ops.some((op) => op.module === "paymentRequests" && op.field === "employee"));
  assert.ok(ops.some((op) => op.module === "clients" && op.key === "Alpha Lab" && op.field === "archived" && op.after === true));
  assert.match(r.rows[0].found, /TIN/);
  pass("k19", { clients: [{ name: "Alpha Lab Inc.", tin: "123-456-789" }, { name: "Alpha Lab", archived: true, tin: "123-456-789" }] });
});

test("every check has a test above and a unique id", () => {
  const ids = RECON_CHECKS.map((check) => check.id);
  assert.equal(new Set(ids).size, 19);
  assert.deepEqual(ids, Array.from({ length: 19 }, (_, i) => `k${i + 1}`));
});

test("a check that throws reports can't run, not pass", () => {
  const out = runRecon({ items: null, sales: [{ documentNo: "SI-1", lines: "broken", amount: 1, net: 1 }] }, { now: NOW });
  for (const result of Object.values(out.results)) assert.notEqual(result.status, undefined);
  const broken = RECON_CHECKS.find((check) => check.id === "k10");
  const original = broken.run;
  broken.run = () => { throw new Error("boom"); };
  try {
    const r = runRecon({}, { now: NOW, only: ["k10"] }).results.k10;
    assert.equal(r.status, "cant");
    assert.match(r.reason, /boom/);
  } finally { broken.run = original; }
});

test("mergeDifferences: explained stays hidden until its values change; fixed rows resolve", () => {
  const at1 = "2026-11-16T00:00:00Z";
  const at2 = "2026-11-16T10:00:00Z";
  const row = { id: "k14:SI-1", check: "k14", key: "SI-1", title: "t", expected: "Paid ₱60", found: "Paid ₱100", amount: 40, fingerprint: JSON.stringify(["Paid ₱60", "Paid ₱100", 40]) };
  const results = { k14: { status: "diff" } };
  const [first] = mergeDifferences([], [row], results, at1);
  assert.equal(first.status, "open");
  const explained = { ...first, status: "explained", note: "Agreed with client" };
  const [same] = mergeDifferences([explained], [row], results, at2);
  assert.equal(same.status, "explained");
  const changed = { ...row, found: "Paid ₱120", amount: 60, fingerprint: JSON.stringify(["Paid ₱60", "Paid ₱120", 60]) };
  const [reopened] = mergeDifferences([explained], [changed], results, at2);
  assert.equal(reopened.status, "open");
  assert.match(reopened.history[0].action, /changed/);
  const [resolved] = mergeDifferences([first], [], { k14: { status: "pass" } }, at2);
  assert.equal(resolved.status, "resolved");
  assert.deepEqual(mergeDifferences([first], [], { k14: { status: "cant" } }, at2), [], "a check that couldn't run resolves nothing");
});

test("path helpers", () => {
  const target = { lines: [{ qty: 1 }], invoiceSeries: [{}] };
  setPath(target, "lines.0.adjusted", true);
  setPath(target, "invoiceSeries.0.voided.12", { reason: "x" });
  assert.equal(getPath(target, "lines.0.adjusted"), true);
  assert.deepEqual(getPath(target, "invoiceSeries.0.voided.12"), { reason: "x" });
  setPath(target, "invoiceSeries.0.voided.12", null);
  assert.equal(getPath(target, "invoiceSeries.0.voided.12"), undefined);
  assert.ok(sameValue(undefined, null) && sameValue(1.00001, 1) && !sameValue(1, 2));
});

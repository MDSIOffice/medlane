// Recon on the Worker: who may do what, fixes applied in one write with an audit row and undo,
// stale fixes refused, explained items staying put, and the stock movement log.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, as } from "./helpers/load-worker.mjs";

const { requireReconViewer, requireReconFixer, reconDifferenceAction, saveReconInput, runReconJob, reconOverview, stockMovementRows, stockMovementSource } = worker;

/** In-memory app_records with the PostgREST filters the Recon code uses. */
function fakeDb(seed = {}) {
  const table = new Map();
  const put = (module, key, data) => table.set(`${module}|${key}`, { module_name: module, record_key: key, data: structuredClone(data), updated_at: new Date().toISOString() });
  for (const [module, records] of Object.entries(seed)) for (const [key, data] of Object.entries(records)) put(module, key, data);
  const upserts = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname !== "/rest/v1/app_records") return Response.json([]);
    if ((init.method || "GET") === "POST") {
      const rows = JSON.parse(init.body);
      upserts.push(rows);
      for (const row of rows) put(row.module_name, row.record_key, row.data);
      return new Response(null, { status: 201 });
    }
    let rows = [...table.values()];
    const list = (value) => value.replace(/^\(|\)$/g, "").split(",").map((part) => part.replace(/^"|"$/g, ""));
    for (const [name, value] of url.searchParams) {
      if (name === "module_name" && value.startsWith("eq.")) rows = rows.filter((row) => row.module_name === value.slice(3));
      if (name === "module_name" && value.startsWith("in.")) { const set = list(value.slice(3)); rows = rows.filter((row) => set.includes(row.module_name)); }
      if (name === "record_key" && value.startsWith("eq.")) rows = rows.filter((row) => row.record_key === value.slice(3));
      if (name === "record_key" && value.startsWith("in.")) { const set = list(value.slice(3)); rows = rows.filter((row) => set.includes(row.record_key)); }
      if (name === "data->>at" && value.startsWith("gt.")) rows = rows.filter((row) => String(row.data?.at || "") > value.slice(3));
    }
    if (url.searchParams.get("order") === "record_key.desc") rows.sort((a, b) => b.record_key.localeCompare(a.record_key));
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 1e9);
    return Response.json(rows.slice(offset, offset + limit));
  };
  return { get: (module, key) => table.get(`${module}|${key}`)?.data, all: (module) => [...table.values()].filter((row) => row.module_name === module).map((row) => row.data), upserts };
}
const superadmin = { ...as("Superadmin"), name: "Super Admin", email: "sa@test" };
const ceo = { ...as("CEO"), name: "The CEO", email: "ceo@test" };
const context = { device: "test" };

describe("access", () => {
  for (const role of ["Admin", "Accounting", "Sales", "Logistics", "HR", "Engineering", "Product Specialist"]) {
    test(`${role} cannot open Recon`, () => assert.throws(() => requireReconViewer(as(role)), /Only Superadmin or CEO/));
  }
  test("CEO can view but not fix", () => {
    requireReconViewer(ceo);
    assert.throws(() => requireReconFixer(ceo), /Only Superadmin/);
  });
  test("Superadmin can fix", () => { requireReconViewer(superadmin); requireReconFixer(superadmin); });
  test("CEO cannot apply, undo or explain a difference", async () => {
    fakeDb({ reconDifferences: { "k14:SI-1": { id: "k14:SI-1", check: "k14", status: "open", fix: { kind: "apply", ops: [] } } } });
    for (const action of ["fix", "undo", "explain"]) await assert.rejects(reconDifferenceAction(env, STATE, ceo, "u1", context, "k14:SI-1", action, { note: "x" }), /Only Superadmin/);
  });
  test("Accounting cannot save Recon inputs", async () => {
    fakeDb();
    await assert.rejects(saveReconInput(env, STATE, as("Accounting"), "u1", context, "cash-counts", { amount: 5 }), /Only Superadmin or CEO/);
  });
});

describe("runs", () => {
  beforeEach(() => fakeDb({
    sales: { "SI-1": { documentNo: "SI-1", client: "C", net: 100, paid: 100 } },
    payments: { p1: { id: "p1", invoice: "SI-1", amount: 60 } },
    inventory: { "A|Main|L1": { code: "A", branch: "Main", lot: "L1", qty: 5 } },
  }));
  test("a run stores the run and the differences; k1 starts the movement log", async () => {
    const run = await runReconJob(env, STATE, { trigger: "manual", by: "t" });
    assert.equal(run.results.k14.status, "diff");
    assert.equal(run.results.k1.status, "cant");
    assert.match(run.results.k1.reason, /log started/);
    const page = await reconOverview(env, STATE, superadmin);
    assert.equal(page.differences.find((d) => d.id === "k14:SI-1").status, "open");
    assert.ok(page.baseline?.at);
    assert.equal(page.canFix, true);
    assert.equal((await reconOverview(env, STATE, ceo)).canFix, false);
    // From the next run k1 has a baseline and the untouched stock passes.
    const second = await runReconJob(env, STATE, { trigger: "manual", by: "t" });
    assert.equal(second.results.k1.status, "pass");
  });
});

describe("fixes", () => {
  let db;
  const diff = (extra = {}) => ({ id: "k14:SI-1", check: "k14", key: "SI-1", title: "t", ref: "SI-1", status: "open", fingerprint: "f", history: [], fix: { kind: "apply", label: "Set paid", ops: [{ op: "set", module: "sales", key: "SI-1", field: "paid", before: 100, after: 60 }] }, ...extra });
  beforeEach(() => { db = fakeDb({ sales: { "SI-1": { documentNo: "SI-1", net: 100, paid: 100 } }, reconDifferences: { "k14:SI-1": diff() } }); });

  test("apply writes the record, the difference and an audit row in one upsert", async () => {
    const next = await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "fix", {});
    assert.equal(next.status, "fixed");
    assert.equal(db.get("sales", "SI-1").paid, 60);
    const write = db.upserts.at(-1);
    assert.deepEqual(write.map((row) => row.module_name).sort(), ["logs", "reconDifferences", "sales"]);
    const log = write.find((row) => row.module_name === "logs").data;
    assert.equal(log.action, "Recon fix applied");
    assert.deepEqual(log.changes[0], { field: "sales · SI-1 · paid", from: "100", to: "60" });
  });
  test("undo restores the value and is logged", async () => {
    await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "fix", {});
    const undone = await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "undo", {});
    assert.equal(undone.status, "open");
    assert.equal(db.get("sales", "SI-1").paid, 100);
    assert.equal(db.upserts.at(-1).find((row) => row.module_name === "logs").data.action, "Recon fix undone");
  });
  test("a fix is refused if the record changed since the check", async () => {
    db = fakeDb({ sales: { "SI-1": { documentNo: "SI-1", net: 100, paid: 80 } }, reconDifferences: { "k14:SI-1": diff() } });
    await assert.rejects(reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "fix", {}), /Recon conflict/);
    assert.equal(db.get("sales", "SI-1").paid, 80);
    assert.equal(db.upserts.length, 0, "nothing written");
  });
  test("a fix that needs a reason is refused without one", async () => {
    db = fakeDb({ reconSettings: { settings: { id: "settings", invoiceSeries: [{ id: "s", prefix: "SI-", start: 1 }] } }, reconDifferences: { "k11:s:2": diff({ id: "k11:s:2", check: "k11", fix: { kind: "apply", needsNote: true, ops: [{ op: "set", module: "reconSettings", key: "settings", field: "invoiceSeries.0.voided.2", before: null, after: { reason: "{{note}}", by: "{{user}}" } }] } }) } });
    await assert.rejects(reconDifferenceAction(env, STATE, superadmin, "u1", context, "k11:s:2", "fix", {}), /reason/);
    await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k11:s:2", "fix", { note: "Spoiled booklet" });
    assert.deepEqual(db.get("reconSettings", "settings").invoiceSeries[0].voided["2"], { reason: "Spoiled booklet", by: "Super Admin" });
  });
  test("a stock fix changes on hand, logs a movement and adds a reason to the stock history", async () => {
    db = fakeDb({ inventory: { "A|Main|L1": { code: "A", branch: "Main", lot: "L1", qty: 5 } }, reconDifferences: { "k4:A|Main|L1": diff({ id: "k4:A|Main|L1", check: "k4", fix: { kind: "apply", ops: [{ op: "stock", key: "A|Main|L1", before: 5, after: 0, reason: "Expired, written off" }] } }) } });
    await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k4:A|Main|L1", "fix", {});
    assert.equal(db.get("inventory", "A|Main|L1").qty, 0);
    assert.equal(db.get("inventory", "A|Main|L1").history[0].reason, "Expired, written off");
    const [move] = db.all("stockMovements");
    assert.equal(move.delta, -5);
    assert.equal(move.source.type, "correction");
  });
  test("explain needs a note, changes no data, and stays explained while values match", async () => {
    await assert.rejects(reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "explain", {}), /note/);
    const next = await reconDifferenceAction(env, STATE, superadmin, "u1", context, "k14:SI-1", "explain", { note: "Agreed write-off" });
    assert.equal(next.status, "explained");
    assert.equal(db.get("sales", "SI-1").paid, 100, "data untouched");
    assert.deepEqual(db.upserts.at(-1).map((row) => row.module_name).sort(), ["logs", "reconDifferences"]);
  });
  test("CEO can assign; the assignee gets a notice addressed to them", async () => {
    await reconDifferenceAction(env, STATE, ceo, "u1", context, "k14:SI-1", "assign", { assignee: { name: "Acct", email: "Acct@Test" } });
    const notice = db.all("notifications")[0];
    assert.equal(notice.targetUser, "acct@test");
    assert.equal(db.get("reconDifferences", "k14:SI-1").assignedTo.name, "Acct");
  });
});

describe("inputs", () => {
  test("posting a count takes the system quantity from stored stock", async () => {
    const db = fakeDb({ inventory: { "A|Main|L1": { code: "A", branch: "Main", lot: "L1", qty: 9 } } });
    const count = await saveReconInput(env, STATE, ceo, "u1", context, "stock-counts", { branch: "Main", status: "Posted", lines: [{ key: "A|Main|L1", code: "A", counted: 7, system: 999 }] });
    assert.equal(count.lines[0].system, 9);
    assert.equal(db.all("logs")[0].action, "Stock count posted");
  });
  test("editing the invoice series keeps voided numbers", async () => {
    const db = fakeDb({ reconSettings: { settings: { id: "settings", invoiceSeries: [{ id: "s", prefix: "SI-", start: 1, voided: { 4: { reason: "x" } } }] } } });
    await saveReconInput(env, STATE, ceo, "u1", context, "settings", { invoiceSeries: [{ id: "s", prefix: "si-", start: 1, end: 500 }] });
    const series = db.get("reconSettings", "settings").invoiceSeries[0];
    assert.equal(series.prefix, "SI-");
    assert.equal(series.end, 500);
    assert.deepEqual(series.voided, { 4: { reason: "x" } });
  });
  test("a statement with no dated amounts is refused", async () => {
    fakeDb();
    await assert.rejects(saveReconInput(env, STATE, ceo, "u1", context, "bank-statements", { lines: [{ date: "soon", amount: 5 }] }), /Recon: no dated amounts/);
  });
});

describe("stock movement log", () => {
  const inv = (qty, extra = {}) => ({ module_name: "inventory", record_key: "A|Main|L1", data: { code: "A", item: "Item A", branch: "Main", lot: "L1", qty, ...extra } });
  test("logs only rows whose quantity changed, with the invoice as source", () => {
    const rows = [inv(3), { module_name: "inventory", record_key: "B|Main|L1", data: { code: "B", branch: "Main", lot: "L1", qty: 4 } }, { module_name: "sales", record_key: "SI-9", data: { documentNo: "SI-9" } }];
    const out = stockMovementRows(STATE, "u1", "Tester", rows, new Map([["A|Main|L1", { qty: 5 }], ["B|Main|L1", { qty: 4 }]]));
    assert.equal(out.length, 1);
    assert.equal(out[0].module_name, "stockMovements");
    assert.deepEqual([out[0].data.before, out[0].data.after, out[0].data.delta], [5, 3, -2]);
    assert.deepEqual(out[0].data.source, { type: "invoice", ref: "SI-9", reason: "" });
  });
  test("a new stock row logs from zero", () => {
    const out = stockMovementRows(STATE, "u1", "Tester", [inv(6)], new Map(), { type: "receipt", ref: "RCV-1", reason: "" });
    assert.equal(out[0].data.delta, 6);
    assert.equal(out[0].data.source.type, "receipt");
  });
  test("sources: transfer, demo DR, adjustment with reason, and unattributed", () => {
    assert.equal(stockMovementSource([{ module_name: "pendingTransfers", data: { id: "T1" } }], {}, {}).type, "transfer");
    assert.equal(stockMovementSource([{ module_name: "sales", data: { documentNo: "DR-1", type: "DR" } }], {}, {}).type, "demo");
    const entry = { at: "x", by: "y", changes: [{ field: "qty" }], reason: "Damaged" };
    assert.deepEqual(stockMovementSource([], { history: [entry] }, { history: [] }), { type: "adjustment", ref: "", reason: "Damaged" });
    assert.equal(stockMovementSource([], { history: [entry] }, { history: [entry] }).type, "unattributed", "an old history entry is not this change's reason");
  });
});

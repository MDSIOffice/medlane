import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const { validateNewSaleRows: validate } = worker;
const STOCK = [stored("A|LP|L1", { code: "A", branch: "LP", lot: "L1", qty: 10 })];
const sale = (over = {}) => ({ documentNo: "SI-1", client: "Lab", type: "SI", code: "A", qty: 2, price: 100, branch: "LP", lot: "L1", amount: 200, net: 200, discount: 0, ...over });
const saleRow = (data, key = data.documentNo || "SI-1") => row("sales", key, data);
const run = (profile, ...sales) => validate(env, STATE, profile, sales.map((data) => saleRow(data)));
const client = (name, data = {}) => stored(name, { name, creditLimit: 0, ...data });
beforeEach(() => mockSupabase({ inventory: STOCK, clients: [client("Lab")] }));

describe("amounts", () => {
  test("a correct invoice passes", async () => { await run(as("Accounting"), sale()); });
  test("an amount that doesn't match its lines is rejected", async () => {
    await assert.rejects(run(as("Accounting"), sale({ amount: 1, net: 1 })), /amount does not match/);
  });
  test("a net that doesn't match amount minus discount is rejected", async () => {
    await assert.rejects(run(as("Admin"), sale({ discount: 10, net: 200 })), /net amount does not match/);
  });
  for (const [name, over] of [["zero", { qty: 0 }], ["negative", { qty: -1 }], ["text", { qty: "lots" }]]) {
    test(`${name} quantity is rejected`, async () => {
      await assert.rejects(run(as("Accounting"), sale(over)), /invalid quantity/);
    });
  }
  test("a negative price is rejected", async () => {
    await assert.rejects(run(as("Accounting"), sale({ price: -5 })), /invalid price/);
  });
  test("an expired lot is rejected", async () => {
    await assert.rejects(run(as("Accounting"), sale({ expiry: "2001-01-01" })), /expired lot/);
  });
});

describe("discounts", () => {
  for (const role of ["Accounting", "Sales"]) {
    test(`${role} cannot give a discount`, async () => {
      await assert.rejects(run(as(role), sale({ discount: 10, net: 190 })), /discounts require/);
    });
    test(`${role} cannot give one by flagging the invoice noPo`, async () => {
      await assert.rejects(run(as(role), sale({ noPo: true, discount: 10, net: 190 })), /discounts require/);
    });
    test(`${role} cannot give one by flagging the invoice migrated`, async () => {
      await assert.rejects(run(as(role), sale({ migrated: true, discount: 10, net: 190 })), /discounts require/);
    });
  }
  for (const role of ["Superadmin", "CEO", "Admin"]) {
    test(`${role} can give a discount`, async () => { await run(as(role), sale({ discount: 10, net: 190 })); });
  }
  test("a negative discount is rejected", async () => {
    await assert.rejects(run(as("Admin"), sale({ discount: -10, net: 210 })), /discount cannot be negative/);
  });
  test("a discount above the gross amount is rejected", async () => {
    await assert.rejects(run(as("Admin"), sale({ discount: 500, net: -300 })), /cannot exceed gross/);
  });
});

describe("credit limit", () => {
  const limited = (balance) => mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 1000 })] }, { balances: { Lab: balance } });
  test("under the limit passes", async () => { limited(500); await run(as("Accounting"), sale()); });
  test("exactly at the limit passes", async () => { limited(800); await run(as("Accounting"), sale()); });
  test("over the limit is rejected", async () => {
    limited(900);
    await assert.rejects(run(as("Accounting"), sale()), /credit limit exceeded for Lab/);
  });
  test("splitting one order across rows in a save can't slip past", async () => {
    limited(700);
    await assert.rejects(run(as("Accounting"), sale({ documentNo: "SI-1" }), sale({ documentNo: "SI-2" })), /Invoice SI-2: credit limit exceeded/);
  });
  for (const flag of ["noPo", "migrated"]) {
    test(`flagging an invoice ${flag} doesn't skip the check`, async () => {
      limited(900);
      await assert.rejects(run(as("Accounting"), sale({ [flag]: true })), /credit limit exceeded/);
    });
  }
  for (const role of ["Superadmin", "CEO", "Admin"]) {
    test(`${role} can authorize over the limit`, async () => { limited(900); await run(as(role), sale()); });
  }
  test("a client with no limit set is not capped", async () => {
    mockSupabase({ inventory: STOCK, clients: [client("Lab")] }, { balances: { Lab: 99999 } });
    await run(as("Accounting"), sale());
  });
});

describe("stock", () => {
  test("more than is available is rejected", async () => {
    await assert.rejects(run(as("Accounting"), sale({ qty: 11, amount: 1100, net: 1100 })), /insufficient stock/);
  });
  test("two invoices can't both claim the last units", async () => {
    await assert.rejects(run(as("Accounting"), sale({ documentNo: "SI-1", qty: 6, amount: 600, net: 600 }), sale({ documentNo: "SI-2", qty: 6, amount: 600, net: 600 })), /Invoice SI-2: insufficient stock/);
  });
  test("a typed lot can claim stock received without a lot", async () => {
    mockSupabase({ inventory: [stored("A|LP|", { code: "A", branch: "LP", lot: "", qty: 5 })], clients: [client("Lab")] });
    await run(as("Accounting"), sale({ lot: "NEW" }));
  });
  test("stock in another branch doesn't count", async () => {
    await assert.rejects(run(as("Accounting"), sale({ branch: "Naga" })), /insufficient stock/);
  });
  test("a multi-line invoice is checked line by line", async () => {
    await assert.rejects(run(as("Accounting"), sale({ amount: 300, net: 300, lines: [
      { code: "A", qty: 2, price: 100, branch: "LP", lot: "L1" },
      { code: "MISSING", qty: 1, price: 100, branch: "LP", lot: "L1" },
    ] })), /insufficient stock for MISSING/);
  });
});

describe("archived clients", () => {
  const archived = () => mockSupabase({ inventory: STOCK, clients: [client("Old", { archived: true })] });
  test("a skip-PO invoice against one is rejected", async () => {
    archived();
    await assert.rejects(run(as("Admin"), sale({ client: "Old", noPo: true })), /Old is archived/);
  });
  test("a migrated historical invoice is still allowed", async () => {
    archived();
    await run(as("Admin"), sale({ client: "Old", migrated: true }));
  });
});

// Known gaps, found while writing this suite. Each states the behaviour we want and is marked todo so
// it reports without failing the run. Remove `todo` when the rule is fixed.
describe("known gaps in the credit check", () => {
  const limited = () => mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 1000 })] }, { balances: { Lab: 900 } });
  test("a non-numeric net must not skip the limit", { todo: "NaN > limit is false, so the check passes" }, async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ net: "abc" })));
  });
  test("a non-numeric amount and net must be rejected", { todo: "NaN comparisons pass the amount checks too" }, async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ amount: "abc", net: "abc" })));
  });
  test("a negative net on a noPo invoice must not lower the balance", { todo: "the noPo path doesn't validate amounts" }, async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, net: -99999 })));
  });
  test("a client name in different casing must still hit the limit", { todo: "the limit lookup is an exact string match" }, async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ client: "LAB" })));
  });
});

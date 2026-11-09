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
      await assert.rejects(run(as(role, ["imports"]), sale({ migrated: true, discount: 10, net: 190 })), /discounts require/);
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
      await assert.rejects(run(as("Accounting", ["imports"]), sale({ [flag]: true })), /credit limit exceeded/);
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
    await run(as("Admin", ["imports"]), sale({ client: "Old", migrated: true }));
  });
});

describe("tampered invoices", () => {
  const limited = () => mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 1000 })] }, { balances: { Lab: 900 } });
  for (const role of ["Accounting", "Admin", "CEO"]) {
    test(`a non-numeric net is rejected for ${role}`, async () => {
      limited();
      await assert.rejects(run(as(role), sale({ net: "abc" })), /net must be a number/);
    });
    test(`a non-numeric amount is rejected for ${role}`, async () => {
      limited();
      await assert.rejects(run(as(role), sale({ amount: "abc", net: "abc" })), /amount must be a number/);
    });
  }
  for (const flag of ["noPo", "migrated"]) {
    for (const value of ["abc", "Infinity"]) {
      test(`net ${value} is rejected when flagged ${flag}`, async () => {
        limited();
        await assert.rejects(run(as("Accounting"), sale({ [flag]: true, net: value })), /net must be a number/);
      });
    }
  }
  test("a negative net on a noPo invoice is rejected", async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, net: -99999 })), /cannot be negative/);
  });
  test("a negative net on a DR is rejected", async () => {
    await assert.rejects(run(as("Accounting"), sale({ type: "DR", amount: 0, net: -5 })), /cannot be negative/);
  });
  test("a noPo invoice can't hide its value behind net 0", async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, amount: 5000000, net: 0 })), /amount does not match/);
  });
  test("a noPo invoice can't hide its value behind amount 0", async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, amount: 0, net: 0 })), /amount does not match/);
  });
  test("a noPo invoice's net must equal amount minus discount", async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, amount: 200, net: 0 })), /net amount does not match/);
  });
  test("two clients that normalize alike each keep their own limit", async () => {
    mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 1000 }), client("LAB", { creditLimit: 5 })] });
    await run(as("Accounting"), sale({ client: "Lab" }));
    await assert.rejects(run(as("Accounting"), sale({ client: "LAB" })), /credit limit exceeded/);
  });
  test("a noPo invoice with non-numeric line values is rejected", async () => {
    limited();
    await assert.rejects(run(as("Accounting"), sale({ noPo: true, qty: "lots" })), /amount does not match/);
  });
  test("a negative migrated net is accepted but can't lower the balance", async () => {
    limited();
    await assert.rejects(run(as("Accounting", ["imports"]), sale({ documentNo: "M1", migrated: true, amount: 0, net: -99999 }), sale({ documentNo: "SI-2" })), /Invoice SI-2: credit limit exceeded/);
  });
  for (const name of ["LAB", " lab ", "Lab."]) {
    test(`client spelled "${name}" can't dodge the limit`, async () => {
      limited();
      await assert.rejects(run(as("Accounting"), sale({ client: name })), /must match the masterlist name "Lab"/);
    });
  }
  test("an authorizer isn't blocked by the exact-name rule", async () => {
    limited();
    await run(as("Admin"), sale({ client: "LAB" }));
  });
  for (const [name, value] of [["missing", undefined], ["empty", ""], ["blank", "   "], ["a list", ["Lab"]], ["an object", { name: "Lab" }]]) {
    for (const role of ["Accounting", "CEO"]) {
      test(`client ${name} is rejected for ${role}`, async () => {
        limited();
        await assert.rejects(run(as(role), sale({ client: value })), /client is required/);
      });
    }
    test(`client ${name} is rejected on a noPo invoice`, async () => {
      limited();
      await assert.rejects(run(as("Accounting"), sale({ noPo: true, client: value })), /client is required/);
    });
  }
});

describe("the migrated flag", () => {
  const stock = () => mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 100000 })] });
  // Skips stock and amounts, so these would otherwise fabricate an invoice worth anything.
  const fabricated = (over = {}) => sale({ code: "NOT-REAL", qty: 99999, price: 1, amount: 5, net: 5, migrated: true, ...over });
  for (const role of ["Admin", "Accounting", "Sales", "Logistics", "HR", "Engineering", "Product Specialist"]) {
    test(`${role} without Imports can't use it`, async () => {
      stock();
      await assert.rejects(run(as(role), fabricated()), /requires Imports edit permission/);
    });
    test(`${role} with only other edit rights can't use it`, async () => {
      stock();
      await assert.rejects(run(as(role, ["sales", "invoicing"]), fabricated()), /requires Imports edit permission/);
    });
  }
  test("view access to Imports isn't enough", async () => {
    stock();
    const viewer = { ...as("Accounting"), customPermissions: { enabled: true, view: ["imports"], edit: [] } };
    await assert.rejects(run(viewer, fabricated()), /requires Imports edit permission/);
  });
  for (const value of [1, "yes", "false", {}]) {
    test(`a truthy ${JSON.stringify(value)} counts as the flag`, async () => {
      stock();
      await assert.rejects(run(as("Accounting"), fabricated({ migrated: value })), /requires Imports edit permission/);
    });
  }
  test("the refusal comes before anything else about the invoice", async () => {
    stock();
    await assert.rejects(run(as("Accounting"), fabricated({ discount: 10 })), /requires Imports edit permission/);
  });
  for (const importer of [as("Superadmin"), as("CEO"), as("Admin", ["imports"]), as("Accounting", ["imports"])]) {
    test(`${importer.role}${importer.customPermissions.edit.length ? " with Imports" : ""} can still import`, async () => {
      stock();
      await run(importer, fabricated());
    });
  }
  test("one bad row refuses the whole save", async () => {
    stock();
    await assert.rejects(run(as("Accounting"), sale({ documentNo: "SI-2" }), fabricated()), /requires Imports edit permission/);
  });
  test("a normal invoice isn't affected", async () => {
    stock();
    await run(as("Accounting"), sale());
  });
});

// Shaped like what buildSale() and buildMigratedSale() really send, so the rules above can't start
// rejecting genuine invoices.
describe("genuine invoices still pass", () => {
  const line = { item: "Item A", code: "A", qty: 2, price: 100, sourceBranch: "LP", branch: "LP", lot: "L1", expiry: "2099-01-01" };
  const built = (over = {}) => ({ id: "SI-9", documentNo: "SI-9", client: "Lab", type: "SI", sourceBranch: "LP", qty: 2, lines: [line], amount: 200, discount: 0, net: 200, paid: 0, status: "Active", ...over });
  const roomy = () => mockSupabase({ inventory: STOCK, clients: [client("Lab", { creditLimit: 100000 })] });
  test("PO invoice", async () => { roomy(); await run(as("Accounting"), built()); });
  test("fractional quantity", async () => { roomy(); await run(as("Accounting"), built({ lines: [{ ...line, qty: 0.5 }], qty: 0.5, amount: 50, net: 50 })); });
  test("DR with zero value", async () => { roomy(); await run(as("Accounting"), built({ type: "DR", amount: 0, net: 0 })); });
  test("skip-PO invoice", async () => { roomy(); await run(as("Accounting"), built({ noPo: true })); });
  test("skip-PO DR", async () => { roomy(); await run(as("Accounting"), built({ noPo: true, type: "DR", amount: 0, net: 0 })); });
  test("skip-PO invoice with an authorized discount", async () => { roomy(); await run(as("Admin"), built({ noPo: true, discount: 20, net: 180 })); });
  test("amounts sent as numeric strings", async () => { roomy(); await run(as("Accounting"), built({ amount: "200", net: "200.00" })); });
  test("migrated row with its own net formula", async () => { roomy(); await run(as("Admin", ["imports"]), built({ migrated: true, amount: 200, net: 224 })); });
  // Opening-AR migration requires the Clients masterlist import first — no placeholder clients.
  test("migrated row for a client not yet in the masterlist is refused", async () => { roomy(); await assert.rejects(run(as("Admin", ["imports"]), built({ migrated: true, client: "Brand New Lab" })), /not in the Clients masterlist/); });
});

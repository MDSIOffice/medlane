import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worker, workerSourcePath, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const ALL_ROLES = ["Superadmin", "CEO", "Admin", "Accounting", "Sales", "Logistics", "HR", "Engineering", "Product Specialist"];
beforeEach(() => mockSupabase());

describe("role gates", () => {
  const gates = {
    requireUserAdmin: ["Superadmin", "CEO"],
    requireMemoAdmin: ["Superadmin", "CEO", "HR"],
    requireBackupAdmin: ["Superadmin", "CEO"],
    requireDigestAdmin: ["Superadmin", "CEO"],
    requirePoApprover: ["Superadmin", "CEO"],
    requirePoReceiver: ["Superadmin", "CEO", "Logistics"],
    requirePaymentRequestApprover: ["Superadmin", "CEO"],
    requireStockReceiptApprover: ["Superadmin", "CEO"],
  };
  for (const [gate, allowed] of Object.entries(gates)) {
    for (const role of ALL_ROLES) {
      test(`${gate}: ${role} ${allowed.includes(role) ? "passes" : "is refused"}`, () => {
        if (allowed.includes(role)) worker[gate](as(role));
        else assert.throws(() => worker[gate](as(role)));
      });
    }
    for (const profile of [null, undefined, {}]) {
      test(`${gate}: profile ${JSON.stringify(profile)} is refused`, () => {
        assert.throws(() => worker[gate](profile));
      });
    }
  }
  test("every role the gates name is a real role", () => {
    for (const role of ALL_ROLES) assert.ok(worker.validRole(role), role);
    assert.ok(!worker.validRole("Superadmni"));
    assert.ok(!worker.validRole("constructor"), "inherited object keys must not count as roles");
  });
});

describe("write access", () => {
  test("no edit modules means no writes for ordinary roles", () => {
    assert.equal(worker.canWrite(as("Sales")), false);
    assert.throws(() => worker.requireWriteAccess(as("Sales")));
    assert.throws(() => worker.requireWriteAccess(null));
  });
  test("an edit grant allows writes", () => { assert.equal(worker.canWrite(as("Sales", ["sales"])), true); });
  for (const role of ["Superadmin", "CEO", "Admin"]) {
    test(`${role} can always write`, () => { assert.equal(worker.canWrite(as(role)), true); });
  }
});

describe("module access", () => {
  const { canAccessKey } = worker;
  test("Superadmin and CEO reach everything", () => {
    assert.equal(canAccessKey(as("CEO"), "payables", "edit"), true);
    assert.equal(canAccessKey(as("Superadmin"), "users", "edit"), true);
  });
  test("a key needs a matching module grant", () => {
    assert.equal(canAccessKey(as("Sales", ["sales"]), "payables", "edit"), false);
    assert.equal(canAccessKey(as("Accounting", ["payables"]), "payables", "edit"), true);
  });
  test("expense budgets and recurring costs: Expenses users read, only Superadmin/CEO/Admin edit", () => {
    for (const key of ["expenseBudgets", "recurringCosts"]) {
      assert.equal(canAccessKey(as("Accounting", ["replenishments"]), key, "view"), true);
      assert.equal(canAccessKey(as("Accounting", ["replenishments"]), key, "edit"), false);
      assert.equal(canAccessKey(as("Admin", ["replenishments"]), key, "edit"), true);
      assert.equal(canAccessKey(as("CEO"), key, "edit"), true);
      assert.equal(canAccessKey(as("Sales", ["sales"]), key, "view"), false);
    }
  });
  test("an unknown key is denied", () => { assert.equal(canAccessKey(as("Admin", ["payables"]), "nope", "edit"), false); });
  test("no profile is denied", () => {
    assert.equal(canAccessKey(null, "payables", "view"), false);
    assert.equal(canAccessKey(undefined, "payables", "edit"), false);
  });
  test("a memos grant doesn't let non-HR post memos", () => {
    assert.equal(canAccessKey(as("Sales", ["memos"]), "memos", "edit"), false);
    assert.equal(canAccessKey(as("HR", ["memos"]), "memos", "edit"), true);
  });
  test("support reports are editable only by the listed roles", () => {
    assert.equal(canAccessKey(as("Logistics", ["product-issues"]), "productIssues", "edit"), false);
    assert.equal(canAccessKey(as("Sales", ["product-issues"]), "productIssues", "edit"), false);
    assert.equal(canAccessKey(as("Admin", ["product-issues"]), "productIssues", "edit"), true);
  });
  test("role defaults match the agreed access list", () => {
    const { moduleListsFor } = worker;
    const accounting = moduleListsFor("Accounting", []);
    assert.ok(accounting.view.includes("inventory"), "Accounting can view Inventory");
    assert.ok(!accounting.edit.includes("inventory"), "Accounting Inventory is view-only");
    for (const module of ["masterlists", "logs", "reports", "reconciliation", "analytics"]) assert.ok(!accounting.view.includes(module), `Accounting has no ${module} by default`);
    for (const module of ["imports", "print-templates"]) assert.ok(accounting.edit.includes(module), `Accounting can use ${module}`);
    const sales = moduleListsFor("Sales", []);
    for (const module of ["analytics", "purchase-orders", "inventory"]) assert.ok(sales.view.includes(module), `Sales sees ${module}`);
    for (const module of ["receivables-tracker", "purchase-history", "product-issues"]) assert.ok(!sales.view.includes(module), `Sales has no ${module}`);
    // Older per-user rows that granted them are overridden for every Sales account.
    const customised = moduleListsFor("Sales", ["receivables-tracker", "receivables", "product-issues", "sales"].map((module_key) => ({ module_key, can_view: true, can_edit: true })));
    for (const module of ["receivables-tracker", "receivables", "product-issues"]) assert.ok(!customised.view.includes(module) && !customised.edit.includes(module), `customised Sales still has no ${module}`);
    assert.ok(customised.view.includes("sales"));
    for (const role of ["Accounting", "Logistics", "Engineering", "Product Specialist", "HR"]) assert.ok(!moduleListsFor(role, []).view.includes("item-forecast"), `${role} has no Item Forecast`);
    for (const role of ["Superadmin", "CEO", "Admin", "Sales"]) assert.ok(moduleListsFor(role, []).view.includes("item-forecast"), `${role} has Item Forecast`);
    const admin = moduleListsFor("Admin", []);
    assert.ok(admin.view.includes("imports") && admin.view.includes("settings"));
    assert.ok(!admin.view.includes("users") && !admin.view.includes("backup"));
    for (const role of ["Logistics", "Engineering", "Product Specialist"]) {
      for (const module of ["reports", "reconciliation", "analytics", "item-forecast"]) assert.ok(!moduleListsFor(role, []).view.includes(module), `${role} has no ${module}`);
    }
  });
  test("a per-user grant can still give Accounting Masterlists", () => {
    const { view } = worker.moduleListsFor("Accounting", [{ module_key: "masterlists", can_view: true, can_edit: false }, { module_key: "invoicing", can_view: true, can_edit: true }]);
    assert.ok(view.includes("masterlists"));
  });
  for (const role of ["Sales", "Engineering", "Product Specialist"]) {
    test(`${role} can write demo requests but no other inventory`, () => {
      assert.equal(canAccessKey(as(role, ["inventory"]), "inventoryDemoRequests", "edit"), true);
      assert.equal(canAccessKey(as(role, ["inventory"]), "inventory", "edit"), false);
      assert.equal(canAccessKey(as(role, ["inventory"]), "stockReceipts", "edit"), false);
    });
  }
  test("Purchase Orders is client POs; supplier POs belong to Inventory", () => {
    assert.equal(canAccessKey(as("Sales", ["purchase-orders"]), "purchaseOrders", "edit"), true);
    assert.equal(canAccessKey(as("Accounting", ["purchase-orders"]), "purchaseOrders", "edit"), true);
    assert.equal(canAccessKey(as("Sales", ["inventory", "purchase-orders"]), "inventoryPurchaseOrders", "edit"), false);
    assert.equal(canAccessKey(as("Accounting", ["purchase-orders"]), "inventoryPurchaseOrders", "edit"), false);
    assert.equal(canAccessKey(as("Logistics", ["inventory"]), "inventoryPurchaseOrders", "edit"), true);
  });
  test("Accounting and Logistics can raise supplier POs with Inventory view-only; their stock stays read-only", () => {
    const viewOnly = (role) => ({ id: "u1", role, customPermissions: { enabled: true, view: ["inventory"], edit: [] } });
    for (const role of ["Accounting", "Logistics"]) {
      assert.equal(canAccessKey(viewOnly(role), "inventoryPurchaseOrders", "edit"), true, role);
      assert.equal(canAccessKey(viewOnly(role), "inventory", "edit"), false, `${role} stock`);
      assert.equal(canAccessKey(viewOnly(role), "stockReceipts", "edit"), false, `${role} receipts`);
    }
    // Not without seeing Inventory at all, and not for other roles.
    assert.equal(canAccessKey(as("Accounting", ["purchase-orders"]), "inventoryPurchaseOrders", "edit"), false);
    assert.equal(canAccessKey(viewOnly("Sales"), "inventoryPurchaseOrders", "edit"), false);
    assert.equal(canAccessKey(viewOnly("HR"), "inventoryPurchaseOrders", "edit"), false);
  });
  test("Logistics is blocked from logs and support", () => {
    assert.deepEqual(worker.ROLE_BLOCKED_MODULES.Logistics, ["logs", "product-issues"]);
  });
});

describe("demo requests", () => {
  const check = worker.assertDemoRequestTransitionsAllowed;
  const consumable = { lines: [{ type: "Consumable" }] };
  test("a machine-only request starts at management", () => {
    assert.equal(worker.demoRequestInitialStatus({ lines: [{ type: "Machine" }] }), "For Management Approval");
  });
  test("any consumable line starts at logistics", () => {
    assert.equal(worker.demoRequestInitialStatus(consumable), "For Logistics Approval");
  });
  test("only requester roles can file", async () => {
    await assert.rejects(check(env, STATE, as("Logistics"), [row("inventoryDemoRequests", "D1", { status: "For Management Approval" })]), /Only Sales, Engineering or Product Specialist/);
    await assert.rejects(check(env, STATE, as("Accounting"), [row("inventoryDemoRequests", "D1", { status: "For Management Approval" })]), /Only Sales, Engineering or Product Specialist/);
    await check(env, STATE, as("Engineering"), [row("inventoryDemoRequests", "D1", { status: "For Management Approval" })]);
    await check(env, STATE, as("Sales"), [row("inventoryDemoRequests", "D1", { status: "For Management Approval" })]);
  });
  test("a new request can't skip its first step", async () => {
    await assert.rejects(check(env, STATE, as("Engineering"), [row("inventoryDemoRequests", "D1", { ...consumable, status: "For Management Approval" })]), /must start at For Logistics Approval/);
    await assert.rejects(check(env, STATE, as("Engineering"), [row("inventoryDemoRequests", "D1", { status: "Approved" })]), /must start at/);
  });
  test("only management approves", async () => {
    mockSupabase({ inventoryDemoRequests: [stored("D1", { status: "For Management Approval" })] });
    await assert.rejects(check(env, STATE, as("Logistics"), [row("inventoryDemoRequests", "D1", { status: "Approved" })]), /Only Superadmin\/CEO/);
    await check(env, STATE, as("CEO"), [row("inventoryDemoRequests", "D1", { status: "Approved" })]);
  });
  test("steps can't be skipped", async () => {
    mockSupabase({ inventoryDemoRequests: [stored("D1", { status: "For Logistics Approval" })] });
    await assert.rejects(check(env, STATE, as("Superadmin"), [row("inventoryDemoRequests", "D1", { status: "Approved" })]), /cannot move from/);
  });
});

describe("support reports", () => {
  const check = worker.assertSupportReportChangesAllowed;
  test("Engineering can only change workflow fields", async () => {
    mockSupabase({ productIssues: [stored("I1", { status: "Open", client: "Lab" })] });
    await check(env, STATE, as("Engineering"), [row("productIssues", "I1", { status: "Resolved", client: "Lab" })]);
    await assert.rejects(check(env, STATE, as("Engineering"), [row("productIssues", "I1", { status: "Open", client: "Other" })]), /can only update the status/);
  });
  test("Engineering and Product Specialist can file a new one", async () => {
    await check(env, STATE, as("Engineering"), [row("productIssues", "I2", { status: "Open" })]);
    await check(env, STATE, as("Product Specialist"), [row("productIssues", "I2", { status: "Open" })]);
    assert.equal(worker.canAccessKey(as("Engineering", ["product-issues"]), "productIssues", "edit"), true);
  });
  test("Superadmin and CEO can correct any field of an existing report", async () => {
    mockSupabase({ productIssues: [stored("I1", { status: "Resolved", companyName: "Lab", typeOfSupport: "Technical Supprt" })] });
    for (const role of ["Superadmin", "CEO"]) await check(env, STATE, as(role), [row("productIssues", "I1", { status: "Resolved", companyName: "Lab Inc.", typeOfSupport: "Technical Support" })]);
    await assert.rejects(check(env, STATE, as("Engineering"), [row("productIssues", "I1", { status: "Resolved", companyName: "Lab Inc." })]), /can only update the status/);
  });
  test("other roles aren't limited by this check", async () => {
    await check(env, STATE, as("Admin"), [row("productIssues", "I2", { status: "Open" })]);
  });
});

describe("removing attachments", () => {
  const remove = worker.assertFileRemovable;
  const file = (over = {}) => ({ record_type: "productIssue", uploaded_by: "u1", ...over });
  test("the uploader can remove their own Support Tracker file", () => {
    remove(as("Engineering", ["product-issues"]), "u1", file());
    remove(as("Product Specialist", ["product-issues"]), "u1", file({ record_type: "instrumentalServiceReport" }));
  });
  test("someone else's file needs Superadmin/CEO", () => {
    assert.throws(() => remove(as("Engineering", ["product-issues"]), "u1", file({ uploaded_by: "u2" })), /person who uploaded/);
    assert.throws(() => remove(as("Admin", ["product-issues"]), "u1", file({ uploaded_by: null })), /person who uploaded/);
    remove(as("CEO"), "u9", file({ uploaded_by: "u2" }));
    remove(as("Superadmin"), "u9", file({ uploaded_by: null }));
  });
  test("needs edit access to the report", () => {
    assert.throws(() => remove(as("Sales", []), "u1", file()), /permission/);
  });
  test("only Support Tracker files can be removed, even by Superadmin", () => {
    for (const record_type of ["sale", "payable", "paymentRequest", "client-doc", "memo", "general"]) {
      assert.throws(() => remove(as("Superadmin"), "u1", file({ record_type })), /Only Support Tracker/, record_type);
    }
  });
});

describe("role names in the source", () => {
  // Role checks are plain strings, so a typo silently locks a role out (or never matches). Catches it.
  const source = readFileSync(workerSourcePath, "utf8");
  test("every string compared against a role is a known role", () => {
    const seen = new Set();
    for (const [, list] of source.matchAll(/\[((?:"[^"]+"(?:,\s*)?)+)\]\.includes\((?:profile(?:\[0\])?\??\.role|role)\)/g)) {
      for (const [, name] of list.matchAll(/"([^"]+)"/g)) seen.add(name);
    }
    for (const [, name] of source.matchAll(/(?:profile\??\.role|\brole) [!=]== "([^"]+)"/g)) seen.add(name);
    assert.ok(seen.size >= 5, "pattern stopped matching the source");
    for (const name of seen) assert.ok(ALL_ROLES.includes(name), `unknown role in worker.js: ${name}`);
  });
});

describe("receiving", () => {
  const items = [{ code: "A", name: "Item A" }];
  const line = (over = {}) => ({ code: "A", qty: 2, branch: "LP", lot: "L1", expiry: "2030-01-01", ...over });
  const po = () => ({ branch: "LP", lines: [{ code: "A", qty: 5, receivedQty: 1 }] });
  test("can't receive more than remains on the order", () => {
    assert.throws(() => worker.validateReceivingLines(po(), [line({ qty: 5 })], items), /only 4 remain/);
  });
  test("one item split across lots can't over-receive", () => {
    assert.throws(() => worker.validateReceivingLines(po(), [line({ qty: 3 }), line({ qty: 3, lot: "L2" })], items), /has nothing left to receive|only 1 remain/);
  });
  test("an unknown item is rejected", () => {
    assert.throws(() => worker.validateReceivingLines(po(), [line({ code: "Z" })], items), /Unknown item code/);
  });
  test("a valid receipt returns its line", () => {
    assert.equal(worker.validateReceivingLines(po(), [line()], items)[0].qty, 2);
  });
});

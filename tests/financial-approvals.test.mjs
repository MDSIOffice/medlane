import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const { assertFinancialApprovalAllowed: check, assertCreditApprovalAllowed: checkCredit } = worker;
const NON_MANAGEMENT = ["Admin", "Accounting", "Sales", "Logistics", "HR", "Engineering", "Product Specialist"];
beforeEach(() => mockSupabase());

describe("payables", () => {
  for (const role of NON_MANAGEMENT) {
    test(`${role} cannot approve a payable`, async () => {
      await assert.rejects(check(env, STATE, as(role), [row("payables", "P1", { requestStatus: "Approved" })]), /Only Superadmin or CEO can approve payable/);
    });
  }
  for (const role of ["Superadmin", "CEO"]) {
    test(`${role} can approve a payable`, async () => {
      await check(env, STATE, as(role), [row("payables", "P1", { requestStatus: "Approved" })]);
    });
  }
  for (const [name, data] of [
    ["status Approved", { status: "Approved" }],
    ["status Paid", { status: "Paid" }],
    ["paymentConfirmed true", { paymentConfirmed: true }],
    ['paymentConfirmed "true"', { paymentConfirmed: "true" }],
    ["requestStatus in odd casing", { requestStatus: "  aPPROVED " }],
  ]) {
    test(`Accounting cannot reach approval through ${name}`, async () => {
      await assert.rejects(check(env, STATE, as("Accounting"), [row("payables", "P1", data)]), /Only Superadmin or CEO/);
    });
  }
  test("a pending edit needs no approver", async () => {
    await check(env, STATE, as("Accounting"), [row("payables", "P1", { requestStatus: "Pending" })]);
  });
  test("editing an already approved payable is allowed", async () => {
    mockSupabase({ payables: [stored("P1", { requestStatus: "Approved" })] });
    await check(env, STATE, as("Accounting"), [row("payables", "P1", { requestStatus: "Approved", paymentConfirmed: true })]);
  });
  test("a stored row that is only pending still blocks", async () => {
    mockSupabase({ payables: [stored("P1", { requestStatus: "Pending" })] });
    await assert.rejects(check(env, STATE, as("Admin"), [row("payables", "P1", { requestStatus: "Approved" })]), /Only Superadmin or CEO/);
  });
});

describe("expense requests (replenishments)", () => {
  test("Accounting cannot approve", async () => {
    await assert.rejects(check(env, STATE, as("Accounting"), [row("replenishments", "E1", { requestStatus: "Approved" })]), /Accounting cannot approve expense/);
  });
  test("Accounting cannot approve through paymentConfirmed", async () => {
    await assert.rejects(check(env, STATE, as("Accounting"), [row("replenishments", "E1", { paymentConfirmed: true })]), /Accounting cannot approve expense/);
  });
  for (const role of ["Superadmin", "CEO", "Admin"]) {
    test(`${role} can approve`, async () => {
      await check(env, STATE, as(role), [row("replenishments", "E1", { requestStatus: "Approved" })]);
    });
  }
});

describe("collection payment requests", () => {
  for (const role of NON_MANAGEMENT) {
    test(`${role} cannot approve`, async () => {
      await assert.rejects(check(env, STATE, as(role), [row("paymentRequests", "R1", { status: "approved" })]), /Only Superadmin\/CEO can approve payment/);
    });
  }
  test("CEO can approve", async () => {
    await check(env, STATE, as("CEO"), [row("paymentRequests", "R1", { requestStatus: "Approved" })]);
  });
  test("an already approved request can be edited", async () => {
    mockSupabase({ paymentRequests: [stored("R1", { status: "Approved" })] });
    await check(env, STATE, as("Admin"), [row("paymentRequests", "R1", { status: "Approved", note: "x" })]);
  });
});

describe("stock receipts", () => {
  test("Logistics can file a receipt as Pending Approval", async () => {
    await check(env, STATE, as("Logistics"), [row("stockReceipts", "S1", { status: "Pending Approval" })]);
  });
  for (const status of ["Approved", "Cancelled"]) {
    test(`Logistics cannot move a receipt to ${status}`, async () => {
      mockSupabase({ stockReceipts: [stored("S1", { status: "Pending Approval" })] });
      await assert.rejects(check(env, STATE, as("Logistics"), [row("stockReceipts", "S1", { status })]), /Only Superadmin\/CEO can approve or cancel/);
    });
  }
  test("Logistics cannot create a receipt that is already Approved", async () => {
    await assert.rejects(check(env, STATE, as("Logistics"), [row("stockReceipts", "S2", { status: "Approved" })]), /Only Superadmin\/CEO/);
  });
  test("an unchanged approved receipt passes", async () => {
    mockSupabase({ stockReceipts: [stored("S1", { status: "Approved" })] });
    await check(env, STATE, as("Logistics"), [row("stockReceipts", "S1", { status: "Approved" })]);
  });
  test("CEO can approve", async () => {
    await check(env, STATE, as("CEO"), [row("stockReceipts", "S1", { status: "Approved" })]);
  });
});

describe("inventory purchase orders", () => {
  for (const role of ["Admin", "Accounting", "Logistics"]) {
    test(`${role} cannot approve (Superadmin/CEO only)`, async () => {
      await assert.rejects(check(env, STATE, as(role), [row("inventoryPurchaseOrders", "PO1", { status: "APPROVED" })]), /Only Superadmin\/CEO can approve purchase orders/);
    });
  }
  for (const role of ["Superadmin", "CEO"]) {
    test(`${role} can approve`, async () => {
      await check(env, STATE, as(role), [row("inventoryPurchaseOrders", "PO1", { status: "Approved" })]);
    });
  }
  test("an already approved PO can be edited", async () => {
    mockSupabase({ inventoryPurchaseOrders: [stored("PO1", { status: "Approved" })] });
    await check(env, STATE, as("CEO"), [row("inventoryPurchaseOrders", "PO1", { status: "Approved" })]);
  });
  for (const status of ["Sent to Supplier", "In Transit", "For Receiving", "Fully Received"]) {
    test(`Logistics cannot move a pending PO straight to ${status}`, async () => {
      mockSupabase({ inventoryPurchaseOrders: [stored("PO1", { status: "Pending Approval" })] });
      await assert.rejects(check(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "PO1", { status })]), /must be approved/);
    });
  }
  test("an approved PO may move on to Sent to Supplier", async () => {
    mockSupabase({ inventoryPurchaseOrders: [stored("PO1", { status: "Approved" })] });
    await check(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "PO1", { status: "Sent to Supplier", promisedDate: "2026-12-01" })]);
  });
  test("a pending PO can still be edited while pending", async () => {
    mockSupabase({ inventoryPurchaseOrders: [stored("PO1", { status: "Pending Approval" })] });
    await check(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "PO1", { status: "Pending Approval", promisedDate: "2026-12-01" })]);
  });
});

describe("missing profile fails closed", () => {
  for (const profile of [null, undefined, {}]) {
    test(`profile ${JSON.stringify(profile)} cannot approve a payable`, async () => {
      await assert.rejects(check(env, STATE, profile, [row("payables", "P1", { requestStatus: "Approved" })]));
    });
  }
});

describe("credit-limit invoice requests", () => {
  for (const status of ["Approved", "Rejected"]) {
    for (const role of ["Accounting", "Sales", "Logistics"]) {
      test(`${role} cannot mark one ${status}`, async () => {
        mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Pending" })] });
        await assert.rejects(checkCredit(env, STATE, as(role), [row("pendingCreditInvoices", "C1", { status })]), /Only Superadmin, CEO, or Admin/);
      });
    }
  }
  for (const role of ["Superadmin", "CEO", "Admin"]) {
    test(`${role} can approve one`, async () => {
      mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Pending" })] });
      await checkCredit(env, STATE, as(role), [row("pendingCreditInvoices", "C1", { status: "Approved" })]);
    });
  }
  test("Accounting can submit one as Pending", async () => {
    await checkCredit(env, STATE, as("Accounting"), [row("pendingCreditInvoices", "C1", { status: "Pending" })]);
  });
  test("Accounting can resave an already decided one unchanged", async () => {
    mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Approved" })] });
    await checkCredit(env, STATE, as("Accounting"), [row("pendingCreditInvoices", "C1", { status: "Approved" })]);
  });
});

describe("credit request status casing", () => {
  for (const status of ["approved", "APPROVED", " Rejected ", "rejected"]) {
    test(`Accounting can't set status "${status}"`, async () => {
      mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Pending" })] });
      await assert.rejects(checkCredit(env, STATE, as("Accounting"), [row("pendingCreditInvoices", "C1", { status })]), /Only Superadmin, CEO, or Admin/);
    });
  }
  test("re-saving a decided request in different casing isn't a new decision", async () => {
    mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Approved" })] });
    await checkCredit(env, STATE, as("Accounting"), [row("pendingCreditInvoices", "C1", { status: "approved" })]);
  });
  test("Admin can still approve", async () => {
    mockSupabase({ pendingCreditInvoices: [stored("C1", { status: "Pending" })] });
    await checkCredit(env, STATE, as("Admin"), [row("pendingCreditInvoices", "C1", { status: "approved" })]);
  });
});

test("HR can approve an expense (first step of the expense workflow)", async () => {
  await check(env, STATE, as("HR"), [row("replenishments", "E1", { status: "Approved by HR" })]);
});

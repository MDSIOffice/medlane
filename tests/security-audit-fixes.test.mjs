// Regression tests for the 25 Nov 2026 security audit fixes (run-1 findings).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";

const env = { ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key" };
const {
  assertFinancialApprovalAllowed: checkFinancial, assertStockChangesAllowed: checkStock, memoVisibleTo, branchRecordVisibleTo,
  filterRecordsForProfile, emailLinkSessionToken, assertPrintTemplateValuesValid, digestRecipients, allNoticeUsers, authUserIsBanned,
} = worker;
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
beforeEach(() => mockSupabase());

describe("expense / payable approvals", () => {
  test("Accounting can't approve an expense through the legacy 'Approved by HR' status with no requestStatus", async () => {
    mockSupabase({ replenishments: [stored("E1", { status: "For Approval", requestStatus: "For Approval" })] });
    await assert.rejects(checkFinancial(env, STATE, as("Accounting"), [row("replenishments", "E1", { status: "Approved by HR" })]), /Accounting cannot approve expense/);
  });
  test("HR's own 'Approved by HR' step (requestStatus still set) is not an approval", async () => {
    mockSupabase({ replenishments: [stored("E1", { status: "For HR Approval", requestStatus: "For Approval" })] });
    await checkFinancial(env, STATE, as("Accounting"), [row("replenishments", "E1", { status: "Approved by HR", requestStatus: "For Approval" })]);
  });
  test("an approved payable's amount can't be raised by a non-approver", async () => {
    mockSupabase({ payables: [stored("P3", { requestStatus: "Approved", amount: 1000, grossAmount: 1000, supplier: "S" })] });
    await assert.rejects(checkFinancial(env, STATE, as("Accounting"), [row("payables", "P3", { requestStatus: "Approved", amount: 950000, grossAmount: 950000, supplier: "S" })]), /permission to change the amount or payee/);
  });
  test("an approved payable's payee can't be swapped", async () => {
    mockSupabase({ payables: [stored("P3", { requestStatus: "Approved", amount: 1000, supplier: "S" })] });
    await assert.rejects(checkFinancial(env, STATE, as("Accounting"), [row("payables", "P3", { requestStatus: "Approved", amount: 1000, supplier: "Someone else" })]), /permission/);
  });
  test("recording payment on an approved payable still works", async () => {
    mockSupabase({ payables: [stored("P3", { requestStatus: "Approved", amount: 1000, grossAmount: 1000, supplier: "S" })] });
    await checkFinancial(env, STATE, as("Accounting"), [row("payables", "P3", { requestStatus: "Approved", amount: 1000, grossAmount: 1000, supplier: "S", method: "Cheque", bank: "B", cheque: "1", paymentConfirmed: true, status: "Paid", paid: 1000 })]);
  });
  test("an approved expense's amount can't be raised by Accounting, but Admin (an approver) may correct it", async () => {
    mockSupabase({ replenishments: [stored("E6", { requestStatus: "Approved", amount: 4200 })] });
    await assert.rejects(checkFinancial(env, STATE, as("Accounting"), [row("replenishments", "E6", { requestStatus: "Approved", amount: 99000 })]), /permission/);
    await checkFinancial(env, STATE, as("Admin"), [row("replenishments", "E6", { requestStatus: "Approved", amount: 4300 })]);
  });
});

describe("supplier purchase orders", () => {
  test("only known statuses can be stored, for any role", async () => {
    for (const role of ["Logistics", "Admin", "Superadmin"]) {
      await assert.rejects(checkFinancial(env, STATE, as(role), [row("inventoryPurchaseOrders", "IPO-X", { status: '<img src=x onerror="alert(1)">' })]), /Unknown purchase order status/);
    }
    await checkFinancial(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "IPO-1", { status: "Pending Approval" })]);
  });
  test("Logistics can't create a PO past approval", async () => {
    await assert.rejects(checkFinancial(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "IPO-2", { status: "For Receiving" })]), /must start as Pending Approval/);
  });
  test("a cancelled PO can't be revived by a plain save", async () => {
    mockSupabase({ inventoryPurchaseOrders: [stored("IPO-3", { status: "Cancelled" })] });
    await assert.rejects(checkFinancial(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "IPO-3", { status: "For Receiving" })]), /cancelled and can no longer be edited/);
  });
  test("Logistics still moves an approved PO along", async () => {
    mockSupabase({ inventoryPurchaseOrders: [stored("IPO-4", { status: "Approved" })] });
    await checkFinancial(env, STATE, as("Logistics"), [row("inventoryPurchaseOrders", "IPO-4", { status: "Sent to Supplier" })]);
  });
});

describe("stock changes below Admin", () => {
  const stock = (key, data) => stored(key, { code: "RG-01", branch: "Naga", lot: "L1", expiry: "2027-01-01", ...data });
  const inv = (key, data) => row("inventory", key, { code: "RG-01", branch: "Naga", lot: "L1", expiry: "2027-01-01", ...data });
  test("a brand-new stock row with quantity is refused (no receipt)", async () => {
    mockSupabase({});
    await assert.rejects(checkStock(env, STATE, as("Logistics"), [inv("inv-minted", { lot: "L-MINT", qty: 5000 })]), /approved stock receipt/);
  });
  test("an Imports migration row is left to assertMigratedStockAllowed", async () => {
    mockSupabase({});
    await checkStock(env, STATE, as("Logistics"), [inv("inv-import", { qty: 50, migrated: true })]);
  });
  test("re-sending an unchanged transfer next to a stock edit doesn't unlock it", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 10 })], pendingTransfers: [stored("T1", { status: "In Transit", lines: [{ code: "RG-01", dispatchedQty: 5 }] })] });
    await assert.rejects(checkStock(env, STATE, as("Logistics"), [inv("inv-1", { qty: 5000 }), row("pendingTransfers", "T1", { status: "In Transit", lines: [{ code: "RG-01", dispatchedQty: 5 }] })]), /Only Admin, CEO, or Superadmin/);
  });
  test("re-sending an existing invoice doesn't unlock a stock edit (Accounting)", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 10 })], sales: [stored("SI-1", { status: "Active", lines: [{ code: "RG-01", qty: 2 }] })] });
    await assert.rejects(checkStock(env, STATE, as("Accounting", ["sales"]), [inv("inv-1", { qty: 900 }), row("sales", "SI-1", { status: "Active", lines: [{ code: "RG-01", qty: 2 }] })]), /Only Admin, CEO, or Superadmin/);
  });
  test("a new invoice deducts exactly its quantity", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 10 })] });
    await checkStock(env, STATE, as("Sales"), [inv("inv-1", { qty: 7 }), row("sales", "SI-9", { status: "Active", lines: [{ code: "RG-01", qty: 3 }] })]);
    await assert.rejects(checkStock(env, STATE, as("Sales"), [inv("inv-1", { qty: 2 }), row("sales", "SI-9", { status: "Active", lines: [{ code: "RG-01", qty: 3 }] })]), /Only Admin/);
    await assert.rejects(checkStock(env, STATE, as("Sales"), [inv("inv-1", { qty: 13 }), row("sales", "SI-9", { status: "Active", lines: [{ code: "RG-01", qty: 3 }] })]), /Only Admin/, "a new sale never adds stock");
  });
  test("cancelling an invoice puts its quantity back", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 7 })], sales: [stored("SI-9", { status: "Active", lines: [{ code: "RG-01", qty: 3 }] })] });
    await checkStock(env, STATE, as("Accounting", ["sales"]), [inv("inv-1", { qty: 10 }), row("sales", "SI-9", { status: "Cancelled", lines: [{ code: "RG-01", qty: 3 }] })]);
  });
  test("transfer dispatch and receipt move exactly what the transfer records", async () => {
    mockSupabase({ inventory: [stock("inv-src", { qty: 10 })], pendingTransfers: [stored("T2", { status: "Approved", lines: [{ code: "RG-01", requestedQty: 4 }] })] });
    await checkStock(env, STATE, as("Logistics"), [inv("inv-src", { qty: 6 }), row("pendingTransfers", "T2", { status: "In Transit", lines: [{ code: "RG-01", requestedQty: 4, dispatchedQty: 4 }] })]);
    mockSupabase({ pendingTransfers: [stored("T2", { status: "In Transit", lines: [{ code: "RG-01", dispatchedQty: 4 }] })] });
    await checkStock(env, STATE, as("Logistics"), [inv("inv-dest", { branch: "Las Pinas", qty: 4 }), row("pendingTransfers", "T2", { status: "Received", lines: [{ code: "RG-01", dispatchedQty: 4, receivedQty: 4 }] })]);
    mockSupabase({ pendingTransfers: [stored("T2", { status: "In Transit", lines: [{ code: "RG-01", dispatchedQty: 4 }] })] });
    await assert.rejects(checkStock(env, STATE, as("Logistics"), [inv("inv-dest", { branch: "Las Pinas", qty: 400 }), row("pendingTransfers", "T2", { status: "Received", lines: [{ code: "RG-01", dispatchedQty: 4, receivedQty: 4 }] })]), /approved stock receipt/);
  });
  test("expiry is never changed below Admin; Admin can correct anything", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 10 })] });
    await assert.rejects(checkStock(env, STATE, as("Logistics"), [inv("inv-1", { qty: 10, expiry: "2030-01-01" })]), /Only Admin/);
    await checkStock(env, STATE, as("Admin"), [inv("inv-1", { qty: 99, expiry: "2030-01-01" })]);
  });
  test("an unchanged re-save passes", async () => {
    mockSupabase({ inventory: [stock("inv-1", { qty: 10 })] });
    await checkStock(env, STATE, as("Logistics"), [inv("inv-1", { qty: 10, note: "checked" })]);
  });
});

describe("memo audience", () => {
  const memo = { id: "M1", audience: ["CEO"] };
  test("only the audience (and the posters) see a role-targeted memo", () => {
    assert.equal(memoVisibleTo(as("Sales"), memo), false);
    assert.equal(memoVisibleTo(as("CEO"), memo), true);
    assert.equal(memoVisibleTo(as("HR"), memo), true);
    assert.equal(memoVisibleTo(as("Sales"), { audience: "all" }), true);
  });
  test("state reads drop memos outside the audience", () => {
    const rows = [{ module_name: "memos", record_key: "M1", data: memo }, { module_name: "memos", record_key: "M2", data: { id: "M2", audience: "all" } }];
    const salesView = { ...as("Sales"), customPermissions: { enabled: true, view: ["memos"], edit: [] } };
    assert.deepEqual(filterRecordsForProfile(rows, salesView, "view").map((r) => r.record_key), ["M2"]);
  });
});

describe("branch scope", () => {
  const naga = { ...as("Sales"), branch: "Naga", customPermissions: { enabled: true, view: ["sales", "inventory", "invoicing"], edit: [] } };
  test("a branch-locked person gets only that branch's invoices and stock", () => {
    const rows = [
      { module_name: "sales", record_key: "S1", data: { area: "Naga" } },
      { module_name: "sales", record_key: "S2", data: { area: "Las Pinas" } },
      { module_name: "inventory", record_key: "I1", data: { branch: "Naga" } },
      { module_name: "inventory", record_key: "I2", data: { branch: "Las Pinas" } },
      { module_name: "inventory", record_key: "I3", data: { branch: "Both" } },
    ];
    assert.deepEqual(filterRecordsForProfile(rows, naga, "view").map((r) => r.record_key), ["S1", "I1", "I3"]);
  });
  test("an all-branches person is unaffected, and other modules aren't branch-scoped", () => {
    assert.equal(branchRecordVisibleTo({ ...naga, branch: "all" }, "sales", { area: "Las Pinas" }), true);
    assert.equal(branchRecordVisibleTo(naga, "clients", { area: "Las Pinas" }), true);
  });
});

describe("password set from an email link", () => {
  const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const now = Math.floor(Date.now() / 1000);
  test("accepts a fresh recovery / invite session", () => {
    assert.equal(emailLinkSessionToken(jwt({ amr: [{ method: "recovery", timestamp: now - 60 }] })), true);
    assert.equal(emailLinkSessionToken(jwt({ amr: [{ method: "otp", timestamp: now - 60 }] })), true);
    assert.equal(emailLinkSessionToken(jwt({ amr: [{ method: "invite", timestamp: now - 60 }] })), true);
  });
  test("refuses an ordinary password session, a stale link session, and junk", () => {
    assert.equal(emailLinkSessionToken(jwt({ amr: [{ method: "password", timestamp: now - 60 }] })), false);
    assert.equal(emailLinkSessionToken(jwt({ amr: [{ method: "recovery", timestamp: now - 5 * 3600 }] })), false);
    assert.equal(emailLinkSessionToken(jwt({})), false);
    assert.equal(emailLinkSessionToken("not-a-jwt"), false);
  });
  test("the endpoint refuses a password-login token without calling GoTrue", async () => {
    let gotrue = 0;
    globalThis.fetch = async () => { gotrue += 1; return Response.json({}); };
    const response = await worker.default.fetch(new Request("https://app.test/api/auth/set-password", { method: "POST", body: JSON.stringify({ accessToken: jwt({ amr: [{ method: "password", timestamp: now }] }), password: "Secret123!Secret" }) }), env, { waitUntil: () => {} });
    assert.equal(response.status, 400);
    assert.equal(gotrue, 0);
  });
});

describe("print templates", () => {
  test("markup in a template override is refused at save", () => {
    assert.throws(() => assertPrintTemplateValuesValid([row("printTemplates", "SI", { type: "SI", fields: { "si-date": { align: 'left"><img src=x onerror=alert(1)>' } } })]), /unknown alignment/);
    assert.throws(() => assertPrintTemplateValuesValid([row("printTemplates", "SI", { type: "SI", row: { top: "1in;x" } })]), /must be a number/);
    assertPrintTemplateValuesValid([row("printTemplates", "SI", { type: "SI", fields: { "si-date": { left: 1.25, top: "2", align: "center", fontSize: 11 } }, row: { top: 3, spacing: 0.25 } })]);
  });
});

describe("deactivated accounts", () => {
  /** Fake Supabase for the recipient builders: profiles + GoTrue users. */
  const fake = ({ profiles, authUsers }) => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/admin/users") return Response.json({ users: authUsers });
      if (url.pathname === "/rest/v1/profiles") return Response.json(profiles);
      return Response.json([]);
    };
  };
  test("ban detection", () => {
    assert.equal(authUserIsBanned({ banned_until: "2126-01-01T00:00:00Z" }), true);
    assert.equal(authUserIsBanned({ banned_until: null }), false);
    assert.equal(authUserIsBanned({ banned_until: "2001-01-01T00:00:00Z" }), false);
  });
  test("digest and notice recipients skip deactivated accounts", async () => {
    fake({
      profiles: [{ id: "u-active", email: "active@example.test", role: "Superadmin" }, { id: "u-off", email: "off@example.test", role: "CEO" }],
      authUsers: [{ id: "u-active" }, { id: "u-off", banned_until: "2126-01-01T00:00:00Z" }],
    });
    const digest = await digestRecipients(env, ["Superadmin", "CEO"]);
    assert.deepEqual([...digest.keys()], ["active@example.test"]);
    const users = await allNoticeUsers(env);
    assert.deepEqual(users.map((u) => u.id), ["u-active"]);
  });
  test("a banned account's token is refused on every request", async () => {
    globalThis.fetch = async () => Response.json({ id: "u-off", email: "off@example.test", banned_until: "2126-01-01T00:00:00Z" });
    await assert.rejects(worker.authenticatedUser(new Request("https://app.test/x", { headers: { authorization: "Bearer t" } }), env), /deactivated/);
  });
});

describe("retired legacy whole-state endpoint", () => {
  test("GET and PUT /api/app-state are gone", async () => {
    for (const method of ["GET", "PUT"]) {
      const response = await worker.default.fetch(new Request("https://app.test/api/app-state", { method, headers: { authorization: "Bearer t" }, body: method === "PUT" ? "{}" : undefined }), env, { waitUntil: () => {} });
      assert.equal(response.status, 410);
    }
  });
});

describe("endpoints", () => {
  /** Minimal signed-in Supabase: one caller profile, others for name checks, memos, and a recorded write log. */
  const signedIn = ({ caller, profiles, memos = [] }) => {
    const db = { writes: [], profiles: structuredClone(profiles) };
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || "GET";
      const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (method !== "GET") db.writes.push({ method, path: url.pathname, body });
      if (url.pathname === "/auth/v1/user") { const p = db.profiles.find((x) => x.id === caller); return Response.json({ id: p.id, email: p.email }); }
      if (url.pathname === "/rest/v1/profiles") {
        const id = url.searchParams.get("id");
        if (method === "PATCH") return new Response(null, { status: 204 });
        if (id?.startsWith("eq.")) return Response.json(db.profiles.filter((p) => p.id === id.slice(3)));
        if (id?.startsWith("neq.")) return Response.json(db.profiles.filter((p) => p.id !== id.slice(4)));
        return Response.json(db.profiles);
      }
      if (url.pathname === "/rest/v1/app_records" && method === "GET" && url.searchParams.get("module_name") === "eq.memos") {
        const key = url.searchParams.get("record_key");
        return Response.json(memos.filter((m) => !key || `eq.${m.id}` === key).map((m) => ({ record_key: m.id, data: m })));
      }
      if (url.pathname === "/rest/v1/rpc/acknowledge_memo") return Response.json([{ data: memos[0] }]);
      return method === "GET" ? Response.json([]) : new Response(null, { status: 201 });
    };
    return db;
  };
  const post = (path, body, { form } = {}) => worker.default.fetch(new Request(`https://app.test${path}`, { method: path === "/api/account/profile" ? "PATCH" : "POST", headers: { authorization: "Bearer t" }, body: form || JSON.stringify(body) }), { ...env, DOCUMENTS_BUCKET: { put: async () => {}, delete: async () => {} } }, { waitUntil: (p) => p });
  const person = (id, role, full_name = id) => ({ id, email: `${id}@example.test`, role, full_name, branch: "all" });

  test("attachments need edit access to the record's module", async () => {
    for (const [role, recordType] of [["HR", "payable"], ["Sales", "memo"], ["Logistics", "client-doc"], ["Sales", "general"]]) {
      const db = signedIn({ caller: "u1", profiles: [person("u1", role)] });
      const form = new FormData();
      form.set("file", new File(["x"], "a.pdf", { type: "application/pdf" }));
      form.set("recordType", recordType);
      form.set("recordId", "R1");
      const response = await post("/api/files", null, { form });
      assert.ok([400, 403].includes(response.status), `${role} → ${recordType}: ${response.status}`);
      assert.ok(!db.writes.some((w) => w.path === "/rest/v1/file_objects"), "no file row written");
    }
  });
  test("a browser can't post a sign-in audit entry, and posted entries carry the account email", async () => {
    let db = signedIn({ caller: "u1", profiles: [person("u1", "Sales", "Ana Cruz")] });
    assert.equal((await post("/api/logs", { action: "Failed sign-in", module: "Authentication", record: "boss@example.test" })).status, 400);
    db = signedIn({ caller: "u1", profiles: [person("u1", "Sales", "Ana Cruz")] });
    assert.equal((await post("/api/logs", { action: "Exported client list", module: "Masterlists" })).status, 201);
    const entry = db.writes.find((w) => w.path === "/rest/v1/app_records" && w.body?.[0]?.module_name === "logs").body[0].data;
    assert.equal(entry.email, "u1@example.test");
    assert.equal(entry.clientReported, true);
  });
  test("you can't rename yourself to a colleague's full name", async () => {
    const db = signedIn({ caller: "u1", profiles: [person("u1", "Sales", "Ana Cruz"), person("u2", "Sales", "Carl Reyes")] });
    const response = await post("/api/account/profile", { fullName: "carl  reyes", phone: "", displayName: "" });
    assert.equal(response.status, 409);
    assert.ok(!db.writes.some((w) => w.method === "PATCH" && w.path === "/rest/v1/profiles"));
    signedIn({ caller: "u1", profiles: [person("u1", "Sales", "Ana Cruz"), person("u2", "Sales", "Carl Reyes")] });
    assert.equal((await post("/api/account/profile", { fullName: "Ana M. Cruz", phone: "", displayName: "" })).status, 200);
  });
  test("a memo outside your audience can't be acknowledged (404)", async () => {
    signedIn({ caller: "u1", profiles: [person("u1", "Sales")], memos: [{ id: "MEMO-9", audience: ["CEO"], title: "t", body: "secret" }] });
    const response = await post("/api/memos/MEMO-9/acknowledge", {});
    assert.equal(response.status, 404);
    assert.ok(!JSON.stringify(await response.json()).includes("secret"));
  });
});

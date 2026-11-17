// Support Tracker on the server: the response clock belongs to the server, ticket fields are
// checked, Engineering/Product Specialist only move tickets along, and a breached ticket notifies
// its engineer and Superadmin.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored, as } from "./helpers/load-worker.mjs";
import { generateNotices, noticeVisibleTo } from "../src/notifications.js";

beforeEach(() => mockSupabase());
const check = worker.assertSupportReportChangesAllowed;

describe("ticket fields on save", () => {
  test("a new ticket's logged time is the server's, whatever the browser sent", async () => {
    const before = Date.now();
    const incoming = row("productIssues", "TSR-1", { status: "Open", openedAt: "2020-01-01T00:00:00.000Z", priority: "high" });
    await check(env, STATE, as("Admin"), [incoming]);
    const stamped = Date.parse(incoming.data.openedAt);
    assert.ok(stamped >= before && stamped <= Date.now() + 1000);
    // An older-style report without openedAt stays untracked.
    const legacy = row("productIssues", "TSR-2", { status: "Open" });
    await check(env, STATE, as("Admin"), [legacy]);
    assert.equal(legacy.data.openedAt, undefined);
  });

  test("once set, the logged time and first response can't be moved (except by Superadmin/CEO)", async () => {
    const opened = "2026-11-18T00:00:00.000Z";
    const replied = "2026-11-18T00:30:00.000Z";
    mockSupabase({ productIssues: [stored("TSR-1", { status: "Open", openedAt: opened, firstResponseAt: replied })] });
    for (const role of ["Admin", "Engineering"]) {
      const incoming = row("productIssues", "TSR-1", { status: "Open", openedAt: "2026-11-19T00:00:00.000Z", firstResponseAt: "2026-11-18T00:05:00.000Z" });
      await check(env, STATE, as(role), [incoming]);
      assert.deepEqual([incoming.data.openedAt, incoming.data.firstResponseAt], [opened, replied], role);
    }
    const fix = row("productIssues", "TSR-1", { status: "Open", openedAt: "2026-11-17T23:00:00.000Z", firstResponseAt: replied });
    await check(env, STATE, as("Superadmin"), [fix]);
    assert.equal(fix.data.openedAt, "2026-11-17T23:00:00.000Z");
  });

  test("priority, type and status must be known values", async () => {
    await assert.rejects(check(env, STATE, as("Admin"), [row("productIssues", "T", { priority: "urgent" })]), /Unknown priority/);
    await assert.rejects(check(env, STATE, as("Admin"), [row("productIssues", "T", { issueType: "Plumbing" })]), /Unknown ticket type/);
    await assert.rejects(check(env, STATE, as("Admin"), [row("productIssues", "T", { ticketStatus: "Done" })]), /Unknown ticket status/);
    await check(env, STATE, as("Admin"), [row("productIssues", "T", { priority: "critical", issueType: "Reagent / QC", ticketStatus: "New" })]);
  });

  test("Engineering can assign, reply, schedule a visit and resolve, but not change the client or the issue", async () => {
    mockSupabase({ productIssues: [stored("TSR-1", { status: "Open", companyName: "Lab", concerns: "CBC down", priority: "high", ticketStatus: "New" })] });
    await check(env, STATE, as("Engineering"), [row("productIssues", "TSR-1", {
      status: "Open", companyName: "Lab", concerns: "CBC down", priority: "critical", ticketStatus: "On-site visit set", statusSince: "x", engineer: "Engineer 1", engineerEmail: "e1@x.ph",
      firstResponseAt: "2026-11-18T01:00:00Z", visitAt: "2026-11-19T01:00:00Z", visitEventIds: ["EVT-1"], updates: [{ note: "Called" }],
    })]);
    await assert.rejects(check(env, STATE, as("Engineering"), [row("productIssues", "TSR-1", { status: "Open", companyName: "Lab", concerns: "Something else", priority: "high", ticketStatus: "New" })]), /can only update the status/);
  });

  test("support settings: Superadmin, CEO and Admin change them; everyone with the tracker reads them", () => {
    for (const role of ["Superadmin", "CEO", "Admin"]) assert.equal(worker.canAccessKey(as(role, ["product-issues"]), "supportSettings", "edit"), true, role);
    for (const role of ["Engineering", "Product Specialist"]) {
      assert.equal(worker.canAccessKey(as(role, ["product-issues"]), "supportSettings", "edit"), false, role);
      assert.equal(worker.canAccessKey(as(role, ["product-issues"]), "supportSettings", "view"), true, role);
    }
  });
});

describe("breach notifications", () => {
  const now = new Date("2026-11-18T08:00:00+08:00");
  const hoursAgo = (/** @type {number} */ h) => new Date(now.getTime() - h * 3600e3).toISOString();
  const state = {
    productIssues: [
      { id: "TSR-1", companyName: "Lab C", status: "Open", priority: "high", openedAt: hoursAgo(7), engineer: "Engineer 1", engineerEmail: "E1@x.ph" },
      { id: "TSR-2", companyName: "Clinic B", status: "Open", priority: "high", openedAt: hoursAgo(1), engineerEmail: "e1@x.ph" },
      { id: "TSR-3", companyName: "Clinic F", status: "Open", priority: "critical", openedAt: hoursAgo(3) },
      { id: "TSR-4", companyName: "Lab D", status: "Resolved", priority: "critical", openedAt: hoursAgo(90) },
      { id: "TSR-5", companyName: "Old", status: "Open", startDate: "2025-01-01" },
    ],
  };
  const notices = generateNotices(state, now).filter((n) => /^GEN-support-breach/.test(n.id));

  test("only open, tracked, breached tickets", () => {
    assert.deepEqual([...new Set(notices.map((n) => n.record))].sort(), ["TSR-1", "TSR-3"]);
    assert.ok(notices.every((n) => n.urgent && n.section === "product-issues" && n.category === "service"));
    assert.equal(notices.find((n) => n.id === "GEN-support-breach-TSR-1").message, "High ticket TSR-1 for Lab C missed its response time.");
  });

  test("the assigned engineer and Superadmin get it; other engineers and roles don't", () => {
    const engineer = { email: "e1@x.ph", role: "Engineering", modules: ["product-issues"] };
    const other = { email: "e2@x.ph", role: "Engineering", modules: ["product-issues"] };
    const admin = { email: "a@x.ph", role: "Admin", modules: ["product-issues"] };
    const boss = { email: "s@x.ph", role: "Superadmin", modules: [] };
    const seen = (/** @type {any} */ who) => notices.filter((n) => noticeVisibleTo(who, n)).map((n) => n.id).sort();
    assert.deepEqual(seen(engineer), ["GEN-support-breach-TSR-1"]);
    assert.deepEqual(seen(other), []);
    assert.deepEqual(seen(admin), []);
    assert.deepEqual(seen(boss), ["GEN-support-breach-TSR-1-superadmin", "GEN-support-breach-TSR-3-superadmin"]);
  });

  test("the message doesn't change every 15 minutes, so it isn't re-sent", () => {
    const later = generateNotices(state, new Date(now.getTime() + 45 * 60e3)).filter((n) => /^GEN-support-breach/.test(n.id));
    assert.deepEqual(later.map((n) => n.message), notices.map((n) => n.message));
  });

  test("custom response targets are used", () => {
    const relaxed = generateNotices({ ...state, supportSettings: [{ id: "support-settings", targets: { high: { respondHours: 12 } } }] }, now).filter((n) => /^GEN-support-breach/.test(n.id));
    assert.deepEqual([...new Set(relaxed.map((n) => n.record))], ["TSR-3"]);
  });
});

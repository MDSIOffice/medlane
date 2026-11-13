import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

const { notificationVisibleTo, filterRecordsForProfile } = worker;
const accounting = { role: "Accounting", email: "acc@medlane.local", customPermissions: { view: ["invoicing", "payables", "notifications"], edit: ["invoicing", "notifications"] } };
const sales = { role: "Sales", email: "sales@medlane.local", customPermissions: { view: ["sales", "notifications"], edit: ["sales"] } };
const admin = { role: "Admin", email: "admin@medlane.local", customPermissions: { view: ["security", "notifications"], edit: ["security"] } };
const row = (data, i = 0) => ({ module_name: "notifications", record_key: `notifications-${i}`, data });

describe("which notices a non-management role can read", () => {
  test("a notice addressed to this person (email match is case-insensitive)", () => {
    assert.equal(notificationVisibleTo(accounting, { targetUser: "ACC@medlane.local", section: "notifications", message: "Your invoice request was approved" }), true);
  });
  test("a notice addressed to someone else is hidden, whatever its section", () => {
    assert.equal(notificationVisibleTo(sales, { targetUser: "acc@medlane.local", section: "notifications", message: "Your invoice request was approved" }), false);
  });
  test("a notice for one of this role's modules", () => {
    assert.equal(notificationVisibleTo(accounting, { section: "payables", type: "Payable", message: "PAY-1 approved." }), true);
    assert.equal(notificationVisibleTo(sales, { section: "payables", type: "Payable", message: "PAY-1 approved." }), false);
  });
  test("security, user and audit notices never reach these roles", () => {
    assert.equal(notificationVisibleTo(accounting, { section: "users", message: "x" }), false);
    assert.equal(notificationVisibleTo(accounting, { section: "invoicing", type: "Security", message: "Password reset" }), false);
  });
  test("an audience list limits by role", () => {
    assert.equal(notificationVisibleTo(accounting, { section: "invoicing", audience: ["Admin"], message: "x" }), false);
    assert.equal(notificationVisibleTo(accounting, { section: "invoicing", audience: ["Accounting"], message: "x" }), true);
  });
});

describe("record filtering", () => {
  test("non-management roles get only their notices, read-only", () => {
    const rows = [row({ targetUser: "acc@medlane.local", message: "mine" }, 0), row({ targetUser: "other@x", message: "theirs" }, 1), row({ section: "security", message: "lock" }, 2)];
    assert.deepEqual(filterRecordsForProfile(rows, accounting, "view").map((r) => r.data.message), ["mine"]);
    assert.deepEqual(filterRecordsForProfile(rows, accounting, "edit"), []);
  });
  test("management roles still read the whole list", () => {
    const rows = [row({ targetUser: "acc@medlane.local", message: "a" }, 0), row({ section: "security", message: "b" }, 1)];
    assert.equal(filterRecordsForProfile(rows, admin, "view").length, 2);
  });
});

// Warranty rules (public/scripts/warranty-rules.js, a plain browser script that also sets
// globalThis.WarrantyRules, which is how the Worker and these tests use it).
import test from "node:test";
import assert from "node:assert/strict";
import "../public/scripts/warranty-rules.js";

const W = /** @type {any} */ (globalThis).WarrantyRules;
const TODAY = "2026-11-18";

test("warranty expiring: under warranty, expiring soon within 60 days, out of warranty after the end date", () => {
  const status = (/** @type {string} */ end, extra = {}) => W.unitStatus({ warrantyEnd: end, ...extra }, TODAY);
  assert.equal(status("2027-06-01").status, "under");
  assert.equal(status("2027-01-18").status, "under", "61 days left");
  assert.deepEqual([status("2027-01-17").status, status("2027-01-17").daysLeft], ["expiring", 60]);
  assert.equal(status("2026-11-18").status, "expiring", "ends today: still covered");
  assert.equal(status("2026-11-17").status, "out");
  assert.equal(status("").status, "out", "no end date: not covered");
  assert.equal(status("2026-11-18").label, "Expiring soon");
});

test("a service contract covers a unit once its warranty has ended, until the contract ends", () => {
  assert.equal(W.unitStatus({ warrantyEnd: "2025-01-01", contractStatus: "active", contractEnd: "2027-01-01" }, TODAY).status, "contract");
  assert.equal(W.unitStatus({ warrantyEnd: "2025-01-01", contractStatus: "active", contractEnd: "2026-11-01" }, TODAY).status, "out", "contract ended");
  assert.equal(W.unitStatus({ warrantyEnd: "2025-01-01", contractStatus: "quoted", contractEnd: "2027-01-01" }, TODAY).status, "out", "only quoted");
  assert.equal(W.unitStatus({ warrantyEnd: "2027-06-01", contractStatus: "active" }, TODAY).status, "under", "warranty first");
});

test("PM due: next PM is last PM plus the interval; overdue, due within 14 days, or scheduled", () => {
  const pm = (/** @type {any} */ unit, /** @type {any} */ settings) => W.pm(unit, TODAY, settings);
  assert.deepEqual([pm({ lastPm: "2026-08-01" }).next, pm({ lastPm: "2026-08-01" }).status], ["2026-11-01", "overdue"]);
  assert.deepEqual([pm({ lastPm: "2026-08-18" }).next, pm({ lastPm: "2026-08-18" }).status, pm({ lastPm: "2026-08-18" }).days], ["2026-11-18", "due", 0]);
  assert.equal(pm({ lastPm: "2026-09-02" }).status, "due", "due on 2 Dec, 14 days away");
  assert.equal(pm({ lastPm: "2026-09-03" }).status, "scheduled", "15 days away");
  assert.equal(pm({ installDate: "2026-10-01" }).next, "2027-01-01", "no PM yet: counts from the install date");
  assert.equal(pm({}).status, "none");
  assert.equal(W.addMonths("2026-11-30", 3), "2027-02-28", "end of month clamps");
});

test("the PM interval is configurable per model, with a default", () => {
  const settings = { pmMonths: { "Zybio Z5": 6, Broken: 0 }, defaultPmMonths: 4 };
  assert.equal(W.pmMonths({ model: "Zybio Z5" }, settings), 6);
  assert.equal(W.pmMonths({ equipment: "Zybio Z5" }, settings), 6, "older records use equipment as the model");
  assert.equal(W.pmMonths({ model: "Broken" }, settings), 4, "nonsense falls back to the default");
  assert.equal(W.pmMonths({ model: "Other" }), 3);
  assert.equal(W.pm({ model: "Zybio Z5", lastPm: "2026-06-01" }, TODAY, settings).next, "2026-12-01");
});

test("a booked PM is shown but doesn't hide that it's overdue; a past booking is ignored", () => {
  const p = W.pm({ lastPm: "2026-07-01", pmScheduledFor: "2026-11-25" }, TODAY);
  assert.deepEqual([p.status, p.booked], ["overdue", "2026-11-25"]);
  assert.equal(W.pm({ lastPm: "2026-07-01", pmScheduledFor: "2026-11-01" }, TODAY).booked, "");
});

test("claims move forward one step at a time; what's still to recover", () => {
  assert.ok(W.claimMoveAllowed("Open", "Part received"));
  assert.ok(W.claimMoveAllowed("Part received", "Part received"));
  assert.ok(!W.claimMoveAllowed("Open", "Credited"), "no skipping");
  assert.ok(!W.claimMoveAllowed("Credited", "Open"), "no going back");
  assert.ok(!W.claimMoveAllowed("Open", "Paid"));
  assert.equal(W.nextClaimStatus({ status: "Old part returned" }), "Credited");
  assert.equal(W.nextClaimStatus({ status: "Credited" }), "");
  assert.equal(W.toRecover([{ partCost: 12000, status: "Open" }, { partCost: "3500", status: "Old part returned" }, { partCost: 9000, status: "Credited" }, { partCost: 100, status: "Open", cancelled: true }, { partCost: -5 }]), 15500);
  assert.equal(W.nextClaimId([{ id: "WC-2026-009" }, { id: "WC-2025-044" }, { id: "X" }], TODAY), "WC-2026-010");
  assert.equal(W.nextClaimId([], TODAY), "WC-2026-001");
});

test("warranty-ending distribution and issues per model", () => {
  const units = [{ warrantyEnd: "2026-10-01" }, { warrantyEnd: "2026-12-01" }, { warrantyEnd: "2027-01-10" }, { warrantyEnd: "2027-04-01" }, { warrantyEnd: "2027-09-01" }, { warrantyEnd: "2029-01-01" }, {}];
  assert.deepEqual(W.endingBuckets(units, TODAY).map((/** @type {any} */ b) => b.count), [1, 1, 1, 1, 1, 1]);
  const fleet = [{ model: "Zybio Z5", serial: "A" }, { model: "Zybio Z5", serial: "B" }, { equipment: "VEDA8900", serial: "C" }];
  const tickets = [{ serialNo: "a", openedAt: "2026-10-01T00:00:00Z" }, { serialNo: "A", startDate: "2026-03-01" }, { serialNo: "C", startDate: "2026-09-01" }, { serialNo: "C", startDate: "2025-01-01" }, { serialNo: "Z" }];
  assert.deepEqual(W.issuesPerModel(fleet, tickets, TODAY).map((/** @type {any} */ m) => [m.model, m.units, m.tickets, m.rate]), [["Zybio Z5", 2, 2, 1], ["VEDA8900", 1, 1, 1]], "same rate: more tickets first");
});

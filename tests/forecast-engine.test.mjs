// Runs the real public/scripts/forecast-engine.js (a plain browser script) in a sandbox.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/forecast-engine.js", import.meta.url), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\n;globalThis.engine = { FORECAST_DEFAULTS, forecastSettingsFrom, forecastItemMath, forecastUsageEvents, forecastUnitsBetween, forecastAccuracy, forecastLeadTimes, forecastLeadFor, forecastExpiryRisk, forecastTrend, forecastAddDays, forecastMonthStart };`, sandbox);
const E = sandbox.engine;
const base = { lookbackDays: 90, safetyDays: 14, coverDays: 60 };

test("Order now: available at or below the reorder point", () => {
  // 90 used in 90 days → 1/day. Lead 14 + safety 14 → reorder point 28. Available 20 + 5 = 25.
  const m = E.forecastItemMath({ ...base, units: 90, onHand: 20, onOrder: 5, leadDays: 14 });
  assert.equal(m.daily, 1);
  assert.equal(m.safety, 14);
  assert.equal(m.rop, 28);
  assert.equal(m.available, 25);
  assert.equal(m.upTo, 88); // 1 × (14 + 60) + 14
  assert.equal(m.status, "now");
  assert.equal(m.suggested, 63); // 88 − 25
  assert.equal(m.daysOfStock, 20);
});

test("Order now exactly at the reorder point", () => {
  const m = E.forecastItemMath({ ...base, units: 90, onHand: 28, onOrder: 0, leadDays: 14 });
  assert.equal(m.status, "now");
});

test("Order soon: reaches the reorder point within the lead time", () => {
  // Reorder point 28; available 40 → 12 days until the reorder point, lead time 14.
  const m = E.forecastItemMath({ ...base, units: 90, onHand: 40, onOrder: 0, leadDays: 14 });
  assert.equal(m.status, "soon");
  assert.equal(m.daysToRop, 12);
  assert.equal(m.suggested, 48); // 88 − 40
});

test("OK: more than a lead time away from the reorder point", () => {
  const m = E.forecastItemMath({ ...base, units: 90, onHand: 80, onOrder: 0, leadDays: 14 });
  assert.equal(m.daysToRop, 52);
  assert.equal(m.status, "ok");
  assert.equal(m.suggested, 0);
});

test("on order counts as available", () => {
  const without = E.forecastItemMath({ ...base, units: 90, onHand: 10, onOrder: 0, leadDays: 14 });
  const withOrder = E.forecastItemMath({ ...base, units: 90, onHand: 10, onOrder: 80, leadDays: 14 });
  assert.equal(without.status, "now");
  assert.equal(withOrder.status, "ok");
  assert.equal(withOrder.daysOfStock, 10); // days of stock is on hand only
});

test("no use in the window is OK, never Order now, even with no stock", () => {
  const m = E.forecastItemMath({ ...base, units: 0, onHand: 0, onOrder: 0, leadDays: 14 });
  assert.equal(m.status, "ok");
  assert.equal(m.daysOfStock, null);
  assert.equal(m.suggested, 0);
});

test("suggested quantity rounds up to the pack size", () => {
  const m = E.forecastItemMath({ ...base, units: 90, onHand: 20, onOrder: 5, leadDays: 14, packSize: 10 });
  assert.equal(m.need, 63);
  assert.equal(m.suggested, 70);
});

test("reorder point and order-up-to round up fractional units", () => {
  // 10 units in 90 days → 0.111/day; lead 24 + safety 14 → 4.22 → 5.
  const m = E.forecastItemMath({ ...base, units: 10, onHand: 3, onOrder: 0, leadDays: 24 });
  assert.equal(m.rop, 5);
  assert.equal(m.upTo, 11); // 0.111 × (24 + 60) + 1.556 = 10.89 → 11
});

test("settings: defaults, bounds and supplier lead times", () => {
  assert.deepEqual({ ...E.forecastSettingsFrom(undefined), supplierLeadDays: {} }, { safetyDays: 14, coverDays: 60, lookbackDays: 90, defaultLeadDays: 14, supplierLeadDays: {} });
  const s = E.forecastSettingsFrom({ safetyDays: "21", coverDays: -5, defaultLeadDays: 999, supplierLeadDays: { Zybio: 24, Bad: "x", "": 3 } });
  assert.equal(s.safetyDays, 21);
  assert.equal(s.coverDays, 60);
  assert.equal(s.defaultLeadDays, 14);
  assert.deepEqual({ ...s.supplierLeadDays }, { Zybio: 24 });
});

const toDay = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : "");

test("usage counts SI and TS lines only; DRs and cancelled documents are excluded", () => {
  const sales = [
    { type: "SI", status: "Active", date: "2026-11-01", lines: [{ code: "A", qty: 5 }] },
    { type: "TS", status: "Active", date: "2026-11-02", lines: [{ code: "A", qty: 2 }, { item: "Beta", qty: 1 }] },
    { type: "DR", status: "Active", date: "2026-11-03", lines: [{ code: "A", qty: 100 }] },
    { type: "SI", status: "Cancelled", date: "2026-11-04", lines: [{ code: "A", qty: 100 }] },
    { type: "SI", status: "Active", date: "2026-06-01", lines: [{ code: "A", qty: 50 }] },
  ];
  const events = E.forecastUsageEvents(sales, { toDay, codeOf: (line) => line.code || (line.item === "Beta" ? "B" : "") });
  const units = E.forecastUnitsBetween(events, "2026-08-19", "2026-11-16");
  assert.equal(units.get("A"), 7);
  assert.equal(units.get("B"), 1);
});

test("lead time is the average days from approval to first receipt, per supplier", () => {
  const pos = [
    { supplier: "Zybio", status: "Fully Received", approvedAt: "2026-09-01", history: [{ status: "Approved", date: "2026-09-01" }, { status: "Partially Received", date: "2026-09-21" }, { status: "Fully Received", date: "2026-09-30" }] },
    { supplier: "Zybio", status: "Fully Received", approvedAt: "2026-10-01", history: [{ status: "Fully Received", date: "2026-10-29" }] },
    { supplier: "Zybio", status: "Cancelled", approvedAt: "2026-10-01", history: [{ status: "Fully Received", date: "2026-12-29" }] },
    { supplier: "Other", status: "Approved", approvedAt: "2026-11-01", history: [] },
  ];
  const leads = E.forecastLeadTimes(pos, toDay);
  assert.deepEqual({ ...leads.get("Zybio") }, { days: 24, samples: 2 }); // (20 + 28) / 2
  assert.equal(leads.has("Other"), false);
  const settings = E.forecastSettingsFrom({ supplierLeadDays: { Other: 10 } });
  assert.equal(E.forecastLeadFor("Zybio", leads, settings).source, "history");
  assert.deepEqual({ ...E.forecastLeadFor("Other", leads, settings) }, { days: 10, source: "setting", samples: 0 });
  assert.deepEqual({ ...E.forecastLeadFor("New", leads, settings) }, { days: 14, source: "default", samples: 0 });
});

test("expiry risk uses the earliest-expiring lot first", () => {
  const lots = [
    { code: "A", lot: "L2", qty: 10, expiry: "2026-12-16" }, // 30 days
    { code: "A", lot: "L1", qty: 10, expiry: "2026-11-26" }, // 10 days
  ];
  const plain = (value) => JSON.parse(JSON.stringify(value));
  // 1 a day: L1 supplies 10 in its 10 days; L2 gets the remaining 30 − 10 = 20 days of use → all 10.
  let out = E.forecastExpiryRisk(lots, new Map([["A", 1]]), "2026-11-16");
  assert.deepEqual(plain(out.map((lot) => [lot.lot, lot.willUse, lot.unused])), [["L1", 10, 0], ["L2", 10, 0]]);
  // 0.5 a day: L1 supplies 5 before it expires (5 unused); L2 gets 15 − 5 = 10 → all 10 used.
  out = E.forecastExpiryRisk(lots, new Map([["A", 0.5]]), "2026-11-16");
  assert.deepEqual(plain(out.map((lot) => [lot.lot, lot.willUse, lot.unused])), [["L1", 5, 5], ["L2", 10, 0]]);
  // 0.2 a day: L1 supplies 2 (8 unused); L2 gets 6 − 2 = 4 (6 unused).
  out = E.forecastExpiryRisk(lots, new Map([["A", 0.2]]), "2026-11-16");
  assert.deepEqual(plain(out.map((lot) => [lot.lot, lot.willUse, lot.unused])), [["L1", 2, 8], ["L2", 4, 6]]);
  // No use: everything expires unused.
  out = E.forecastExpiryRisk(lots, new Map(), "2026-11-16");
  assert.deepEqual(plain(out.map((lot) => lot.unused)), [10, 10]);
});

test("forecast accuracy compares each month with the 90 days before it", () => {
  // Steady 1 a day for a year → every forecast is exact.
  const events = [];
  for (let day = 0; day < 365; day += 1) events.push({ code: "A", day: E.forecastAddDays("2025-11-16", day), units: 1 });
  assert.equal(E.forecastAccuracy(events, "2026-11-16", 90), 100);
  // Nothing used in the last three months against a steady history → 0.
  assert.equal(E.forecastAccuracy([], "2026-11-16", 90), null);
  const doubled = events.map((event) => (event.day >= "2026-08-01" ? { ...event, units: 2 } : event));
  const accuracy = E.forecastAccuracy(doubled, "2026-11-16", 90);
  assert.ok(accuracy > 0 && accuracy < 100, String(accuracy));
});

test("trend: rising, falling, steady", () => {
  assert.equal(E.forecastTrend([9, 10, 11, 12, 12, 13]), "rising");
  assert.equal(E.forecastTrend([10, 9, 8, 7, 7, 7]), "falling");
  assert.equal(E.forecastTrend([6, 5, 6, 6, 7, 6]), "steady");
  assert.equal(E.forecastTrend([0, 0, 0, 0, 0, 4]), "new");
});

// @ts-check
// Warranty rules: unit status, preventive maintenance (PM) due dates, claims. Pure functions over
// plain inputs (no DOM, no app state), shared by the page (warranty-page.js), the Worker's
// notifications (src/notifications.js imports this file for its side effect) and the tests.
// Exposed as the global `WarrantyRules`. Dates are "YYYY-MM-DD" (Manila days).
//
//   Unit status   Under warranty   warranty end ≥ today (+ "Expiring soon" when ≤ 60 days left)
//                 Service contract out of warranty, with an active service contract
//                 Out of warranty  otherwise
//   PM            every 3 months unless the model has its own interval;
//                 next PM = last PM (else install date) + interval;
//                 Overdue (before today) · Due (within 14 days) · Scheduled (later)
//   Claims        open → part received → old part returned → credited;
//                 to recover = part cost of every claim not yet credited

const WarrantyRules = (() => {
  const DAY = 86400000;
  const EXPIRING_DAYS = 60;
  const PM_DUE_DAYS = 14;
  const DEFAULT_PM_MONTHS = 3;
  const CLAIM_STATUSES = ["Open", "Part received", "Old part returned", "Credited"];
  /** @typedef {"under" | "expiring" | "contract" | "out"} UnitStatus */
  const STATUS_LABELS = /** @type {Record<UnitStatus, string>} */ ({ under: "Under warranty", expiring: "Expiring soon", contract: "Service contract", out: "Out of warranty" });
  /** @typedef {"overdue" | "due" | "scheduled" | "none"} PmStatus */
  const PM_LABELS = /** @type {Record<PmStatus, string>} */ ({ overdue: "Overdue", due: "Due", scheduled: "Scheduled", none: "No PM date" });

  /** @param {any} value */
  function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
  /** Whole days from `from` to `to` (both YYYY-MM-DD). @param {string} from @param {string} to */
  function daysBetween(from, to) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY); }
  /** Today in Manila. @param {Date} [now] */
  function manilaToday(now = new Date()) { return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
  /** `date` + n months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). @param {string} date @param {number} months */
  function addMonths(date, months) {
    const [y, m, d] = date.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
  }

  /** The unit's model (older records only have `equipment`). @param {any} unit */
  function modelOf(unit) { return String(unit?.model || unit?.equipment || "").trim(); }
  /** Is the service contract active today? @param {any} unit @param {string} today */
  function contractActive(unit, today) {
    if (!(unit?.contractStatus === "active" || unit?.contract === true || unit?.contract === "Yes")) return false;
    return !isDate(unit?.contractEnd) || unit.contractEnd >= today;
  }
  /**
   * Status, days of warranty left and whether a contract covers it.
   * @param {any} unit @param {string} today
   */
  function unitStatus(unit, today) {
    const end = isDate(unit?.warrantyEnd) ? String(unit.warrantyEnd) : "";
    const daysLeft = end ? daysBetween(today, end) : null;
    const contract = contractActive(unit, today);
    /** @type {UnitStatus} */
    const status = daysLeft !== null && daysLeft >= 0 ? (daysLeft <= EXPIRING_DAYS ? "expiring" : "under") : contract ? "contract" : "out";
    return { status, label: STATUS_LABELS[status], daysLeft, covered: status === "under" || status === "expiring", contract };
  }

  /** PM interval in months for this unit's model. @param {any} unit @param {any} [settings] */
  function pmMonths(unit, settings) {
    const own = Number(settings?.pmMonths?.[modelOf(unit)]);
    if (Number.isFinite(own) && own >= 1 && own <= 60) return Math.round(own);
    const fallback = Number(settings?.defaultPmMonths);
    return Number.isFinite(fallback) && fallback >= 1 && fallback <= 60 ? Math.round(fallback) : DEFAULT_PM_MONTHS;
  }
  /**
   * Next PM date and its status. A booked visit (pmScheduledFor) is shown alongside, but the
   * status follows the due date: a PM booked after it was due is still overdue until it's done.
   * @param {any} unit @param {string} today @param {any} [settings]
   */
  function pm(unit, today, settings) {
    const months = pmMonths(unit, settings);
    const base = isDate(unit?.lastPm) ? String(unit.lastPm) : isDate(unit?.installDate) ? String(unit.installDate) : "";
    const next = base ? addMonths(base, months) : "";
    const days = next ? daysBetween(today, next) : null;
    /** @type {PmStatus} */
    const status = days === null ? "none" : days < 0 ? "overdue" : days <= PM_DUE_DAYS ? "due" : "scheduled";
    const booked = isDate(unit?.pmScheduledFor) && unit.pmScheduledFor >= today ? String(unit.pmScheduledFor) : "";
    return { months, last: isDate(unit?.lastPm) ? String(unit.lastPm) : "", next, days, status, label: PM_LABELS[status], booked };
  }

  /** @param {any} claim */
  function claimStatus(claim) { return CLAIM_STATUSES.includes(claim?.status) ? String(claim.status) : "Open"; }
  /** The step after this one, or "" at the end. @param {any} claim */
  function nextClaimStatus(claim) { return CLAIM_STATUSES[CLAIM_STATUSES.indexOf(claimStatus(claim)) + 1] || ""; }
  /** May a claim move from `from` to `to`? Forward one step at a time (or stay). @param {string} from @param {string} to */
  function claimMoveAllowed(from, to) {
    const a = CLAIM_STATUSES.indexOf(from || "Open");
    const b = CLAIM_STATUSES.indexOf(to);
    return b >= 0 && (b === a || b === a + 1);
  }
  /** Part cost still to recover from the principal. @param {any[]} claims */
  function toRecover(claims) {
    return claims.filter((c) => claimStatus(c) !== "Credited" && !c.cancelled).reduce((sum, c) => sum + Math.max(0, Number(c.partCost) || 0), 0);
  }
  /** Next claim number for the year: WC-2026-001. @param {any[]} claims @param {string} today */
  function nextClaimId(claims, today) {
    const year = today.slice(0, 4);
    const max = claims.map((c) => /^WC-(\d{4})-(\d+)$/.exec(String(c.id || ""))).filter((m) => m && m[1] === year).reduce((n, m) => Math.max(n, Number(/** @type {RegExpExecArray} */ (m)[2])), 0);
    return `WC-${year}-${String(max + 1).padStart(3, "0")}`;
  }

  /** How many units end their warranty in each window. @param {any[]} units @param {string} today */
  function endingBuckets(units, today) {
    const buckets = [
      { key: "ended", label: "Ended", test: (/** @type {number} */ d) => d < 0 },
      { key: "30", label: "≤ 30 days", test: (/** @type {number} */ d) => d >= 0 && d <= 30 },
      { key: "60", label: "31–60 days", test: (/** @type {number} */ d) => d > 30 && d <= 60 },
      { key: "180", label: "2–6 months", test: (/** @type {number} */ d) => d > 60 && d <= 180 },
      { key: "365", label: "6–12 months", test: (/** @type {number} */ d) => d > 180 && d <= 365 },
      { key: "later", label: "Over a year", test: (/** @type {number} */ d) => d > 365 },
    ];
    return buckets.map((b) => ({ key: b.key, label: b.label, count: units.filter((u) => { const s = unitStatus(u, today); return s.daysLeft !== null && b.test(s.daysLeft); }).length }));
  }

  /**
   * Tickets per unit by model over the last 12 months (tickets ÷ units installed).
   * @param {any[]} units @param {any[]} tickets @param {string} today
   */
  function issuesPerModel(units, tickets, today) {
    const since = addMonths(today, -12);
    const key = (/** @type {any} */ s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
    /** @type {Map<string, { model: string, units: number, tickets: number }>} */
    const byModel = new Map();
    const serialModel = new Map(units.map((u) => [key(u.serial), modelOf(u)]));
    units.forEach((u) => { const m = modelOf(u) || "Unknown model"; const e = byModel.get(m) || { model: m, units: 0, tickets: 0 }; e.units += 1; byModel.set(m, e); });
    tickets.forEach((t) => {
      const day = String(t.openedAt || t.startDate || "").slice(0, 10);
      if (!isDate(day) || day < since) return;
      const model = serialModel.get(key(t.serialNo));
      if (!model || !byModel.has(model)) return;
      /** @type {any} */ (byModel.get(model)).tickets += 1;
    });
    return [...byModel.values()].map((e) => ({ ...e, rate: e.units ? e.tickets / e.units : 0 })).sort((a, b) => b.rate - a.rate || b.tickets - a.tickets || a.model.localeCompare(b.model));
  }

  return {
    EXPIRING_DAYS, PM_DUE_DAYS, DEFAULT_PM_MONTHS, CLAIM_STATUSES, STATUS_LABELS, PM_LABELS,
    isDate, daysBetween, manilaToday, addMonths, modelOf, contractActive, unitStatus, pmMonths, pm,
    claimStatus, nextClaimStatus, claimMoveAllowed, toRecover, nextClaimId, endingBuckets, issuesPerModel,
  };
})();
/** @type {any} */ (globalThis).WarrantyRules = WarrantyRules;

// @ts-check
// Item Forecast maths. Pure functions over plain inputs (no app state), so they're unit-tested in
// tests/forecast-engine.test.mjs and the page (forecast-page.js) only gathers the inputs.
//
//   daily use      = units delivered to clients in the last 90 days ÷ 90   (SI and TS; DRs and cancelled excluded)
//   safety stock   = daily use × safety days (14)
//   reorder point  = ceil(daily use × supplier lead time + safety stock)
//   available      = on hand + on order (approved, not yet received)
//   order up to    = ceil(daily use × (lead time + cover days (60)) + safety stock)
//   suggested qty  = order up to − available, rounded up to the pack size   (only when status ≠ OK)
//   days of stock  = on hand ÷ daily use
//   status         = Order now  if available ≤ reorder point
//                    Order soon if days until the reorder point ≤ lead time
//                    OK         otherwise (also when there was no use in the window)

/** @typedef {{ safetyDays: number, coverDays: number, lookbackDays: number, defaultLeadDays: number, supplierLeadDays: Record<string, number> }} ForecastSettings */
/** @typedef {"now" | "soon" | "ok"} ForecastStatus */
/**
 * @typedef {{ daily: number, safety: number, rop: number, available: number, upTo: number, daysOfStock: number | null,
 *   daysToRop: number | null, status: ForecastStatus, need: number, suggested: number }} ForecastMath
 */

const FORECAST_DEFAULTS = Object.freeze({ safetyDays: 14, coverDays: 60, lookbackDays: 90, defaultLeadDays: 14 });
const FORECAST_EPS = 1e-9;

/** Settings with defaults filled in and nonsense values replaced. @param {any} [raw] @returns {ForecastSettings} */
function forecastSettingsFrom(raw) {
  const num = (/** @type {any} */ value, /** @type {number} */ fallback, /** @type {number} */ min, /** @type {number} */ max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
  };
  /** @type {Record<string, number>} */
  const supplierLeadDays = {};
  for (const [name, days] of Object.entries(raw?.supplierLeadDays || {})) {
    const n = Number(days);
    if (name && Number.isFinite(n) && n > 0 && n <= 365) supplierLeadDays[name] = Math.round(n);
  }
  return {
    safetyDays: num(raw?.safetyDays, FORECAST_DEFAULTS.safetyDays, 0, 180),
    coverDays: num(raw?.coverDays, FORECAST_DEFAULTS.coverDays, 1, 365),
    lookbackDays: FORECAST_DEFAULTS.lookbackDays,
    defaultLeadDays: num(raw?.defaultLeadDays, FORECAST_DEFAULTS.defaultLeadDays, 1, 365),
    supplierLeadDays,
  };
}

/**
 * The forecast for one item.
 * @param {{ units: number, lookbackDays: number, onHand: number, onOrder: number, leadDays: number, safetyDays: number, coverDays: number, packSize?: number }} input
 * @returns {ForecastMath}
 */
function forecastItemMath({ units, lookbackDays, onHand, onOrder, leadDays, safetyDays, coverDays, packSize = 1 }) {
  const daily = lookbackDays > 0 ? Math.max(0, units) / lookbackDays : 0;
  const safety = daily * safetyDays;
  const rop = Math.ceil(daily * leadDays + safety - FORECAST_EPS);
  const available = onHand + onOrder;
  const upTo = Math.ceil(daily * (leadDays + coverDays) + safety - FORECAST_EPS);
  const daysOfStock = daily > 0 ? onHand / daily : null;
  const daysToRop = daily > 0 ? Math.max(0, (available - rop) / daily) : null;
  /** @type {ForecastStatus} */
  const status = daily <= 0 ? "ok" : available <= rop ? "now" : /** @type {number} */ (daysToRop) <= leadDays ? "soon" : "ok";
  const need = status === "ok" ? 0 : Math.max(0, upTo - available);
  const pack = packSize > 0 ? packSize : 1;
  const suggested = need > 0 ? Math.ceil(need / pack - FORECAST_EPS) * pack : 0;
  return { daily, safety, rop, available, upTo, daysOfStock, daysToRop, status, need, suggested };
}

// ----- dates (YYYY-MM-DD, calendar days, no time zone) ---------------------------------------------
/** @param {string} key */
function forecastDayNumber(key) {
  const [y, m, d] = String(key).slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
/** @param {string} from @param {string} to */
function forecastDaysBetween(from, to) { return forecastDayNumber(to) - forecastDayNumber(from); }
/** @param {string} key @param {number} days */
function forecastAddDays(key, days) { return new Date((forecastDayNumber(key) + days) * 86400000).toISOString().slice(0, 10); }
/** First day of the month `offset` months from `key`'s month. @param {string} key @param {number} offset */
function forecastMonthStart(key, offset) {
  const [y, m] = String(key).split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 + offset, 1));
  return at.toISOString().slice(0, 10);
}
/** @param {string} monthStart */
function forecastMonthDays(monthStart) { return forecastDaysBetween(monthStart, forecastMonthStart(monthStart, 1)); }

// ----- usage -------------------------------------------------------------------------------------
/** Sales documents that count as delivered to clients: SI and TS, not cancelled. DRs are demo units. @param {{ type?: string, status?: string }} sale */
function forecastCountsAsUse(sale) {
  const type = String(sale.type || "").toUpperCase();
  return (type === "SI" || type === "TS") && sale.status !== "Cancelled";
}

/**
 * Units per item code delivered between two dates (inclusive), per day key.
 * @param {{ type?: string, status?: string, date?: string, lines?: { code?: string, item?: string, qty?: number }[] }[]} sales
 * @param {{ toDay: (value: any) => string, codeOf: (line: { code?: string, item?: string }) => string }} helpers
 * @returns {{ code: string, day: string, units: number }[]}
 */
function forecastUsageEvents(sales, { toDay, codeOf }) {
  /** @type {{ code: string, day: string, units: number }[]} */
  const out = [];
  for (const sale of sales) {
    if (!forecastCountsAsUse(sale)) continue;
    const day = toDay(sale.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const line of sale.lines || []) {
      const code = codeOf(line);
      const units = Number(line.qty || 0);
      if (code && units > 0) out.push({ code, day, units });
    }
  }
  return out;
}
/** @param {{ code: string, day: string, units: number }[]} events @param {string} from @param {string} to @returns {Map<string, number>} */
function forecastUnitsBetween(events, from, to) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const event of events) if (event.day >= from && event.day <= to) out.set(event.code, (out.get(event.code) || 0) + event.units);
  return out;
}

/**
 * Forecast accuracy over the last `months` full months: for each month, the forecast is the daily
 * use of the 90 days before it × the month's days; accuracy = 1 − Σ|forecast − actual| ÷ Σ actual.
 * @param {{ code: string, day: string, units: number }[]} events @param {string} todayKey @param {number} lookbackDays
 * @param {number} [months] @param {number} [skip] how many recent full months to skip (to compare with an earlier period)
 * @returns {number | null} 0–100, or null when nothing was used
 */
function forecastAccuracy(events, todayKey, lookbackDays, months = 3, skip = 0) {
  let error = 0, actualTotal = 0;
  for (let offset = 1 + skip; offset <= months + skip; offset += 1) {
    const start = forecastMonthStart(todayKey, -offset);
    const end = forecastAddDays(forecastMonthStart(todayKey, -offset + 1), -1);
    const before = forecastUnitsBetween(events, forecastAddDays(start, -lookbackDays), forecastAddDays(start, -1));
    const actual = forecastUnitsBetween(events, start, end);
    const days = forecastMonthDays(start);
    for (const code of new Set([...before.keys(), ...actual.keys()])) {
      const forecast = ((before.get(code) || 0) / lookbackDays) * days;
      const got = actual.get(code) || 0;
      error += Math.abs(forecast - got);
      actualTotal += got;
    }
  }
  return actualTotal > 0 ? Math.max(0, Math.round((1 - error / actualTotal) * 100)) : null;
}

// ----- lead time ------------------------------------------------------------------------------------
/**
 * Average days from approval to first receipt, per supplier, from supplier PO history.
 * @param {{ supplier?: string, status?: string, approvedAt?: string, receivedAt?: string, history?: { date?: string, status?: string }[] }[]} pos
 * @param {(value: any) => string} toDay
 * @returns {Map<string, { days: number, samples: number }>}
 */
function forecastLeadTimes(pos, toDay) {
  /** @type {Map<string, number[]>} */
  const bySupplier = new Map();
  for (const po of pos) {
    if (!po.supplier || po.status === "Cancelled") continue;
    const history = po.history || [];
    const approved = toDay(po.approvedAt) || toDay(history.find((entry) => entry.status === "Approved")?.date);
    const received = toDay(history.find((entry) => ["Partially Received", "Fully Received"].includes(String(entry.status)))?.date) || (po.status === "Fully Received" ? toDay(po.receivedAt) : "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(approved) || !/^\d{4}-\d{2}-\d{2}$/.test(received)) continue;
    const days = forecastDaysBetween(approved, received);
    if (days >= 0 && days <= 365) bySupplier.set(po.supplier, [...(bySupplier.get(po.supplier) || []), days]);
  }
  /** @type {Map<string, { days: number, samples: number }>} */
  const out = new Map();
  bySupplier.forEach((list, name) => out.set(name, { days: Math.max(1, Math.round(list.reduce((a, b) => a + b, 0) / list.length)), samples: list.length }));
  return out;
}

/**
 * Lead time for a supplier: PO history first, then the supplier setting, then the default.
 * @param {string} supplier @param {Map<string, { days: number, samples: number }>} history @param {ForecastSettings} settings
 * @returns {{ days: number, source: "history" | "setting" | "default", samples: number }}
 */
function forecastLeadFor(supplier, history, settings) {
  const seen = history.get(supplier);
  if (seen) return { days: seen.days, source: "history", samples: seen.samples };
  if (settings.supplierLeadDays[supplier]) return { days: settings.supplierLeadDays[supplier], source: "setting", samples: 0 };
  return { days: settings.defaultLeadDays, source: "default", samples: 0 };
}

// ----- expiry -----------------------------------------------------------------------------------
/**
 * Units of each lot expected to expire unused at the current rate, using the earliest-expiring lot
 * first: demand goes to the earliest lot until it runs out or expires, then to the next.
 * @template {{ code: string, qty: number, expiry: string }} L
 * @param {L[]} lots unexpired lots with stock
 * @param {Map<string, number>} dailyByCode @param {string} todayKey
 * @returns {(L & { days: number, willUse: number, unused: number })[]}
 */
function forecastExpiryRisk(lots, dailyByCode, todayKey) {
  /** @type {Map<string, L[]>} */
  const byCode = new Map();
  for (const lot of lots) byCode.set(lot.code, [...(byCode.get(lot.code) || []), lot]);
  /** @type {(L & { days: number, willUse: number, unused: number })[]} */
  const out = [];
  byCode.forEach((list, code) => {
    const daily = dailyByCode.get(code) || 0;
    let before = 0;
    [...list].sort((a, b) => a.expiry.localeCompare(b.expiry)).forEach((lot) => {
      const days = Math.max(0, forecastDaysBetween(todayKey, lot.expiry));
      const capacity = daily * days;
      const willUse = Math.min(lot.qty, Math.max(0, Math.floor(capacity - before + FORECAST_EPS)));
      before += willUse; // units this lot actually supplies; what it can't supply expires with it
      out.push({ ...lot, days, willUse, unused: lot.qty - willUse });
    });
  });
  return out;
}

/** "rising" when the latest month is above the first × 1.2, "falling" below × 0.8. @param {number[]} months */
function forecastTrend(months) {
  const first = months[0] || 0, last = months[months.length - 1] || 0;
  if (first <= 0) return last > 0 ? "new" : "steady";
  return last > first * 1.2 ? "rising" : last < first * 0.8 ? "falling" : "steady";
}

// Item Forecast page: what to order, how much and when. The maths lives in forecast-engine.js; this
// file gathers the inputs from the records the server sent this role (sales lines, stock, supplier
// POs, item masterlist) and draws the four tabs. Costs and order values are shown only to roles
// that may see margins (canSeeMargins). "Create PO" pre-fills the normal New purchase order form,
// which always saves as Pending Approval, so nothing here can approve or place an order.

const FORECAST_TAB_LABELS = /** @type {Record<string, string>} */ ({ overview: "Overview", reorder: "Reorder list", items: "All items", expiry: "Expiry risk" });
const FORECAST_TABS = Object.keys(FORECAST_TAB_LABELS);
const forecastSeed = moduleUrlSeed("item-forecast", FORECAST_TABS);
let forecastTab = forecastSeed.tab;
/** @type {UiViewState} */
let forecastView = forecastSeed.view;
const FORECAST_STATUS = /** @type {Record<ForecastStatus, { label: string, tone: UiTone }>} */ ({ now: { label: "Order now", tone: "red" }, soon: { label: "Order soon", tone: "amber" }, ok: { label: "OK", tone: "green" } });
// Supplier POs that are approved and still have something to deliver.
const FORECAST_ON_ORDER_STATUSES = ["Approved", "Sent to Supplier", "In Transit", "For Receiving", "Partially Received"];

/**
 * @typedef {{
 *   code: string, name: string, item: MasterItem, supplier: string, lead: { days: number, source: "history" | "setting" | "default", samples: number },
 *   onHand: number, onOrder: number, orderPos: string[], pendingPos: string[], units: number, monthly: number[], cost: number, min: number, pack: number,
 *   m: ForecastMath, orderBy: string, value: number, minLow: boolean, trend: string
 * }} ForecastRow
 */
/**
 * @typedef {{ row: StockRow, code: string, qty: number, expiry: string, days: number, willUse: number, unused: number, cost: number }} ForecastLot
 */

/** @type {{ at: number, model: ReturnType<typeof forecastModelBuild> | null }} */
const forecastCache = { at: 0, model: null };
/** The forecast, reused for a second so the page, its assistant and the Dashboard build it once. @param {boolean} [fresh] */
function forecastModel(fresh = false) {
  if (fresh || !forecastCache.model || Date.now() - forecastCache.at > 1000) forecastCache.model = forecastModelBuild(), forecastCache.at = Date.now();
  return forecastCache.model;
}
/** Everything the page shows. */
function forecastModelBuild() {
  const settings = forecastSettingsFrom(data.forecastSettings?.[0]);
  const todayKey = fmtDate(today);
  const byName = new Map(data.items.map((item) => [String(item.name || "").trim().toLowerCase(), item.code]));
  const codeOf = (/** @type {{ code?: string, item?: string }} */ line) => String(line.code || byName.get(String(line.item || "").trim().toLowerCase()) || "");
  const events = forecastUsageEvents(data.sales, { toDay: fmtDateSafe, codeOf });
  const units90 = forecastUnitsBetween(events, forecastAddDays(todayKey, -(settings.lookbackDays - 1)), todayKey);
  // Last 6 months, oldest first; the current month is projected from the days so far.
  const monthStarts = [5, 4, 3, 2, 1, 0].map((offset) => forecastMonthStart(todayKey, -offset));
  const elapsed = Number(todayKey.slice(8));
  const monthMaps = monthStarts.map((start, index) => forecastUnitsBetween(events, start, index === 5 ? todayKey : forecastAddDays(monthStarts[index + 1], -1)));
  const projection = forecastMonthDays(monthStarts[5]) / Math.max(1, elapsed);

  /** @type {Map<string, number>} */
  const onHand = new Map();
  /** @type {StockRow[]} */
  const expired = [];
  /** @type {StockRow[]} */
  const live = [];
  for (const row of data.inventory) {
    const qty = Number(row.qty || 0);
    if (qty <= 0 || row.archived) continue;
    if (inventoryStatus(row) === "Expired") { expired.push(row); continue; }
    live.push(row);
    onHand.set(row.code, (onHand.get(row.code) || 0) + qty);
  }
  /** @type {Map<string, number>} */
  const onOrder = new Map();
  /** @type {Map<string, string[]>} */
  const orderPos = new Map();
  /** @type {Map<string, string[]>} */
  const pendingPos = new Map();
  /** @type {Map<string, { supplier: string, date: string }>} */
  const lastSupplier = new Map();
  for (const po of data.inventoryPurchaseOrders || []) {
    if (po.status === "Cancelled") continue;
    const date = fmtDateSafe(po.date);
    for (const line of po.lines || []) {
      if (!line.code) continue;
      const seen = lastSupplier.get(line.code);
      if (po.supplier && (!seen || date >= seen.date)) lastSupplier.set(line.code, { supplier: po.supplier, date });
      const left = Math.max(0, Number(line.qty || 0) - Number(line.receivedQty || 0));
      if (left <= 0) continue;
      if (FORECAST_ON_ORDER_STATUSES.includes(po.status)) {
        onOrder.set(line.code, (onOrder.get(line.code) || 0) + left);
        orderPos.set(line.code, [...new Set([...(orderPos.get(line.code) || []), po.id])]);
      } else if (po.status === "Pending Approval") pendingPos.set(line.code, [...new Set([...(pendingPos.get(line.code) || []), po.id])]);
    }
  }
  const suppliers = activeSuppliers();
  const leadHistory = forecastLeadTimes(data.inventoryPurchaseOrders || [], fmtDateSafe);

  /** @type {ForecastRow[]} */
  const rows = [];
  for (const item of data.items) {
    if (isArchived(item) || isEquipmentItem(item) || !item.code) continue;
    const units = units90.get(item.code) || 0;
    const monthly = monthMaps.map((map, index) => { const n = map.get(item.code) || 0; return index === 5 ? Math.round(n * projection) : n; });
    const have = onHand.get(item.code) || 0;
    const ordered = onOrder.get(item.code) || 0;
    if (!have && !ordered && !units && !monthly.some(Boolean)) continue;
    const supplier = lastSupplier.get(item.code)?.supplier || String(item.supplier || "") || suppliers.find((entry) => entry.brand && entry.brand === item.brand)?.name || "";
    const lead = forecastLeadFor(supplier, leadHistory, settings);
    const pack = itemPackSizeValue(item.packSize) || 1;
    const m = forecastItemMath({ units, lookbackDays: settings.lookbackDays, onHand: have, onOrder: ordered, leadDays: lead.days, safetyDays: settings.safetyDays, coverDays: settings.coverDays, packSize: pack });
    const cost = Number(item.cost || 0);
    const min = Number(item.minLevel || 0);
    rows.push({
      code: item.code, name: String(item.name || item.code), item, supplier, lead, onHand: have, onOrder: ordered,
      orderPos: orderPos.get(item.code) || [], pendingPos: pendingPos.get(item.code) || [], units, monthly, cost, min, pack, m,
      orderBy: m.status === "now" ? todayKey : m.status === "soon" ? forecastAddDays(todayKey, Math.floor(/** @type {number} */ (m.daysToRop))) : "",
      value: m.suggested * cost, minLow: m.rop > 0 && min < m.rop, trend: forecastTrend(monthly),
    });
  }
  const rank = { now: 0, soon: 1, ok: 2 };
  rows.sort((a, b) => rank[a.m.status] - rank[b.m.status] || (a.m.daysOfStock ?? 1e9) - (b.m.daysOfStock ?? 1e9) || a.name.localeCompare(b.name));

  const daily = new Map(rows.map((row) => [row.code, row.m.daily]));
  const costOf = (/** @type {string} */ code) => Number(data.items.find((item) => item.code === code)?.cost || 0);
  /** @type {ForecastLot[]} */
  const lots = forecastExpiryRisk(live.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(fmtDateSafe(row.expiry))).map((row) => ({ row, code: row.code, qty: Number(row.qty || 0), expiry: fmtDateSafe(row.expiry) })), daily, todayKey)
    .map((lot) => ({ ...lot, cost: costOf(lot.code) }));
  return {
    settings, todayKey, rows, lots, expired, monthStarts,
    toOrder: rows.filter((row) => row.m.status !== "ok"),
    accuracy: forecastAccuracy(events, todayKey, settings.lookbackDays, 3),
    accuracyBefore: forecastAccuracy(events, todayKey, settings.lookbackDays, 3, 3),
    costs: canSeeMargins(),
  };
}
/** @typedef {ReturnType<typeof forecastModelBuild>} ForecastModel */

// ----- small formatters ---------------------------------------------------------------------------
/** @param {number} value */
function forecastNum(value) { return Number.isInteger(value) ? value.toLocaleString("en-PH") : (Math.round(value * 10) / 10).toLocaleString("en-PH"); }
/** @param {number | null} days */
function forecastDays(days) { return days === null ? "—" : `${Math.round(days).toLocaleString("en-PH")} d`; }
/** @param {ForecastRow} row */
function forecastLeadText(row) {
  return row.lead.source === "history" ? `${row.lead.days} days (average of ${plural(row.lead.samples, "PO")})` : row.lead.source === "setting" ? `${row.lead.days} days (supplier setting)` : `${row.lead.days} days (default, no PO history)`;
}
/** @param {string} key */
function forecastShortDate(key) { return key ? new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; }
function forecastCanOrder() { return canCreateSupplierPo(); }
function forecastCanEditSettings() { return ["Superadmin", "CEO"].includes(String(currentUser?.role || "")); }

// ----- detail panel (the calculation, line by line) ----------------------------------------------
/** @param {ForecastRow} row @param {ForecastModel} model @returns {UiDetail} */
function forecastDetail(row, model) {
  const s = model.settings;
  const m = row.m;
  const st = FORECAST_STATUS[m.status];
  const d1 = (/** @type {number} */ n) => (Math.round(n * 100) / 100).toLocaleString("en-PH");
  const note = model.costs && !row.cost && m.status !== "ok"
    ? { text: `No cost in Masterlists, so the order value can’t be estimated.${canViewModule("reconciliation") ? " Fill it in Recon or Masterlists." : " Ask an admin to add it in Masterlists."}`, tone: /** @type {UiTone} */ ("amber") }
    : row.minLow ? { text: `Min level in Masterlists (${row.min}) is below the reorder point (${m.rop}). Raise it so low-stock alerts fire in time.`, tone: /** @type {UiTone} */ ("amber") }
    : m.daily <= 0 ? { text: `Nothing delivered to clients in the last ${s.lookbackDays} days, so there’s nothing to forecast.`, tone: /** @type {UiTone} */ ("slate") }
    : m.suggested && model.costs && row.cost ? { text: `Estimated ${peso.format(row.value)} at the current cost of ${peso.format(row.cost)}.`, tone: /** @type {UiTone} */ ("blue") }
    : m.status === "ok" ? { text: "Enough stock to cover the lead time plus safety stock.", tone: /** @type {UiTone} */ ("green") } : undefined;
  const actions = [];
  if (m.status !== "ok" && forecastCanOrder() && row.supplier) actions.push(uiButton(`Order from ${row.supplier}`, { "data-forecast-po": row.supplier }, { primary: true }));
  if (forecastCanEditSettings()) actions.push(uiButton("Forecast settings", { "data-forecast-settings": "" }));
  return {
    eyebrow: `${row.supplier || "No supplier on file"} · lead time ${row.lead.days} days`, title: row.name, pill: { text: st.label, tone: st.tone },
    closeAttrs: { "data-forecast-close": "" }, label: "Forecast details",
    fields: [
      { label: "On hand", value: forecastNum(row.onHand), sub: "Unexpired, all branches" },
      { label: "On order", value: forecastNum(row.onOrder), sub: row.orderPos.join(", ") || (row.pendingPos.length ? `${row.pendingPos.join(", ")} awaiting approval` : "") },
      { label: "Use, last 90 days", value: forecastNum(row.units) },
      { label: "Days of stock", value: m.daysOfStock === null ? "—" : `${Math.round(m.daysOfStock)} days` },
      { label: "Reorder point", value: forecastNum(m.rop) },
      { label: "Suggested order", value: m.suggested ? `${forecastNum(m.suggested)} units` : "—", sub: row.pack > 1 ? `Rounded up to packs of ${row.pack}` : "" },
      { label: "Lead time", value: forecastLeadText(row), wide: true },
    ],
    linesTitle: "How it’s calculated",
    lines: [
      { left: "Daily use", sub: `${forecastNum(row.units)} units in the last ${s.lookbackDays} days ÷ ${s.lookbackDays}`, right: d1(m.daily), tone: "slate" },
      { left: "Safety stock", sub: `${s.safetyDays} days × daily use`, right: d1(m.safety), tone: "slate" },
      { left: "Reorder point", sub: `Daily use × ${row.lead.days}-day lead time + safety, rounded up`, right: forecastNum(m.rop), tone: "blue" },
      { left: "Available", sub: "On hand + on order (approved, not yet received)", right: forecastNum(m.available), tone: "blue" },
      { left: "Order up to", sub: `Daily use × (${row.lead.days} lead + ${s.coverDays}-day cover) + safety, rounded up`, right: forecastNum(m.upTo), tone: "blue" },
      { left: "Suggested order", sub: m.status === "ok" ? "Only when the status isn’t OK" : `Order up to − available${row.pack > 1 ? `, in packs of ${row.pack}` : ""}`, right: forecastNum(m.suggested), tone: m.suggested ? "amber" : "green" },
      { left: "Status", sub: m.status === "now" ? "Available is at or below the reorder point" : m.status === "soon" ? `Reaches the reorder point in ${Math.round(/** @type {number} */ (m.daysToRop))} days, within the lead time` : m.daily > 0 ? `Reaches the reorder point in ${Math.round(/** @type {number} */ (m.daysToRop))} days` : "No recent use", right: st.label, tone: st.tone },
    ],
    note, actions,
  };
}

// ----- tabs ----------------------------------------------------------------------------------------
/** @param {ForecastRow} row */
function forecastSearch(row) { return [row.name, row.code, row.supplier, row.item.brand].join(" "); }
/** @param {ForecastRow} row */
function forecastWhen(row) { return row.m.status === "now" ? "Now" : row.m.status === "soon" ? `By ${forecastShortDate(row.orderBy)}` : "—"; }

/** @param {string} tab @param {ForecastModel} model @returns {UiView} */
function forecastTabModel(tab, model) {
  const sel = (/** @type {string} */ id) => uiViewSelect("forecast", id);
  const costCell = (/** @type {ForecastRow} */ row) => !model.costs ? "" : row.cost ? uiCellNum(pesoShort(row.value)) : `<span class="ui-sub tone-red">No cost</span>`;
  const orderButton = forecastCanOrder() && model.toOrder.length ? [uiButton("Create PO from list", { "data-forecast-po": "" }, { primary: true })] : [];

  if (tab === "reorder") {
    /** @type {Map<string, ForecastRow[]>} */
    const bySupplier = new Map();
    model.toOrder.forEach((row) => bySupplier.set(row.supplier || "No supplier", [...(bySupplier.get(row.supplier || "No supplier") || []), row]));
    const groups = [...bySupplier.entries()].map(([name, list]) => ({ name, list, value: list.reduce((sum, row) => sum + row.value, 0), uncosted: list.filter((row) => !row.cost).length }))
      .sort((a, b) => b.list.length - a.list.length || b.value - a.value);
    return {
      title: "Reorder list", intro: "Items at or near their reorder point, by supplier. Select one to see how it’s calculated, or create a draft PO for a supplier’s items. A new PO always waits for approval.",
      placeholder: "Item or supplier", actions: orderButton,
      stats: groups.slice(0, 4).map((group) => ({ label: group.name, value: plural(group.list.length, "item"), sub: model.costs ? `${pesoShort(group.value)}${group.uncosted ? ` + ${group.uncosted} without cost` : ""}` : group.list.filter((row) => row.m.status === "now").length ? `${group.list.filter((row) => row.m.status === "now").length} to order now` : "Order soon", tone: /** @type {UiTone} */ (group.list.some((row) => row.m.status === "now") ? "red" : "amber") })),
      cols: [
        { key: "name", label: "Item", sortable: true }, { key: "supplier", label: "Supplier", sortable: true },
        { key: "available", label: "Available", align: "right", sortable: true },
        { key: "qty", label: "Order", align: "right", sortable: true },
        ...(model.costs ? [{ key: "value", label: "Est. cost", align: /** @type {"right"} */ ("right"), sortable: true }] : []), { key: "when", label: "When", sortable: true },
      ],
      csvHeader: ["Code", "Item", "Supplier", "Available", "Reorder point", "Days of stock", "Suggested qty", ...(model.costs ? ["Unit cost", "Est. cost"] : []), "Order by"], csvName: "item-forecast-reorder.csv",
      rows: model.toOrder.map((row) => ({
        id: row.code, branches: [], scopes: [row.m.status], search: forecastSearch(row),
        sortValues: { name: row.name, supplier: row.supplier, available: row.m.available, days: row.m.daysOfStock ?? 1e9, qty: row.m.suggested, value: row.value, when: row.orderBy || "9999" },
        csv: [row.code, row.name, row.supplier, row.m.available, row.m.rop, row.m.daysOfStock === null ? "" : Math.round(row.m.daysOfStock), row.m.suggested, ...(model.costs ? [row.cost || "", row.cost ? row.value.toFixed(2) : ""] : []), row.orderBy],
        cells: [
          uiCellDoc(row.name, sel(row.code), `${forecastNum(Math.round(row.m.daily * 30))} / month · ${forecastDays(row.m.daysOfStock)} left`, { plain: true }), uiCellText(row.supplier || "—", row.pendingPos.length ? `${row.pendingPos[0]} awaiting approval` : ""),
          `${uiCellNum(forecastNum(row.m.available))}<div class="ui-sub">reorder at ${escapeHtml(forecastNum(row.m.rop))}</div>`, uiCellNum(forecastNum(row.m.suggested)),
          ...(model.costs ? [costCell(row)] : []), uiPill(forecastWhen(row), FORECAST_STATUS[row.m.status].tone),
        ],
        detail: () => forecastDetail(row, model),
      })),
      empty: ["Nothing to order", "Every stocked item is above its reorder point for longer than its lead time."], minWidth: model.costs ? 720 : 620,
      defaultSort: { key: "when", dir: 1 }, chips: [{ key: "now", label: "Order now", tone: "red" }, { key: "soon", label: "Order soon", tone: "amber" }], defaultScope: "",
    };
  }

  if (tab === "items") {
    const healthy = model.rows.filter((row) => row.m.status === "ok" && row.m.daily > 0).length;
    const minLow = model.rows.filter((row) => row.minLow).length;
    return {
      title: "All items", intro: `Forecast for every stocked item. Reorder point = daily use × lead time + ${model.settings.safetyDays} days of safety stock.`,
      placeholder: "Item, code or supplier", actions: [],
      stats: [
        { label: "Healthy", value: String(healthy), sub: "Above the reorder point for longer than the lead time", tone: "green", scope: "ok" },
        { label: "To order", value: String(model.toOrder.length), sub: `${model.toOrder.filter((row) => row.m.status === "now").length} now · ${model.toOrder.filter((row) => row.m.status === "soon").length} soon`, tone: "red", scope: "order" },
        { label: "Min level too low", value: String(minLow), sub: "Masterlist min below the reorder point", tone: "amber", scope: "minlow" },
      ],
      cols: [
        { key: "name", label: "Item", sortable: true }, { key: "onHand", label: "On hand", align: "right", sortable: true },
        { key: "use", label: "Use / month", align: "right", sortable: true }, { key: "rop", label: "Reorder point", align: "right", sortable: true },
        { key: "days", label: "Days left", align: "right", sortable: true }, { key: "status", label: "Status", sortable: true },
      ],
      csvHeader: ["Code", "Item", "Supplier", "On hand", "On order", "Use per month", "Lead days", "Lead source", "Reorder point", "Masterlist min", "Days of stock", "Status", "Suggested qty"], csvName: "item-forecast-items.csv",
      rows: model.rows.map((row) => ({
        id: row.code, branches: [], scopes: [row.m.status, ...(row.m.status !== "ok" ? ["order"] : []), ...(row.minLow ? ["minlow"] : [])], search: forecastSearch(row),
        sortValues: { name: row.name, onHand: row.onHand, onOrder: row.onOrder, use: row.m.daily, lead: row.lead.days, rop: row.m.rop, days: row.m.daysOfStock ?? 1e9, status: ({ now: 0, soon: 1, ok: 2 })[row.m.status] },
        csv: [row.code, row.name, row.supplier, row.onHand, row.onOrder, Math.round(row.m.daily * 300) / 10, row.lead.days, row.lead.source, row.m.rop, row.min, row.m.daysOfStock === null ? "" : Math.round(row.m.daysOfStock), FORECAST_STATUS[row.m.status].label, row.m.suggested],
        cells: [
          uiCellDoc(row.name, sel(row.code), `${row.supplier || "No supplier on file"} · ${row.lead.days}-day lead`, { plain: true }),
          `${uiCellNum(forecastNum(row.onHand))}${row.onOrder ? `<div class="ui-sub">+${escapeHtml(forecastNum(row.onOrder))} on order</div>` : ""}`,
          uiCellNum(forecastNum(Math.round(row.m.daily * 300) / 10)),
          `${uiCellNum(forecastNum(row.m.rop))}${row.minLow ? `<div class="ui-sub tone-amber">${row.min ? `Min ${escapeHtml(forecastNum(row.min))} in Masterlists` : "No min in Masterlists"}</div>` : ""}`,
          uiCellNum(forecastDays(row.m.daysOfStock)), row.m.daily > 0 ? uiPill(FORECAST_STATUS[row.m.status].label, FORECAST_STATUS[row.m.status].tone) : uiPill("No recent use", "slate"),
        ],
        detail: () => forecastDetail(row, model),
      })),
      empty: ["No stocked items", "Items appear here once they have stock, an open order or recent sales."], minWidth: 820,
      defaultSort: { key: "status", dir: 1 }, chips: [{ key: "now", label: "Order now", tone: "red" }, { key: "soon", label: "Order soon", tone: "amber" }, { key: "ok", label: "OK", tone: "green" }, { key: "minlow", label: "Min too low", tone: "amber" }], defaultScope: "",
    };
  }

  // Expiry risk
  const atRisk = model.lots.filter((lot) => lot.unused > 0);
  const horizon = forecastAddDays(model.todayKey, 60);
  const within60 = model.lots.filter((lot) => lot.expiry <= horizon);
  const expiredValue = model.expired.reduce((sum, row) => sum + Number(row.qty || 0) * Number(data.items.find((item) => item.code === row.code)?.cost || 0), 0);
  const money = (/** @type {number} */ value) => (model.costs ? pesoShort(value) : "");
  const canRecon = canViewModule("reconciliation");
  /** @type {UiViewRow[]} */
  const lotRows = model.lots.filter((lot) => lot.unused > 0 || lot.expiry <= horizon).map((lot) => ({
    id: `${lot.row.code}|${lot.row.branch}|${lot.row.lot}`, branches: [lot.row.branch], scopes: [lot.unused > 0 ? "risk" : "fine"], search: [lot.row.item, lot.code, lot.row.lot, lot.row.branch].join(" "),
    sortValues: { name: lot.row.item, expiry: lot.expiry, unused: lot.unused, value: lot.unused * lot.cost },
    csv: [lot.code, lot.row.item, lot.row.branch, lot.row.lot, lot.qty, lot.expiry, lot.willUse, lot.unused, ...(model.costs ? [lot.cost ? (lot.unused * lot.cost).toFixed(2) : ""] : [])],
    cells: [
      uiCellDoc(lot.row.item, sel(`${lot.row.code}|${lot.row.branch}|${lot.row.lot}`), `Lot ${lot.row.lot || "—"} · ${lot.row.branch}`, { plain: true }), uiCellNum(forecastNum(lot.qty)),
      uiCellText(uiDate(lot.expiry), `in ${plural(lot.days, "day")}`),
      `${lot.unused ? `<span class="ui-num tone-red">${escapeHtml(forecastNum(lot.unused))}</span>` : `<span class="ui-muted">0</span>`}<div class="ui-sub">${escapeHtml(forecastNum(lot.willUse))} used by then</div>`,
      ...(model.costs ? [lot.unused && lot.cost ? `<span class="ui-num tone-red">${escapeHtml(peso.format(lot.unused * lot.cost))}</span>` : `<span class="ui-muted">${lot.unused ? "No cost" : "₱0"}</span>`] : []),
    ],
    detail: () => ({
      eyebrow: `Lot ${lot.row.lot || "—"} · ${lot.row.branch}`, title: lot.row.item, pill: lot.unused ? { text: "At risk", tone: /** @type {UiTone} */ ("red") } : { text: "Will be used in time", tone: /** @type {UiTone} */ ("green") },
      closeAttrs: { "data-forecast-close": "" }, label: "Lot details",
      fields: [{ label: "On hand", value: forecastNum(lot.qty) }, { label: "Expires", value: uiDate(lot.expiry), sub: `in ${plural(lot.days, "day")}` }, { label: "Use by then", value: forecastNum(lot.willUse) }, { label: "Expected unused", value: forecastNum(lot.unused) }],
      linesTitle: "How it’s calculated",
      lines: [
        { left: "Daily use", sub: "Units delivered in the last 90 days ÷ 90", right: (Math.round((model.rows.find((row) => row.code === lot.code)?.m.daily || 0) * 100) / 100).toLocaleString("en-PH"), tone: "slate" },
        { left: "Use by then", sub: "Daily use × days to expiry, after earlier-expiring lots of the same item", right: forecastNum(lot.willUse), tone: "blue" },
        { left: "Expected unused", sub: "On hand − use by then", right: forecastNum(lot.unused), tone: lot.unused ? "red" : "green" },
      ],
      note: lot.unused ? { text: `${plural(lot.unused, "unit")} will likely expire unused. Offer ${lot.unused === 1 ? "it" : "them"} to clients that use more, or move ${lot.unused === 1 ? "it" : "them"} to a branch that sells faster.`, tone: /** @type {UiTone} */ ("red") } : { text: "The current rate of use will finish this lot before it expires.", tone: /** @type {UiTone} */ ("green") },
      actions: canViewModule("inventory") ? [uiButton("Open in Inventory", { "data-workflow-action": `open-inventory:${lot.code}` })] : [],
    }),
  }));
  return {
    title: "Expiry risk", intro: "Lots that will expire before they’re used at the current rate, using the earliest-expiring lot first. Lots expiring within 60 days are listed too.",
    placeholder: "Item, lot or branch", actions: [],
    stats: [
      { label: "Already expired", value: model.costs ? pesoShort(expiredValue) : plural(model.expired.length, "lot"), sub: `${plural(model.expired.length, "lot")} still in stock${canRecon && model.expired.length ? " · fix in Recon" : ""}`, tone: "red", ...(canRecon && model.expired.length ? { action: { "data-wa-goto": "reconciliation|diffs||" } } : {}) },
      { label: "Expected to expire unused", value: model.costs ? pesoShort(atRisk.reduce((sum, lot) => sum + lot.unused * lot.cost, 0)) : plural(atRisk.reduce((sum, lot) => sum + lot.unused, 0), "unit"), sub: plural(atRisk.length, "lot"), tone: "amber", scope: "risk" },
      { label: "Expiring within 60 days", value: model.costs ? money(within60.reduce((sum, lot) => sum + lot.qty * lot.cost, 0)) : plural(within60.length, "lot"), sub: `${plural(within60.length, "lot")} · ${within60.filter((lot) => !lot.unused).length} will be used in time`, tone: "slate" },
    ],
    cols: [
      { key: "name", label: "Item", sortable: true }, { key: "qty", label: "On hand", align: "right" }, { key: "expiry", label: "Expires", sortable: true },
      { key: "unused", label: "Expected unused", align: "right", sortable: true },
      ...(model.costs ? [{ key: "value", label: "Value at risk", align: /** @type {"right"} */ ("right"), sortable: true }] : []),
    ],
    csvHeader: ["Code", "Item", "Branch", "Lot", "On hand", "Expires", "Will use", "Expected unused", ...(model.costs ? ["Value at risk"] : [])], csvName: "item-forecast-expiry.csv",
    rows: lotRows, branchOptions: inventoryBranchOptions(),
    empty: ["No lots at risk", "Every lot will be used before it expires at the current rate."], minWidth: model.costs ? 760 : 640,
    defaultSort: { key: "expiry", dir: 1 }, chips: [{ key: "risk", label: "At risk", tone: "red" }, { key: "fine", label: "Will be used", tone: "green" }], defaultScope: "",
  };
}

/** @param {ForecastModel} model */
function forecastOverviewHtml(model) {
  const now = model.toOrder.filter((row) => row.m.status === "now");
  const soon = model.toOrder.filter((row) => row.m.status === "soon");
  const costed = model.toOrder.filter((row) => row.cost);
  const uncosted = model.toOrder.filter((row) => !row.cost);
  const names = (/** @type {ForecastRow[]} */ list) => list.length ? `${list.slice(0, 2).map((row) => row.name).join(", ")}${list.length > 2 ? ` and ${list.length - 2} more` : ""}` : "";
  const accuracyChange = model.accuracy !== null && model.accuracyBefore !== null ? { text: `${model.accuracy >= model.accuracyBefore ? "▲" : "▼"} ${Math.abs(model.accuracy - model.accuracyBefore)} pts`, good: model.accuracy >= model.accuracyBefore } : null;
  /** @type {UiKpi[]} */
  const kpis = [
    { label: "Order now", value: String(now.length), tone: "red", change: now.length ? { text: "At or below reorder point", good: false } : null, sub: names(now) || "Nothing below its reorder point" },
    { label: "Order soon", value: String(soon.length), tone: "amber", sub: soon.length ? `${names(soon)} · within lead time` : "Nothing due within its lead time" },
    model.costs
      ? { label: "Suggested order value", value: pesoShort(costed.reduce((sum, row) => sum + row.value, 0)), tone: "blue", change: uncosted.length ? { text: `+ ${plural(uncosted.length, "item")} without cost`, good: null } : null, sub: "At current masterlist costs" }
      : { label: "Units to order", value: forecastNum(model.toOrder.reduce((sum, row) => sum + row.m.suggested, 0)), tone: "blue", sub: plural(model.toOrder.length, "item") },
    { label: "Forecast accuracy", value: model.accuracy === null ? "—" : `${model.accuracy}%`, tone: "accent", change: accuracyChange, sub: model.accuracy === null ? "Not enough sales history yet" : "Forecast vs actual use, last 3 months" },
  ];

  const bars = model.rows.filter((row) => row.m.daysOfStock !== null).slice(0, 10).map((row) => ({
    label: row.name, value: Math.min(/** @type {number} */ (row.m.daysOfStock), 140), display: `${Math.round(/** @type {number} */ (row.m.daysOfStock))} days`,
    target: Math.min(row.lead.days + model.settings.safetyDays, 140), sub: `lead ${row.lead.days} d · ${forecastNum(row.onHand)} on hand`, tone: FORECAST_STATUS[row.m.status].tone,
  }));

  /** @type {UiInsight[]} */
  const suggestions = [];
  /** @type {Map<string, ForecastRow[]>} */
  const bySupplier = new Map();
  model.toOrder.filter((row) => row.supplier).forEach((row) => bySupplier.set(row.supplier, [...(bySupplier.get(row.supplier) || []), row]));
  [...bySupplier.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 2).forEach(([supplier, list]) => {
    const pending = (data.inventoryPurchaseOrders || []).find((po) => po.supplier === supplier && po.status === "Pending Approval");
    suggestions.push({
      tone: "amber", title: `Order the ${plural(list.length, `${supplier} item`)} on one PO`,
      text: `${names(list)} all come from ${supplier}.${pending ? ` ${pending.id} is still waiting for approval and doesn’t cover them.` : " One PO saves on freight."}`,
      action: forecastCanOrder() ? { label: "Create PO", attrs: { "data-forecast-po": supplier } } : undefined,
    });
  });
  const minLow = model.rows.filter((row) => row.minLow && row.m.daily > 0);
  if (minLow.length) suggestions.push({
    tone: "amber", title: `Raise ${plural(minLow.length, "min level")}`,
    text: `${minLow.slice(0, 3).map((row) => `${row.name} (${row.min} → ${row.m.rop})`).join(", ")}${minLow.length > 3 ? ` and ${minLow.length - 3} more` : ""} ${minLow.length === 1 ? "has a min level" : "have min levels"} below the reorder point, so low-stock alerts fire too late.`,
    action: canViewModule("masterlists") && canEditModule("masterlists") ? { label: "Update", attrs: { "data-wa-goto": "masterlists|items||" } } : undefined,
  });
  model.rows.filter((row) => row.trend === "rising" && row.m.daily > 0).sort((a, b) => b.monthly[5] - b.monthly[0] - (a.monthly[5] - a.monthly[0])).slice(0, 1).forEach((row) => suggestions.push({
    tone: "blue", title: `${row.name} demand is rising`, text: `Use went from ${row.monthly[0]} to ${row.monthly[5]} a month since ${shortMonthLabel(model.monthStarts[0].slice(0, 7))}. The forecast already uses the latest 3 months.`,
  }));
  if (model.costs && uncosted.length) suggestions.push({
    tone: "red", title: `Fill the cost for ${uncosted.length === 1 ? uncosted[0].name : plural(uncosted.length, "item")}`, text: "Needed to estimate the order value.",
    action: canViewModule("reconciliation") ? { label: "Fix in Recon", attrs: { "data-wa-goto": "reconciliation|diffs||" } } : canViewModule("masterlists") ? { label: "Masterlists", attrs: { "data-wa-goto": "masterlists|items||" } } : undefined,
  });

  const labels = model.monthStarts.map((start, index) => `${shortMonthLabel(start.slice(0, 7))}${index === 5 ? "*" : ""}`);
  const usageRows = model.rows.filter((row) => row.monthly.some(Boolean)).sort((a, b) => b.monthly.reduce((x, y) => x + y, 0) - a.monthly.reduce((x, y) => x + y, 0)).slice(0, 12);
  const trendCell = (/** @type {string} */ trend) => trend === "rising" ? `<b class="tone-orange">▲ rising</b>` : trend === "falling" ? `<b class="tone-blue">▼ falling</b>` : trend === "new" ? `<b>new</b>` : `<span class="ui-muted">steady</span>`;
  const usage = usageRows.length
    ? `<div class="ui-table-scroll"><table class="ui-mini-table" style="min-width:560px"><caption class="sr-only">Units delivered per month, last 6 months</caption><thead><tr><th scope="col">Item</th>${labels.map((label) => `<th scope="col" class="num">${escapeHtml(label)}</th>`).join("")}<th scope="col" class="num">Trend</th></tr></thead><tbody>${usageRows.map((row) => `<tr><th scope="row">${escapeHtml(row.name)}</th>${row.monthly.map((value) => `<td class="num">${escapeHtml(forecastNum(value))}</td>`).join("")}<td class="num">${trendCell(row.trend)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="ui-muted">No deliveries to clients in the last 6 months.</p>`;

  return uiKpiCards(kpis) + uiDashboardGrid([
    [
      { span: 2, title: "Days of stock left", sub: `On hand ÷ daily use. The line marks lead time + ${model.settings.safetyDays} days of safety stock; red runs out before a new order would arrive.`, body: uiHBars({ items: bars, caption: "Days of stock left by item", targetLabel: "Lead time + safety stock" }) },
      { span: 1, title: "Suggestions", sub: "From the forecast", body: uiInsightList(suggestions, "Nothing to change right now.") },
    ],
    [
      { span: 2, title: "Usage, last 6 months", sub: `Units delivered to clients per month (SI and TS; DRs excluded) · *${shortMonthLabel(model.monthStarts[5].slice(0, 7))} projected from ${plural(Number(model.todayKey.slice(8)), "day")}`, body: usage },
    ],
  ]);
}

// ----- render ------------------------------------------------------------------------------------
function forecastQueryString() { return moduleViewQueryString("item-forecast", forecastTab, "overview", forecastView); }

function renderItemForecast() {
  const panel = qs("#forecast-tab-panel");
  if (!panel) return;
  if (!FORECAST_TABS.includes(forecastTab)) forecastTab = "overview";
  const model = forecastModel(true);
  const counts = /** @type {Record<string, number | undefined>} */ ({ reorder: model.toOrder.length, items: model.rows.length, expiry: model.lots.filter((lot) => lot.unused > 0).length + model.expired.length });
  qs("#forecast-tabs").innerHTML = uiModuleTabs({ tabs: FORECAST_TABS.map((key) => ({ key, label: FORECAST_TAB_LABELS[key], count: counts[key] })), active: forecastTab, attr: "data-forecast-tab" });
  const actions = qs("#forecast-actions");
  if (actions) actions.innerHTML = (forecastCanEditSettings() ? uiButton("Forecast settings", { "data-forecast-settings": "" }) : "") + (forecastCanOrder() && model.toOrder.length ? uiButton("Create PO from list", { "data-forecast-po": "" }, { primary: true }) : "");
  const desc = qs("#forecast-desc");
  if (desc) desc.textContent = `What to order, how much and when, from each item’s deliveries to clients over the last ${model.settings.lookbackDays} days, the supplier’s lead time and ${model.settings.safetyDays} days of safety stock. Every number shows how it was calculated.`;
  renderModuleAssistant("item-forecast");
  uiRender(panel, forecastTab === "overview" ? forecastOverviewHtml(model) : uiViewHtml(forecastTabModel(forecastTab, model), forecastView, "forecast"));
  syncModuleUrl("item-forecast", forecastQueryString());
}

WORKFLOW_RULES["item-forecast"] = [
  { id: "forecast-order-now", rule: () => {
    const model = forecastModel();
    const now = model.toOrder.filter((row) => row.m.status === "now");
    if (!now.length) return null;
    const first = now[0];
    const money = model.costs ? now.reduce((sum, row) => sum + row.value, 0) : 0;
    return {
      tone: "red", money,
      text: now.length === 1 ? `Order ${first.name}: ${forecastDays(first.m.daysOfStock).replace(" d", " days")} of stock left, lead time ${first.lead.days} days.` : `${plural(now.length, "item")} to order now — ${first.name} has ${forecastDays(first.m.daysOfStock).replace(" d", " days")} of stock left, lead time ${first.lead.days} days.`,
      action: "Reorder list", attrs: { "data-wa-goto": "item-forecast|reorder|now|" },
    };
  } },
  { id: "forecast-order-soon", rule: () => {
    const soon = forecastModel().toOrder.filter((row) => row.m.status === "soon");
    return soon.length ? { tone: "amber", text: `${plural(soon.length, "item")} will reach the reorder point within the supplier’s lead time.`, action: "Show", attrs: { "data-wa-goto": "item-forecast|reorder|soon|" } } : null;
  } },
  { id: "forecast-min-low", rule: () => {
    const low = forecastModel().rows.filter((row) => row.minLow && row.m.daily > 0);
    return low.length ? { tone: "slate", text: `${plural(low.length, "Masterlist min level")} ${low.length === 1 ? "is" : "are"} below the reorder point.`, action: "Show", attrs: { "data-wa-goto": "item-forecast|items|minlow|" } } : null;
  } },
];

// ----- actions -----------------------------------------------------------------------------------
/** Pre-fills a draft supplier PO (Pending Approval once saved) for one supplier's items to order. @param {string} supplier "" = ask which supplier */
async function forecastCreatePo(supplier) {
  if (!forecastCanOrder()) return toast("Creating supplier purchase orders needs Inventory or Purchase Orders edit access.");
  const model = forecastModel();
  const suppliers = [...new Set(model.toOrder.map((row) => row.supplier).filter(Boolean))];
  let chosen = supplier;
  if (!chosen) {
    if (!suppliers.length) return model.toOrder.length ? toast("The items to order have no supplier on file. Add one on a PO first.") : toast("Nothing to order right now.");
    if (suppliers.length === 1) chosen = suppliers[0];
    else {
      const counts = suppliers.map((name) => ({ name, n: model.toOrder.filter((row) => row.supplier === name).length }));
      const values = await reconDialog({
        eyebrow: "Item Forecast", title: "Create PO from list", sub: "A PO is for one supplier. Pick one; the form opens with its items and suggested quantities, and the PO waits for approval once saved.",
        body: `<div class="field full"><label for="forecast-po-supplier">Supplier</label><select id="forecast-po-supplier" name="supplier" required>${counts.map((entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)} · ${plural(entry.n, "item")}</option>`).join("")}</select></div>`,
        submit: "Open PO form",
      });
      if (!values) return;
      chosen = values.supplier;
    }
  }
  const rows = model.toOrder.filter((row) => row.supplier === chosen && row.m.suggested > 0);
  if (!rows.length) return toast(`Nothing from ${chosen} needs ordering right now.`);
  inventoryPoPrefill = { supplier: chosen, lines: rows.map((row) => ({ code: row.code, item: row.name, qty: row.m.suggested, price: row.cost || "" })) };
  openModal("inventoryPurchaseOrder");
}

/** Safety days, cover days and lead-time fallbacks (Superadmin/CEO; enforced on the server too). */
async function forecastEditSettings() {
  if (!forecastCanEditSettings()) return toast("Only Superadmin or CEO can change the forecast settings.");
  const model = forecastModel();
  const s = model.settings;
  const noHistory = [...new Set(model.rows.filter((row) => row.supplier && row.lead.source !== "history").map((row) => row.supplier))].sort();
  const field = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ value, /** @type {string} */ help) => `<div class="field"><label for="${id}">${escapeHtml(label)}</label><input id="${id}" name="${id}" type="number" min="1" max="365" step="1" value="${value}" required /><small>${escapeHtml(help)}</small></div>`;
  const values = await reconDialog({
    eyebrow: "Item Forecast", title: "Forecast settings", wide: true,
    sub: "Applies to every item. Lead times come from PO history (approval to first receipt); the fallbacks below are used only for suppliers without any.",
    body: `<div class="form-grid">${field("safetyDays", "Safety stock (days)", s.safetyDays, "Extra days of use kept on hand.")}${field("coverDays", "Order cover (days)", s.coverDays, "How long an order should last after it arrives.")}${field("defaultLeadDays", "Default lead time (days)", s.defaultLeadDays, "For suppliers with no PO history or setting.")}</div>
      ${noHistory.length ? `<h3 class="forecast-settings-h3">Suppliers without PO history</h3><div class="form-grid">${noHistory.map((name, index) => `<div class="field"><label for="lead-${index}">${escapeHtml(name)}</label><input id="lead-${index}" name="lead-${index}" data-supplier="${escapeHtml(name)}" type="number" min="1" max="365" step="1" placeholder="${s.defaultLeadDays} (default)" value="${s.supplierLeadDays[name] || ""}" /></div>`).join("")}</div>` : ""}`,
    submit: "Save settings",
  });
  if (!values) return;
  /** @type {Record<string, number>} */
  const supplierLeadDays = { ...s.supplierLeadDays };
  noHistory.forEach((name, index) => { const n = Number(values[`lead-${index}`]); if (n > 0) supplierLeadDays[name] = Math.round(n); else delete supplierLeadDays[name]; });
  const next = forecastSettingsFrom({ safetyDays: values.safetyDays, coverDays: values.coverDays, defaultLeadDays: values.defaultLeadDays, supplierLeadDays });
  /** @type {ForecastSettingsRecord} */
  const record = { id: "settings", safetyDays: next.safetyDays, coverDays: next.coverDays, defaultLeadDays: next.defaultLeadDays, supplierLeadDays: next.supplierLeadDays, updatedBy: String(currentUser?.name || currentUser?.email || ""), updatedAt: new Date().toISOString() };
  const before = data.forecastSettings?.[0];
  data.forecastSettings = [record];
  const result = await persistRecords({ forecastSettings: [record] });
  if (!result?.ok) { data.forecastSettings = before ? [before] : []; return renderItemForecast(); }
  log("Changed forecast settings", "Item Forecast", `Safety ${next.safetyDays} d · cover ${next.coverDays} d · default lead ${next.defaultLeadDays} d${Object.keys(next.supplierLeadDays).length ? ` · ${Object.entries(next.supplierLeadDays).map(([name, days]) => `${name} ${days} d`).join(", ")}` : ""}`);
  toast("Forecast settings saved.");
  renderItemForecast();
}

/** Click handling for the page (wired in events-bootstrap.js). @param {Element} target */
function handleForecastClick(target) {
  const tab = closestEl(target, "[data-forecast-tab]");
  if (tab) {
    if (tab.dataset.forecastTab !== forecastTab) forecastView = uiBlankViewState();
    forecastTab = /** @type {string} */ (tab.dataset.forecastTab);
    return renderItemForecast();
  }
  const po = closestEl(target, "[data-forecast-po]");
  if (po) return forecastCreatePo(String(po.dataset.forecastPo || ""));
  if (closestEl(target, "[data-forecast-settings]")) return forecastEditSettings();
  if (closestEl(target, "[data-forecast-close]")) { forecastView.sel = ""; return renderItemForecast(); }
  if (forecastTab !== "overview") uiViewClick(target, "forecast", { state: () => forecastView, view: () => forecastTabModel(forecastTab, forecastModel()), render: renderItemForecast });
}

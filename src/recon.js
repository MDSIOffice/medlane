// Recon: data integrity checks. Pure functions only (no I/O), so the Worker can run them on its
// full data and the tests can run them on fixtures.
//
// Each check is one entry in RECON_CHECKS: { id, area, name, rule, run(ctx) }. run() returns
//   { status?: "cant", reason?, scope, checked, rows, note? }
// where every row is one record that disagrees:
//   { key, title, ref, expected, found, amount, impact, fix }
// A check with missing input data must return status "cant" with a reason, never a pass.
// To add a check, add an entry here; the Recon page draws whatever the run returns.
//
// A row's `fix` is one of
//   { kind: "apply", label, ops, preview, needsNote? }  applied by the Worker, logged, undoable
//   { kind: "open", label, goto: { section, tab, sel } } handled in the module that owns it
//   null                                                 explain or assign only
// Fix ops (see applyReconOps in worker.js):
//   { op: "set", module, key, field, before, after }   field may be a dotted path ("lines.2.adjusted")
//   { op: "stock", key, before, after, reason }         inventory qty change + a movement entry
//   { op: "movement", key, delta, reason, item }        movement-log entry only (no stock change)
// "{{note}}" / "{{user}}" inside an op's `after` are filled in by the Worker when it applies it.

export const RECON_AREAS = ["Stock", "Purchasing & payables", "Sales & billing", "Cash & receivables", "Master data"];

/** Modules a full run reads (the Worker loads exactly these). */
export const RECON_INPUT_MODULES = [
  "inventory", "stockMovements", "stockCounts", "pendingTransfers", "inventoryPurchaseOrders", "payables", "purchaseOrders",
  "sales", "payments", "paymentRequests", "items", "clients", "suppliers", "priceLists", "bankStatements", "cashCounts",
  "reconSettings", "warranties", "productIssues", "pendingCreditInvoices",
];

const EPS = 0.005;
/** @param {unknown} value */
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
/** @param {number} value */
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
/** @param {number} value */
const round4 = (value) => Math.round(value * 10000) / 10000;
/** @param {number} value */
export function pesoText(value) {
  const n = round2(num(value));
  return `${n < 0 ? "−" : ""}₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
/** @param {number} value */
const qtyText = (value) => String(round4(value));
/** @param {any} record */
const isArchived = (record) => Boolean(record?.archived);

/** YYYY-MM-DD in Manila. @param {Date | number | string} value */
export function manilaDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "";
}
/** The YYYY-MM-DD part of a stored date ("2026-11-12", ISO, or "Nov 12, 2026"). @param {unknown} value */
export function dayOf(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match) return match[1];
  if (!text) return "";
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? manilaDate(parsed) : "";
}
/** "12 Nov 2026". @param {string} day */
export function dayLabel(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ""));
  if (!match) return String(day || "—");
  return `${Number(match[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[2]) - 1]} ${match[1]}`;
}

// ----- record keys (must match recordKeyFor in worker.js) -----
/** The stored record_key of each loaded record; set by dataFromRows. */
const RECORD_KEYS = new WeakMap();
/** @param {any} row */
export function inventoryKey(row) {
  return [row?.code || row?.item || "stock", row?.branch || "branch", row?.lot || row?.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
}
/** @param {string} module @param {any} record */
export function keyOf(module, record) {
  const stored = record && typeof record === "object" ? RECORD_KEYS.get(record) : undefined;
  if (stored) return stored;
  if (module === "inventory") return inventoryKey(record);
  if (module === "collectionContacts" && record?.client) return String(record.client);
  return String(record?.id || record?.documentNo || record?.receiptNo || record?.cvNo || record?.code || record?.name || record?.email || "");
}
/** Builds the data object a run reads from app_records rows ({ module_name, record_key, data }). @param {any[]} rows */
export function dataFromRows(rows) {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const module of RECON_INPUT_MODULES) out[module] = [];
  for (const row of rows || []) {
    if (!row?.data || typeof row.data !== "object") continue;
    (out[row.module_name] ||= []).push(row.data);
    RECORD_KEYS.set(row.data, String(row.record_key));
  }
  return out;
}

// ----- shared helpers -----
/** @param {any} sale */
export function saleDocType(sale) { const type = String(sale?.type || "SI").toUpperCase(); return type === "DRS" ? "DR" : type; }
/** @param {any} sale */
export function saleNo(sale) { return String(sale?.documentNo || sale?.id || ""); }
/** @param {any} sale */
export function saleLines(sale) {
  if (Array.isArray(sale?.lines) && sale.lines.length) return sale.lines;
  return sale?.code || sale?.item ? [{ item: sale.item, code: sale.code, qty: sale.qty, price: sale.price, lot: sale.lot }] : [];
}
/** @param {any} sale */
const isCancelledSale = (sale) => String(sale?.status || "") === "Cancelled";
/** @param {any} payment */
const paymentCounts = (payment) => !payment?.voided && payment?.appliedToInvoice !== false;
/** @param {any} transfer */
const isReceivedTransfer = (transfer) => /received/i.test(String(transfer?.status || ""));

/** Context shared by every check in one run. @param {Record<string, any[]>} data @param {Date} now */
export function reconContext(data, now = new Date()) {
  const items = (data.items || []).filter((item) => item && !isArchived(item));
  const itemByCode = new Map(items.map((item) => [String(item.code || ""), item]));
  /** @type {Map<string, number>} */
  const onHand = new Map();
  for (const row of data.inventory || []) onHand.set(String(row?.code || ""), (onHand.get(String(row?.code || "")) || 0) + num(row?.qty));
  const settings = (data.reconSettings || []).find((record) => keyOf("reconSettings", record) === "settings") || {};
  const baseline = (data.reconSettings || []).find((record) => keyOf("reconSettings", record) === "movement-baseline") || null;
  return {
    data, now, today: manilaDate(now), items, itemByCode, onHand, settings, baseline,
    /** @param {string} code */
    cost: (code) => num(itemByCode.get(String(code || ""))?.cost),
    /** @param {string} code @param {string} [fallback] */
    itemName: (code, fallback = "") => String(itemByCode.get(String(code || ""))?.name || fallback || code || "Item"),
    latestPoPrice: latestPoPrices(data.inventoryPurchaseOrders || []),
  };
}
/** @typedef {ReturnType<typeof reconContext>} ReconCtx */

/** Latest supplier PO unit cost per item code (received or approved POs, newest PO date wins). @param {any[]} pos */
export function latestPoPrices(pos) {
  /** @type {Map<string, { price: number, po: string, date: string }>} */
  const out = new Map();
  for (const po of pos || []) {
    const status = String(po?.status || "");
    if (!/received|approved|ordered|transit/i.test(status) || /cancel/i.test(status)) continue;
    const date = dayOf(po.date);
    for (const line of po.lines || []) {
      const code = String(line?.code || "");
      const price = num(line?.price);
      if (!code || !(price > 0)) continue;
      const prev = out.get(code);
      if (!prev || date >= prev.date) out.set(code, { price: round2(price), po: String(po.id || ""), date });
    }
  }
  return out;
}

/** @param {any} row */
const stockLabel = (row) => [row?.item || row?.code, row?.serial ? `Serial ${row.serial}` : row?.lot ? `Lot ${row.lot}` : "", row?.branch].filter(Boolean).join(" · ");

/** @param {string} reason @param {string} [scope] */
const cant = (reason, scope = "") => ({ status: "cant", reason, scope, checked: 0, rows: [] });

/** Digits only. @param {unknown} value */
const digits = (value) => String(value || "").replace(/\D+/g, "");
/** Lower-case letters/digits only. @param {unknown} value */
const squash = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
/** A client name without punctuation and company suffixes. @param {unknown} value */
const clientNameKey = (value) => String(value || "").toLowerCase().replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|opc|the)\b\.?/g, "").replace(/[^a-z0-9]+/g, "");

// ----- the checks -----
/** @type {{ id: string, area: string, name: string, rule: string, run: (ctx: ReconCtx) => any }[]} */
export const RECON_CHECKS = [
  {
    id: "k1", area: "Stock", name: "Stock movements add up",
    rule: "Opening + every logged movement (received, delivered, transfers, adjustments) = on hand, per item, branch and lot",
    run(ctx) {
      const baseline = ctx.baseline;
      if (!baseline?.at) return cant("The stock movement log starts with the first run after this update. From then on every change to on-hand stock is logged, and this check compares the log with what is on hand.");
      /** @type {Map<string, number>} */
      const expected = new Map(Object.entries(baseline.qty || {}).map(([key, qty]) => [key, num(qty)]));
      /** @type {Map<string, any>} */
      const info = new Map();
      const moves = (ctx.data.stockMovements || []).filter((move) => String(move?.at || "") > String(baseline.at)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
      for (const move of moves) {
        expected.set(String(move.key), (expected.get(String(move.key)) || 0) + num(move.delta));
        info.set(String(move.key), move);
      }
      /** @type {Map<string, number>} */
      const current = new Map();
      for (const row of ctx.data.inventory || []) {
        const key = keyOf("inventory", row);
        current.set(key, (current.get(key) || 0) + num(row.qty));
        info.set(key, row);
      }
      const keys = new Set([...expected.keys(), ...current.keys()]);
      const counts = latestCountLines(ctx.data.stockCounts || []);
      /** @type {any[]} */
      const rows = [];
      for (const key of keys) {
        const want = round4(expected.get(key) || 0);
        const have = round4(current.get(key) || 0);
        if (Math.abs(want - have) <= 0.0001) continue;
        const row = info.get(key) || {};
        const code = String(row.code || key.split("|")[0]);
        const diff = round4(have - want);
        const cost = ctx.cost(code);
        const lastMove = moves.filter((move) => move.key === key).pop();
        const count = counts.get(key);
        const countAgrees = Boolean(count && num(count.line.counted) === want && (!lastMove || String(count.at) > String(lastMove.at)));
        const label = stockLabel({ ...row, item: ctx.itemName(code, row.item) });
        rows.push({
          key, title: "Stock movements don’t add up", ref: label,
          expected: `${qtyText(want)} (from movements)`, found: `${qtyText(have)} on hand`,
          amount: round2(Math.abs(diff) * cost),
          impact: `${qtyText(Math.abs(diff))} unit${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "on hand with no logged movement behind them" : "left stock with no logged movement"}.${countAgrees && count ? ` The ${dayLabel(dayOf(count.at))} count found ${qtyText(want)}, so the system figure is wrong.` : ""}`,
          fix: countAgrees && count
            ? { kind: "apply", label: `Correct on hand to ${qtyText(want)}`, ops: [{ op: "movement", key, delta: diff, reason: "Unlogged change found by Recon", item: row }, { op: "stock", key, before: have, after: want, reason: `Recon correction (count ${dayLabel(dayOf(count.at))})` }], preview: [["On hand", `${qtyText(have)} → ${qtyText(want)}`], ["Stock value", cost ? `${diff > 0 ? "−" : "+"}${pesoText(Math.abs(diff) * cost)}` : "No cost on file"]] }
            : { kind: "apply", label: `Accept on hand (${qtyText(have)})`, ops: [{ op: "movement", key, delta: diff, reason: "Unlogged change accepted in Recon", item: row }], preview: [["Movement log", `${qtyText(want)} → ${qtyText(have)}`], ["On hand", `${qtyText(have)} (unchanged)`]] },
        });
      }
      return { scope: `${keys.size} item-branch-lot rows since ${dayLabel(dayOf(baseline.at))}`, checked: keys.size, rows };
    },
  },
  {
    id: "k2", area: "Stock", name: "Transfers sent = received",
    rule: "Quantity dispatched = quantity confirmed by the receiving branch",
    run(ctx) {
      const transfers = (ctx.data.pendingTransfers || []).filter(isReceivedTransfer);
      /** @type {any[]} */
      const rows = [];
      for (const transfer of transfers) {
        const lines = Array.isArray(transfer.lines) && transfer.lines.length ? transfer.lines : [{ code: transfer.code, item: transfer.item, lot: transfer.lot, qty: transfer.qty, dispatchedQty: transfer.dispatchedQty, receivedQty: transfer.receivedQty }];
        let value = 0;
        const parts = [];
        let sent = 0;
        let got = 0;
        for (const line of lines) {
          const lineSent = num(line.dispatchedQty ?? line.requestedQty ?? line.qty);
          const lineGot = line.receivedQty === undefined || line.receivedQty === null ? lineSent : num(line.receivedQty);
          sent += lineSent; got += lineGot;
          if (Math.abs(lineSent - lineGot) > 0.0001) {
            parts.push(`${ctx.itemName(line.code, line.item)} ${qtyText(lineSent)} sent, ${qtyText(lineGot)} received`);
            value += Math.abs(lineSent - lineGot) * ctx.cost(line.code);
          }
        }
        if (!parts.length) continue;
        rows.push({
          key: String(transfer.id), title: got < sent ? "Transfer arrived short" : "Transfer received more than was sent", ref: `${transfer.id} · ${transfer.from || "?"} → ${transfer.to || "?"}`,
          expected: `${qtyText(sent)} received`, found: `${qtyText(got)} received`, amount: round2(value),
          impact: `${parts.join("; ")}.`,
          fix: { kind: "open", label: "Open the transfer", goto: { section: "inventory", tab: "transfers", sel: String(transfer.id) } },
        });
      }
      return { scope: transfers.length ? `${transfers.length} received transfer${transfers.length === 1 ? "" : "s"}` : "No received transfers yet", checked: transfers.length, rows };
    },
  },
  {
    id: "k3", area: "Stock", name: "Physical count = system",
    rule: "Each lot’s counted quantity = the system quantity when it was counted",
    run(ctx) {
      const counts = (ctx.data.stockCounts || []).filter((count) => count && count.status !== "Draft");
      if (!counts.length) return cant("No stock count has been recorded yet. Start a count in the Stock count tab.");
      const currentByKey = new Map((ctx.data.inventory || []).map((row) => [keyOf("inventory", row), row]));
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      for (const count of latestCountPerBranch(counts)) {
        (count.lines || []).forEach((/** @type {any} */ line, /** @type {number} */ index) => {
          checked += 1;
          const variance = round4(num(line.counted) - num(line.system));
          if (Math.abs(variance) <= 0.0001 || line.adjusted) return;
          const key = String(line.key || inventoryKey({ ...line, branch: count.branch }));
          const stock = currentByKey.get(key);
          const cost = ctx.cost(line.code);
          const day = dayOf(count.at || count.date);
          const after = stock ? round4(Math.max(0, num(stock.qty) + variance)) : 0;
          rows.push({
            key: `${keyOf("stockCounts", count)}:${index}`, title: variance < 0 ? "Physical count is lower than the system" : "Physical count is higher than the system",
            ref: stockLabel({ ...line, item: ctx.itemName(line.code, line.item), branch: count.branch }),
            expected: `${qtyText(num(line.system))} (system)`, found: `${qtyText(num(line.counted))} (counted ${dayLabel(day)})`,
            amount: round2(Math.abs(variance) * cost),
            impact: `${qtyText(Math.abs(variance))} unit${Math.abs(variance) === 1 ? "" : "s"} ${variance < 0 ? "missing" : "more than the system shows"}${cost ? ` (${pesoText(Math.abs(variance) * cost)} at cost)` : ""}. Nothing changes until the adjustment is posted.`,
            fix: stock
              ? { kind: "apply", label: `Post count adjustment (${variance > 0 ? "+" : "−"}${qtyText(Math.abs(variance))})`, ops: [{ op: "stock", key, before: num(stock.qty), after, reason: `Count variance ${dayLabel(day)}` }, { op: "set", module: "stockCounts", key: keyOf("stockCounts", count), field: `lines.${index}.adjusted`, before: line.adjusted ?? null, after: true }], preview: [["On hand", `${qtyText(num(stock.qty))} → ${qtyText(after)}`], ["Stock value", cost ? `${variance < 0 ? "−" : "+"}${pesoText(Math.abs(variance) * cost)}` : "No cost on file"], ["Reason", `Count variance ${dayLabel(day)}`]] }
              : { kind: "open", label: "Open Inventory", goto: { section: "inventory", tab: "stocks", sel: "" } },
          });
        });
      }
      return { scope: `${checked} counted line${checked === 1 ? "" : "s"}`, checked, rows };
    },
  },
  {
    id: "k4", area: "Stock", name: "No expired stock available",
    rule: "Lots past their expiry date are written off for disposal, not left in available stock",
    run(ctx) {
      const lots = (ctx.data.inventory || []).filter((row) => row && !isArchived(row) && /^\d{4}-\d{2}-\d{2}/.test(String(row.expiry || "")));
      /** @type {any[]} */
      const rows = [];
      for (const row of lots) {
        const qty = num(row.qty);
        if (!(qty > 0) || dayOf(row.expiry) >= ctx.today) continue;
        const key = keyOf("inventory", row);
        const cost = ctx.cost(row.code);
        rows.push({
          key, title: "Expired lot still counted as stock", ref: stockLabel({ ...row, item: ctx.itemName(row.code, row.item) }),
          expected: "Written off for disposal", found: `${qtyText(qty)} on hand, expired ${dayLabel(dayOf(row.expiry))}`,
          amount: round2(qty * cost), impact: "It inflates stock value and could be picked for a delivery.",
          fix: { kind: "apply", label: `Write off ${qtyText(qty)} for disposal`, ops: [{ op: "stock", key, before: qty, after: 0, reason: `Expired ${dayLabel(dayOf(row.expiry))}, written off for disposal` }], preview: [["On hand", `${qtyText(qty)} → 0`], ["Stock value", cost ? `−${pesoText(qty * cost)}` : "No cost on file"]] },
        });
      }
      return { scope: `${lots.length} lots with an expiry date`, checked: lots.length, rows };
    },
  },
  {
    id: "k5", area: "Stock", name: "Every adjustment has a reason",
    rule: "Manual stock adjustments carry a reason",
    run(ctx) {
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      for (const row of ctx.data.inventory || []) {
        const history = Array.isArray(row?.history) ? row.history : [];
        for (const entry of history) {
          const changes = Array.isArray(entry?.changes) ? entry.changes.map((/** @type {any} */ change) => (typeof change === "string" ? change : `${change?.field || ""} ${change?.from ?? ""} → ${change?.to ?? ""}`)).join(" ") : String(entry?.changes || "");
          if (!/qty|quantity|on hand/i.test(changes)) continue;
          checked += 1;
          if (String(entry.reason || "").trim()) continue;
          rows.push({
            key: `${keyOf("inventory", row)}@${entry.at || ""}`, title: "Stock adjustment without a reason",
            ref: `${stockLabel({ ...row, item: ctx.itemName(row.code, row.item) })} · ${entry.at || "?"} · ${entry.by || "Unknown"}`,
            expected: "A reason", found: "None", amount: 0, impact: `${changes || "Quantity changed"} with no explanation.`, fix: null,
          });
        }
      }
      for (const move of ctx.data.stockMovements || []) {
        if (move?.source?.type !== "unattributed") continue;
        checked += 1;
        const code = String(move.code || String(move.key || "").split("|")[0]);
        rows.push({
          key: `move:${move.id}`, title: "Stock changed with no document or reason",
          ref: `${stockLabel({ ...move, item: ctx.itemName(code, move.item) })} · ${dayLabel(dayOf(move.at))} · ${move.by || "Unknown"}`,
          expected: "A document or reason", found: `${num(move.delta) > 0 ? "+" : "−"}${qtyText(Math.abs(num(move.delta)))} with none`,
          amount: round2(Math.abs(num(move.delta)) * ctx.cost(code)),
          impact: `On hand went ${qtyText(num(move.before))} → ${qtyText(num(move.after))} in a save with no invoice, transfer, receipt or reason.`, fix: null,
        });
      }
      return { scope: `${checked} adjustment${checked === 1 ? "" : "s"}`, checked, rows };
    },
  },
  {
    id: "k6", area: "Purchasing & payables", name: "PO = received = billed",
    rule: "What a supplier bills for a PO = the value received against it (3-way match)",
    run(ctx) {
      const linked = (ctx.data.payables || []).filter((bill) => bill && bill.poId && String(bill.requestStatus || bill.status || "") !== "Cancelled");
      if (!linked.length) return cant("No supplier bill is linked to a supplier PO yet. Pick the PO on a payable request to run the 3-way match.");
      const poById = new Map((ctx.data.inventoryPurchaseOrders || []).map((po) => [String(po.id || ""), po]));
      /** @type {Map<string, any[]>} */
      const billsByPo = new Map();
      for (const bill of linked) billsByPo.set(String(bill.poId), [...(billsByPo.get(String(bill.poId)) || []), bill]);
      /** @type {any[]} */
      const rows = [];
      for (const [poId, bills] of billsByPo) {
        const po = poById.get(poId);
        const openBill = { kind: "open", label: "Open the bill", goto: { section: "payables", tab: "bills", sel: String(bills[0].id) } };
        if (!po) {
          rows.push({ key: poId, title: "Bill linked to a PO that doesn’t exist", ref: `${bills.map((bill) => bill.id).join(", ")} · ${poId}`, expected: "An existing supplier PO", found: "Not found", amount: round2(bills.reduce((s, bill) => s + num(bill.grossAmount || bill.amount), 0)), impact: "The bill can’t be matched to what was ordered or received.", fix: openBill });
          continue;
        }
        const ordered = round2((po.lines || []).reduce((/** @type {number} */ s, /** @type {any} */ line) => s + num(line.qty) * num(line.price), 0));
        const received = round2((po.lines || []).reduce((/** @type {number} */ s, /** @type {any} */ line) => s + num(line.receivedQty) * num(line.price), 0));
        const billed = round2(bills.reduce((s, bill) => s + num(bill.grossAmount || bill.amount), 0));
        if (billed - received > 1) {
          const short = (po.lines || []).filter((/** @type {any} */ line) => num(line.receivedQty) < num(line.qty)).map((/** @type {any} */ line) => `${qtyText(num(line.qty) - num(line.receivedQty))} × ${ctx.itemName(line.code, line.item)}`);
          rows.push({
            key: poId, title: "Bill charges for items that never arrived", ref: `${poId} · ${po.supplier || ""} · ${bills.map((bill) => bill.id).join(", ")}`,
            expected: `${pesoText(received)} received`, found: `${pesoText(billed)} billed`, amount: round2(billed - received),
            impact: `Paying the full bill overpays ${po.supplier || "the supplier"} by ${pesoText(billed - received)}.${short.length ? ` Not received: ${short.join(", ")}.` : ""}`,
            fix: { ...openBill, label: "Short-pay the bill" },
          });
        } else if (billed - ordered > 1) {
          rows.push({ key: poId, title: "Billed more than ordered", ref: `${poId} · ${po.supplier || ""}`, expected: `${pesoText(ordered)} ordered`, found: `${pesoText(billed)} billed`, amount: round2(billed - ordered), impact: "The bill is higher than the PO value.", fix: openBill });
        }
      }
      return { scope: `${billsByPo.size} PO${billsByPo.size === 1 ? "" : "s"} with linked bills`, checked: billsByPo.size, rows };
    },
  },
  {
    id: "k7", area: "Purchasing & payables", name: "Item cost = latest PO cost",
    rule: "The masterlist cost = the unit cost on the latest received or approved supplier PO",
    run(ctx) {
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      for (const item of ctx.items) {
        const code = String(item.code || "");
        const cost = num(item.cost);
        const latest = ctx.latestPoPrice.get(code);
        if (!code || !(cost > 0) || !latest) continue;
        checked += 1;
        if (Math.abs(cost - latest.price) <= EPS) continue;
        const qty = Math.max(ctx.onHand.get(code) || 0, 0);
        const price = num(item.price);
        const margin = (/** @type {number} */ c) => (price > 0 ? `${Math.round(((price - c) / price) * 100)}%` : "—");
        rows.push({
          key: keyOf("items", item), title: `${item.name || code} cost is out of date`, ref: `Masterlists · ${code}`,
          expected: `${pesoText(latest.price)} (${latest.po})`, found: pesoText(cost),
          amount: round2(Math.abs(latest.price - cost) * qty),
          impact: `Stock value ${latest.price > cost ? "understated" : "overstated"} by ${pesoText(Math.abs(latest.price - cost) * qty)} (${qtyText(qty)} on hand)${price > 0 ? ` and margin shown as ${margin(cost)} instead of ${margin(latest.price)}` : ""}.`,
          fix: { kind: "apply", label: `Update cost to ${pesoText(latest.price)}`, ops: [{ op: "set", module: "items", key: keyOf("items", item), field: "cost", before: item.cost ?? null, after: latest.price }], preview: [["Item cost", `${pesoText(cost)} → ${pesoText(latest.price)}`], ...(price > 0 ? [["List margin", `${margin(cost)} → ${margin(latest.price)}`]] : []), ...(qty ? [[`Stock value (${qtyText(qty)} units)`, `${pesoText(cost * qty)} → ${pesoText(latest.price * qty)}`]] : [])] },
        });
      }
      return { scope: `${checked} item${checked === 1 ? "" : "s"} with a cost and a PO`, checked, rows };
    },
  },
  {
    id: "k8", area: "Purchasing & payables", name: "Bills are consistent",
    rule: "On every bill: paid ≤ amount, no negative amounts, and only approved bills are marked paid",
    run(ctx) {
      const bills = (ctx.data.payables || []).filter((bill) => bill && String(bill.requestStatus || bill.status || "") !== "Cancelled");
      /** @type {any[]} */
      const rows = [];
      const open = (/** @type {any} */ bill) => ({ kind: "open", label: "Open the bill", goto: { section: "payables", tab: "bills", sel: String(bill.id) } });
      for (const bill of bills) {
        const amount = num(bill.amount);
        const paid = num(bill.paid);
        const ref = `${bill.id} · ${bill.supplier || ""}`;
        if (amount < -EPS) rows.push({ key: `${bill.id}:neg`, title: "Bill has a negative amount", ref, expected: "₱0 or more", found: pesoText(amount), amount: Math.abs(amount), impact: "Negative bills reduce what we appear to owe.", fix: open(bill) });
        if (amount >= -EPS && paid - amount > 0.01) rows.push({ key: `${bill.id}:over`, title: "Bill paid more than its amount", ref, expected: `Paid ≤ ${pesoText(amount)}`, found: `Paid ${pesoText(paid)}`, amount: round2(paid - amount), impact: `${pesoText(paid - amount)} more than the bill was recorded as paid.`, fix: open(bill) });
        if (bill.paymentConfirmed && String(bill.requestStatus || "") !== "Approved") rows.push({ key: `${bill.id}:unapproved`, title: "Bill marked paid but not approved", ref, expected: "Approved before payment", found: `Status: ${bill.requestStatus || "none"}`, amount: round2(amount), impact: "Payables must be approved by Superadmin or CEO before they are paid.", fix: open(bill) });
      }
      return { scope: `${bills.length} bill${bills.length === 1 ? "" : "s"}`, checked: bills.length, rows };
    },
  },
  {
    id: "k9", area: "Sales & billing", name: "Delivered = invoiced",
    rule: "A client PO marked complete has every line invoiced (or was closed short on purpose)",
    run(ctx) {
      const served = servedQtyByPo(ctx.data.sales || []);
      const pos = (ctx.data.purchaseOrders || []).filter((po) => po && /complete|deliver|served|closed/i.test(String(po.status || "")) && !/cancel|short|close/i.test(String(po.completedType || "")));
      /** @type {any[]} */
      const rows = [];
      for (const po of pos) {
        let missingValue = 0;
        const parts = [];
        for (const line of po.lines || []) {
          const left = num(line.qty) - (served.get(`${po.id}|${line.code}`) || 0);
          if (left > 0.0001) { parts.push(`${qtyText(left)} × ${ctx.itemName(line.code, line.item)}`); missingValue += left * num(line.price); }
        }
        if (!parts.length) continue;
        rows.push({
          key: String(po.id), title: "PO marked complete but not fully invoiced", ref: `${po.id} · ${po.client || ""}`,
          expected: "Every line invoiced", found: `Not invoiced: ${parts.join(", ")}`, amount: round2(missingValue),
          impact: `${pesoText(missingValue)} isn’t in receivables, so it won’t show as owed or get collected.`,
          fix: { kind: "open", label: "Create the invoice", goto: { section: "purchase-orders", tab: "orders", sel: String(po.id) } },
        });
      }
      return { scope: `${pos.length} completed PO${pos.length === 1 ? "" : "s"}`, checked: pos.length, rows };
    },
  },
  {
    id: "k10", area: "Sales & billing", name: "Invoice math is correct",
    rule: "Line totals = invoice amount, and amount − discount = net, to the centavo (prices include 12% VAT)",
    run(ctx) {
      const sales = (ctx.data.sales || []).filter((sale) => sale && !isCancelledSale(sale) && saleDocType(sale) !== "DR" && Array.isArray(sale.lines) && sale.lines.length);
      /** @type {any[]} */
      const rows = [];
      for (const sale of sales) {
        const lines = round2(sale.lines.reduce((/** @type {number} */ s, /** @type {any} */ line) => s + round2(num(line.qty) * num(line.price)), 0));
        const amount = round2(num(sale.amount));
        const net = round2(num(sale.net));
        const expectNet = round2(amount - num(sale.discount));
        const open = { kind: "open", label: "Open the invoice", goto: { section: "invoicing", tab: "list", sel: saleNo(sale) } };
        if (Math.abs(lines - amount) > 0.01) rows.push({ key: `${saleNo(sale)}:lines`, title: "Invoice lines don’t add up", ref: `${saleNo(sale)} · ${sale.client || ""}`, expected: `${pesoText(lines)} (lines)`, found: `${pesoText(amount)} amount`, amount: round2(Math.abs(lines - amount)), impact: "The invoice amount differs from the sum of its lines.", fix: open });
        else if (Math.abs(expectNet - net) > 0.01) rows.push({ key: `${saleNo(sale)}:net`, title: "Invoice total doesn’t match amount less discount", ref: `${saleNo(sale)} · ${sale.client || ""}`, expected: `${pesoText(expectNet)} net`, found: `${pesoText(net)} net`, amount: round2(Math.abs(expectNet - net)), impact: "The amount due differs from the invoice amount less its discount.", fix: open });
      }
      return { scope: `${sales.length} invoice${sales.length === 1 ? "" : "s"}`, checked: sales.length, rows };
    },
  },
  {
    id: "k11", area: "Sales & billing", name: "No gaps in invoice numbers",
    rule: "Every number in a series is issued, cancelled or recorded as voided",
    run(ctx) {
      const series = Array.isArray(ctx.settings.invoiceSeries) ? ctx.settings.invoiceSeries.filter((/** @type {any} */ entry) => entry && num(entry.start) > 0) : [];
      if (!series.length) return cant("No invoice number series is set. Set the series (prefix and first number) to run this check.");
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      ctx.settings.invoiceSeries.forEach((/** @type {any} */ entry, /** @type {number} */ index) => {
        if (!entry || !(num(entry.start) > 0)) return;
        const prefix = String(entry.prefix || "").replace(/\s+/g, "").toUpperCase();
        const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}0*(\\d+)$`);
        /** @type {Set<number>} */
        const used = new Set();
        for (const sale of ctx.data.sales || []) {
          const match = pattern.exec(saleNo(sale).replace(/\s+/g, "").toUpperCase());
          if (match) used.add(Number(match[1]));
        }
        const voided = entry.voided && typeof entry.voided === "object" ? entry.voided : {};
        Object.keys(voided).forEach((n) => { if (voided[n]) used.add(Number(n)); });
        const start = num(entry.start);
        const end = num(entry.end) || Math.max(start - 1, ...[...used].filter((n) => n >= start));
        checked += Math.max(0, end - start + 1);
        const width = num(entry.width);
        const label = (/** @type {number} */ n) => `${prefix}${width ? String(n).padStart(width, "0") : n}`;
        /** @type {number[]} */
        let run = [];
        const flush = () => {
          if (!run.length) return;
          const nums = run.slice();
          run = [];
          rows.push({
            key: `${entry.id || index}:${nums[0]}`, title: nums.length === 1 ? "Invoice number missing from the series" : `${nums.length} invoice numbers missing from the series`,
            ref: nums.length <= 3 ? nums.map(label).join(", ") : `${label(nums[0])} to ${label(nums[nums.length - 1])}`,
            expected: "Issued, cancelled or voided", found: "Not found", amount: 0,
            impact: "Every number must be accounted for. Find out whether they were skipped, deleted or printed and lost.",
            fix: { kind: "apply", needsNote: true, label: "Record as voided with a reason", ops: nums.map((n) => ({ op: "set", module: "reconSettings", key: "settings", field: `invoiceSeries.${index}.voided.${n}`, before: null, after: { reason: "{{note}}", by: "{{user}}" } })), preview: nums.slice(0, 6).map((n) => [label(n), "Missing → Voided"]).concat(nums.length > 6 ? [[`+${nums.length - 6} more`, "Missing → Voided"]] : []) },
          });
        };
        for (let n = start; n <= end; n += 1) {
          if (used.has(n)) { flush(); continue; }
          run.push(n);
          if (run.length >= 200) flush();
        }
        flush();
      });
      return { scope: `${checked} number${checked === 1 ? "" : "s"} in ${series.length} series`, checked, rows };
    },
  },
  {
    id: "k12", area: "Sales & billing", name: "Prices match the price list",
    rule: "Invoice price = the client’s price list (or the item’s list price), unless the discount was approved",
    run(ctx) {
      const lists = (ctx.data.priceLists || []).filter((list) => list && list.active !== false);
      const priced = ctx.items.filter((item) => num(item.price) > 0).length;
      if (!priced && !lists.length) return cant("No list prices are set yet. Add list prices to items or create a price list in Masterlists.");
      const since = shiftDay(ctx.today, -90);
      const clientByName = new Map((ctx.data.clients || []).map((client) => [String(client.name || ""), client]));
      const standard = lists.find((list) => list.isDefault) || lists.find((list) => /standard/i.test(String(list.name || "")));
      const sales = (ctx.data.sales || []).filter((sale) => sale && !isCancelledSale(sale) && saleDocType(sale) !== "DR" && dayOf(sale.date) >= since);
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      for (const sale of sales) {
        const client = clientByName.get(String(sale.client || ""));
        const clientList = lists.find((list) => String(list.name || "") === String(client?.priceList || ""));
        let below = 0;
        const parts = [];
        for (const line of saleLines(sale)) {
          const listed = listPriceFor(ctx, String(line.code || ""), clientList || standard, dayOf(sale.date));
          if (!(listed > 0)) continue;
          checked += 1;
          const price = num(line.price);
          if (price >= listed - EPS) continue;
          below += (listed - price) * num(line.qty);
          parts.push(`${ctx.itemName(line.code, line.item)} ${pesoText(price)} vs ${pesoText(listed)}`);
        }
        if (!parts.length) continue;
        const reason = String(sale.discountReason || saleLines(sale).map((/** @type {any} */ line) => line.discountReason).find(Boolean) || "");
        rows.push({
          key: saleNo(sale), title: "Invoice priced below the price list", ref: `${saleNo(sale)} · ${sale.client || ""}${sale.salesperson ? ` · ${sale.salesperson}` : ""}`,
          expected: clientList ? `${clientList.name} price` : "List price", found: `${parts.length} line${parts.length === 1 ? "" : "s"} below`, amount: round2(below),
          impact: `${parts.slice(0, 3).join("; ")}${parts.length > 3 ? "; …" : ""}.${reason ? ` Reason given: “${reason}”, but no approval on record.` : " No discount approval on record."} Mark it as explained to approve it.`,
          fix: { kind: "open", label: "Open the invoice", goto: { section: "invoicing", tab: "list", sel: saleNo(sale) } },
        });
      }
      return { scope: `${checked} invoice line${checked === 1 ? "" : "s"} in the last 90 days`, checked, rows };
    },
  },
  {
    id: "k13", area: "Cash & receivables", name: "Receivables are consistent",
    rule: "No invoice is paid more than its total, and cancelled invoices carry no payments",
    run(ctx) {
      const sales = (ctx.data.sales || []).filter((sale) => sale && saleDocType(sale) !== "DR");
      /** @type {any[]} */
      const rows = [];
      for (const sale of sales) {
        const paid = num(sale.paid);
        const net = num(sale.net);
        const ref = `${saleNo(sale)} · ${sale.client || ""}`;
        const open = { kind: "open", label: "Open the invoice", goto: { section: "invoicing", tab: "list", sel: saleNo(sale) } };
        if (isCancelledSale(sale)) { if (paid > 0.01) rows.push({ key: `${saleNo(sale)}:cancelled`, title: "Cancelled invoice still has payments applied", ref, expected: "₱0 paid", found: `${pesoText(paid)} paid`, amount: round2(paid), impact: "The payment should move to the replacement invoice or be refunded.", fix: open }); continue; }
        if (paid - net > 0.01) rows.push({ key: `${saleNo(sale)}:over`, title: "Invoice paid more than its total", ref, expected: `Paid ≤ ${pesoText(net)}`, found: `Paid ${pesoText(paid)}`, amount: round2(paid - net), impact: `${pesoText(paid - net)} overpaid; receivables are understated.`, fix: open });
        if (paid < -EPS) rows.push({ key: `${saleNo(sale)}:neg`, title: "Invoice has a negative paid amount", ref, expected: "₱0 or more", found: pesoText(paid), amount: Math.abs(paid), impact: "Receivables are overstated.", fix: open });
      }
      return { scope: `${sales.length} invoice${sales.length === 1 ? "" : "s"}`, checked: sales.length, rows };
    },
  },
  {
    id: "k14", area: "Cash & receivables", name: "Invoice balances are correct",
    rule: "An invoice’s paid amount = the collections applied to it (balance = total − payments)",
    run(ctx) {
      /** @type {Map<string, { sum: number, n: number }>} */
      const byInvoice = new Map();
      for (const payment of ctx.data.payments || []) {
        if (!paymentCounts(payment)) continue;
        const id = String(payment.invoice || "");
        const entry = byInvoice.get(id) || { sum: 0, n: 0 };
        entry.sum += num(payment.amount); entry.n += 1;
        byInvoice.set(id, entry);
      }
      const sales = (ctx.data.sales || []).filter((sale) => sale && !isCancelledSale(sale) && saleDocType(sale) !== "DR");
      /** @type {any[]} */
      const rows = [];
      let checked = 0;
      let skipped = 0;
      for (const sale of sales) {
        if (sale.migrated) { skipped += 1; continue; }
        const applied = byInvoice.get(saleNo(sale)) || (sale.id ? byInvoice.get(String(sale.id)) : undefined) || { sum: 0, n: 0 };
        checked += 1;
        const paid = round2(num(sale.paid));
        const want = round2(applied.sum);
        if (Math.abs(paid - want) <= 0.01) continue;
        const net = num(sale.net);
        rows.push({
          key: saleNo(sale), title: "Invoice balance doesn’t match its payments", ref: `${saleNo(sale)} · ${sale.client || ""}`,
          expected: `Paid ${pesoText(want)} (${applied.n} payment${applied.n === 1 ? "" : "s"})`, found: `Paid ${pesoText(paid)}`, amount: round2(Math.abs(paid - want)),
          impact: `The balance shows ${pesoText(net - paid)} but the payments on file leave ${pesoText(net - want)}.`,
          fix: { kind: "apply", label: `Set paid to ${pesoText(want)}`, ops: [{ op: "set", module: "sales", key: keyOf("sales", sale), field: "paid", before: sale.paid ?? null, after: want }], preview: [["Paid", `${pesoText(paid)} → ${pesoText(want)}`], ["Balance", `${pesoText(net - paid)} → ${pesoText(net - want)}`]] },
        });
      }
      return { scope: `${checked} invoice${checked === 1 ? "" : "s"}`, checked, rows, note: skipped ? `${skipped} imported invoice${skipped === 1 ? "" : "s"} skipped: their paid amounts came from the import, not from collections.` : "" };
    },
  },
  {
    id: "k15", area: "Cash & receivables", name: "Every receipt is fully applied",
    rule: "A collection’s amount = the amounts applied to invoices",
    run(ctx) {
      const requests = (ctx.data.paymentRequests || []).filter((request) => request && /approved|completed/i.test(String(request.requestStatus || "")));
      /** @type {Map<string, number>} */
      const applied = new Map();
      for (const payment of ctx.data.payments || []) {
        if (payment?.voided) continue;
        const cv = String(payment.paymentRequestCvNo || payment.receiptNo || "");
        applied.set(cv, (applied.get(cv) || 0) + num(payment.amount));
      }
      /** @type {any[]} */
      const rows = [];
      for (const request of requests) {
        const cv = String(request.cvNo || request.id || "");
        const total = round2(num(request.total || request.amount));
        const got = round2(applied.get(cv) || 0);
        if (Math.abs(total - got) <= 0.01) continue;
        rows.push({
          key: cv, title: got < total ? "Collection not fully applied to invoices" : "More applied than was collected", ref: `${cv} · ${request.client || request.employee || ""}`,
          expected: `${pesoText(total)} applied`, found: `${pesoText(got)} applied`, amount: round2(Math.abs(total - got)),
          impact: got < total ? `${pesoText(total - got)} was collected but isn’t applied to any invoice. A payment record may be missing.` : `${pesoText(got - total)} more is applied than the collection’s amount.`,
          fix: { kind: "open", label: "Open the collection", goto: { section: "collections", tab: "register", sel: cv } },
        });
      }
      return { scope: `${requests.length} approved collection${requests.length === 1 ? "" : "s"}`, checked: requests.length, rows };
    },
  },
  {
    id: "k16", area: "Cash & receivables", name: "Deposits match the bank",
    rule: "Each deposit appears on the bank statement for the same amount (within 3 days)",
    run(ctx) {
      const statements = (ctx.data.bankStatements || []).filter((statement) => statement && Array.isArray(statement.lines));
      if (!statements.length) return cant("No bank statement has been uploaded yet. Upload one to run this check.");
      const deposits = (ctx.data.payments || []).filter((payment) => payment && !payment.voided && String(payment.collectionStatus || "") === "Deposited").map((payment) => ({ payment, day: depositDay(payment), amount: round2(num(payment.amount)) })).filter((entry) => entry.day);
      const covered = deposits.filter((entry) => statements.some((statement) => entry.day >= dayOf(statement.from) && entry.day <= dayOf(statement.to)));
      if (!covered.length) return cant(`No uploaded statement covers a deposit date. The latest statement ends ${dayLabel(statements.map((s) => dayOf(s.to)).sort().pop() || "")}.`);
      const credits = statements.flatMap((statement) => statement.lines.map((/** @type {any} */ line) => ({ day: dayOf(line.date), amount: round2(num(line.amount)), used: false }))).filter((line) => line.amount > 0);
      const near = (/** @type {string} */ a, /** @type {string} */ b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 3 * 86400000;
      /** @type {typeof covered} */
      const unmatched = [];
      for (const entry of covered) {
        const credit = credits.find((line) => !line.used && Math.abs(line.amount - entry.amount) <= 0.01 && near(line.day, entry.day));
        if (credit) credit.used = true; else unmatched.push(entry);
      }
      // Several checks/receipts deposited on one slip show as one credit: match the day's total.
      /** @type {Map<string, typeof covered>} */
      const byDay = new Map();
      for (const entry of unmatched) byDay.set(entry.day, [...(byDay.get(entry.day) || []), entry]);
      /** @type {any[]} */
      const rows = [];
      for (const [day, list] of byDay) {
        const total = round2(list.reduce((s, entry) => s + entry.amount, 0));
        const credit = list.length > 1 ? credits.find((line) => !line.used && Math.abs(line.amount - total) <= 0.01 && near(line.day, day)) : null;
        if (credit) { credit.used = true; continue; }
        for (const entry of list) rows.push({
          key: String(entry.payment.id || `${entry.payment.receiptNo}|${entry.payment.invoice}`), title: "Deposit not found on the bank statement",
          ref: `${entry.payment.receiptNo || ""} · ${entry.payment.client || ""} · ${dayLabel(day)}`, expected: `Credit of ${pesoText(entry.amount)} near ${dayLabel(day)}`, found: "No matching credit", amount: entry.amount,
          impact: "Either the deposit didn’t reach the bank, or it was recorded with a different amount or date.",
          fix: { kind: "open", label: "Open the collection", goto: { section: "collections", tab: "register", sel: String(entry.payment.paymentRequestCvNo || entry.payment.receiptNo || "") } },
        });
      }
      return { scope: `${covered.length} deposit${covered.length === 1 ? "" : "s"} in ${statements.length} statement${statements.length === 1 ? "" : "s"}`, checked: covered.length, rows };
    },
  },
  {
    id: "k17", area: "Cash & receivables", name: "Cash on hand = undeposited cash",
    rule: "Today’s counted cash = cash receipts not yet deposited",
    run(ctx) {
      const todays = (ctx.data.cashCounts || []).filter((count) => count && dayOf(count.date || count.at) === ctx.today);
      if (!todays.length) return cant("No cash count has been entered today. Enter today’s count to run this check.");
      /** @type {Map<string, any>} */
      const latest = new Map();
      for (const count of todays) { const branch = String(count.branch || "All"); if (!latest.has(branch) || String(count.at || "") > String(latest.get(branch).at || "")) latest.set(branch, count); }
      const counted = round2([...latest.values()].reduce((s, count) => s + num(count.amount), 0));
      const undeposited = (ctx.data.payments || []).filter((payment) => payment && /cash/i.test(String(payment.method || "")) && !payment.voided && payment.appliedToInvoice !== false && !/deposited|bounced/i.test(String(payment.collectionStatus || "")));
      const expected = round2(undeposited.reduce((s, payment) => s + num(payment.amount), 0));
      const rows = Math.abs(counted - expected) > 0.01 ? [{
        key: ctx.today, title: counted < expected ? "Cash on hand is short" : "Cash on hand is over", ref: `Cash count ${dayLabel(ctx.today)} · ${[...latest.keys()].join(", ")}`,
        expected: `${pesoText(expected)} (${undeposited.length} undeposited cash receipt${undeposited.length === 1 ? "" : "s"})`, found: `${pesoText(counted)} counted`, amount: round2(Math.abs(counted - expected)),
        impact: counted < expected ? `${pesoText(expected - counted)} of recorded cash isn’t in the cash box.` : `${pesoText(counted - expected)} more cash than the receipts explain.`, fix: null,
      }] : [];
      return { scope: `${undeposited.length} undeposited cash receipt${undeposited.length === 1 ? "" : "s"}`, checked: undeposited.length, rows };
    },
  },
  {
    id: "k18", area: "Master data", name: "Items have a cost and price",
    rule: "Active items have a cost, and a list price unless quoted per deal",
    run(ctx) {
      const noCost = ctx.items.filter((item) => !(num(item.cost) > 0));
      const noPrice = ctx.items.filter((item) => !(num(item.price) > 0) && !item.quotedPerDeal);
      /** @type {any[]} */
      const rows = [];
      const sample = (/** @type {any[]} */ list) => list.slice(0, 2).map((item) => item.name || item.code).join(", ");
      if (noCost.length) {
        const fillable = noCost.filter((item) => ctx.latestPoPrice.get(String(item.code || "")));
        rows.push({
          key: "no-cost", title: `${noCost.length === 1 ? "An item has" : `${noCost.length} items have`} no cost`, ref: `${noCost.length} item${noCost.length === 1 ? "" : "s"} · e.g. ${sample(noCost)}`,
          expected: "Cost entered", found: "Blank", amount: 0, impact: "Margin and stock value are wrong for these items.",
          fix: fillable.length
            ? { kind: "apply", label: "Fill costs from the last PO", ops: fillable.map((item) => ({ op: "set", module: "items", key: keyOf("items", item), field: "cost", before: item.cost ?? null, after: /** @type {any} */ (ctx.latestPoPrice.get(String(item.code))).price })), preview: [[`${fillable.length} item${fillable.length === 1 ? "" : "s"}`, "Cost filled from their last PO"], ...(noCost.length > fillable.length ? [[`${noCost.length - fillable.length} item${noCost.length - fillable.length === 1 ? "" : "s"}`, "No PO found, needs manual entry"]] : [])] }
            : { kind: "open", label: "Open Items", goto: { section: "masterlists", tab: "items", sel: "" } },
        });
      }
      if (noPrice.length) rows.push({
        key: "no-price", title: `${noPrice.length === 1 ? "An item has" : `${noPrice.length} items have`} no list price`, ref: `${noPrice.length} item${noPrice.length === 1 ? "" : "s"} · e.g. ${sample(noPrice)}`,
        expected: "List price, or marked quoted per deal", found: "Blank", amount: 0, impact: "Invoices can’t be checked against a price, and margins can’t be shown.",
        fix: { kind: "open", label: "Open Items", goto: { section: "masterlists", tab: "items", sel: "" } },
      });
      return { scope: `${ctx.items.length} active item${ctx.items.length === 1 ? "" : "s"}`, checked: ctx.items.length, rows };
    },
  },
  {
    id: "k19", area: "Master data", name: "No duplicate clients",
    rule: "No two active clients share a TIN, phone number, address or name",
    run(ctx) {
      const clients = (ctx.data.clients || []).filter((client) => client && !isArchived(client) && client.name);
      /** @type {Map<string, any[]>} */
      const groups = new Map();
      const add = (/** @type {string} */ key, /** @type {any} */ client) => { if (key) groups.set(key, [...(groups.get(key) || []), client]); };
      for (const client of clients) {
        const tin = digits(client.tin);
        if (tin.length >= 9 && !/^0+$/.test(tin)) add(`TIN|${tin.slice(0, 9)}`, client);
        for (const phone of String(client.contact || "").match(/\+?\d[\d\s-]{6,}\d/g) || []) { const d = digits(phone).slice(-10); if (d.length >= 7) add(`phone|${d}`, client); }
        const address = squash(client.address);
        if (address.length >= 12) add(`address|${address}`, client);
        const name = clientNameKey(client.name);
        if (name.length >= 4) add(`name|${name}`, client);
      }
      /** @type {Map<string, { a: any, b: any, why: Set<string> }>} */
      const pairs = new Map();
      for (const [key, list] of groups) {
        const unique = [...new Set(list)];
        for (let i = 0; i < unique.length; i += 1) for (let j = i + 1; j < unique.length; j += 1) {
          const [a, b] = [unique[i], unique[j]].sort((x, y) => String(x.name).localeCompare(String(y.name)));
          const id = `${a.name}||${b.name}`;
          const entry = pairs.get(id) || { a, b, why: new Set() };
          entry.why.add(key.split("|")[0]);
          pairs.set(id, entry);
        }
      }
      /** @type {Map<string, number>} */
      const salesBy = new Map();
      for (const sale of ctx.data.sales || []) salesBy.set(String(sale?.client || ""), (salesBy.get(String(sale?.client || "")) || 0) + 1);
      /** @type {any[]} */
      const rows = [];
      for (const [id, { a, b, why }] of pairs) {
        const [keep, drop] = (salesBy.get(String(b.name)) || 0) > (salesBy.get(String(a.name)) || 0) ? [b, a] : [a, b];
        const merge = mergeClientOps(ctx.data, String(drop.name), String(keep.name), drop);
        rows.push({
          key: id, title: "Possible duplicate client", ref: `${a.name} / ${b.name}`,
          expected: "One client record", found: `Two, same ${[...why].join(" and ")}`, amount: 0,
          impact: `Balances and history are split across two records. ${drop.name} has ${merge.moved} record${merge.moved === 1 ? "" : "s"} that would move.`,
          fix: { kind: "apply", label: `Merge into ${keep.name}`, ops: merge.ops, preview: [[String(drop.name), `Merged into ${keep.name} · archived`], ...merge.preview] },
        });
      }
      return { scope: `${clients.length} active client${clients.length === 1 ? "" : "s"}`, checked: clients.length, rows };
    },
  },
];

/** @param {any[]} sales */
function servedQtyByPo(sales) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const sale of sales) {
    if (!sale?.po || isCancelledSale(sale)) continue;
    for (const line of saleLines(sale)) { const key = `${sale.po}|${line.code}`; out.set(key, (out.get(key) || 0) + num(line.qty)); }
  }
  return out;
}

/** The newest posted count per branch. @param {any[]} counts */
export function latestCountPerBranch(counts) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const count of counts) {
    if (!count || count.status === "Draft") continue;
    const branch = String(count.branch || "");
    if (!out.has(branch) || String(count.at || count.date || "") > String(out.get(branch).at || out.get(branch).date || "")) out.set(branch, count);
  }
  return [...out.values()];
}
/** Latest counted line per inventory key. @param {any[]} counts */
function latestCountLines(counts) {
  /** @type {Map<string, { at: string, line: any }>} */
  const out = new Map();
  for (const count of counts) {
    if (!count || count.status === "Draft") continue;
    for (const line of count.lines || []) {
      const key = String(line.key || inventoryKey({ ...line, branch: count.branch }));
      const at = String(count.at || count.date || "");
      const prev = out.get(key);
      if (!prev || at > prev.at) out.set(key, { at, line });
    }
  }
  return out;
}

/** @param {string} day @param {number} days */
function shiftDay(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The price a client should pay: its list's own price, else the list's % off the item price, else the item price. @param {ReconCtx} ctx @param {string} code @param {any} list @param {string} day */
export function listPriceFor(ctx, code, list, day) {
  const item = ctx.itemByCode.get(code);
  if (item?.quotedPerDeal) return 0;
  const base = num(item?.price);
  const inWindow = !list || ((!list.from || day >= dayOf(list.from)) && (!list.to || day <= dayOf(list.to)));
  if (list && inWindow) {
    const own = (list.prices || []).find((/** @type {any} */ entry) => String(entry.code) === code);
    if (own && num(own.price) > 0) return num(own.price);
    if (num(list.discountPct) > 0 && base > 0) return round2(base * (1 - num(list.discountPct) / 100));
  }
  return base;
}

/** Date a payment was deposited (from its status history, else when it was recorded). @param {any} payment */
export function depositDay(payment) {
  const history = Array.isArray(payment?.statusHistory) ? payment.statusHistory : [];
  const entry = [...history].reverse().find((/** @type {any} */ item) => /deposited/i.test(String(item?.status || "")));
  return dayOf(entry?.date || entry?.at || payment?.depositedAt || payment?.dateRecorded || payment?.date);
}

// Fields that name a client, per module (paymentRequests use `employee` for the client).
const CLIENT_FIELDS = /** @type {[string, string[]][]} */ ([
  ["sales", ["client"]], ["purchaseOrders", ["client"]], ["payments", ["client"]], ["paymentRequests", ["client", "employee"]],
  ["warranties", ["client"]], ["productIssues", ["client"]], ["pendingCreditInvoices", ["client"]],
]);
const MERGE_LABELS = /** @type {Record<string, string>} */ ({ sales: "Invoices moved", purchaseOrders: "Client POs moved", payments: "Payments moved", paymentRequests: "Collections moved", warranties: "Warranties moved", productIssues: "Support reports moved", pendingCreditInvoices: "Credit requests moved" });
/** Ops that move every record from one client name to another and archive the duplicate. @param {Record<string, any[]>} data @param {string} from @param {string} to @param {any} dropRecord */
export function mergeClientOps(data, from, to, dropRecord) {
  const ops = [];
  /** @type {[string, string][]} */
  const preview = [];
  let moved = 0;
  for (const [module, fields] of CLIENT_FIELDS) {
    let n = 0;
    for (const record of data[module] || []) {
      let touched = false;
      for (const field of fields) {
        if (String(record?.[field] || "") !== from) continue;
        ops.push({ op: "set", module, key: keyOf(module, record), field, before: from, after: to });
        touched = true;
      }
      if (touched) n += 1;
    }
    if (n) { preview.push([MERGE_LABELS[module] || `${module} moved`, String(n)]); moved += n; }
  }
  ops.push({ op: "set", module: "clients", key: keyOf("clients", dropRecord), field: "archived", before: dropRecord.archived ?? null, after: true });
  ops.push({ op: "set", module: "clients", key: keyOf("clients", dropRecord), field: "mergedInto", before: dropRecord.mergedInto ?? null, after: to });
  if (!moved) preview.push(["Records moved", "0"]);
  return { ops, preview, moved };
}

/**
 * Runs checks. Returns per-check results and every difference row (with its check id).
 * @param {Record<string, any[]>} data @param {{ now?: Date, only?: string[] }} [options]
 */
export function runRecon(data, { now = new Date(), only } = {}) {
  const ctx = reconContext(data, now);
  /** @type {Record<string, any>} */
  const results = {};
  /** @type {any[]} */
  const rows = [];
  for (const check of RECON_CHECKS) {
    if (only && !only.includes(check.id)) continue;
    let out;
    try { out = check.run(ctx) || {}; }
    catch (error) { out = cant(`The check failed to run: ${error instanceof Error ? error.message : String(error)}`); }
    const list = Array.isArray(out.rows) ? out.rows : [];
    const status = out.status === "cant" ? "cant" : list.length ? "diff" : "pass";
    results[check.id] = { status, reason: out.reason || "", scope: out.scope || "", checked: num(out.checked), open: list.length, amount: round2(list.reduce((/** @type {number} */ s, /** @type {any} */ row) => s + num(row.amount), 0)), note: out.note || "" };
    for (const row of list) rows.push({ ...row, check: check.id, id: `${check.id}:${row.key}`, fingerprint: fingerprintOf(row) });
  }
  const recordsChecked = Object.values(results).reduce((s, result) => s + num(result.checked), 0);
  return { results, rows, recordsChecked };
}

/** What makes a difference "the same" for Explained items (they reopen when it changes). @param {any} row */
export function fingerprintOf(row) { return JSON.stringify([row.expected, row.found, round2(num(row.amount))]); }

/**
 * Merges a run's rows into the stored differences. Returns only the records that changed.
 * - new rows open; open rows refresh; explained rows stay explained while the values match
 * - fixed/explained/resolved rows whose values changed (or that came back) reopen
 * - open rows of a check that ran and no longer reports them are marked resolved
 * @param {any[]} stored @param {any[]} rows @param {Record<string, any>} results @param {string} at
 */
export function mergeDifferences(stored, rows, results, at) {
  const byId = new Map((stored || []).map((diff) => [String(diff.id), diff]));
  const seen = new Set();
  /** @type {any[]} */
  const changed = [];
  for (const row of rows) {
    seen.add(row.id);
    const prev = byId.get(row.id);
    const base = { id: row.id, check: row.check, key: row.key, title: row.title, ref: row.ref, expected: row.expected, found: row.found, amount: round2(num(row.amount)), impact: row.impact || "", fix: row.fix || null, fingerprint: row.fingerprint, lastSeen: at };
    if (!prev) { changed.push({ ...base, status: "open", firstSeen: at, history: [{ at, action: "Found", by: "Recon" }] }); continue; }
    if (prev.status === "explained" && prev.fingerprint === row.fingerprint) { changed.push({ ...prev, ...base, status: "explained" }); continue; }
    const reopen = prev.status !== "open";
    changed.push({ ...prev, ...base, status: "open", history: reopen ? [{ at, action: prev.status === "explained" ? "Values changed since it was explained" : "Found again", by: "Recon" }, ...(prev.history || [])].slice(0, 30) : prev.history || [] });
  }
  for (const prev of stored || []) {
    if (seen.has(String(prev.id)) || prev.status !== "open") continue;
    const result = results[String(prev.check)];
    if (!result || result.status === "cant") continue;
    changed.push({ ...prev, status: "resolved", resolvedAt: at, history: [{ at, action: "No longer found", by: "Recon" }, ...(prev.history || [])].slice(0, 30) });
  }
  return changed;
}

/** Reads `a.b.0.c` from an object. @param {any} target @param {string} path */
export function getPath(target, path) {
  return String(path).split(".").reduce((value, part) => (value === null || value === undefined ? undefined : value[part]), target);
}
/** Writes `a.b.0.c` (creates objects along the way; null/undefined deletes). @param {any} target @param {string} path @param {any} value */
export function setPath(target, path, value) {
  const parts = String(path).split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (node[part] === null || node[part] === undefined || typeof node[part] !== "object") node[part] = {}; // numeric keys (voided.12) stay object keys; existing arrays are kept
    node = node[part];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) { if (Array.isArray(node)) node[Number(last)] = null; else delete node[last]; }
  else node[last] = value;
  return target;
}
/** Same value for fix purposes (missing = null, numbers to 4 dp). @param {any} a @param {any} b */
export function sameValue(a, b) {
  const norm = (/** @type {any} */ v) => (v === undefined || v === "" ? null : typeof v === "number" ? round4(v) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

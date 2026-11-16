// Masterlists page: items, clients, suppliers, price lists, branches, employees and banks, with a
// completeness flag on every record. Records are still added and edited through the shared
// modal (openModal / openMasterEditModal) and archived through archiveMasterlistRecord, so the
// existing validation, approvals and Audit Log entries apply unchanged. Cost, list-price and
// credit-term changes are logged by the Worker (AUDIT_WATCHED_FIELDS); duplicate merges are
// applied from Recon so they are previewed and can be undone.

const MASTER_TAB_LABELS = /** @type {Record<string, string>} */ ({ overview: "Overview", items: "Items", clients: "Clients", suppliers: "Suppliers", pricelists: "Price lists", branches: "Branches", employees: "Employees", banks: "Banks" });
const MASTER_TABS = Object.keys(MASTER_TAB_LABELS);
const masterSeed = moduleUrlSeed("masterlists", MASTER_TABS);
let masterPageTab = masterSeed.tab;
/** @type {UiViewState} */
let masterView = masterSeed.view;
/** Audit Log entries for "Recently changed" (loaded once per visit). @type {{ entries: any[] | null, loading: boolean }} */
const masterAudit = { entries: null, loading: false };
/** Allowed difference between an item's cost and its latest supplier PO price before it's flagged. */
const MASTER_COST_TOLERANCE = 0.02;

/** A record's name cell (plain text, not the monospace document-number style). @param {string} text @param {UiAttrs} attrs @param {string} [sub] */
function masterCell(text, attrs, sub = "") { return uiCellDoc(text, attrs, sub, { plain: true }); }
function masterQueryString() { return moduleViewQueryString("masterlists", masterPageTab, "overview", masterView); }
function masterCanEdit() { return canEditModule("masterlists"); }
function masterCanArchive() { return ["Superadmin", "CEO"].includes(String(currentUser?.role)); }
/** @param {number} value */
function masterPeso(value) { return Math.abs(value) >= 1000000 ? pesoShort(value) : peso.format(value).replace(/\.00$/, ""); }
/** @param {unknown} value */
function masterNum(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
/** Case, space and punctuation-insensitive form of a name. @param {unknown} value */
function masterNorm(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** Latest price per item code from approved/received supplier POs. @returns {Map<string, { price: number, po: string, date: string }>} */
function masterLatestPoPrices() {
  /** @type {Map<string, { price: number, po: string, date: string }>} */
  const out = new Map();
  for (const po of data.inventoryPurchaseOrders || []) {
    const status = String(po?.status || "");
    if (!/received|approved|ordered|transit/i.test(status) || /cancel/i.test(status)) continue;
    const date = String(po.date || "").slice(0, 10);
    for (const line of /** @type {any[]} */ (po.lines || [])) {
      const code = String(line?.code || "");
      const price = masterNum(line?.price);
      if (!code || !(price > 0)) continue;
      const prev = out.get(code);
      if (!prev || date >= prev.date) out.set(code, { price, po: String(po.id || ""), date });
    }
  }
  return out;
}
/** Quantity on hand per item code, all branches. */
function masterOnHand() {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const row of data.inventory || []) out.set(String(row.code || ""), (out.get(String(row.code || "")) || 0) + masterNum(row.qty));
  return out;
}

/**
 * What's missing on each record. Every rule here is shown on the Overview ("What makes a record
 * complete"), so the flags never surprise anyone.
 */
const MASTER_RULES = {
  item: [["Code and name", "code"], ["Unit of measure", "uom"], ["Supplier", "supplier"], ["Cost", "cost"], ["List price, or quoted per deal", "price"]],
  client: [["TIN", "tin"], ["Address", "address"], ["Payment terms", "terms"], ["Credit limit", "creditLimit"], ["Required documents", "docs"]],
  supplier: [["TIN", "tin"], ["Payment terms", "terms"], ["How we pay them", "paymentMethod"], ["Bank details, when paid by bank transfer", "bankDetails"]],
};
/** @param {any} item @returns {string[]} */
function masterItemGaps(item) {
  /** @type {string[]} */
  const gaps = [];
  if (!item.code || !item.name) gaps.push("code");
  if (!item.uom) gaps.push("unit");
  if (!item.supplier) gaps.push("supplier");
  if (!(masterNum(item.cost) > 0)) gaps.push("cost");
  if (!(masterNum(item.price) > 0) && !item.quotedPerDeal) gaps.push("list price");
  return gaps;
}
/** @param {any} client @returns {string[]} */
function masterClientGaps(client) {
  /** @type {string[]} */
  const gaps = [];
  if (!String(client.tin || "").trim()) gaps.push("TIN");
  if (!String(client.address || "").trim()) gaps.push("address");
  if (!(masterNum(client.terms) > 0)) gaps.push("terms");
  if (!(masterNum(client.creditLimit) > 0)) gaps.push("credit limit");
  const docs = requiredClientDocs.filter((doc) => attachedFilesFor("client-doc", clientDocRecordId(client.name, doc)).length).length;
  if (docs < requiredClientDocs.length) gaps.push(`${requiredClientDocs.length - docs} doc${requiredClientDocs.length - docs === 1 ? "" : "s"}`);
  return gaps;
}
/** @param {any} supplier @returns {string[]} */
function masterSupplierGaps(supplier) {
  /** @type {string[]} */
  const gaps = [];
  if (!String(supplier.tin || "").trim()) gaps.push("TIN");
  if (!(masterNum(supplier.terms) > 0)) gaps.push("terms");
  if (!supplier.paymentMethod) gaps.push("payment method");
  if (supplier.paymentMethod === "Bank transfer" && !(supplier.bankDetails?.bank && supplier.bankDetails?.accountNo)) gaps.push("bank details");
  return gaps;
}
/** @param {string[]} gaps */
function masterGapPill(gaps) { return gaps.length ? uiPill(`Missing ${gaps.slice(0, 2).join(", ")}${gaps.length > 2 ? ` +${gaps.length - 2}` : ""}`, "amber") : uiPill("Complete", "green"); }

/** Clients that share a TIN or a normalized name with another active client. */
function masterDuplicateClients() {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const client of activeClients()) {
    const keys = [`n:${masterNorm(client.name)}`, client.tin ? `t:${String(client.tin).replace(/\D/g, "")}` : ""].filter((key) => key.length > 2);
    for (const key of keys) groups.set(key, [...(groups.get(key) || []), client]);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ reason: key.startsWith("t:") ? "Same TIN" : "Same name", clients: list }));
}
/** @param {any} item @param {Map<string, { price: number, po: string, date: string }>} latest */
function masterCostOutOfDate(item, latest) {
  const po = latest.get(String(item.code || ""));
  const cost = masterNum(item.cost);
  if (!po || !(cost > 0)) return null;
  const change = (po.price - cost) / cost;
  return Math.abs(change) > MASTER_COST_TOLERANCE ? { ...po, change } : null;
}
/** "A, B and 3 more". @param {any[]} clients */
function masterNames(clients) { const names = clients.map((client) => String(client.name)); return names.length <= 3 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`; }
/** @param {any} client */
function masterClientPriceList(client) { return (data.priceLists || []).find((list) => list.name === client.priceList) || null; }

function loadMasterAudit() {
  if (masterAudit.entries || masterAudit.loading || !effectiveModules().includes("logs")) return;
  masterAudit.loading = true;
  MedlaneAPI.listLogs({ limit: 200 }).then((result) => {
    masterAudit.entries = (result?.entries || []).filter((/** @type {any} */ entry) => /Masterlists/i.test(String(entry.module || "")));
  }).catch(() => { masterAudit.entries = []; }).finally(() => {
    masterAudit.loading = false;
    if (document.body.dataset.activeSection === "masterlists" && masterPageTab === "overview") renderMasterlists();
  });
}

// ----- overview -----------------------------------------------------------------------------
function masterOverviewHtml() {
  const items = activeItems();
  const clients = activeClients();
  const suppliers = activeSuppliers();
  const latest = masterLatestPoPrices();
  const onHand = masterOnHand();
  const itemGaps = items.map((item) => ({ item, gaps: masterItemGaps(item) }));
  const clientGaps = clients.map((client) => ({ client, gaps: masterClientGaps(client) }));
  const supplierGaps = suppliers.map((supplier) => ({ supplier, gaps: masterSupplierGaps(supplier) }));
  const complete = itemGaps.filter((x) => !x.gaps.length).length + clientGaps.filter((x) => !x.gaps.length).length + supplierGaps.filter((x) => !x.gaps.length).length;
  const total = items.length + clients.length + suppliers.length;
  const duplicates = masterDuplicateClients();
  const noCost = itemGaps.filter((x) => x.gaps.includes("cost"));
  const stale = items.map((item) => ({ item, po: masterCostOutOfDate(item, latest) })).filter((x) => x.po);
  const noTin = clientGaps.filter((x) => x.gaps.includes("TIN"));
  const noBank = supplierGaps.filter((x) => x.gaps.includes("bank details"));
  const belowMin = items.filter((item) => masterNum(item.minLevel) > 0 && (onHand.get(String(item.code)) || 0) < masterNum(item.minLevel));
  const goto = (/** @type {string} */ tab, /** @type {string} */ scope = "", /** @type {string} */ sel = "") => ({ "data-wa-goto": `masterlists|${tab}|${scope}|${sel}` });
  const pct = (/** @type {number} */ n, /** @type {number} */ d) => (d ? Math.round((n / d) * 100) : 100);

  /** @type {UiKpi[]} */
  const kpis = [
    { label: "Records complete", value: `${pct(complete, total)}%`, tone: complete === total ? "green" : "amber", sub: `${complete} of ${total} items, clients and suppliers` },
    { label: "Items", value: String(items.length), tone: "blue", sub: `${noCost.length} without cost · ${belowMin.length} below min level` },
    { label: "Clients", value: String(clients.length), tone: "blue", sub: `${plural(duplicates.length, "possible duplicate")} · ${noTin.length} missing TIN` },
    { label: "Suppliers", value: String(suppliers.length), tone: "blue", sub: `${noBank.length} missing bank details` },
  ];

  /** @type {UiInsight[]} */
  const fixes = [];
  const costValue = (/** @type {any} */ item) => (onHand.get(String(item.code)) || 0) * Math.max(masterNum(item.price), latest.get(String(item.code))?.price || 0);
  if (stale.length) {
    const top = [...stale].sort((a, b) => costValue(b.item) - costValue(a.item))[0];
    const po = /** @type {{ price: number, po: string, change: number }} */ (top.po);
    fixes.push({ tone: "red", title: stale.length === 1 ? `${top.item.name} cost is out of date` : `${stale.length} item costs are out of date`, text: `${top.item.name}: ${masterPeso(masterNum(top.item.cost))} on file, last PO ${po.po} at ${masterPeso(po.price)} (${po.change > 0 ? "+" : ""}${Math.round(po.change * 100)}%). Margins use the cost on file.`, action: { label: "Review", attrs: goto("items", "stale", stale.length === 1 ? String(top.item.code) : "") } });
  }
  if (noCost.length) fixes.push({ tone: "amber", title: `${plural(noCost.length, "item")} ${noCost.length === 1 ? "has" : "have"} no cost`, text: "Margin and stock value can’t be computed for them.", action: { label: "Show", attrs: goto("items", "incomplete") } });
  if (duplicates.length) fixes.push({ tone: "amber", title: `Possible duplicate client${duplicates.length === 1 ? "" : "s"}`, text: `${duplicates[0].reason}: ${masterNames(duplicates[0].clients)}.${duplicates.length > 1 ? ` ${plural(duplicates.length - 1, "other group")} too.` : ""} Merges are applied in Recon (check K19) so they’re logged and can be undone.`, action: { label: "Show", attrs: goto("clients", "duplicate") } });
  if (noTin.length) fixes.push({ tone: "amber", title: `${plural(noTin.length, "client")} missing TIN`, text: "Needed for VAT invoices and BIR forms.", action: { label: "Show", attrs: goto("clients", "incomplete") } });
  if (noBank.length) fixes.push({ tone: "amber", title: noBank.length === 1 ? `${noBank[0].supplier.name} has no bank details` : `${noBank.length} suppliers have no bank details`, text: "They’re paid by bank transfer, so payables can’t be released without the account.", action: { label: "Show", attrs: goto("suppliers", "incomplete", noBank.length === 1 ? String(noBank[0].supplier.code || noBank[0].supplier.name) : "") } });
  if (belowMin.length) fixes.push({ tone: "slate", title: `${plural(belowMin.length, "item")} below minimum level`, text: `${belowMin.slice(0, 3).map((item) => item.name).join(", ")}${belowMin.length > 3 ? "…" : ""}`, action: { label: "Show", attrs: goto("items", "belowmin") } });

  const share = (/** @type {string} */ label, /** @type {number} */ n, /** @type {number} */ d) => /** @type {UiHBar} */ ({ label, value: pct(n, d), display: `${pct(n, d)}%`, sub: `${n} of ${d}`, target: 100, tone: /** @type {UiTone} */ (pct(n, d) >= 95 ? "green" : pct(n, d) >= 80 ? "amber" : "red") });
  const bars = [
    share("Item cost", items.length - noCost.length, items.length),
    share("Item list price", itemGaps.filter((x) => !x.gaps.includes("list price")).length, items.length),
    share("Client TIN", clients.length - noTin.length, clients.length),
    share("Client credit limit", clientGaps.filter((x) => !x.gaps.includes("credit limit")).length, clients.length),
    share("Supplier terms", supplierGaps.filter((x) => !x.gaps.includes("terms")).length, suppliers.length),
    share("Supplier bank details", suppliers.length - noBank.length, suppliers.length),
  ];
  const rules = Object.entries(MASTER_RULES).map(([type, list]) => `<div><dt>${escapeHtml(type === "item" ? "Items" : type === "client" ? "Clients" : "Suppliers")}</dt><dd>${escapeHtml(list.map(([label]) => label).join(" · "))}</dd></div>`).join("");
  const changed = masterAudit.entries;
  const recent = !effectiveModules().includes("logs") ? `<p class="ui-muted">Needs Audit Log access.</p>`
    : !changed ? `<p class="ui-muted">Loading…</p>`
    : uiInsightList(changed.slice(0, 6).map((entry) => ({ tone: /** @type {UiTone} */ (/price|cost/i.test(String(entry.action)) ? "amber" : /archiv|merge/i.test(String(entry.action)) ? "red" : "slate"), title: String(entry.action || "Changed"), text: `${entry.record || ""} · ${entry.user || "System"} · ${uiDate(String(entry.created_at || entry.at || entry.date || ""))}` })), "No masterlist changes in the latest Audit Log entries.");

  return uiKpiCards(kpis) + uiDashboardGrid([
    [
      { span: 2, title: "Records to fix", sub: "Incomplete or inconsistent records, most costly first. Cost and duplicate fixes are applied in Recon so they’re logged.", body: uiInsightList(fixes, "Every item, client and supplier has the fields it needs.") },
      { span: 1, title: "Completeness by field", sub: "Share of active records with the field filled", body: uiHBars({ items: bars, caption: "Completeness by field" }) },
    ],
    [
      { span: 2, title: "Recently changed", sub: "From the Audit Log", body: recent, link: effectiveModules().includes("logs") ? { label: "Open Audit Log", attrs: { "data-wa-goto": "logs|||" } } : undefined },
      { span: 1, title: "Rules", sub: "What makes a record complete", body: `<dl class="ui-dl recon-facts">${rules}</dl>` },
    ],
  ]);
}

// ----- tabs -----------------------------------------------------------------------------------
/** Row buttons shared by every archivable list. @param {string} type @param {any[]} list @param {any} record */
function masterRowActions(type, list, record) {
  const index = list.indexOf(record);
  if (isArchived(record)) return masterCanArchive() ? [uiButton("Restore", { "data-master-restore": type, "data-index": index })] : [];
  return [
    ...(masterCanEdit() ? [uiButton("Edit", { "data-master-edit": type, "data-index": index }, { primary: true })] : []),
    ...(masterCanArchive() ? [uiButton("Archive", { "data-master-archive": type, "data-index": index }, { danger: true })] : []),
  ];
}
/** @param {any} record */
function masterStatusPill(record) { return isArchived(record) ? uiPill("Archived", "slate") : /hold|inactive/i.test(String(record.status || "")) ? uiPill(String(record.status), "amber") : ""; }

/** @param {string} tab @returns {UiView} */
function masterTabModel(tab) {
  const select = (/** @type {string} */ id) => uiViewSelect("master", id);
  const add = (/** @type {string} */ label, /** @type {string} */ type) => (masterCanEdit() ? [uiButton(label, { "data-master-add": type }, { size: "sm", primary: true })] : []);
  const archivedChip = /** @type {UiViewChip} */ ({ key: "archived", label: "Archived", tone: "slate" });

  if (tab === "items") {
    const latest = masterLatestPoPrices();
    const onHand = masterOnHand();
    const rows = data.items.map(/** @returns {UiViewRow} */ (item) => {
      const gaps = masterItemGaps(item);
      const stale = masterCostOutOfDate(item, latest);
      const cost = masterNum(item.cost);
      const price = masterNum(item.price);
      const margin = cost > 0 && price > 0 ? (price - cost) / price : null;
      const qty = onHand.get(String(item.code)) || 0;
      const below = masterNum(item.minLevel) > 0 && qty < masterNum(item.minLevel);
      const archived = isArchived(item);
      const id = String(item.code || item.name);
      return {
        id, branches: [], scopes: archived ? ["archived"] : ["active", ...(gaps.length ? ["incomplete"] : []), ...(stale ? ["stale"] : []), ...(below ? ["belowmin"] : []), ...(item.quotedPerDeal ? ["quoted"] : [])],
        search: [item.code, item.name, item.brand, item.supplier, item.classification, item.category].join(" "),
        sortValues: { item: String(item.name || ""), supplier: String(item.supplier || ""), cost, price, margin: margin ?? -1, qty },
        csv: [item.code, item.name, item.brand, item.classification || item.category || "", item.supplier, item.uom || "", cost || "", item.quotedPerDeal ? "Quoted per deal" : price || "", margin === null ? "" : `${Math.round(margin * 100)}%`, qty, item.minLevel || "", gaps.join("; ")],
        cells: [
          masterCell(String(item.name || item.code), select(id), [item.code, item.brand].filter(Boolean).join(" · ")),
          escapeHtml(String(item.classification || item.category || "—")),
          escapeHtml(String(item.supplier || "—")),
          `${uiCellNum(cost ? masterPeso(cost) : "—")}${stale ? `<div class="ui-sub t-red-text">PO ${escapeHtml(masterPeso(stale.price))}</div>` : ""}`,
          uiCellNum(item.quotedPerDeal ? "Per deal" : price ? masterPeso(price) : "—"),
          uiCellNum(margin === null ? "—" : `${Math.round(margin * 100)}%`),
          `${uiCellNum(String(qty))}${below ? `<div class="ui-sub t-amber-text">min ${escapeHtml(String(item.minLevel))}</div>` : ""}`,
          masterStatusPill(item) || (stale ? uiPill("Cost out of date", "red") : masterGapPill(gaps)),
        ],
        detail: () => ({
          eyebrow: [item.code, item.brand].filter(Boolean).join(" · "), title: String(item.name || item.code), pill: archived ? { text: "Archived", tone: "slate" } : gaps.length ? { text: "Incomplete", tone: "amber" } : { text: "Complete", tone: "green" }, closeAttrs: { "data-master-close": "" }, label: "Item details",
          fields: [
            { label: "Supplier", value: String(item.supplier || "—") }, { label: "Category", value: String(item.classification || item.category || "—") },
            { label: "Unit", value: String(item.uom || "—") }, { label: "Pack size", value: item.packSize ? String(item.packSize) : "—" },
            { label: "Cost", value: cost ? masterPeso(cost) : "—", sub: stale ? `Last PO ${stale.po}: ${masterPeso(stale.price)}` : latest.get(String(item.code)) ? `Matches last PO ${latest.get(String(item.code))?.po}` : "" },
            { label: "List price", value: item.quotedPerDeal ? "Quoted per deal" : price ? masterPeso(price) : "—", sub: "VAT inclusive" },
            { label: "Margin", value: margin === null ? "—" : `${Math.round(margin * 100)}%` },
            { label: "On hand", value: String(qty), sub: item.minLevel ? `Minimum ${item.minLevel}` : "No minimum set" },
          ],
          note: stale ? { text: "The cost on file differs from the latest supplier PO. Update it here, or apply the Recon fix (check K14) so the change is previewed and logged.", tone: "red" } : gaps.length ? { text: `Missing: ${gaps.join(", ")}.`, tone: "amber" } : undefined,
          actions: masterRowActions("item", data.items, item),
        }),
      };
    });
    const active = rows.filter((row) => row.scopes.includes("active"));
    const count = (/** @type {string} */ scope) => rows.filter((row) => row.scopes.includes(scope)).length;
    return {
      title: "Items", intro: "Every product we buy and sell, with its cost, list price (VAT inclusive) and stock on hand. Cost and price changes are written to the Audit Log.", placeholder: "Code, name, brand or supplier", actions: add("Add item", "item"), minWidth: 1080,
      stats: [
        { label: "Active items", value: active.length, sub: `${active.length - count("incomplete")} complete`, tone: "blue", scope: "active" },
        { label: "Incomplete", value: count("incomplete"), sub: "Missing supplier, unit, cost or price", tone: "amber", scope: "incomplete" },
        { label: "Cost out of date", value: count("stale"), sub: "Differs from the last PO", tone: "red", scope: "stale" },
        { label: "Below min level", value: count("belowmin"), sub: "Across all branches", tone: "slate", scope: "belowmin" },
      ],
      cols: [{ key: "item", label: "Item", sortable: true }, { key: "cat", label: "Category" }, { key: "supplier", label: "Supplier", sortable: true }, { key: "cost", label: "Cost", align: "right", sortable: true }, { key: "price", label: "List price", align: "right", sortable: true }, { key: "margin", label: "Margin", align: "right", sortable: true }, { key: "qty", label: "On hand", align: "right", sortable: true }, { key: "status", label: "Status" }],
      csvName: "items.csv", csvHeader: ["Code", "Item", "Brand", "Category", "Supplier", "Unit", "Cost", "List price", "Margin", "On hand", "Min level", "Missing"],
      rows, empty: ["No items", "Add an item or import the masterlist."], defaultSort: { key: "item", dir: 1 },
      chips: [{ key: "active", label: "Active", tone: "blue" }, { key: "incomplete", label: "Incomplete", tone: "amber" }, { key: "stale", label: "Cost out of date", tone: "red" }, { key: "belowmin", label: "Below min", tone: "slate" }, archivedChip], defaultScope: "active",
    };
  }

  if (tab === "clients") {
    const duplicateNames = new Set(masterDuplicateClients().flatMap((group) => group.clients.map((client) => client.name)));
    const rows = data.clients.map(/** @returns {UiViewRow} */ (client) => {
      const gaps = masterClientGaps(client);
      const used = clientBalance(client.name);
      const limit = masterNum(client.creditLimit);
      const over = limit > 0 && used > limit;
      const archived = isArchived(client);
      const dup = !archived && duplicateNames.has(client.name);
      const id = String(client.code || client.name);
      const list = masterClientPriceList(client);
      return {
        id, branches: [], scopes: archived ? ["archived"] : ["active", ...(gaps.length ? ["incomplete"] : []), ...(dup ? ["duplicate"] : []), ...(over ? ["overlimit"] : [])],
        search: [client.code, client.name, client.area, client.salesperson, client.tin, client.dealer, client.priceList].join(" "),
        sortValues: { client: String(client.name || ""), area: String(client.area || ""), terms: masterNum(client.terms), limit, used },
        csv: [client.code || "", client.name, client.area || "", client.dealer || "", client.salesperson || "", client.tin || "", client.terms || "", limit, used.toFixed(2), client.priceList || "Standard", gaps.join("; ")],
        cells: [
          masterCell(String(client.name), select(id), [client.code, client.dealer].filter(Boolean).join(" · ")),
          uiCellText(String(client.area || "—"), String(client.salesperson || "Unassigned")),
          uiCellNum(`${masterNum(client.terms) || 30} days`),
          uiCellNum(limit ? masterPeso(limit) : "—"),
          `${uiCellNum(masterPeso(used))}${over ? `<div class="ui-sub t-red-text">over limit</div>` : ""}`,
          escapeHtml(list ? list.name : "Standard"),
          docUploadButtons(client),
          masterStatusPill(client) || (dup ? uiPill("Possible duplicate", "red") : masterGapPill(gaps)),
        ],
        detail: () => ({
          eyebrow: [client.code, client.area].filter(Boolean).join(" · "), title: String(client.name), pill: archived ? { text: "Archived", tone: "slate" } : dup ? { text: "Possible duplicate", tone: "red" } : gaps.length ? { text: "Incomplete", tone: "amber" } : { text: "Complete", tone: "green" }, closeAttrs: { "data-master-close": "" }, label: "Client details",
          fields: [
            { label: "TIN", value: String(client.tin || "—"), mono: true }, { label: "Account type", value: String(client.dealer || "—") },
            { label: "Sales rep", value: String(client.salesperson || "Unassigned") }, { label: "Terms", value: `${masterNum(client.terms) || 30} days` },
            { label: "Credit limit", value: limit ? masterPeso(limit) : "—" }, { label: "AR used", value: masterPeso(used), sub: limit ? `${Math.round((used / limit) * 100)}% of limit` : "" },
            { label: "Price list", value: list ? list.name : "Standard", sub: list?.discountPct ? `${list.discountPct}% off list` : "" },
            { label: "Address", value: String(client.address || "—"), wide: true },
          ],
          note: dup ? { text: "Another client has the same name or TIN. Merging is done from Recon (check K19): the merge is previewed, logged and can be undone.", tone: "red" } : gaps.length ? { text: `Missing: ${gaps.join(", ")}.`, tone: "amber" } : undefined,
          actions: [uiButton("Documents", { "data-open-client-docs": client.name }), ...masterRowActions("client", data.clients, client)],
        }),
      };
    });
    const count = (/** @type {string} */ scope) => rows.filter((row) => row.scopes.includes(scope)).length;
    return {
      title: "Clients", intro: "Hospitals, labs and dealers we invoice. Credit limits and terms drive the invoice checks; changes to them are written to the Audit Log.", placeholder: "Name, code, area, rep or TIN", actions: add("Add client", "client"), minWidth: 1160,
      stats: [
        { label: "Active clients", value: count("active"), sub: `${count("active") - count("incomplete")} complete`, tone: "blue", scope: "active" },
        { label: "Incomplete", value: count("incomplete"), sub: "TIN, terms, limit or documents", tone: "amber", scope: "incomplete" },
        { label: "Possible duplicates", value: count("duplicate"), sub: "Same name or TIN", tone: "red", scope: "duplicate" },
        { label: "Over credit limit", value: count("overlimit"), sub: "AR above the limit", tone: "slate", scope: "overlimit" },
      ],
      cols: [{ key: "client", label: "Client", sortable: true }, { key: "area", label: "Area · rep", sortable: true }, { key: "terms", label: "Terms", align: "right", sortable: true }, { key: "limit", label: "Credit limit", align: "right", sortable: true }, { key: "used", label: "AR used", align: "right", sortable: true }, { key: "list", label: "Price list" }, { key: "docs", label: "Documents" }, { key: "status", label: "Status" }],
      csvName: "clients.csv", csvHeader: ["Code", "Client", "Area", "Account type", "Sales rep", "TIN", "Terms", "Credit limit", "AR used", "Price list", "Missing"],
      rows, empty: ["No clients", "Add a client or import the masterlist."], defaultSort: { key: "client", dir: 1 },
      chips: [{ key: "active", label: "Active", tone: "blue" }, { key: "incomplete", label: "Incomplete", tone: "amber" }, { key: "duplicate", label: "Possible duplicate", tone: "red" }, { key: "overlimit", label: "Over limit", tone: "slate" }, archivedChip], defaultScope: "active",
    };
  }

  if (tab === "suppliers") {
    const openPos = (/** @type {string} */ name) => (data.inventoryPurchaseOrders || []).filter((po) => po.supplier === name && !inventoryPoTerminalStatuses.includes(po.status)).length;
    const rows = data.suppliers.map(/** @returns {UiViewRow} */ (supplier) => {
      const gaps = masterSupplierGaps(supplier);
      const archived = isArchived(supplier);
      const open = openPos(supplier.name);
      const id = String(supplier.code || supplier.name);
      const bank = supplier.bankDetails;
      return {
        id, branches: [], scopes: archived ? ["archived"] : ["active", ...(gaps.length ? ["incomplete"] : []), ...(open ? ["openpo"] : [])],
        search: [supplier.code, supplier.name, supplier.classification, supplier.brand, supplier.tin, supplier.paymentMethod].join(" "),
        sortValues: { supplier: String(supplier.name || ""), terms: masterNum(supplier.terms), open },
        csv: [supplier.code || "", supplier.name, supplier.classification || supplier.brand || "", supplier.tin || "", supplier.terms || "", supplier.paymentMethod || "", bank ? `${bank.bank} ${bank.accountNo}` : "", open, gaps.join("; ")],
        cells: [
          masterCell(String(supplier.name), select(id), [supplier.code, supplier.classification || supplier.brand].filter(Boolean).join(" · ")),
          uiCellText(String(supplier.tin || "—"), "", { mono: true }),
          uiCellNum(masterNum(supplier.terms) ? `${supplier.terms} days` : "—"),
          escapeHtml(String(supplier.paymentMethod || "—")),
          bank?.bank ? uiCellText(String(bank.bank), String(bank.accountNo || "")) : supplier.paymentMethod === "Bank transfer" ? `<span class="t-red-text">Missing</span>` : "—",
          uiCellNum(String(open)),
          masterStatusPill(supplier) || masterGapPill(gaps),
        ],
        detail: () => ({
          eyebrow: [supplier.code, supplier.classification || supplier.brand].filter(Boolean).join(" · "), title: String(supplier.name), pill: archived ? { text: "Archived", tone: "slate" } : gaps.length ? { text: "Incomplete", tone: "amber" } : { text: "Complete", tone: "green" }, closeAttrs: { "data-master-close": "" }, label: "Supplier details",
          fields: [
            { label: "TIN", value: String(supplier.tin || "—"), mono: true }, { label: "Payee type", value: String(supplier.entityType || "—") },
            { label: "Terms", value: masterNum(supplier.terms) ? `${supplier.terms} days` : "—" }, { label: "Pays by", value: String(supplier.paymentMethod || "—") },
            { label: "Bank details", value: bank?.bank ? `${bank.bank} · ${bank.accountNo || "—"}` : "—", sub: bank?.accountName ? String(bank.accountName) : "", wide: true },
            { label: "Open POs", value: String(open) }, { label: "Contact", value: String(supplier.contact || "—") },
            { label: "Address", value: String(supplier.address || "—"), wide: true },
          ],
          note: gaps.length ? { text: `Missing: ${gaps.join(", ")}.`, tone: "amber" } : undefined,
          actions: masterRowActions("supplier", data.suppliers, supplier),
        }),
      };
    });
    const count = (/** @type {string} */ scope) => rows.filter((row) => row.scopes.includes(scope)).length;
    return {
      title: "Suppliers", intro: "Principals and vendors we buy from, with their terms and how we pay them (cash, check or bank transfer).", placeholder: "Name, code, TIN or brand", actions: add("Add supplier", "supplier"), minWidth: 1000,
      stats: [
        { label: "Active suppliers", value: count("active"), sub: `${count("openpo")} with open POs`, tone: "blue", scope: "active" },
        { label: "Incomplete", value: count("incomplete"), sub: "TIN, terms or payment details", tone: "amber", scope: "incomplete" },
      ],
      cols: [{ key: "supplier", label: "Supplier", sortable: true }, { key: "tin", label: "TIN" }, { key: "terms", label: "Terms", align: "right", sortable: true }, { key: "pays", label: "Pays by" }, { key: "bank", label: "Bank details" }, { key: "open", label: "Open POs", align: "right", sortable: true }, { key: "status", label: "Status" }],
      csvName: "suppliers.csv", csvHeader: ["Code", "Supplier", "Classification", "TIN", "Terms", "Pays by", "Bank", "Open POs", "Missing"],
      rows, empty: ["No suppliers", "Add a supplier or import the masterlist."], defaultSort: { key: "supplier", dir: 1 },
      chips: [{ key: "active", label: "Active", tone: "blue" }, { key: "incomplete", label: "Incomplete", tone: "amber" }, { key: "openpo", label: "Open POs", tone: "slate" }, archivedChip], defaultScope: "active",
    };
  }

  if (tab === "pricelists") {
    const lists = /** @type {PriceList[]} */ (data.priceLists || []);
    const users = (/** @type {string} */ name) => activeClients().filter((client) => client.priceList === name);
    const standard = /** @type {UiViewRow} */ ({
      id: "__standard", branches: [], scopes: ["active"], search: "Standard list prices", sortValues: { name: "", clients: 0 }, csv: ["Standard", "", "", "", "", "Active"],
      cells: [masterCell("Standard", select("__standard"), "Item list prices"), "—", uiCellNum(String(activeItems().filter((item) => masterNum(item.price) > 0).length)), uiCellNum(String(activeClients().filter((client) => !client.priceList).length)), "Always", uiPill("Default", "blue")],
      detail: () => ({ eyebrow: "Price list", title: "Standard", pill: { text: "Default", tone: "blue" }, closeAttrs: { "data-master-close": "" }, label: "Price list", fields: [{ label: "Items with a list price", value: String(activeItems().filter((item) => masterNum(item.price) > 0).length) }, { label: "Quoted per deal", value: String(activeItems().filter((item) => item.quotedPerDeal).length) }], note: { text: "Clients without a price list are checked against each item’s list price (Recon check K15). Set list prices on the Items tab.", tone: "blue" }, actions: [] }),
    });
    const rows = [standard, ...lists.map(/** @returns {UiViewRow} */ (list) => {
      const using = users(list.name);
      const active = list.active !== false;
      const window = list.from || list.to ? `${list.from ? uiDate(list.from) : "…"} – ${list.to ? uiDate(list.to) : "open"}` : "Always";
      return {
        id: list.id, branches: [], scopes: [active ? "active" : "inactive"], search: [list.name, list.note].join(" "),
        sortValues: { name: String(list.name), clients: using.length },
        csv: [list.name, list.discountPct || "", (list.prices || []).length, using.length, window, active ? "Active" : "Inactive"],
        cells: [masterCell(String(list.name), select(list.id), String(list.note || "")), uiCellNum(list.discountPct ? `${list.discountPct}% off` : "—"), uiCellNum(String((list.prices || []).length)), uiCellNum(String(using.length)), escapeHtml(window), active ? uiPill("Active", "green") : uiPill("Inactive", "slate")],
        detail: () => ({
          eyebrow: "Price list", title: String(list.name), pill: active ? { text: "Active", tone: "green" } : { text: "Inactive", tone: "slate" }, closeAttrs: { "data-master-close": "" }, label: "Price list",
          fields: [{ label: "Discount off list", value: list.discountPct ? `${list.discountPct}%` : "—" }, { label: "Valid", value: window }, { label: "Clients", value: String(using.length), sub: using.slice(0, 3).map((client) => client.name).join(", ") + (using.length > 3 ? "…" : "") }, { label: "Last updated", value: list.updatedAt ? uiDate(list.updatedAt) : "—", sub: list.updatedBy ? `by ${list.updatedBy}` : "" }],
          linesTitle: (list.prices || []).length ? "Own prices" : "", lines: (list.prices || []).slice(0, 20).map((entry) => ({ left: String(data.items.find((item) => item.code === entry.code)?.name || entry.code), sub: entry.code, right: masterPeso(masterNum(entry.price)) })),
          note: { text: "An item’s own price on this list wins; otherwise the discount applies to its list price. Invoices below these prices are flagged by Recon check K15.", tone: "slate" },
          actions: masterCanEdit() ? [uiButton("Edit", { "data-master-pricelist": list.id }, { primary: true })] : [],
        }),
      };
    })];
    return {
      title: "Price lists", intro: "Agreed prices for groups of clients. Standard is the default: each item’s own list price.", placeholder: "Price list", actions: masterCanEdit() ? [uiButton("New price list", { "data-master-pricelist": "" }, { size: "sm", primary: true })] : [], minWidth: 860,
      stats: [{ label: "Active lists", value: rows.filter((row) => row.scopes.includes("active")).length, sub: "Standard is the default", tone: "blue", scope: "active" }, { label: "Clients on a list", value: activeClients().filter((client) => client.priceList).length, sub: `of ${activeClients().length} active clients`, tone: "slate" }],
      cols: [{ key: "name", label: "Price list", sortable: true }, { key: "discount", label: "Discount", align: "right" }, { key: "prices", label: "Own prices", align: "right" }, { key: "clients", label: "Clients", align: "right", sortable: true }, { key: "valid", label: "Valid" }, { key: "status", label: "Status" }],
      csvName: "price-lists.csv", csvHeader: ["Price list", "Discount %", "Own prices", "Clients", "Valid", "Status"],
      rows, empty: ["No price lists", "Create one for clients with agreed prices."], defaultSort: { key: "name", dir: 1 },
      chips: [{ key: "active", label: "Active", tone: "green" }, { key: "inactive", label: "Inactive", tone: "slate" }], defaultScope: "",
    };
  }

  if (tab === "branches") {
    const rows = platformBranches().map(/** @returns {UiViewRow} */ (branch) => {
      const stock = (data.inventory || []).filter((row) => row.branch === branch && masterNum(row.qty) > 0);
      const value = stock.reduce((sum, row) => sum + masterNum(row.qty) * masterNum(data.items.find((item) => item.code === row.code)?.cost), 0);
      const reasons = branchUsageReasons(branch);
      const address = branchAddresses()[branch] || "";
      const openPos = (data.inventoryPurchaseOrders || []).filter((po) => po.branch === branch && !inventoryPoTerminalStatuses.includes(po.status)).length;
      const users = (data.users || []).filter((user) => user.branch === branch).length;
      // Last posted Recon count (only loaded for Superadmin/CEO, who can open Recon).
      const lastCount = /** @type {any[]} */ (typeof reconState !== "undefined" && reconState.data?.stockCounts || []).filter((count) => count.branch === branch && count.status === "Posted").map((count) => String(count.at)).sort().pop() || "";
      return {
        id: branch, branches: [], scopes: [reasons.length ? "used" : "unused"], search: `${branch} ${address}`,
        sortValues: { branch, lots: stock.length, value, pos: openPos, users },
        csv: [branch, address, stock.length, value.toFixed(2), openPos, users, lastCount.slice(0, 10), reasons.length ? "Used by records" : "Unused"],
        cells: [masterCell(branch, select(branch), address || "No address set"), uiCellNum(String(stock.length)), uiCellNum(value ? masterPeso(value) : "—"), uiCellNum(String(openPos)), uiCellNum(String(users)), escapeHtml(lastCount ? uiDate(lastCount) : "—"), reasons.length ? uiPill("In use", "green") : uiPill("Unused", "slate")],
        detail: () => ({
          eyebrow: "Branch", title: branch, pill: reasons.length ? { text: "In use", tone: "green" } : { text: "Unused", tone: "slate" }, closeAttrs: { "data-master-close": "" }, label: "Branch",
          fields: [{ label: "Address", value: address || "No address set", wide: true }, { label: "Lots on hand", value: String(stock.length) }, { label: "Stock value at cost", value: value ? masterPeso(value) : "—" }, { label: "Open supplier POs", value: String(openPos) }, { label: "Users", value: String(users) }, { label: "Last stock count", value: lastCount ? uiDate(lastCount) : "—", sub: lastCount ? "" : "Counts are entered in Recon" }],
          note: reasons.length ? { text: `Can’t be removed: used by ${reasons.join(", ")}.`, tone: "slate" } : undefined,
          actions: masterCanEdit() ? [uiButton("Edit address", { "data-edit-branch-address": branch }, { primary: true }), ...(reasons.length ? [] : [uiButton("Remove", { "data-remove-platform-branch": branch }, { danger: true })])] : [],
        }),
      };
    });
    return {
      title: "Branches", intro: "Physical branches that hold stock and issue documents.", placeholder: "Branch", actions: masterCanEdit() ? [uiButton("Add branch", { "data-master-add": "branch" }, { size: "sm", primary: true })] : [], minWidth: 860,
      stats: rows.slice(0, 4).map((row) => ({ label: row.id, value: `${row.sortValues.lots} lots`, sub: Number(row.sortValues.value) ? `${masterPeso(Number(row.sortValues.value))} at cost` : "No stock", tone: /** @type {UiTone} */ ("blue") })),
      cols: [{ key: "branch", label: "Branch", sortable: true }, { key: "lots", label: "Lots on hand", align: "right", sortable: true }, { key: "value", label: "Stock value", align: "right", sortable: true }, { key: "pos", label: "Open POs", align: "right", sortable: true }, { key: "users", label: "Users", align: "right", sortable: true }, { key: "count", label: "Last count" }, { key: "status", label: "Status" }],
      csvName: "branches.csv", csvHeader: ["Branch", "Address", "Lots on hand", "Stock value at cost", "Open POs", "Users", "Last count", "Status"],
      rows, empty: ["No branches", "Add the first branch."], defaultSort: { key: "branch", dir: 1 }, chips: [], defaultScope: "",
    };
  }

  if (tab === "employees") {
    const salary = canManageEmployeeSalary();
    const rows = data.employees.map(/** @returns {UiViewRow} */ (employee) => {
      const archived = isArchived(employee);
      const id = String(employee.email || employee.name);
      return {
        id, branches: [], scopes: [archived ? "archived" : "active"], search: [employee.name, employee.role, employee.contact].join(" "),
        sortValues: { name: String(employee.name), role: String(employee.role || "") },
        csv: [employee.name, employee.role || "", employee.contact || "", salary ? masterNum(employee.salary) : "", masterNum(employee.targetSales) || ""],
        cells: [masterCell(String(employee.name), select(id), String(employee.contact || "")), escapeHtml(String(employee.role || "—")), uiCellNum(salary ? masterPeso(masterNum(employee.salary)) : "Superadmin only"), uiCellNum(masterNum(employee.targetSales) ? masterPeso(masterNum(employee.targetSales)) : "—"), escapeHtml(employeeBenefitsSummary(employee)), masterStatusPill(employee)],
        detail: () => ({
          eyebrow: String(employee.role || "Employee"), title: String(employee.name), pill: archived ? { text: "Archived", tone: "slate" } : undefined, closeAttrs: { "data-master-close": "" }, label: "Employee",
          fields: [{ label: "Contact", value: String(employee.contact || "—") }, { label: "Birthday", value: employee.birthday ? uiDate(employee.birthday) : "—" }, { label: "Salary", value: salary ? masterPeso(masterNum(employee.salary)) : "Superadmin only" }, { label: "Govt. benefits", value: employeeBenefitsSummary(employee), wide: true }],
          actions: masterRowActions("employee", data.employees, employee),
        }),
      };
    });
    return {
      title: "Employees", intro: "Staff records for collectors, requesters and payroll benefits.", placeholder: "Name or role", actions: add("Add employee", "employee"), minWidth: 860,
      stats: [{ label: "Active employees", value: rows.filter((row) => row.scopes.includes("active")).length, sub: "", tone: "blue", scope: "active" }],
      cols: [{ key: "name", label: "Name", sortable: true }, { key: "role", label: "Role", sortable: true }, { key: "salary", label: "Salary", align: "right" }, { key: "target", label: "Target sales", align: "right" }, { key: "benefits", label: "Govt. benefits" }, { key: "status", label: "" }],
      csvName: "employees.csv", csvHeader: ["Name", "Role", "Contact", "Salary", "Target sales"],
      rows, empty: ["No employees", "Add an employee."], defaultSort: { key: "name", dir: 1 }, chips: [{ key: "active", label: "Active", tone: "blue" }, archivedChip], defaultScope: "active",
    };
  }

  // Banks: our own collection accounts.
  const rows = data.banks.map(/** @returns {UiViewRow} */ (bank) => {
    const archived = isArchived(bank);
    const id = String(bank.name) + String(bank.account || "");
    return {
      id, branches: [], scopes: [archived ? "archived" : "active"], search: [bank.name, bank.account, bank.notes].join(" "),
      sortValues: { name: String(bank.name) }, csv: [bank.name, bank.account || "", bank.notes || ""],
      cells: [masterCell(String(bank.name), select(id)), escapeHtml(String(bank.account || "—")), escapeHtml(String(bank.notes || "")), masterStatusPill(bank)],
      detail: () => ({ eyebrow: "Bank account", title: String(bank.name), pill: archived ? { text: "Archived", tone: "slate" } : undefined, closeAttrs: { "data-master-close": "" }, label: "Bank", fields: [{ label: "Account / purpose", value: String(bank.account || "—"), wide: true }, { label: "Notes", value: String(bank.notes || "—"), wide: true }], actions: masterRowActions("bank", data.banks, bank) }),
    };
  });
  return {
    title: "Banks", intro: "Our bank accounts that collections are deposited into.", placeholder: "Bank or account", actions: add("Add bank", "bank"), minWidth: 700,
    stats: [{ label: "Active accounts", value: rows.filter((row) => row.scopes.includes("active")).length, sub: "", tone: "blue", scope: "active" }],
    cols: [{ key: "name", label: "Bank", sortable: true }, { key: "account", label: "Account / purpose" }, { key: "notes", label: "Notes" }, { key: "status", label: "" }],
    csvName: "banks.csv", csvHeader: ["Bank", "Account", "Notes"],
    rows, empty: ["No banks", "Add a bank account."], defaultSort: { key: "name", dir: 1 }, chips: [{ key: "active", label: "Active", tone: "blue" }, archivedChip], defaultScope: "active",
  };
}

function masterVisibleTabs() { return MASTER_TABS.filter((key) => key !== "employees" || canManageEmployees()); }

function renderMasterlists() {
  const panel = qs("#master-tab-panel");
  if (!panel) return;
  ensureUploadedFilesLoaded(renderMasterlists);
  const tabs = masterVisibleTabs();
  if (!tabs.includes(masterPageTab)) masterPageTab = "overview";
  if (masterPageTab === "overview") loadMasterAudit();
  const counts = /** @type {Record<string, number | undefined>} */ ({ items: activeItems().length, clients: activeClients().length, suppliers: activeSuppliers().length, pricelists: (data.priceLists || []).length + 1, branches: platformBranches().length, employees: activeEmployees().length, banks: activeBanks().length });
  qs("#master-tabs").innerHTML = uiModuleTabs({ tabs: tabs.map((key) => ({ key, label: MASTER_TAB_LABELS[key], count: counts[key] })), active: masterPageTab, attr: "data-master-tab" });
  const header = qs("#master-actions");
  if (header) header.innerHTML = masterCanEdit() ? uiButton("Add item", { "data-master-add": "item" }) + uiButton("Add client", { "data-master-add": "client" }, { primary: true }) : "";
  renderModuleAssistant("masterlists");
  uiRender(panel, masterPageTab === "overview" ? masterOverviewHtml() : uiViewHtml(masterTabModel(masterPageTab), masterView, "master"));
  syncModuleUrl("masterlists", masterQueryString());
}

// Assistant: the most useful single fix.
WORKFLOW_RULES.masterlists = [
  { id: "master-stale-cost", rule: () => {
    const latest = masterLatestPoPrices();
    const stale = activeItems().filter((item) => masterCostOutOfDate(item, latest));
    return stale.length ? { tone: /** @type {UiTone} */ ("red"), text: `${plural(stale.length, "item cost")} differ from the latest supplier PO, so margins are off.`, action: "Review", attrs: { "data-wa-goto": "masterlists|items|stale|" } } : null;
  } },
  { id: "master-dup-client", rule: () => {
    const dup = masterDuplicateClients()[0];
    return dup ? { tone: /** @type {UiTone} */ ("amber"), text: `Possible duplicate client: ${masterNames(dup.clients)} (${dup.reason.toLowerCase()}).`, action: "Show", attrs: { "data-wa-goto": "masterlists|clients|duplicate|" } } : null;
  } },
];

// ----- price lists, branches ------------------------------------------------------------------
/** Create or edit a price list. @param {string} id */
async function masterEditPriceList(id) {
  if (!masterCanEdit()) return toast("Price list changes need Masterlists edit access.");
  const list = /** @type {PriceList | undefined} */ ((data.priceLists || []).find((entry) => entry.id === id));
  const prices = (list?.prices || []).map((entry) => `${entry.code}, ${entry.price}`).join("\n");
  const values = await reconDialog({
    eyebrow: "Price list", title: list ? `Edit ${list.name}` : "New price list", sub: "Own prices win; the discount applies to every other item’s list price", wide: true,
    body: `<div class="field"><label for="pl-name">Name</label><input id="pl-name" name="name" required maxlength="60" value="${escapeHtml(list?.name || "")}" placeholder="e.g. Government" /></div>
      <div class="field"><label for="pl-discount">Discount off list price (%)</label><input id="pl-discount" name="discountPct" type="number" min="0" max="90" step="0.01" value="${escapeHtml(String(list?.discountPct || ""))}" /></div>
      <div class="field"><label for="pl-from">Valid from (optional)</label><input id="pl-from" name="from" type="date" value="${escapeHtml(list?.from || "")}" /></div>
      <div class="field"><label for="pl-to">Valid to (optional)</label><input id="pl-to" name="to" type="date" value="${escapeHtml(list?.to || "")}" /></div>
      <div class="field full"><label for="pl-prices">Own prices: one “item code, price” per line (VAT inclusive)</label><textarea id="pl-prices" name="prices" rows="6" placeholder="ITEM-001, 1250">${escapeHtml(prices)}</textarea></div>
      <div class="field full"><label for="pl-note">Note (optional)</label><input id="pl-note" name="note" maxlength="200" value="${escapeHtml(list?.note || "")}" /></div>
      <label class="ios-check-row"><input name="active" type="checkbox" value="true" ${list?.active === false ? "" : "checked"} /><span></span><strong>Active</strong></label>`,
    submit: "Save price list",
  });
  if (!values) return;
  const name = values.name.trim();
  if ((data.priceLists || []).some((entry) => entry.id !== id && masterNorm(entry.name) === masterNorm(name)) || masterNorm(name) === "standard") return toast(`A price list called “${name}” already exists.`);
  /** @type {{ code: string, price: number }[]} */
  const own = [];
  for (const line of values.prices.split(/\n/).map((text) => text.trim()).filter(Boolean)) {
    const [code, price] = line.split(/[,\t]/).map((part) => part.trim());
    const amount = Number(String(price || "").replace(/[₱,\s]/g, ""));
    if (!data.items.some((item) => item.code === code)) return toast(`Item code “${code}” isn’t in the item list.`);
    if (!(amount > 0)) return toast(`Price for ${code} must be a number above zero.`);
    own.push({ code, price: Math.round(amount * 100) / 100 });
  }
  /** @type {PriceList} */
  const next = { ...(list || {}), id: list?.id || `PL-${Date.now().toString(36).toUpperCase()}`, name, discountPct: Number(values.discountPct) || 0, prices: own, from: values.from || "", to: values.to || "", note: values.note || "", active: values.active === "true", updatedAt: new Date().toISOString(), updatedBy: String(currentUser?.name || "") };
  if (next.from && next.to && next.to < next.from) return toast("“Valid to” can’t be before “Valid from”.");
  const renamed = list && list.name !== name ? activeClients().filter((client) => client.priceList === list.name).map((client) => ({ ...client, priceList: name })) : [];
  data.priceLists ||= [];
  if (list) data.priceLists[data.priceLists.indexOf(list)] = next; else data.priceLists.push(next);
  for (const client of renamed) { const index = data.clients.findIndex((entry) => entry.name === client.name); if (index >= 0) data.clients[index] = client; }
  const result = await persistRecords({ priceLists: [next], ...(renamed.length ? { clients: renamed } : {}) });
  if (!result?.ok) return;
  log(list ? "Edited price list" : "Created price list", "Masterlists", `${name}${next.discountPct ? ` · ${next.discountPct}% off` : ""} · ${plural(own.length, "own price")}`, { save: false });
  toast(`Price list ${name} saved.`);
  renderMasterlists();
}
async function masterAddBranch() {
  if (!masterCanEdit()) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const values = await reconDialog({ eyebrow: "Branches", title: "Add branch", body: `<div class="field"><label for="mb-name">Branch name</label><input id="mb-name" name="branch" required maxlength="60" /></div><div class="field"><label for="mb-address">Address</label><input id="mb-address" name="address" required maxlength="200" /></div>`, submit: "Add branch" });
  if (!values) return;
  const branch = values.branch.trim();
  if (platformBranches().some((item) => item.toLowerCase() === branch.toLowerCase())) return toast("Branch already exists.");
  data.platformBranches.push(branch);
  data.branchAddresses ||= {};
  data.branchAddresses[branch] = values.address.trim();
  log("Added branch masterlist record", "Masterlists", branch);
  notify("Settings", `${branch} was added to platform branches.`, "settings", branch);
  saveData();
  renderAll();
  toast(`${branch} added to platform branches.`);
}

/** Click handling for the Masterlists section (wired in events-bootstrap.js). @param {Element} target */
function handleMasterlistsClick(target) {
  const tab = closestEl(target, "[data-master-tab]");
  if (tab) {
    if (tab.dataset.masterTab !== masterPageTab) masterView = uiBlankViewState();
    masterPageTab = /** @type {string} */ (tab.dataset.masterTab);
    return renderMasterlists();
  }
  const addButton = closestEl(target, "[data-master-add]");
  if (addButton) {
    if (!masterCanEdit()) return toast("Masterlist changes need approval from Admin or Superadmin.");
    return addButton.dataset.masterAdd === "branch" ? masterAddBranch() : openModal(addButton.dataset.masterAdd);
  }
  const editButton = closestEl(target, "[data-master-edit]");
  if (editButton) {
    if (!masterCanEdit()) return toast("Masterlist edits need approval from Admin or Superadmin.");
    return openMasterEditModal(/** @type {string} */ (editButton.dataset.masterEdit), Number(editButton.dataset.index));
  }
  const archiveButton = closestEl(target, "[data-master-archive]");
  if (archiveButton) return archiveMasterlistRecord(/** @type {string} */ (archiveButton.dataset.masterArchive), Number(archiveButton.dataset.index));
  const restoreButton = closestEl(target, "[data-master-restore]");
  if (restoreButton) return restoreMasterlistRecord(/** @type {string} */ (restoreButton.dataset.masterRestore), Number(restoreButton.dataset.index));
  const priceList = closestEl(target, "[data-master-pricelist]");
  if (priceList) return masterEditPriceList(String(priceList.dataset.masterPricelist || ""));
  const address = closestEl(target, "[data-edit-branch-address]");
  if (address) return editPlatformBranchAddress(/** @type {string} */ (address.dataset.editBranchAddress));
  const remove = closestEl(target, "[data-remove-platform-branch]");
  if (remove) return removePlatformBranch(/** @type {string} */ (remove.dataset.removePlatformBranch));
  if (masterPageTab !== "overview") uiViewClick(target, "master", { state: () => masterView, view: () => masterTabModel(masterPageTab), render: renderMasterlists });
}

function statusForSale(sale) {
  if (sale.status === "Cancelled") return "Cancelled";
  const balance = sale.net - sale.paid;
  const dueIn = daysUntil(addDays(sale.date, sale.terms));
  if (balance <= 0) return "Paid";
  if (dueIn < 0) return "Overdue";
  if (dueIn <= 7) return "Near Due";
  if (sale.paid > 0) return "Partially Paid";
  return "Unpaid";
}
function inventoryStatus(item) {
  if (item.expiry !== "N/A" && daysUntil(item.expiry) < 0) return "For Disposal";
  if (item.qty <= Math.ceil(item.min * 0.5)) return "Critical";
  if (item.qty < item.min) return "Low Stock";
  if (item.expiry !== "N/A" && daysUntil(item.expiry) <= 183) return "Near Expiry";
  return "Available";
}
function statusClass(status) {
  const value = String(status).toLowerCase();
  if (value.includes("paid") && !value.includes("unpaid") && !value.includes("partial")) return "green";
  if (value.includes("partial") || value.includes("near") || value.includes("approval") || value.includes("delivered") || value.includes("incomplete")) return "orange";
  if (value.includes("overdue") || value.includes("critical") || value.includes("low") || value.includes("unpaid") || value.includes("cancelled") || value.includes("disposal")) return "red";
  if (value.includes("si") || value.includes("admin")) return "purple";
  return "gray";
}
function documentType(type) { return type === "DRS" ? "DR" : type; }
function invoiceTypeIcon(type) {
  return ({ SI: "₱", TS: "T", DR: "D", DRS: "D" }[type] || "#");
}
function invoiceTypeLabel(type) {
  return ({ SI: "Sales Invoice", TS: "Transmittal Slip", DR: "Delivery Receipt", DRS: "Delivery Receipt" }[type] || "Document");
}
function contactStatusClass(status) {
  return String(status || "Pending").toLowerCase().replace(/\s+/g, "-");
}
function contactStatusLabel(status) {
  if (status === "Called") return "Unreached";
  if (status === "No Response") return "No Reply";
  if (status === "Cheque Available") return "Cheque Available";
  return status || "Pending";
}
function contactStatusFromLabel(status) {
  if (status === "Unreached") return "Unreached";
  if (status === "No Reply") return "No Response";
  return status;
}
function clientBalance(clientName) {
  return data.sales.filter((sale) => sale.client === clientName && sale.status !== "Cancelled").reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
}
function clientCreditState(clientName, pendingAmount = 0) {
  const client = data.clients.find((item) => item.name === clientName);
  const used = clientBalance(clientName);
  const limit = Number(client?.creditLimit || 0);
  return { client, used, limit, projected: used + pendingAmount, exceeded: limit > 0 && used + pendingAmount > limit };
}
function clientTaxRate(client) {
  return (client?.withholdingTax ? 0.05 : 0) + (client?.expandedWithholdingTax ? 0.01 : 0);
}
function clientTaxLabels(client) {
  return [client?.withholdingTax ? "Withholding Tax 5%" : "", client?.expandedWithholdingTax ? "Expanded Withholding Tax 1%" : ""].filter(Boolean);
}
function clientTaxBadge(client) {
  const labels = clientTaxLabels(client);
  return labels.length ? labels.map((label) => `<span class="pill orange">${escapeHtml(label)}</span>`).join(" ") : `<span class="pill gray">No WTax/EWT</span>`;
}
function saleTaxBreakdown(sale) {
  const subtotal = Number(sale.amount || 0) - Number(sale.discount || 0);
  const totalAmountDue = Number(sale.net || subtotal);
  const totalSalesVatInclusive = documentType(sale.type) === "SI" ? totalAmountDue : subtotal;
  const addVat = documentType(sale.type) === "SI" ? Math.max(totalSalesVatInclusive - totalSalesVatInclusive / 1.12, 0) : 0;
  const amountNetVat = totalSalesVatInclusive - addVat;
  return { totalSalesVatInclusive, withholdingTax: 0, expandedWithholdingTax: 0, amountNetVat, addVat, totalAmountDue };
}
function saleTaxSummary(sale) {
  return "No WTax/EWT";
}
function arTrackerStage(sale) {
  if (sale.status === "Cancelled") return "cancelled";
  if (sale.paid >= sale.net) return "completed";
  const dueIn = daysUntil(addDays(sale.date, sale.terms));
  if (dueIn < 0) return "overdue";
  if (dueIn <= 7) return "due-soon";
  return "open-ar";
}
function arTrackerTabs(sales) {
  return [
    ["all", "All", sales.length],
    ["open-ar", "Open AR", sales.filter((sale) => arTrackerStage(sale) === "open-ar").length],
    ["due-soon", "Due Soon", sales.filter((sale) => arTrackerStage(sale) === "due-soon").length],
    ["overdue", "Overdue", sales.filter((sale) => arTrackerStage(sale) === "overdue").length],
    ["completed", "Paid", sales.filter((sale) => arTrackerStage(sale) === "completed").length],
    ["cancelled", "Cancelled", sales.filter((sale) => arTrackerStage(sale) === "cancelled").length],
  ];
}
function warehouseForArea(area) {
  return ["Region I", "Region II", "Region III", "Region IV-A", "Visayas Dealer", "Mindanao Dealer"].includes(area) ? "Las Pinas" : "Naga";
}
function dateInRange(dateValue, from = "", to = "") {
  if (!dateValue) return !from && !to;
  const value = fmtDate(dateValue);
  return (!from || value >= from) && (!to || value <= to);
}
function getDashboardRange() {
  return { from: qs("#dashboard-date-from")?.value || "", to: qs("#dashboard-date-to")?.value || "" };
}
function log(action, module, record) {
  const ua = navigator.userAgent || "";
  const device = /Mobile|iPhone|Android/i.test(ua) ? "Mobile" : /iPad|Tablet/i.test(ua) ? "Tablet" : "Desktop";
  const browser = /Edg\//.test(ua) ? "Microsoft Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  data.logs.unshift({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), user: currentUser?.name || "System User", role: currentUser?.role || "System", action, module, record, device, browser, ipAddress: "Server captured on save" });
  data.logs = data.logs.slice(0, 60);
  saveData();
}
function notify(type, message, section = "notifications", record = "") {
  data.notifications.unshift({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), type, message, section, record, status: "Unread" });
  data.notifications = data.notifications.slice(0, 80);
}
function canSeeNotification(notice) {
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return true;
  const section = notice?.section || "notifications";
  if (["users", "settings", "backup", "security", "logs"].includes(section)) return false;
  if (/user|account|permission|password|security|audit|login|logout|session/i.test(`${notice?.type || ""} ${notice?.message || ""}`)) return false;
  return section === "notifications" || effectiveModules().includes(section);
}
function visibleNotifications() {
  return (data.notifications || []).filter(canSeeNotification);
}
function generatedNoticeDate() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function syncGeneratedNotifications() {
  if (!data?.notifications) return;
  const previous = new Map(data.notifications.filter((notice) => notice.generated && notice.key).map((notice) => [notice.key, notice]));
  const notices = [];
  const add = (key, type, message, section = "notifications", record = "") => {
    const existing = previous.get(key);
    notices.push({ key, generated: true, date: existing?.date || generatedNoticeDate(), type, message, section, record, status: existing?.status || "Unread" });
  };
  const facts = workflowFacts();
  const openPurchaseOrders = data.purchaseOrders.filter((po) => !["Completed", "Served", "Cancelled"].includes(po.status));
  const receivingPurchaseOrders = data.inventoryPurchaseOrders.filter((po) => !["Received", "Completed", "Cancelled"].includes(po.status));
  const expiredStock = data.inventory.filter((item) => item.expiry !== "N/A" && daysUntil(item.expiry) < 0);
  const warrantyExpired = data.warranties.filter((item) => daysUntil(item.warrantyEnd) < 0 || String(item.status).toLowerCase().includes("expired"));
  const warrantySoon = data.warranties.filter((item) => daysUntil(item.warrantyEnd) >= 0 && daysUntil(item.warrantyEnd) <= 180);
  const bouncedCheques = data.payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce"));
  const forDepositCheques = data.payments.filter((payment) => ["Cheque", "Multiple Cheques"].includes(payment.method) && ["For Deposition", "Posted Date"].includes(payment.collectionStatus));
  const blockedImports = data.imports.filter((item) => /blocked|invalid|skipped|no valid/i.test(item.status));
  const latestRecon = data.reconHistory[0];
  const riskyLogs = data.logs.filter((entry) => /cancel|override|discount|password|permission|delete|clear|failed|security/i.test(`${entry.action} ${entry.module}`));

  if (facts.lowStock.length) add("inventory-low-stock", "Low Stock", `${facts.lowStock.length} inventory lot${facts.lowStock.length === 1 ? "" : "s"} are low or critical.`, "inventory", facts.lowStock.map((item) => item.lot || item.code).join("|"));
  if (facts.nearExpiry.length) add("inventory-near-expiry", "Near Expiry", `${facts.nearExpiry.length} inventory lot${facts.nearExpiry.length === 1 ? "" : "s"} should be sold or transferred using FEFO.`, "inventory", facts.nearExpiry.map((item) => item.lot || item.code).join("|"));
  if (expiredStock.length) add("inventory-expired", "For Disposal", `${expiredStock.length} expired inventory lot${expiredStock.length === 1 ? "" : "s"} need disposal review.`, "inventory", expiredStock.map((item) => item.lot || item.code).join("|"));
  if (facts.pendingTransfers.length) add("inventory-transfer-receiving", "Transfer Receiving", `${facts.pendingTransfers.length} stock transfer${facts.pendingTransfers.length === 1 ? "" : "s"} need receiving confirmation.`, "inventory", facts.pendingTransfers.map((item) => item.id).join("|"));
  if (receivingPurchaseOrders.length) add("inventory-po-receiving", "PO Receiving", `${receivingPurchaseOrders.length} inventory purchase order${receivingPurchaseOrders.length === 1 ? "" : "s"} are waiting for receiving.`, "inventory", receivingPurchaseOrders.map((po) => po.id).join("|"));
  if (openPurchaseOrders.length) add("sales-pending-po", "Pending PO", `${openPurchaseOrders.length} client purchase order${openPurchaseOrders.length === 1 ? "" : "s"} still need invoicing or completion.`, "purchase-orders", openPurchaseOrders.map((po) => po.id).join("|"));
  if (facts.nearDue.length) add("ar-near-due", "Near Due AR", `${facts.nearDue.length} invoice${facts.nearDue.length === 1 ? "" : "s"} are due within 7 days.`, "receivables-tracker", facts.nearDue.map((sale) => sale.documentNo || sale.id).join("|"));
  if (facts.overdue.length) add("ar-overdue", "Overdue AR", `${facts.overdue.length} invoice${facts.overdue.length === 1 ? "" : "s"} are overdue and need collection follow-up.`, "receivables-tracker", facts.overdue.map((sale) => sale.documentNo || sale.id).join("|"));
  if (facts.pendingContacts.length) add("collections-followup", "Collection Follow-Up", `${facts.pendingContacts.length} client${facts.pendingContacts.length === 1 ? "" : "s"} still need this week's contact outcome.`, "collections", facts.pendingContacts.map((contact) => contact.client || contact.area).join("|"));
  if (forDepositCheques.length) add("collections-cheques-deposit", "Cheque Deposit", `${forDepositCheques.length} cheque collection${forDepositCheques.length === 1 ? "" : "s"} need deposit or claim-date monitoring.`, "collections", forDepositCheques.map((payment) => payment.receiptNo || payment.invoice).join("|"));
  if (bouncedCheques.length) add("collections-cheques-bounced", "Bounced Cheque", `${bouncedCheques.length} bounced cheque${bouncedCheques.length === 1 ? "" : "s"} need immediate escalation.`, "collections", bouncedCheques.map((payment) => payment.receiptNo || payment.invoice).join("|"));
  if (facts.missingDocs.length) add("masterlists-missing-docs", "Missing Client Docs", `${facts.missingDocs.length} client${facts.missingDocs.length === 1 ? "" : "s"} are missing required documents.`, "masterlists", facts.missingDocs.map((client) => client.name).join("|"));
  if (facts.duplicateClients.length) add("masterlists-duplicates", "Duplicate Client Risk", `${facts.duplicateClients.length} possible duplicate client/TIN record${facts.duplicateClients.length === 1 ? "" : "s"} need review.`, "masterlists", facts.duplicateClients.map((client) => client.name).join("|"));
  if (facts.duePayables.length) add("payables-open", "Payables", `${facts.duePayables.length} payable${facts.duePayables.length === 1 ? "" : "s"} have open balances.`, "payables", facts.duePayables.map((payable) => payable.id).join("|"));
  if (facts.pendingExpenses.length) add("expenses-approval", "Expense Approval", `${facts.pendingExpenses.length} expense request${facts.pendingExpenses.length === 1 ? "" : "s"} are pending approval or payment.`, "replenishments", facts.pendingExpenses.map((expense) => expense.id).join("|"));
  if (warrantySoon.length) add("warranty-ending", "Warranty Ending", `${warrantySoon.length} warranty record${warrantySoon.length === 1 ? "" : "s"} end within 180 days.`, "warranty", warrantySoon.map((item) => item.serial || item.client).join("|"));
  if (warrantyExpired.length) add("warranty-expired", "Warranty Expired", `${warrantyExpired.length} warranty record${warrantyExpired.length === 1 ? "" : "s"} are expired.`, "warranty", warrantyExpired.map((item) => item.serial || item.client).join("|"));
  if (blockedImports.length) add("imports-review", "Import Review", `${blockedImports.length} import batch${blockedImports.length === 1 ? "" : "es"} have skipped, invalid, or blocked rows.`, "imports", blockedImports.map((item) => `${item.date} ${item.module} ${item.file}`).join("|"));
  if (latestRecon?.high > 0) add("recon-high-findings", "Reconciliation Risk", `Latest reconciliation has ${latestRecon.high} high-severity finding${latestRecon.high === 1 ? "" : "s"}.`, "reconciliation", latestRecon.date || "High");
  if (facts.overdue.length || facts.lowStock.length || facts.duePayables.length) add("reports-management-pack", "Report Pack", "Management reports have current AR, inventory, or payable risks to export.", "reports", facts.overdue.length ? "Collections & AR" : facts.lowStock.length ? "Reagent Expiry" : "Supplier Payables");
  if (riskyLogs.length) add("security-risky-actions", "Security Review", `${riskyLogs.length} sensitive audit action${riskyLogs.length === 1 ? "" : "s"} should be reviewed.`, "logs", riskyLogs.map((entry) => entry.record || entry.action).slice(0, 3).join("|"));
  const manual = data.notifications.filter((notice) => !notice.generated);
  data.notifications = [...notices, ...manual].slice(0, 100);
}
function toast(message) {
  const el = qs("#toast");
  const activeDialog = qsa("dialog[open]").at(-1);
  const targetParent = activeDialog || document.body;
  if (el.parentElement !== targetParent) {
    if (activeDialog) targetParent.prepend(el);
    else targetParent.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function table(target, headers, rows) {
  const normalizedRows = rows.map((rowSpec) => {
    const row = Array.isArray(rowSpec) ? rowSpec : rowSpec.cells;
    const focusRecord = Array.isArray(rowSpec) ? "" : rowSpec.focus || "";
    return { cells: row, focus: focusRecord, attrs: Array.isArray(rowSpec) ? {} : rowSpec.attrs || {}, focusText: row.map((cell) => String(cell).replace(/<[^>]*>/g, "")).join(" ") };
  });
  tableState.set(target, { headers, rows: normalizedRows, rendered: 0 });
  const tableEl = qs(target);
  tableEl.dataset.tableTarget = target;
  tableEl.innerHTML = `<thead><tr>${headers.map((h, index) => `<th><button class="sort-button" type="button" data-sort-col="${index}">${escapeHtml(h)}</button></th>`).join("")}</tr></thead><tbody></tbody>`;
  if (!normalizedRows.length) tableEl.tBodies[0].innerHTML = `<tr><td colspan="${headers.length}">No records found.</td></tr>`;
  else appendTableRows(target);
  requestAnimationFrame(updateTableScrollHints);
}

function rowHtml(row) {
  const attrs = Object.entries(row.attrs || {}).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ");
  return `<tr ${attrs} ${row.focus ? `data-focus-record="${escapeHtml(row.focus)}"` : ""} data-focus-text="${escapeHtml(row.focusText)}">${row.cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
}

function appendTableRows(target, count = tableBatchSize) {
  const state = tableState.get(target);
  const tableEl = qs(target);
  if (!state || !tableEl?.tBodies[0]) return;
  const nextRows = state.rows.slice(state.rendered, state.rendered + count);
  tableEl.tBodies[0].insertAdjacentHTML("beforeend", nextRows.map(rowHtml).join(""));
  state.rendered += nextRows.length;
}

function ensureFocusedRecordsRendered(records) {
  qsa(".section.active table[data-table-target]").forEach((tableEl) => {
    const target = tableEl.dataset.tableTarget;
    const state = tableState.get(target);
    if (!state) return;
    const needsRecord = records.some((record) => state.rows.some((row) => String(row.focus || "").toLowerCase().split("|").map((item) => item.trim()).includes(record) || row.focusText.toLowerCase().includes(record)));
    if (needsRecord && state.rendered < state.rows.length) appendTableRows(target, state.rows.length - state.rendered);
  });
}

function loadVisibleTableBatches() {
  qsa("table[data-table-target]").forEach((tableEl) => {
    const card = tableEl.closest(".table-card");
    const state = tableState.get(tableEl.dataset.tableTarget);
    if (!card || !state || state.rendered >= state.rows.length) return;
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight + 220 && rect.bottom < window.innerHeight + 260) appendTableRows(tableEl.dataset.tableTarget);
  });
}

function updateTableScrollHints() {
  qsa(".table-card").forEach((card) => {
    const hasOverflow = card.scrollWidth > card.clientWidth + 2;
    const atStart = card.scrollLeft <= 2;
    const atEnd = card.scrollLeft + card.clientWidth >= card.scrollWidth - 2;
    card.classList.toggle("has-more-left", hasOverflow && !atStart);
    card.classList.toggle("has-more-right", hasOverflow && !atEnd);
  });
}

function goToFocused(section, record = "") {
  prepareFocusedSection(section, record);
  showSection(section);
  if (record) setTimeout(() => focusRecord(record), 80);
}

function prepareFocusedSection(section, record) {
  if (!record) return;
  if (qs("#global-search")?.value) qs("#global-search").value = "";
  const query = String(record).split("|")[0].toLowerCase();
  if (section === "masterlists") {
    if (data.clients.some((item) => item.name.toLowerCase() === query || item.tin?.toLowerCase() === query)) data.masterTab = "clients";
    else if (data.suppliers.some((item) => item.name.toLowerCase() === query)) data.masterTab = "suppliers";
    else if (data.items.some((item) => item.code.toLowerCase() === query || item.name.toLowerCase() === query)) data.masterTab = "items";
    renderMasterlists();
    return;
  }
  if (section === "receivables-tracker") return renderReceivablesTracker();
  if (section === "payables") return renderPayables();
  if (section === "warranty") return renderWarranty();
  if (section === "replenishments") return renderReplenishments();
  if (section === "collections") return renderCollections();
  if (section === "sales") return renderSales();
  if (section === "purchase-orders") return renderPurchaseOrders();
  if (section === "invoicing") return renderInvoicing();
  if (section === "imports") return renderImports();
  if (section === "reports") return renderReports();
  if (section === "users") return renderUsers();
  if (section === "logs") return renderLogs();
  if (section === "settings") return renderPlatformSettings();
  if (section === "security") return renderSecurity();
  if (section === "reconciliation") return renderReconciliation();
  if (section !== "inventory" || !record) return;
  if (qs("#inventory-status")) qs("#inventory-status").value = "all";
  const stock = data.inventory.find((item) => [item.lot, item.serial, item.code, item.item].some((value) => String(value || "").toLowerCase() === query));
  if (stock) {
    inventoryBranchTab = stock.branch;
    renderInventory();
    return;
  }
  const transfer = data.pendingTransfers.find((item) => [item.id, item.lot].some((value) => String(value || "").toLowerCase() === query));
  if (transfer) renderInventory();
}

function focusRecord(record) {
  const queries = String(record).split("|").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!queries.length) return;
  ensureFocusedRecordsRendered(queries);
  const active = qs(".section.active");
  const candidates = qsa("[data-focus-record], tr, .invoice-card, .tracker-card, .client-ar-card, .report-card, .alert-item, .contact-action-card, .map-marker, .platform-area-chip, .security-card").filter((el) => active?.contains(el) && !el.closest(".workflow-assist"));
  const targets = queries.map((query) => candidates.find((el) => String(el.dataset.focusRecord || "").toLowerCase().split("|").map((item) => item.trim()).includes(query)) || candidates.find((el) => (el.dataset.focusText || el.innerText || "").toLowerCase().includes(query))).filter(Boolean);
  if (!targets.length) return;
  qsa(".focus-target").forEach((el) => el.classList.remove("focus-target"));
  targets.forEach((target) => target.classList.add("focus-target"));
  targets[0].scrollIntoView({ behavior: "smooth", block: "center" });
  if (targets.length > 1) toast(`${targets.length} matching records highlighted. Scroll to review the rest.`);
  setTimeout(() => targets.forEach((target) => target.classList.remove("focus-target")), 5200);
}

function sortTable(button) {
  const tableEl = button.closest("table");
  const target = tableEl?.dataset.tableTarget;
  const state = tableState.get(target);
  if (!tableEl?.tBodies[0] || !state) return;
  const col = Number(button.dataset.sortCol);
  const dir = button.dataset.sortDir === "asc" ? "desc" : "asc";
  tableEl.querySelectorAll("[data-sort-dir]").forEach((item) => delete item.dataset.sortDir);
  button.dataset.sortDir = dir;
  state.rows.sort((a, b) => {
    const av = String(a.cells[col] || "").replace(/<[^>]*>/g, "").trim();
    const bv = String(b.cells[col] || "").replace(/<[^>]*>/g, "").trim();
    const an = Number(av.replace(/[^0-9.-]/g, ""));
    const bn = Number(bv.replace(/[^0-9.-]/g, ""));
    const result = Number.isFinite(an) && Number.isFinite(bn) && av.match(/\d/) && bv.match(/\d/) ? an - bn : av.localeCompare(bv);
    return dir === "asc" ? result : -result;
  });
  state.rendered = 0;
  tableEl.tBodies[0].innerHTML = "";
  appendTableRows(target);
}

function sumBy(items, key, valueFn) {
  return items.reduce((acc, item) => {
    const label = item[key];
    acc[label] = (acc[label] || 0) + valueFn(item);
    return acc;
  }, {});
}

function barRows(entries, formatter = (value) => value, colors = []) {
  if (!entries.length) return `<p>No data available for this view.</p>`;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return entries.map(([label, value], index) => `<div class="chart-row"><span class="chart-label">${escapeHtml(label)}</span><div class="chart-track"><span class="chart-fill ${colors[index] || ""}" style="width:${Math.max(4, Math.round((value / max) * 100))}%"></span></div><span class="chart-value">${formatter(value)}</span></div>`).join("");
}

function graphNote(text) { return `<p class="graph-note">${escapeHtml(text)}</p>`; }
function visualCard(icon, title, value, body, tone = "info", note = "") {
  return `<article class="visual-card ${tone}"><div class="visual-card-head"><span class="feature-icon">${escapeHtml(icon)}</span><div><small>${escapeHtml(title)}</small><strong>${escapeHtml(value)}</strong></div></div><div class="visual-card-body">${body}${note ? graphNote(note) : ""}</div></article>`;
}

function workflowButton(label, section, record = "", action = "") {
  const actionAttr = action ? ` data-workflow-action="${escapeHtml(action)}"` : ` data-go-section="${escapeHtml(section)}" data-focus-record="${escapeHtml(record)}"`;
  return `<button class="mini-button workflow-action" type="button"${actionAttr}>${escapeHtml(label)}</button>`;
}

function workflowCard({ title, text, section = "", record = "", action = "", actionLabel = "Open", tone = "info", meta = "" }) {
  const hasTarget = action || section || record;
  return `<article class="workflow-card ${tone}" data-focus-text="${escapeHtml(`${title} ${text} ${record}`)}"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</div>${hasTarget ? workflowButton(actionLabel, section, record, action) : ""}</article>`;
}

function workflowFacts() {
  const activeSales = data.sales.filter((sale) => sale.status !== "Cancelled");
  const openSales = activeSales.filter((sale) => sale.net > sale.paid);
  const overdue = openSales.filter((sale) => statusForSale(sale) === "Overdue");
  const nearDue = openSales.filter((sale) => statusForSale(sale) === "Near Due");
  const lowStock = data.inventory.filter((item) => ["Low Stock", "Critical"].includes(inventoryStatus(item)));
  const nearExpiry = data.inventory.filter((item) => inventoryStatus(item) === "Near Expiry");
  const missingDocs = data.clients.filter((client) => requiredClientDocs.some((doc) => !client.docs?.includes(doc)));
  const pendingContacts = data.collectionContacts.filter((contact) => contact.status === "Pending" || contact.status === "No Response" || contact.status === "Unreached" || contact.status === "Cheque Available");
  const pendingTransfers = data.pendingTransfers.filter((transfer) => transfer.status === "For Receiving");
  const pendingExpenses = data.replenishments.filter((item) => item.status !== "Approved");
  const duePayables = data.payables.filter((payable) => payable.amount > payable.paid);
  const chequeReviews = data.payments.filter((payment) => payment.method === "Cheque" && (!payment.bank || !payment.chequeDate));
  const duplicateClients = data.clients.filter((client, index) => data.clients.findIndex((item) => item.name.toLowerCase() === client.name.toLowerCase() || item.tin === client.tin) !== index);
  return { activeSales, openSales, overdue, nearDue, lowStock, nearExpiry, missingDocs, pendingContacts, pendingTransfers, pendingExpenses, duePayables, chequeReviews, duplicateClients };
}


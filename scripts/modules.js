let currentReportSaleId = null;
let selectedUserSessionsTarget = null;
let serverReportDefinitions = null;

function moduleWorkflowItems(section) {
  const facts = workflowFacts();
  const topOverdue = facts.overdue[0];
  const topNearDue = facts.nearDue[0];
  const lowItem = facts.lowStock[0];
  const expiringItem = facts.nearExpiry.sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry))[0];
  const missingDocClient = facts.missingDocs[0];
  const pendingContact = facts.pendingContacts[0];
  const pendingTransfer = facts.pendingTransfers[0];
  const duePayable = facts.duePayables[0];
  const topOpenIssue = facts.openIssues[0];
  const topEscalatedIssue = facts.escalatedIssues[0];
  const lowStockRecords = facts.lowStock.map((item) => item.lot).join("|");
  const missingDocRecords = facts.missingDocs.map((client) => client.name).join("|");
  const pendingExpenseRecords = facts.pendingExpenses.map((expense) => expense.id).join("|");
  const duePayableRecords = facts.duePayables.map((payable) => payable.id).join("|");
  const openIssueRecords = facts.openIssues.map((report) => report.id).join("|");
  const queues = {
    dashboard: [
      topOverdue && { title: "Collect overdue AR", text: `${topOverdue.client} has ${peso.format(topOverdue.net - topOverdue.paid)} open.`, action: `open-ar:${topOverdue.documentNo || topOverdue.id}`, tone: "risk" },
      lowItem && { title: "Prevent stockout", text: `${facts.lowStock.length} low/critical stock record${facts.lowStock.length === 1 ? "" : "s"}.`, action: `open-inventory:${lowStockRecords}`, tone: "warning" },
      missingDocClient && { title: "Complete client docs", text: `${facts.missingDocs.length} client${facts.missingDocs.length === 1 ? "" : "s"} missing required attachments.`, section: "masterlists", record: missingDocRecords, tone: "info" },
      pendingTransfer && { title: "Receive transfer", text: `${pendingTransfer.id} is waiting for ${pendingTransfer.to}.`, section: "inventory", record: pendingTransfer.id, tone: "warning" },
    ],
    analytics: [
      { title: "Prioritize recovery", text: `${facts.overdue.length + facts.nearDue.length} invoices are overdue or near due.`, section: "collections", action: "queue-collections", tone: facts.overdue.length ? "risk" : "warning" },
      expiringItem && { title: "Bundle expiring stock", text: `${expiringItem.item} expires in ${daysUntil(expiringItem.expiry)} days.`, action: `open-inventory:${expiringItem.lot}`, tone: "warning" },
      { title: "Review demand pattern", text: "Use top brands/items to plan reorder and sales focus.", tone: "info" },
    ],
    masterlists: [
      missingDocClient && { title: "Missing client documents", text: `${facts.missingDocs.length} clients need document completion.`, section: "masterlists", record: missingDocRecords, tone: "warning" },
      facts.duplicateClients.length && { title: "Duplicate client/TIN risk", text: `${facts.duplicateClients.length} possible duplicates need Superadmin review.`, section: "masterlists", record: facts.duplicateClients[0].name, tone: "risk" },
      { title: "Standardize client terms", text: "Keep terms on client records so invoices auto-calculate due dates correctly.", tone: "info" },
    ],
    inventory: [
      lowItem && { title: "Reorder or transfer", text: `${facts.lowStock.length} low/critical stock records.`, action: `open-inventory:${lowStockRecords}`, tone: "risk" },
      expiringItem && { title: "FEFO dispatch", text: `Use lot ${expiringItem.lot} first; expires ${expiringItem.expiry}.`, action: `open-inventory:${expiringItem.lot}`, tone: "warning" },
      pendingTransfer && { title: "Receive transfer", text: `${pendingTransfer.id} is waiting for confirmation.`, section: "inventory", record: pendingTransfer.id, tone: "warning" },
    ],
    sales: [
      expiringItem && { title: "Sell FEFO stock first", text: `${expiringItem.item} lot ${expiringItem.lot} should be prioritized.`, action: `open-inventory:${expiringItem.lot}`, tone: "warning" },
      missingDocClient && { title: "Client compliance before invoice", text: `Check ${facts.missingDocs.length} client${facts.missingDocs.length === 1 ? "" : "s"} with missing docs.`, section: "masterlists", record: missingDocRecords, tone: "warning" },
      { title: "Copy repeat orders", text: "Use client history before encoding repeat invoice lines manually.", tone: "info" },
    ],
    invoicing: [
      { title: "Prevent document errors", text: "Duplicate SI/TS/DR, missing lots, expired stock, and credit limits are blocked before save.", tone: "info" },
      topNearDue && { title: "Collect before new exposure", text: `${topNearDue.client} is near due before more credit.`, section: "collections", record: topNearDue.client, tone: "warning" },
    ],
    collections: [
      pendingContact && { title: "Today’s call queue", text: `${facts.pendingContacts.length} clients still need contact outcome.`, section: "collections", record: pendingContact.client, action: "queue-collections", tone: "warning" },
      topOverdue && { title: "Highest AR risk", text: `${topOverdue.client}: ${peso.format(topOverdue.net - topOverdue.paid)} overdue.`, action: `open-ar:${topOverdue.documentNo || topOverdue.id}`, tone: "risk" },
      { title: "Send reminders", text: "Mark all pending follow-ups as reminded in one batch.", section: "collections", action: "bulk-remind", tone: "info" },
    ],
    "receivables-tracker": [
      topOverdue && { title: "Open oldest overdue", text: `${topOverdue.documentNo || topOverdue.id} needs collection action.`, action: `open-ar:${topOverdue.documentNo || topOverdue.id}`, tone: "risk" },
      { title: "View aging buckets", text: "Use AR status tabs to reduce manual filtering.", tone: "info" },
    ],
    warranty: [
      data.warranties[0] && { title: "Schedule service", text: "Use serial warranty records before dispatching replacement units.", action: `open-warranty:${data.warranties[0].serial}`, tone: "info" },
    ],
    "product-issues": [
      topOpenIssue && { title: "Work open reports", text: `${facts.openIssues.length} open report${facts.openIssues.length === 1 ? "" : "s"}, oldest: ${topOpenIssue.companyName}.`, action: `open-issue:${openIssueRecords}`, tone: "risk" },
      topEscalatedIssue && { title: "Engineering follow-up", text: `${facts.escalatedIssues.length} report${facts.escalatedIssues.length === 1 ? "" : "s"} passed to Engineering awaiting resolution.`, action: `open-issue:${topEscalatedIssue.id}`, tone: "warning" },
      { title: "Complete QC parameters", text: "Fill in all QC parameters and actions taken before marking a report Resolved.", tone: "info" },
    ],
    "purchase-history": [
      { title: "Repeat-order shortcut", text: "Review client history before creating manual invoice lines.", tone: "info" },
    ],
    payables: [
      duePayable && { title: "Payable queue", text: `${facts.duePayables.length} payable${facts.duePayables.length === 1 ? "" : "s"} have open balances.`, action: `open-payable:${duePayableRecords}`, tone: "warning" },
      { title: "Cheque controls", text: "Cheque payables require bank and cheque number before save.", tone: "info" },
    ],
    replenishments: [
      facts.pendingExpenses.length && { title: "Approval queue", text: `${facts.pendingExpenses.length} expenses need HR/accounting action.`, section: "replenishments", record: pendingExpenseRecords, tone: "warning" },
    ],
    imports: [
      { title: "Pre-import safety", text: "Duplicate clients, unsupported areas, and missing fields are blocked before import.", section: "imports", action: "check-import", tone: "info" },
    ],
    reports: [
      { title: "Scheduled reporting", text: "Use saved report cards to avoid rebuilding common management views.", tone: "info" },
      facts.overdue.length && { title: "Export AR support", text: `${facts.overdue.length} overdue invoices should be included in collection report.`, action: `open-ar:${topOverdue.documentNo || topOverdue.id}`, tone: "risk" },
    ],
    reconciliation: [
      { title: "Run fix-oriented checks", text: "Find duplicate receipts, missing docs, transfer issues, and AR mismatches with direct fix buttons.", action: "run-reconciliation", actionLabel: "Run", tone: "info" },
      facts.chequeReviews.length && { title: "Cheque data gap", text: `${facts.chequeReviews.length} cheque records need bank/date cleanup.`, section: "collections", tone: "warning" },
    ],
    security: [
      { title: "Audit risky actions", text: "Watch discount approvals, credit overrides, cancellations, and backdated payments.", tone: "info" },
    ],
    notifications: [
      { title: "Actionable alerts", text: "Open each alert directly instead of searching module tables.", tone: "info" },
    ],
    users: [
      { title: "Role-based queues", text: "Keep each user focused on modules and approvals for their role.", tone: "info" },
    ],
  };
  return (queues[section] || []).filter(Boolean).slice(0, 4);
}

function workflowTitle(section) {
  return ({ dashboard: "Smart Action Queue", analytics: "Decision Shortcuts", masterlists: "Data Quality Queue", inventory: "Warehouse Task Queue", sales: "Sales Safety Queue", invoicing: "Invoice Error Prevention", collections: "Collector Work Queue", "receivables-tracker": "AR Recovery Queue", payables: "Payables Work Queue", replenishments: "Approval Work Queue", reports: "Report Automation", reconciliation: "Fix Queue", security: "Risk Controls", imports: "Import Safety", warranty: "Service Queue", "purchase-history": "Repeat Order Assist", notifications: "Alert Workflow", users: "Access Workflow", "product-issues": "Support Resolution Queue" }[section] || "Workflow Assistant");
}

function ensureWorkflowPanel(sectionId) {
  if (sectionId === "notifications") return null;
  const section = document.getElementById(sectionId);
  if (!section || section.querySelector(".workflow-assist")) return section?.querySelector(".workflow-assist");
  const anchor = section.querySelector(".section-header, .toolbar, .feature-strip") || section.firstElementChild;
  const panel = document.createElement("article");
  panel.className = "panel workflow-assist";
  panel.dataset.workflowSection = sectionId;
  panel.innerHTML = `<div class="panel-header"><div><p class="eyebrow">Workflow Assistant</p><h2></h2><p></p></div><span class="badge"></span></div><div class="workflow-grid"></div>`;
  anchor?.insertAdjacentElement(anchor.classList.contains("section-header") ? "afterend" : "beforebegin", panel);
  return panel;
}

function renderWorkflowAssist(sectionId) {
  const panel = ensureWorkflowPanel(sectionId);
  if (!panel) return;
  const items = moduleWorkflowItems(sectionId);
  panel.querySelector("h2").textContent = workflowTitle(sectionId);
  panel.querySelector("p:not(.eyebrow)").textContent = "Recommended next actions to reduce manual work, prevent errors, and finish recurring tasks faster.";
  panel.querySelector(".badge").textContent = `${items.length} recommendation${items.length === 1 ? "" : "s"}`;
  panel.querySelector(".workflow-grid").innerHTML = items.map(workflowCard).join("") || `<article class="workflow-card success"><div><strong>All clear</strong><span>No urgent workflow recommendations for this module.</span></div></article>`;
}

function renderWorkflowAssistAll() {
  ["dashboard", "analytics", "masterlists", "inventory", "sales", "invoicing", "collections", "receivables-tracker", "warranty", "purchase-history", "imports", "payables", "replenishments", "reports", "reconciliation", "security", "users", "product-issues"].forEach(renderWorkflowAssist);
}

function monthLabel(value) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

function lineChart(entries) {
  if (!entries.length) return `<p>No sales trend available for this view.</p>`;
  const width = 720;
  const height = 260;
  const pad = 42;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  const xStep = entries.length > 1 ? (width - pad * 2) / (entries.length - 1) : 0;
  const points = entries.map(([, value], index) => {
    const x = entries.length > 1 ? pad + index * xStep : width / 2;
    const y = height - pad - (value / max) * (height - pad * 2);
    return { x, y, value };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${points.at(-1).x},${height - pad}`;
  const gridlines = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = height - pad - ratio * (height - pad * 2);
    return `<line class="chart-gridline" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"></line>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly sales line graph">
    <defs><linearGradient id="salesTrendGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity="0.28"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs>
    ${gridlines}<line class="chart-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
    <polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>
    ${points.map((point, index) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="7"><title>${monthLabel(entries[index][0])}: ${peso.format(point.value)}</title></circle>`).join("")}
    ${entries.map(([label], index) => `<text class="chart-text" x="${points[index].x}" y="${height - 12}" text-anchor="middle">${escapeHtml(monthLabel(label))}</text>`).join("")}
  </svg>`;
}

function multiSeriesChart(labels, series) {
  if (!labels.length) return `<p>No trend data available for this view.</p>`;
  const width = 760;
  const height = 280;
  const pad = 44;
  const barSeries = series.filter((s) => s.type === "bar");
  const lineSeries = series.filter((s) => s.type !== "bar");
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const xStep = labels.length > 1 ? (width - pad * 2) / (labels.length - 1) : 0;
  const barWidth = Math.min(26, (labels.length > 1 ? xStep : width - pad * 2) * 0.36);
  const xFor = (index) => (labels.length > 1 ? pad + index * xStep : width / 2);
  const yFor = (value) => height - pad - (value / max) * (height - pad * 2);
  const gridlines = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = height - pad - ratio * (height - pad * 2);
    return `<line class="chart-gridline" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"></line>`;
  }).join("");
  const tip = (s, index) => `${escapeHtml(s.label)} — ${escapeHtml(String(labels[index]))}: ${s.format ? s.format(s.values[index] || 0) : s.values[index] || 0}`;
  const bars = barSeries.map((s) => labels.map((_, index) => {
    const x = xFor(index) - barWidth / 2;
    const y = yFor(s.values[index] || 0);
    const barHeight = Math.max(2, height - pad - y);
    return `<rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${s.color}"><title>${tip(s, index)}</title></rect>`;
  }).join("")).join("");
  const lines = lineSeries.map((s) => {
    const points = labels.map((_, index) => `${xFor(index)},${yFor(s.values[index] || 0)}`).join(" ");
    const dots = labels.map((_, index) => `<circle class="chart-multi-point" cx="${xFor(index)}" cy="${yFor(s.values[index] || 0)}" r="4.5" fill="${s.color}"><title>${tip(s, index)}</title></circle>`).join("");
    return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="6 5"' : ""}></polyline>${dots}`;
  }).join("");
  const axisLabels = labels.map((label, index) => `<text class="chart-text" x="${xFor(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(String(label))}</text>`).join("");
  const legend = series.map((s) => `<span class="chart-legend-item"><i style="background:${s.color}"></i>${escapeHtml(s.label)}</span>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sales and collections trend">
    ${gridlines}<line class="chart-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
    ${bars}${lines}${axisLabels}
  </svg><div class="chart-legend-row">${legend}</div>`;
}

function verticalBars(entries) {
  if (!entries.length) return `<p>No salesperson data available for this view.</p>`;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return entries.map(([label, value]) => `<div class="vertical-bar"><span class="vertical-value">${peso.format(value)}</span><div class="vertical-track"><span class="vertical-fill" style="height:${Math.max(6, Math.round((value / max) * 100))}%"></span></div><span class="vertical-label">${escapeHtml(label)}</span></div>`).join("");
}

function parseInvoiceLines(text, options = {}) {
  const requireLot = options.requireLot !== false;
  return text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => {
    const [itemName, brandValue, qtyValue, uomValue, priceValue, sixthValue, seventhValue, eighthValue, discountValue] = row.split("|").map((cell) => cell.trim());
    const hasBranch = platformBranches().some((branch) => branch.toLowerCase() === String(sixthValue || "").toLowerCase());
    const sourceBranch = hasBranch ? sixthValue : "";
    const lotValue = hasBranch ? seventhValue : sixthValue;
    const expiryValue = hasBranch ? eighthValue : seventhValue;
    const item = data.items.find((entry) => entry.name === itemName || entry.code === itemName);
    if (!item) throw new Error(`Unknown item: ${itemName}`);
    const qty = Number(qtyValue);
    const price = Number(priceValue);
    if (!qty || qty <= 0 || Number.isNaN(price) || price < 0) throw new Error(`Invalid qty or price for ${item.name}`);
    if (requireLot && !lotValue) throw new Error(`Missing lot number for ${item.name}`);
    if (requireLot && !expiryValue) throw new Error(`Missing expiry date for ${item.name}`);
    return { item: item.name, code: item.code, brand: brandValue || item.brand, qty, uom: uomValue || item.uom || "unit", price, sourceBranch, branch: sourceBranch, lot: lotValue || "", expiry: expiryValue || "", discount: Number(discountValue || 0), discountReason: "" };
  });
}

function lineSubtotal(line) { return Math.max(0, line.qty * line.price); }
function saleSummary(sale) { return (sale.lines || []).map((line) => `${line.item} (${line.qty} ${line.uom})`).join(", ") || `${sale.item} (${sale.qty || 0} ${sale.uom || "unit"})`; }
function saleBrandSummary(sale) { return [...new Set((sale.lines || []).map((line) => line.brand).filter(Boolean))].join(", ") || sale.brand || "-"; }
function saleAmount(lines) { return lines.reduce((sum, line) => sum + lineSubtotal(line), 0); }
function documentExists(documentNo, exceptId = null) {
  const normalized = String(documentNo || "").trim().toLowerCase();
  return data.sales.some((sale) => String(sale.documentNo || sale.id || "").trim().toLowerCase() === normalized && sale.id !== exceptId);
}
function receiptExists(receiptNo) {
  const normalized = String(receiptNo || "").trim().toLowerCase();
  return data.payments.some((payment) => String(payment.receiptNo || "").trim().toLowerCase() === normalized);
}
function branchUsageReasons(branch) {
  return [
    data.inventory.some((item) => item.branch === branch) && "inventory stock",
    data.pendingTransfers.some((transfer) => transfer.from === branch || transfer.to === branch) && "stock transfers",
    data.sales.some((sale) => sale.sourceBranch === branch || (sale.lines || []).some((line) => line.sourceBranch === branch || line.branch === branch)) && "posted invoices",
    (data.inventoryPurchaseOrders || []).some((po) => po.branch === branch || po.receivingBranch === branch) && "inventory purchase orders",
  ].filter(Boolean);
}
function discountNeedsApproval(discount) { return Number(discount || 0) > 0; }
function findItemByCodeOrName(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return null;
  return data.items.find((entry) => entry.code.toLowerCase() === query || entry.name.toLowerCase() === query)
    || data.items.find((entry) => entry.code.toLowerCase().startsWith(query) || entry.name.toLowerCase().startsWith(query))
    || data.items.find((entry) => entry.code.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query));
}
function findItemForSheetRow(row, changedInput = null, allowPartial = false) {
  const code = row.querySelector(".stock-code, .transfer-code")?.value.trim().toLowerCase() || "";
  const name = row.querySelector(".stock-item, .transfer-item")?.value.trim().toLowerCase() || "";
  const changedValue = String(changedInput?.value || "").trim().toLowerCase();
  const exact = data.items.find((entry) => entry.code.toLowerCase() === code)
    || data.items.find((entry) => entry.name.toLowerCase() === name)
    || data.items.find((entry) => entry.code.toLowerCase() === changedValue || entry.name.toLowerCase() === changedValue);
  if (exact || !allowPartial) return exact || null;
  return findItemByCodeOrName(changedInput?.value) || findItemByCodeOrName(code) || findItemByCodeOrName(name);
}
function collectionTagForType(type) { return type === "TS" ? "TS-PR" : ["DR", "DRS"].includes(type) ? "DR-CR" : "SI-CR"; }
function paymentRequestHistory(request) {
  return request.history?.length ? request.history : [{ date: request.date, status: request.requestStatus || request.status || "Prepared", note: "Payment request created.", by: request.preparedBy }];
}

function paymentRequestActionsCell(request) {
  const printBtn = `<button class="mini-button" data-payment-request-preview="${escapeHtml(request.cvNo)}">Preview / Print</button>`;
  const timelineBtn = `<button class="mini-button" data-payment-request-timeline="${escapeHtml(request.cvNo)}">View Timeline</button>`;
  const approveBtn = request.invoice && request.requestStatus === "Pending"
    ? (canApprovePaymentRequests() ? `<button class="mini-button" data-payment-request-approve="${escapeHtml(request.cvNo)}">Approve</button>` : `<small>Awaiting Superadmin/CEO</small>`)
    : "";
  const linkedPayment = data.payments.find((entry) => entry.paymentRequestCvNo === request.cvNo);
  const isDepositFinal = linkedPayment?.collectionStatus === "Deposited";
  const isCancellable = request.requestStatus === "Pending";
  const cancelBtn = isCancellable && canApprovePaymentRequests() ? `<button class="mini-button danger-button" data-payment-request-cancel="${escapeHtml(request.cvNo)}">Cancel</button>` : "";
  const statusActions = request.requestStatus === "Approved" && linkedPayment && !isDepositFinal
    ? `<button class="mini-button" data-collection-status="${escapeHtml(linkedPayment.receiptNo)}:Deposited">Deposited</button><button class="mini-button danger-button" data-collection-status="${escapeHtml(linkedPayment.receiptNo)}:Bounced">Bounced</button><button class="mini-button" data-collection-status="${escapeHtml(linkedPayment.receiptNo)}:Posted Date">Posted Date</button>`
    : "";
  return `<div class="inline-actions">${approveBtn}${cancelBtn}${statusActions}${timelineBtn}${printBtn}</div>`;
}

function saleForPayment(payment) {
  return data.sales.find((sale) => (sale.documentNo || sale.id) === payment.invoice || sale.id === payment.invoice || sale.documentNo === payment.invoice);
}

function applyCollectionPayment(payment) {
  const sale = saleForPayment(payment);
  if (!sale) return;
  if (payment.appliedToInvoice === true) return;
  if (payment.appliedToInvoice === undefined) {
    // Legacy approved requests used to add paid amount immediately on approval.
    payment.appliedToInvoice = true;
    return;
  }
  sale.paid = Number(sale.paid || 0) + Number(payment.amount || 0);
  payment.appliedToInvoice = true;
}

function reverseCollectionPayment(payment) {
  const sale = saleForPayment(payment);
  if (!sale) return;
  if (payment.appliedToInvoice === false) return;
  sale.paid = Math.max(Number(sale.paid || 0) - Number(payment.amount || 0), 0);
  payment.appliedToInvoice = false;
}

function paymentRequestPayments(requestOrCvNo) {
  const cvNo = typeof requestOrCvNo === "string" ? requestOrCvNo : requestOrCvNo?.cvNo;
  return data.payments.filter((entry) => entry.paymentRequestCvNo === cvNo || entry.receiptNo === cvNo);
}

async function approvePaymentRequest(cvNo) {
  if (!canApprovePaymentRequests()) return toast("Only Superadmin or CEO can approve payment requests.");
  const request = data.paymentRequests.find((entry) => entry.cvNo === cvNo);
  if (!request) return toast("Payment request not found.");
  const invoiceIds = request.invoices?.length ? request.invoices : (request.invoice ? request.invoice.split(",").map((id) => id.trim()).filter(Boolean) : []);
  if (!invoiceIds.length) return toast("This payment request is not linked to an invoice.");
  if (request.requestStatus !== "Pending") return toast("This payment request has already been processed.");
  const sales = invoiceIds.map((id) => findSaleByDocumentInput(id)).filter(Boolean).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  if (!sales.length) return toast("Linked invoice(s) not found.");
  const combinedBalance = sales.reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
  const requestedAmount = Number(request.total || request.amount || 0);
  if (requestedAmount > combinedBalance) return toast(`Cannot approve: requested ${peso.format(requestedAmount)} exceeds the combined remaining balance of ${peso.format(combinedBalance)}.`);
  const isFull = requestedAmount >= combinedBalance;
  const ok = await confirmDetailsModal({
    eyebrow: "Confirm Approval",
    title: `Approve ${request.cvNo}`,
    fields: [["Invoice(s)", sales.map((sale) => sale.documentNo || sale.id).join(", ")], ["Client", sales[0].client], ["Requested Amount", peso.format(requestedAmount)], ["Combined Balance", peso.format(combinedBalance)]],
    confirmLabel: "Approve & Record Payment",
    note: isFull ? "This will fully settle the selected invoice(s)." : "This will be recorded as a partial payment, applied to the oldest invoice first.",
  });
  if (!ok) return;
  const by = currentUser?.name || "System User";
  let remaining = requestedAmount;
  const newPayments = [];
  sales.forEach((sale) => {
    if (remaining <= 0) return;
    const balance = Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0);
    if (balance <= 0) return;
    const applied = Math.min(balance, remaining);
    remaining -= applied;
    const payment = { invoice: sale.documentNo || sale.id, tag: collectionTagForType(sale.type), receiptNo: request.cvNo, method: request.paymentType || "Cash", bank: request.bank || "", reference: "", chequeDate: request.chequeDate || "", dateCollected: fmtDate(today), dateRecorded: fmtDate(today), client: sale.client, amount: applied, collectionStatus: "For Deposition", appliedToInvoice: false, statusHistory: collectionStatusHistory("For Deposition"), paymentRequestCvNo: request.cvNo };
    data.payments.push(payment);
    newPayments.push(payment);
  });
  request.requestStatus = "Approved";
  request.status = "Approved";
  request.approvedBy = by;
  request.approvedAt = fmtDate(today);
  request.history = paymentRequestHistory(request);
  request.history.push({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status: "Approved", note: `Approved by ${by}. ${isFull ? "Full" : "Partial"} payment of ${peso.format(requestedAmount)} queued for deposition across ${sales.length} invoice(s), oldest first. Invoice paid amount updates only after deposit.`, by });
  await persistRecords({ paymentRequests: [request], payments: newPayments });
  log("Approved payment request", "Collections", `${request.cvNo}: ${peso.format(requestedAmount)} queued for deposition (${isFull ? "Full" : "Partial"})`, { save: false });
  notify("Payment Request", `${request.cvNo} approved — pending bank deposit.`, "collections", request.cvNo);
  saveData(["notifications"]);
  renderAll();
  toast(`${request.cvNo} approved and queued for deposition.`);
}

async function cancelPaymentRequest(cvNo) {
  if (!canApprovePaymentRequests()) return toast("Only Superadmin or CEO can cancel payment requests.");
  const request = data.paymentRequests.find((entry) => entry.cvNo === cvNo);
  if (!request) return toast("Payment request not found.");
  if (request.requestStatus === "Cancelled") return toast("This payment request is already cancelled.");
  if (request.requestStatus === "Approved") return toast("Approved payment requests cannot be cancelled. Update the collection status instead.");
  const payment = data.payments.find((entry) => entry.paymentRequestCvNo === request.cvNo);
  if (payment?.collectionStatus === "Deposited") return toast("This payment has already been deposited and can no longer be cancelled.");
  const sale = request.invoice ? findSaleByDocumentInput(request.invoice) : null;
  const { ok, reason } = await confirmDetailsModal({
    eyebrow: "Confirm Cancellation",
    title: `Cancel ${request.cvNo}`,
    fields: [["Invoice", request.invoice || "-"], ["Client", request.employee], ["Total", peso.format(request.total || 0)], ["Status", request.requestStatus || request.status || "-"]],
    confirmLabel: "Cancel Request",
    danger: true,
    collectReason: true,
    reasonLabel: "Reason for cancellation",
    note: payment ? "This will also reverse the recorded payment and the invoice's paid amount, since the payment has not been deposited yet." : "",
  });
  if (!ok) return;
  if (!reason) return toast("A cancellation reason is required.");
  const by = currentUser?.name || "System User";
  if (payment && sale) {
    sale.paid = Math.max(Number(sale.paid || 0) - Number(payment.amount || 0), 0);
    payment.collectionStatus = "Cancelled";
    payment.voided = true;
    payment.statusHistory ||= [];
    payment.statusHistory.push(...collectionStatusHistory("Cancelled"));
  }
  request.requestStatus = "Cancelled";
  request.status = "Cancelled";
  request.cancelledBy = by;
  request.cancelledAt = fmtDate(today);
  request.cancelReason = reason;
  request.history = paymentRequestHistory(request);
  request.history.push({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status: "Cancelled", note: `Cancelled by ${by}. Reason: ${reason}`, by });
  await persistRecords({ paymentRequests: [request], payments: payment ? [payment] : [], sales: sale ? [sale] : [] });
  log("Cancelled payment request", "Collections", `${request.cvNo}: ${reason}`, { save: false });
  notify("Payment Request", `${request.cvNo} cancelled.`, "collections", request.cvNo);
  saveData(["notifications"]);
  renderAll();
  toast(`${request.cvNo} cancelled.`);
}

function renderPaymentRequestDetail(cvNo) {
  const request = data.paymentRequests.find((entry) => entry.cvNo === cvNo);
  if (!request) return toast("Payment request not found.");
  const events = paymentRequestHistory(request);
  const payment = data.payments.find((entry) => entry.paymentRequestCvNo === request.cvNo);
  const depositHistory = payment?.statusHistory?.length ? payment.statusHistory.map((entry) => `<li>${escapeHtml(entry.date)} · ${escapeHtml(entry.status)} · ${escapeHtml(entry.user || "System User")}</li>`).join("") : `<li>No status history yet.</li>`;
  const isDepositFinal = payment?.collectionStatus === "Deposited" || request.requestStatus === "Cancelled";
  const depositActions = isDepositFinal
    ? `<p class="page-description">${request.requestStatus === "Cancelled" ? "This payment request was cancelled." : "Deposited — this payment is final and its status can no longer be changed."}</p>`
    : `<div class="modal-actions collection-status-actions"><button class="ghost-button" data-collection-status="${escapeHtml(payment?.receiptNo)}:Deposited">Deposited</button><button class="ghost-button danger-button" data-collection-status="${escapeHtml(payment?.receiptNo)}:Bounced">Bounced</button><button class="ghost-button" data-collection-status="${escapeHtml(payment?.receiptNo)}:Posted Date">Posted Date</button></div>`;
  const depositSection = payment ? `<div class="collection-detail-card"><header><div><span class="eyebrow">Deposition</span><strong>${escapeHtml(payment.receiptNo)}</strong><small>${peso.format(Number(payment.amount || 0))}${payment.postedDate ? ` · Posted ${escapeHtml(payment.postedDate)}` : ""}</small></div><span class="pill ${statusClass(payment.collectionStatus || "For Deposition")}">${escapeHtml(payment.collectionStatus || "For Deposition")}</span></header><div class="collection-history-panel"><h3>Deposit Status History</h3><ul>${depositHistory}</ul></div>${depositActions}</div>` : "";
  qs("#payment-request-detail-title").textContent = `${request.cvNo} · ${request.employee}`;
  qs("#payment-request-detail-panel").innerHTML = `<div class="panel-header"><div><p class="eyebrow">${escapeHtml(request.employee || "-")}</p><h2>${escapeHtml(request.invoice ? `Linked to ${request.invoice}` : "CV Voucher")}</h2></div><span class="pill ${statusClass(request.requestStatus || request.status)}">${escapeHtml(request.requestStatus || request.status || "-")}</span></div><div class="report-preview-grid invoice-mini-grid"><div class="report-preview-card"><small>Date</small><strong>${escapeHtml(request.date || "-")}</strong></div><div class="report-preview-card"><small>Total</small><strong>${peso.format(request.total || 0)}</strong></div><div class="report-preview-card"><small>Prepared By</small><strong>${escapeHtml(request.preparedBy || "-")}</strong></div><div class="report-preview-card"><small>Approved By</small><strong>${escapeHtml(request.approvedBy || "-")}</strong></div></div>${depositSection}<details class="full-event-details" open><summary>Status timeline</summary><div class="event-timeline">${events.map((event) => `<div class="event-item ${event.status === "Approved" ? "done" : "pending"}"><span>${escapeHtml((event.status || "P")[0])}</span><time>${escapeHtml(event.date || "")}</time><div><strong>${escapeHtml(event.status || "")}</strong><p>${escapeHtml(event.note || "-")}</p><small>${escapeHtml(event.by || "-")}</small></div></div>`).join("")}</div></details>`;
  showSection("payment-request-detail");
}

function openInvoicesForPaymentRequest(clientName = "") {
  return data.sales.filter((sale) => sale.status !== "Cancelled" && Number(sale.net || 0) - Number(sale.paid || 0) > 0 && (!clientName || sale.client === clientName))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

function syncPaymentRequestInvoiceOptions(preselect = []) {
  const list = qs("#payment-request-invoice-list");
  if (!list) return;
  const clientName = qs("#employee")?.value.trim() || "";
  const invoices = openInvoicesForPaymentRequest(clientName);
  const preselectSet = new Set(preselect);
  list.innerHTML = invoices.length
    ? invoices.map((sale) => {
        const doc = sale.documentNo || sale.id;
        const balance = Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0);
        return `<label class="ios-check-row compact-doc-check"><input class="payment-request-invoice-check" type="checkbox" value="${escapeHtml(doc)}" ${preselectSet.has(doc) ? "checked" : ""} /><span></span><strong>${escapeHtml(doc)}</strong><small>${peso.format(balance)} balance · Due ${escapeHtml(fmtDate(addDays(sale.date, sale.terms)))}</small></label>`;
      }).join("")
    : `<p class="field-help">${clientName ? "No unpaid or partially paid invoices for this client." : "Select a client to see their unpaid/partially paid invoices."}</p>`;
  syncPaymentRequestInvoiceHidden();
}

function syncPaymentRequestInvoiceHidden() {
  const hidden = qs("#invoice");
  if (!hidden) return;
  hidden.value = qsa(".payment-request-invoice-check:checked").map((input) => input.value).join(", ");
}

function collectPaymentRequestInvoices() {
  return qsa(".payment-request-invoice-check:checked").map((input) => input.value);
}

function findSaleByDocumentInput(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return null;
  return data.sales.find((item) => (item.id || "").toLowerCase() === query || (item.documentNo || "").toLowerCase() === query)
    || data.sales.find((item) => (item.id || "").toLowerCase().startsWith(query) || (item.documentNo || "").toLowerCase().startsWith(query));
}

function invoiceLineTemplate(line = {}, options = {}) {
  const requireLot = options.requireLot !== false;
  const allowDiscount = Boolean(options.allowDiscount);
  const item = findItemByCodeOrName(line.code || line.item || line.name);
  const selectedInvoiceBranch = qs("#sourceBranch")?.value || line.sourceBranch || line.branch || inventoryBranchTab || platformBranches()[0] || "";
  const preferredBranch = selectedInvoiceBranch;
  const stock = item ? data.inventory.find((entry) => (entry.code === item.code || entry.item === item.name) && entry.branch === preferredBranch) || {} : {};
  const selectedUom = line.uom || item?.uom || "unit";
  return `<div class="invoice-line-row">
    <div class="invoice-line-fields">
      <div class="field item-field"><label>Item</label><input class="invoice-item-input" list="item-master-options" value="${escapeHtml(line.item || item?.name || "")}" placeholder="Type item name or code" required /></div>
      <input class="invoice-source-branch-input" type="hidden" value="${escapeHtml(selectedInvoiceBranch)}" />
      <div class="field brand-field"><label>Brand</label><input class="invoice-brand-input" value="${escapeHtml(line.brand || item?.brand || "")}" readonly /></div>
      <div class="field qty-field"><label>Qty</label><input class="invoice-qty-input" type="number" min="1" value="${line.qty ? Number(line.qty) : ""}" required /></div>
      <div class="field unit-field"><label>Unit</label><select class="invoice-uom-input" required>${uomOptions.map((uom) => `<option ${uom === selectedUom ? "selected" : ""}>${uom}</option>`).join("")}</select></div>
      <div class="field price-field"><label>Price</label><input class="invoice-price-input" type="number" min="0" value="${line.price || ""}" required /></div>
      ${requireLot ? `<div class="field lot-field"><label>Lot No.</label><input class="invoice-lot-input" list="invoice-lot-options" value="${escapeHtml(line.lot || stock.lot || "")}" placeholder="Lot number" required /></div><div class="field expiry-field"><label>Expiry</label><input class="invoice-expiry-input" type="date" min="${fmtDate(today)}" value="${escapeHtml(line.expiry && line.expiry !== "N/A" ? line.expiry : stock.expiry && stock.expiry !== "N/A" ? stock.expiry : "")}" required /></div>` : `<input class="invoice-lot-input" type="hidden" value="" /><input class="invoice-expiry-input" type="hidden" value="" />`}
      ${allowDiscount ? `<div class="field"><label>Discount</label><input class="invoice-discount-input" type="number" min="0" value="${line.discount || ""}" /></div>` : `<input class="invoice-discount-input" type="hidden" value="${line.discount || 0}" />`}
    </div>
    <button class="icon-button remove-invoice-line" type="button" aria-label="Remove item" title="Remove item">×</button>
  </div>`;
}

function findClientByName(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return null;
  return data.clients.find((client) => client.name.toLowerCase() === query)
    || data.clients.find((client) => client.name.toLowerCase().includes(query));
}

function poServedQty(po, code) {
  return data.sales
    .filter((sale) => sale.po === po.id && sale.status !== "Cancelled")
    .flatMap((sale) => sale.lines || [])
    .filter((line) => line.code === code)
    .reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

function poLineStatus(po, line) {
  const served = poServedQty(po, line.code);
  return { served, pending: Math.max(Number(line.qty || 0) - served, 0) };
}

function poStatus(po) {
  const pending = (po.lines || []).reduce((sum, line) => sum + poLineStatus(po, line).pending, 0);
  const served = (po.lines || []).reduce((sum, line) => sum + poLineStatus(po, line).served, 0);
  if (pending <= 0) return po.completedType === "TS" ? "Transmittal Slip" : "Sales Invoice";
  if (served > 0) return "Pending Orders";
  return "For Invoicing";
}

function poFullyPaid(po) {
  const linkedSales = data.sales.filter((sale) => sale.po === po.id && sale.status !== "Cancelled");
  return linkedSales.length > 0 && linkedSales.every((sale) => Number(sale.paid || 0) >= Number(sale.net || 0));
}

function poInvoiceable(po) {
  return !["Sales Invoice", "Transmittal Slip"].includes(poStatus(po)) && !poFullyPaid(po);
}

function openPurchaseOrdersForClient(clientName) {
  return data.purchaseOrders.filter((po) => po.client === clientName && poInvoiceable(po));
}

function renderInvoiceEditor(lines = [{}], options = {}) {
  const requireLot = options.requireLot !== false;
  const allowDiscount = Boolean(options.allowDiscount);
  const help = requireLot ? "Search item name. Enter lot and expiry before creating SI, TS, or DR." : "Search item name. Lot and expiry will be entered during invoicing.";
  return `<div class="field full invoice-editor"><label>Itemized Lines</label><datalist id="item-master-options">${data.items.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.code)} · ${escapeHtml(item.brand)}</option>`).join("")}</datalist><datalist id="invoice-lot-options">${data.inventory.map((entry) => `<option value="${escapeHtml(entry.lot)}">${escapeHtml(entry.item)} · ${escapeHtml(entry.branch)} · Qty ${entry.qty}</option>`).join("")}</datalist><div class="invoice-line-list" id="invoice-line-list">${lines.map((line) => invoiceLineTemplate(line, { requireLot, allowDiscount })).join("")}</div><div class="invoice-editor-actions"><button class="ghost-button" id="add-invoice-line" type="button">Add Item</button><small>${help}${allowDiscount ? " Each line can include discount." : ""}</small></div><input id="itemsText" name="itemsText" type="hidden" /><div class="invoice-compute-preview" id="invoice-compute-preview"></div></div>`;
}

function collectInvoiceEditorLines() {
  return qsa(".invoice-line-row").map((row) => {
    const itemValue = row.querySelector(".invoice-item-input").value.trim();
    const sourceBranch = qs("#sourceBranch")?.value || row.querySelector(".invoice-source-branch-input")?.value.trim() || "";
    const brand = row.querySelector(".invoice-brand-input").value.trim();
    const qty = row.querySelector(".invoice-qty-input").value;
    const uom = row.querySelector(".invoice-uom-input").value;
    const price = row.querySelector(".invoice-price-input").value;
    const lot = row.querySelector(".invoice-lot-input").value.trim();
    const expiry = row.querySelector(".invoice-expiry-input").value;
    if (expiry && daysUntil(expiry) < 0) throw new Error("Expiry date cannot be in the past.");
    const discount = row.querySelector(".invoice-discount-input")?.value || 0;
    return `${itemValue}|${brand}|${qty}|${uom}|${price}|${sourceBranch}|${lot}|${expiry}|${discount}`;
  }).filter((line) => line.split("|")[0]).join("\n");
}

function syncInvoiceRowLot(input) {
  if (!input) return;
  const row = input.closest(".invoice-line-row");
  const item = findItemByCodeOrName(row?.querySelector(".invoice-item-input")?.value);
  const lot = input.value.trim();
  if (!row || !item || !lot) return;
  const branch = row.querySelector(".invoice-source-branch-input")?.value || qs("#sourceBranch")?.value;
  const stock = data.inventory.find((entry) => (entry.code === item.code || entry.item === item.name) && entry.lot === lot && (!branch || entry.branch === branch));
  if (stock?.expiry && stock.expiry !== "N/A") {
    const expiryInput = row.querySelector(".invoice-expiry-input");
    if (expiryInput) expiryInput.value = stock.expiry;
  }
}

function syncInvoiceRowItem(input) {
  if (!input) return;
  const item = findItemByCodeOrName(input.value);
  if (!item) return;
  const row = input.closest(".invoice-line-row");
  row.querySelector(".invoice-brand-input").value = item.brand || "";
  row.querySelector(".invoice-uom-input").value = item.uom || "unit";
  if (!row.querySelector(".invoice-price-input").value) row.querySelector(".invoice-price-input").value = "";
  const warehouse = qs("#sourceBranch")?.value || row.querySelector(".invoice-source-branch-input")?.value || inventoryBranchTab || platformBranches()[0];
  const stock = data.inventory
    .filter((entry) => (entry.code === item.code || entry.item === item.name) && entry.branch === warehouse && entry.qty > 0 && (entry.expiry === "N/A" || daysUntil(entry.expiry) >= 0))
    .sort((a, b) => daysUntil(a.expiry === "N/A" ? "2099-12-31" : a.expiry) - daysUntil(b.expiry === "N/A" ? "2099-12-31" : b.expiry))[0];
  if (stock) {
    row.querySelector(".invoice-lot-input").value = stock.lot || "";
    row.querySelector(".invoice-expiry-input").value = stock.expiry && stock.expiry !== "N/A" ? stock.expiry : "";
  }
}

function syncInvoiceLinesForClient() {
  qsa(".invoice-item-input").forEach((input) => { if (input.value.trim()) syncInvoiceRowItem(input); });
  renderInvoiceComputePreview();
}

function syncInvoicePurchaseOrders(allowPartial = false) {
  if (!["invoice", "cancelReplace"].includes(modalType)) return;
  const clientInput = qs("#client");
  const poInput = qs("#po");
  if (!clientInput || !poInput) return;
  const client = allowPartial ? findClientByName(clientInput.value) : data.clients.find((item) => item.name.toLowerCase() === clientInput.value.trim().toLowerCase());
  if (!client) return;
  clientInput.value = client.name;
  const options = openPurchaseOrdersForClient(client.name);
  qs("#po-options").innerHTML = options.map((po) => `<option value="${escapeHtml(po.id)}">${escapeHtml(poStatus(po))}</option>`).join("");
  if (!options.some((po) => po.id === poInput.value)) poInput.value = options[0]?.id || "";
  syncInvoiceFromPurchaseOrder();
}

function syncInvoiceFromPurchaseOrder() {
  if (!["invoice", "cancelReplace"].includes(modalType)) return;
  const po = data.purchaseOrders.find((entry) => entry.id === qs("#po")?.value);
  if (!po) return;
  qs("#client").value = po.client;
  const pendingLines = (po.lines || []).map((line) => ({ ...line, qty: poLineStatus(po, line).pending })).filter((line) => line.qty > 0);
  if (pendingLines.length) {
    qs("#invoice-line-list").innerHTML = pendingLines.map((line) => invoiceLineTemplate(line)).join("");
    qsa(".invoice-item-input").forEach((input) => syncInvoiceRowItem(input));
  }
  renderInvoiceComputePreview();
}

function collectInvoicePreviewLines() {
  return qsa(".invoice-line-row").map((row) => {
    const itemValue = row.querySelector(".invoice-item-input")?.value.trim() || "";
    const qty = Number(row.querySelector(".invoice-qty-input")?.value || 0);
    const price = Number(row.querySelector(".invoice-price-input")?.value || 0);
    if (!itemValue || qty <= 0 || price < 0) return null;
    return { item: itemValue, qty, price };
  }).filter(Boolean);
}

function renderInvoiceComputePreview() {
  const preview = qs("#invoice-compute-preview");
  if (!preview || !["invoice", "cancelReplace"].includes(modalType)) return;
  const client = data.clients.find((entry) => entry.name === qs("#client")?.value);
  const type = qs("#type")?.value || "SI";
  const lines = collectInvoicePreviewLines();
  const gross = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  const manualDiscount = Number(qs("#discount")?.value || 0);
  const totalSalesVatInclusive = Math.max(gross - manualDiscount, 0);
  const billableTotal = type === "DR" ? 0 : totalSalesVatInclusive;
  const salesLabel = type === "SI" ? "Total Sales (VAT Inclusive)" : "Total Sales (VAT Exclusive)";
  preview.innerHTML = `<div class="preview-tax-label">${escapeHtml(type === "DR" ? "Delivery Receipt: no price posted to Sales" : "Invoice totals exclude WTax/EWT; deductions are handled in Collections payment requests.")}</div><div class="invoice-tax-summary live-preview"><div class="invoice-meta"><span>${salesLabel}</span><strong>${peso.format(billableTotal)}</strong></div><div class="invoice-meta total-line"><span>Total Amount Due</span><strong>${peso.format(billableTotal)}</strong></div></div>`;
}

function showSection(sectionId, options = {}) {
  document.body.dataset.activeSection = sectionId;
  qsa(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.section === sectionId));
  qsa(".section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
  const activeButton = qs(`.nav-item[data-section="${sectionId}"]`);
  qs("#page-title").textContent = activeButton?.dataset.title || sectionMeta[sectionId]?.[0] || "Dashboard";
  qs("#page-description").textContent = activeButton?.dataset.description || sectionMeta[sectionId]?.[1] || "";
  if (options.scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(updateTableScrollHints);
  if (sectionId === "collections") setTimeout(renderCollectionMapVisual, 80);
  if (sectionId === "backup") renderBackup();
  if (sectionId === "logs") renderLogs();
}

function renderBranchFilter() {
  const current = data.branch || "all";
  qs("#branch-filter").innerHTML = [`<option value="all">All Areas</option>`, ...platformAreas().map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)].join("");
  qs("#branch-filter").value = platformAreas().includes(current) ? current : "all";
  if (!platformAreas().includes(current)) data.branch = "all";
}

function applyRole() {
  if (!currentUser) {
    qs("#login-screen").classList.remove("hidden");
    return;
  }
  qs("#login-screen").classList.add("hidden");
  renderUserMenu();
  qsa(".nav-item").forEach((button) => {
    button.hidden = button.dataset.section === "security" || !effectiveModules().includes(button.dataset.section);
  });
  renderBranchFilter();
  if (currentUser.branch !== "all") data.branch = currentUser.branch;
  qs("#branch-filter").value = data.branch;
  qs("#branch-filter").disabled = currentUser.branch !== "all";
  const activeSection = qs(".section.active")?.id || "dashboard";
  showSection(effectiveModules().includes(activeSection) ? activeSection : "dashboard");
}

function renderUserMenu() {
  if (!currentUser) return;
  const profile = getCurrentProfile();
  qs("#welcome-name").textContent = `Welcome, ${firstName(profile.name)}`;
  qs("#user-initials").textContent = initials(profile.name);
  qs("#user-popover-name").textContent = profile.name;
  qs("#user-popover-role").hidden = false;
  qs("#user-popover-role").textContent = profile.role || "";
}

function renderUserSettings() {
  if (!currentUser) return;
  const profile = getCurrentProfile();
  qs("#settings-name").value = profile.name || "";
  qs("#settings-email").value = profile.email || "";
  qs("#settings-phone").value = profile.phone || "";
  qs("#settings-branch").value = profile.branch === "all" ? "All Areas" : profile.branch;
  qs("#settings-role").value = profile.role || "";
  qs("#settings-notes").value = profile.notes || "";
  const permissionToggle = qs("#settings-custom-permissions")?.closest("label, .field, .settings-row") || qs("#settings-custom-permissions");
  if (permissionToggle) permissionToggle.hidden = true;
  qs("#settings-permissions-panel").hidden = true;
  qs("#settings-permissions-panel").innerHTML = "";
}

function renderPlatformSettings() {
  const lockedBranches = new Set(platformBranches().filter((branch) => branchUsageReasons(branch).length));
  const approvals = invoiceApprovals();
  if (qs("#approved-si")) qs("#approved-si").value = approvals.SI || "ECTOSOC";
  if (qs("#approved-ts")) qs("#approved-ts").value = approvals.TS || "ECTOSOC";
  if (qs("#approved-dr")) qs("#approved-dr").value = approvals.DR || "ECTOSOC";
  if (qs("#invoice-approval-form")) qs("#invoice-approval-form").dataset.focusRecord = "Invoice approvals";
  if (qs("#dev-settings-panel")) qs("#dev-settings-panel").hidden = !isDevEnvironment();
  qs("#platform-branch-list").innerHTML = platformBranches().map((branch) => `<div class="platform-area-chip" data-focus-record="${escapeHtml(branch)}" data-focus-text="${escapeHtml(`${branch} ${branchAddresses()[branch] || "No address set"}`)}"><span>${escapeHtml(branch)}<small>${escapeHtml(branchAddresses()[branch] || "No address set")}</small></span><button class="mini-button" type="button" data-edit-branch-address="${escapeHtml(branch)}">Address</button>${lockedBranches.has(branch) ? `<small>Used by records</small>` : `<button class="mini-button danger-button" type="button" data-remove-platform-branch="${escapeHtml(branch)}">Remove</button>`}</div>`).join("");
  renderSettingsTutorial();
}

function renderSettingsTutorial() {
  const modules = [
    { title: "Dashboard", role: "All users", submodules: [
      ["KPI Cards", "Shows sales, collections, outstanding AR, and stock alerts.", "Use it as the first screen after login to understand today\'s workload.", "If Outstanding AR is high, open Receivables or Collections before creating more sales."],
      ["Action Center", "Lists urgent issues by priority.", "Click an alert to jump to the exact module and record.", "Sales sees overdue clients and cheque pickup alerts; Logistics sees stock risks; Accounting sees collections/payables."],
      ["Graphs and Workflow Assistant", "Explains what the system recommends next.", "Read the assistant cards and use their shortcut buttons.", "Use when a new employee is unsure which task to do first."],
    ] },
    { title: "Masterlists", role: "Admin/Superadmin edit; others by approval", submodules: [
      ["Clients", "Stores client area, account type, terms, TIN, credit limit, contact info, and required documents.", "Add/update clients before PO, invoice, collection, or credit review.", "If a client is missing documents, upload files before approving more transactions."],
      ["Items", "Stores product code, brand, UOM, source, supplier/client, lot, expiry, and category.", "Add items before inventory receiving or invoice encoding.", "Use default lot/expiry for common items, but confirm actual lot during receiving/invoicing."],
      ["Suppliers", "Stores supplier name, brand supplied, address, and contact.", "Use it for Inventory PO and payable workflows.", "If a new reagent supplier is added, add supplier first, then create Inventory PO."],
      ["Branches", "Stores physical inventory locations such as Las Pinas and Naga.", "Use it to manage branch addresses and remove unused branches.", "If stock must move between branches, branch names must exist here first."],
      ["Employees", "Stores employee role, contact, benefits, and salary.", "Use for HR/admin employee records.", "Salary is Superadmin/CEO-only; other users see it masked."],
      ["Banks", "Stores bank accounts used for collections and final payments.", "Add banks before cheque, bank deposit, or bank transfer posting.", "If a payment method needs a bank, select from this masterlist."],
    ] },
    { title: "Inventory", role: "Logistics; Admin/Superadmin approval", submodules: [
      ["Stock By Branch", "Shows current available stock by branch, lot, expiry, quantity, and status.", "Filter by branch/status before confirming item availability.", "If an item is For Disposal, do not use it for invoice fulfillment."],
      ["Inventory Purchase Order", "Creates supplier POs for restocking inventory.", "Enter supplier, PO date, itemized lines, lot, expiry, price, and discount.", "Use when purchasing reagents/supplies from suppliers; it does not deduct stock."],
      ["Receive Stock", "Adds received supplier stock into branch inventory.", "Admin/Superadmin approves direct receiving; select Inventory PO to autofill rows.", "Use after delivered supplier items arrive and lot/expiry are confirmed."],
      ["Stock Transfer", "Moves stock between physical branches.", "Logistics creates transfer requests; Admin/Superadmin dispatches/approves; receiving confirms quantity.", "Use when invoicing from Las Pinas but stock is only in Naga."],
      ["Transfer History", "Audit trail for stock movement.", "Open history to see dispatch, receipt, incomplete, and missing-quantity events.", "Use during reconciliation when stock counts do not match."],
    ] },
    { title: "Purchase Orders", role: "Accounting/Admin/Superadmin", submodules: [
      ["Create Client PO", "Records customer order intent before invoicing.", "Select client/date, add item lines, and save PO.", "Use when a customer sends an order but inventory has not been served yet."],
      ["PO Status Cards", "Shows pending, partial, and served quantities.", "Review before creating SI/TS/DR.", "If only part of the PO is served, remaining quantity stays pending."],
      ["Create Invoice/DR From PO", "Converts pending PO items into SI, TS, or DR.", "Click Create invoice/DR from a PO card.", "Use to avoid retyping client/order details and reduce document errors."],
    ] },
    { title: "Invoicing", role: "Accounting/Admin/Superadmin", submodules: [
      ["Create SI", "Creates billable Sales Invoice with VAT details.", "Choose SI, document number, client, PO, stock branch, tax eligibility, and item lots.", "Use for official taxable sales billing."],
      ["Create TS", "Creates Transmittal Slip for non-SI sales tracking.", "Choose TS and complete item/lot/expiry details.", "Use when items are transmitted but treated separately from SI billing."],
      ["Create DR", "Creates Delivery Receipt without prices and excludes it from Sales totals.", "Choose DR and complete item/lot/expiry details.", "Use for deliveries where pricing should not appear on the document."],
      ["Print Preview", "Shows data-only overlay for pre-printed SI/TS/DR forms.", "Open invoice card, click Print, then print from preview.", "Use Print Without Date if the physical form already has a date."],
      ["Cancel & Replace", "Cancels wrong invoice and creates replacement document.", "Click Cancel & Replace and enter reason/new document details.", "Use for wrong document number, client, item, or tax setting after posting."],
    ] },
    { title: "Sales", role: "Sales personal; Accounting/Admin all", submodules: [
      ["Sales List", "Reviews SI/TS sales records and payment status.", "Filter by document type or status.", "Sales users see personal sales; Accounting/Admin sees all."],
      ["Sales Summary", "Shows displayed sales, collections, AR, invoice size, and risk amounts.", "Use cards to evaluate current sales performance.", "Use before weekly sales review or client follow-up."],
      ["Credit Limit View", "Shows client AR exposure and credit status through Sales/Receivables links.", "Open client-related invoices and balances.", "Use before accepting another order from a client."],
    ] },
    { title: "Collections", role: "Accounting/Admin/Superadmin", submodules: [
      ["Record Payment", "Posts payment against SI/TS/DR.", "Type document number, select method, enter receipt and amount.", "Use for cash, cheque, multiple cheques, bank deposit, or bank transfer."],
      ["Multiple Cheques", "Tracks several cheque references under one collection.", "Add cheque rows with reference number, cheque date, and amount.", "Use when one client pays one invoice using multiple cheques."],
      ["Collection Status", "Tracks bank handling status.", "Set For Deposition, Deposited, Bounced, or Posted Date.", "Use Posted Date when a cheque can be claimed on a future date."],
      ["Payment Request", "Creates printable CV/payment request forms.", "Add employee/vendor, department, CV number, items, deductions, and preview/print.", "Use for internal reimbursement, supplier fees, or priority payment requests."],
      ["Follow-up Map", "Tracks weekly client collection contact status.", "Open client area, choose channels, then select outcome.", "When marking Cheque Available, enter the invoice number for traceability."],
      ["Follow-up History", "Shows all client contact outcomes.", "Click Follow-up History to open the full modal.", "Use to see who contacted the client, when, through what channel, and the result."],
    ] },
    { title: "Receivables", role: "Accounting/Admin/Superadmin; Sales view", submodules: [
      ["Open AR Tracker", "Shows only invoices with unpaid balances.", "Filter status tabs and open client cards.", "Use daily to prioritize overdue and near-due invoices."],
      ["Regional Receivables", "Groups open client invoices by region.", "Review by area before collection calls.", "Use when assigning field follow-ups by territory."],
      ["Client Invoice Timeline", "Shows all invoices for one client.", "Open a client card from Receivables.", "Use before approving credit or discussing balances with client."],
      ["Order Flow Detail", "Shows PO, invoice, delivery, payment, and collection stages.", "Click View Details on a tracker card.", "Use to trace why an order is still unpaid or incomplete."],
    ] },
    { title: "Payables", role: "Accounting/Admin/Superadmin", submodules: [
      ["Payable Request", "Creates itemized supplier/vendor payable requests.", "Enter supplier/contact and item rows, then save.", "Use for supplier bills or utilities before approval."],
      ["For Approval", "Lists payable requests waiting for approval/cancellation.", "Approve or cancel from the request table.", "Use to prevent unapproved supplier payments."],
      ["Final Payables", "Approved payables waiting for payment confirmation.", "Confirm payment by cash, bank transfer, or cheque.", "Use after management approves but before accounting marks paid."],
      ["Payables Ledger", "Shows total, paid, balance, cheque details, and status.", "Review table and KPI cards.", "Use to monitor supplier balance and payment risk."],
    ] },
    { title: "Expenses", role: "Accounting/Admin/Superadmin; HR where needed", submodules: [
      ["Expense Request", "Creates itemized internal expense requests.", "Select type, requester, office, receipt/file, and item rows.", "Use for petty cash, per diem, operating expense, or revolving fund."],
      ["Expense Approval", "Controls approval/cancellation of expense requests.", "Approve/cancel requests before payment confirmation.", "Use to separate requested expenses from payable expenses."],
      ["Confirmed Expenses", "Approved expenses ready for payment.", "Confirm payment method and mark paid.", "Use when accounting releases reimbursement or fund replenishment."],
      ["Expense Classification", "Groups expense totals by type.", "Review Analytics or Expense KPI cards.", "Use to identify high spending categories."],
    ] },
    { title: "Reports & Reconciliation", role: "Admin/Accounting/Superadmin", submodules: [
      ["Reports", "Produces focused operational summaries.", "Open report cards and preview/print details.", "Use for management review or supporting schedules."],
      ["Reconciliation Check", "Finds duplicate receipts, missing docs, cheque gaps, stock transfer issues, and credit risks.", "Choose date range/period and run reconciliation.", "Use before month-end closing or data cleanup."],
      ["Reconciliation History", "Stores previous reconciliation results.", "Open History tab and load a run.", "Use to compare whether issues were resolved over time."],
    ] },
    { title: "Users, Settings, Notifications", role: "Superadmin settings; role-based notifications", submodules: [
      ["Invite User", "Sends a secure email invitation and creates the user profile after Supabase accepts it.", "Select role to precheck default permissions, then customize by module group.", "The invited user accepts the email link and creates their own password."],
      ["Superadmin Permission Grant", "Lets Superadmin promote/demote another user to Superadmin permissions.", "Check/uncheck the Superadmin box in Users table.", "Use when assigning another manager to control users/settings."],
      ["Settings", "Stores platform-level settings and this manual.", "Only Superadmin/CEO can open Settings.", "Use to update signatories and tutorial guidance."],
      ["Notifications", "Stores alerts, reminders, approvals, and workflow notices.", "Open notification bell or Notifications page.", "Use to review system warnings and mark alerts as seen."],
    ] },
  ];
  qs("#settings-tutorial").innerHTML = modules.map((item, index) => `<details class="tutorial-module" ${index === 0 ? "open" : ""}><summary><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.role)}</span></summary><div class="tutorial-submodule-grid">${item.submodules.map(([name, purpose, how, scenario]) => `<article class="tutorial-submodule-card"><h3>${escapeHtml(name)}</h3><p><strong>Purpose:</strong> ${escapeHtml(purpose)}</p><p><strong>How to use:</strong> ${escapeHtml(how)}</p><p><strong>Scenario:</strong> ${escapeHtml(scenario)}</p></article>`).join("")}</div></details>`).join("");
}

function branchOptions(selected = "") {
  return platformBranches().map((branch) => `<option ${branch === selected ? "selected" : ""}>${escapeHtml(branch)}</option>`).join("");
}

function renderInventoryBranchTabs() {
  if (!platformBranches().includes(inventoryBranchTab)) inventoryBranchTab = platformBranches()[0] || "";
  qs("#inventory-branch-tabs").innerHTML = platformBranches().map((branch) => `<button class="tab ${branch === inventoryBranchTab ? "active" : ""}" data-inventory-branch="${escapeHtml(branch)}">${escapeHtml(branch)} Stocks</button>`).join("");
}

function transferAuthorizationCell(transfer, index) {
  if (transfer.status === "For Receiving") return canApproveInventoryChanges() ? `<div class="inline-actions"><button class="mini-button" data-dispatch-transfer="${index}">Admin Approve / In Transit</button></div>` : `<small>Awaiting Admin approval</small>`;
  if (transfer.status === "In Transit") return `<div class="inline-actions"><button class="mini-button" data-receive-transfer="${index}">Confirm Received</button><button class="mini-button danger-button" data-incomplete-transfer="${index}">Mark Incomplete</button></div>`;
  if (transfer.status === "Incomplete") return `<div class="inline-actions"><button class="mini-button" data-complete-transfer="${index}">Confirm Missing Qty</button><small>Missing ${Number(transfer.missingQty || 0)}</small></div>`;
  return transfer.receivedBy || transfer.incompleteBy || transfer.status;
}

function canApproveInventoryChanges() { return ["Admin", "Superadmin"].includes(currentUser?.role); }
function canApprovePurchaseOrders() { return currentUser?.role === "Superadmin"; }
function canApprovePaymentRequests() { return ["Superadmin", "CEO"].includes(currentUser?.role); }
function canManagePoReceiving() { return ["Superadmin", "Logistics"].includes(currentUser?.role); }
function canApproveMigrations() { return ["Superadmin", "CEO"].includes(currentUser?.role); }

const inventoryPoTerminalStatuses = ["Fully Received", "Cancelled"];
const inventoryPoCancellableStatuses = ["Approved", "Sent to Supplier", "In Transit", "For Receiving", "Partially Received"];
const inventoryPoStatusEmoji = { "Sent to Supplier": "📤", "In Transit": "🚚", "For Receiving": "📦", "Partially Received": "☑️", "Fully Received": "✔️", Cancelled: "❌" };
const inventoryPoNextStatus = { Approved: "Sent to Supplier", "Sent to Supplier": "In Transit", "In Transit": "For Receiving" };
function poStatusLabel(status) { return `${inventoryPoStatusEmoji[status] ? `${inventoryPoStatusEmoji[status]} ` : ""}${status}`; }

function inventoryPoActionsCell(po, index) {
  const printBtn = `<button class="mini-button" data-inventory-po-print="${escapeHtml(po.id)}">Print PO</button>`;
  const timelineBtn = `<button class="mini-button" data-inventory-po-timeline="${escapeHtml(po.id)}">View Timeline</button>`;
  const cancelBtn = `<button class="mini-button danger-button" data-inventory-po-cancel="${index}">Cancel Order</button>`;
  let primaryButton = "";
  let waitingNote = "";
  let cancelable = "";
  if (po.status === "Pending Approval") {
    if (canApprovePurchaseOrders()) primaryButton = `<button class="mini-button" data-inventory-po-approve="${index}">Approve</button>`;
    else waitingNote = "Awaiting Superadmin approval";
  } else if (inventoryPoNextStatus[po.status]) {
    if (canManagePoReceiving()) { primaryButton = `<button class="mini-button" data-inventory-po-advance="${index}">Mark ${poStatusLabel(inventoryPoNextStatus[po.status])}</button>`; cancelable = cancelBtn; }
    else waitingNote = "Awaiting Logistics update";
  } else if (po.status === "For Receiving") {
    if (canManagePoReceiving()) { primaryButton = `<button class="mini-button" data-inventory-po-receive="${index}">Receive Stock</button>`; cancelable = cancelBtn; }
    else waitingNote = "Awaiting receiving";
  } else if (po.status === "Partially Received") {
    if (canManagePoReceiving()) { primaryButton = `<button class="mini-button" data-inventory-po-receive="${index}">Receive Remaining Stock</button>`; cancelable = cancelBtn; }
    else waitingNote = "Partially received";
  }
  return `<div class="inline-actions">${primaryButton}${waitingNote ? `<small>${waitingNote}</small>` : ""}<details class="row-action-menu"><summary>More</summary><div>${timelineBtn}${printBtn}${cancelable}</div></details></div>`;
}

function replacePoRecord(po) {
  const index = data.inventoryPurchaseOrders.findIndex((entry) => entry.id === po.id);
  if (index >= 0) data.inventoryPurchaseOrders[index] = po;
  else data.inventoryPurchaseOrders.push(po);
}

async function approvePurchaseOrder(index) {
  if (!canApprovePurchaseOrders()) return toast("Only Superadmin can approve purchase orders.");
  const po = (data.inventoryPurchaseOrders || [])[index];
  if (!po || po.status !== "Pending Approval") return toast("This purchase order is not pending approval.");
  if (!confirm(`Approve ${po.id} for ${po.supplier}?`)) return;
  const result = await MedlaneAPI.approvePurchaseOrder(po.id).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to approve purchase order.");
  replacePoRecord(result.po);
  log("Approved purchase order", "Inventory", po.id);
  notify("Purchase Order", `${po.id} approved.`, "inventory", po.id);
  renderAll();
  toast(`${po.id} approved.`);
}

async function advancePurchaseOrderStatus(index) {
  if (!canManagePoReceiving()) return toast("Only Logistics/Superadmin can update purchase order status.");
  const po = (data.inventoryPurchaseOrders || [])[index];
  const next = po && inventoryPoNextStatus[po.status];
  if (!next) return toast("This purchase order cannot be advanced right now.");
  if (!confirm(`Mark ${po.id} as ${poStatusLabel(next)}?`)) return;
  const result = await MedlaneAPI.advancePurchaseOrder(po.id).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to update purchase order status.");
  replacePoRecord(result.po);
  log("Updated purchase order status", "Inventory", `${po.id}: ${next}`);
  notify("Purchase Order", `${po.id} marked ${poStatusLabel(next)}.`, "inventory", po.id);
  renderAll();
  toast(`${po.id} marked ${poStatusLabel(next)}.`);
}

async function cancelPurchaseOrder(index) {
  if (!canManagePoReceiving()) return toast("Only Logistics/Superadmin can cancel purchase orders.");
  const po = (data.inventoryPurchaseOrders || [])[index];
  if (!po || !inventoryPoCancellableStatuses.includes(po.status)) return toast("This purchase order cannot be cancelled right now.");
  const reason = (prompt(`Reason for cancelling ${po.id}:`, "") || "").trim();
  if (!confirm(`Cancel ${po.id}? This cannot be undone.`)) return;
  const result = await MedlaneAPI.cancelPurchaseOrder(po.id, reason).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to cancel purchase order.");
  replacePoRecord(result.po);
  log("Cancelled purchase order", "Inventory", po.id);
  notify("Purchase Order", `${po.id} cancelled.`, "inventory", po.id);
  renderAll();
  toast(`${po.id} cancelled.`);
}

function inventoryPoHistoryClass(status) {
  if (status === "Fully Received") return "done";
  if (status === "Cancelled") return "blocked";
  return "pending";
}

function renderInventoryPoDetail(id) {
  const po = (data.inventoryPurchaseOrders || []).find((entry) => entry.id === id);
  if (!po) return toast("Purchase order not found.");
  const events = poHistory(po);
  const lineRows = (po.lines || []).map((line) => `<tr><td>${escapeHtml(line.item)}</td><td>${escapeHtml(line.lot || "-")}</td><td>${Number(line.qty || 0)}</td><td>${Number(line.receivedQty || 0)}</td></tr>`).join("");
  qs("#inventory-po-detail-title").textContent = `${po.id} · ${po.supplier}`;
  qs("#inventory-po-detail-panel").innerHTML = `<div class="panel-header"><div><p class="eyebrow">${escapeHtml(po.supplier)}</p><h2>${escapeHtml(po.branch || "No branch")}</h2></div><span class="pill ${statusClass(po.status)}">${poStatusLabel(po.status)}</span></div><div class="report-preview-grid invoice-mini-grid"><div class="report-preview-card"><small>PO Date</small><strong>${escapeHtml(po.date || "-")}</strong></div><div class="report-preview-card"><small>Terms</small><strong>${Number(po.terms || 30)} days</strong></div><div class="report-preview-card"><small>Approved By</small><strong>${escapeHtml(po.approvedBy || "-")}</strong></div><div class="report-preview-card"><small>Completed By</small><strong>${escapeHtml(po.receivedBy || po.cancelledBy || "-")}</strong></div></div><div class="table-card compact-table"><table><thead><tr><th>Item</th><th>Lot</th><th>Ordered Qty</th><th>Received Qty</th></tr></thead><tbody>${lineRows}</tbody></table></div><details class="full-event-details" open><summary>Status timeline</summary><div class="event-timeline">${events.map((event) => `<div class="event-item ${inventoryPoHistoryClass(event.status)}"><span>${escapeHtml((event.status || "P")[0])}</span><time>${escapeHtml(event.date || "")}</time><div><strong>${escapeHtml(poStatusLabel(event.status || ""))}</strong><p>${escapeHtml(event.note || "-")}</p><small>${escapeHtml(event.by || "-")}</small></div></div>`).join("")}</div></details>`;
  showSection("inventory-po-detail");
}

function openStockSheetForPo(poId) {
  renderStockSheet();
  const picker = qs("#inventory-po-receive-picker");
  if (picker) picker.value = poId;
  fillStockSheetFromInventoryPo(poId);
  qs("#stock-sheet-modal").showModal();
}

function transferItemizedDetail(transfer) {
  const lines = transfer.lines?.length ? transfer.lines : [{ item: transfer.item, code: transfer.code, brand: transfer.brand, qty: transfer.qty, lot: transfer.lot, expiry: transfer.expiry || "N/A" }];
  return `<div class="mini-transfer-lines">${lines.map((line) => `<span><strong>${escapeHtml(line.item || transfer.item)}</strong> ${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}<small>Lot ${escapeHtml(line.lot || "-")} · Exp ${escapeHtml(line.expiry || "N/A")}</small></span>`).join("")}</div>`;
}

function renderDashboard() {
  syncCollectionContactsForBalances();
  const dashboardRange = getDashboardRange();
  const visibleSales = byBranch(data.sales, "area").filter((sale) => currentUser?.role !== "Sales" || sale.salesperson === currentUser?.name).filter((sale) => dateInRange(sale.date, dashboardRange.from, dashboardRange.to));
  const totalSales = visibleSales.reduce((sum, sale) => sum + sale.net, 0);
  const totalPaid = visibleSales.reduce((sum, sale) => sum + sale.paid, 0);
  const outstanding = visibleSales.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
  const invAlerts = byBranch(data.inventory).filter((item) => ["Low Stock", "Critical", "Near Expiry", "For Disposal"].includes(inventoryStatus(item)));
  qs("#sales-total").textContent = peso.format(totalSales);
  qs("#collection-total").textContent = peso.format(totalPaid);
  qs("#outstanding-total").textContent = peso.format(outstanding);
  qs("#alert-total").textContent = invAlerts.length;
  const creditAlerts = data.clients.filter((client) => client.creditLimit > 0 && clientBalance(client.name) >= client.creditLimit * 0.85).map((client) => ({ color: clientBalance(client.name) > client.creditLimit ? "red" : "orange", title: "Credit limit watch", text: `${client.name}: ${peso.format(clientBalance(client.name))} / ${peso.format(client.creditLimit)} used.`, section: "masterlists", record: client.name }));
  const transferAlerts = data.pendingTransfers.filter((transfer) => transfer.status === "For Receiving").map((transfer) => ({ color: "orange", title: "Stock transfer for receiving", text: `${transfer.id}: ${transfer.qty} ${transfer.item} from ${transfer.from} to ${transfer.to}.`, section: "inventory", record: transfer.id }));
  const chequeAvailableAlerts = data.collectionContacts.filter((contact) => contact.status === "Cheque Available").map((contact) => ({ color: "green", title: "Cheque available", text: `${contact.client} has a cheque ready${contact.chequeInvoice ? ` for ${contact.chequeInvoice}` : ""}.`, section: "collections", record: contact.client }));
  const salesAlerts = visibleSales.filter((sale) => ["Overdue", "Near Due"].includes(statusForSale(sale))).map((sale) => ({ color: statusForSale(sale) === "Overdue" ? "red" : "orange", title: `${statusForSale(sale)} invoice`, text: `${sale.id} for ${sale.client} has ${peso.format(sale.net - sale.paid)} balance.`, section: "receivables-tracker", record: sale.id }));
  const stockAlerts = invAlerts.map((item) => ({ color: ["Critical", "For Disposal"].includes(inventoryStatus(item)) ? "red" : "orange", title: inventoryStatus(item), text: `${item.item} (${item.branch}) has ${item.qty} left. Lot ${item.lot}.`, section: "inventory", record: item.lot }));
  const alerts = [...chequeAvailableAlerts, ...salesAlerts, ...stockAlerts, ...creditAlerts, ...transferAlerts].slice(0, 8);
  qs("#urgent-count").textContent = `${alerts.length} urgent${dashboardRange.from || dashboardRange.to ? " in range" : ""}`;
  qs("#alerts-list").innerHTML = alerts.map((a) => `<div class="alert-item clickable" data-go-section="${a.section}" data-focus-record="${escapeHtml(a.record || "")}"><span class="alert-dot ${a.color}"></span><div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.text)}</span></div></div>`).join("") || `<div class="alert-item"><span class="alert-dot green"></span><div><strong>All clear</strong><span>No urgent records for this area.</span></div></div>`;
  const branches = platformAreas().map((branch) => ({ branch, amount: visibleSales.filter((s) => s.area === branch).reduce((sum, s) => sum + s.net, 0) }));
  const max = Math.max(...branches.map((b) => b.amount), 1);
  qs("#branch-bars").innerHTML = branches.map((b) => `<div class="branch-item"><header><span>${b.branch}</span><strong>${peso.format(b.amount)}</strong></header><div class="meter ${b.branch.includes("Dealer") ? "green" : ""}"><span style="width:${Math.max(4, Math.round((b.amount / max) * 100))}%"></span></div></div>`).join("") + graphNote("Computed from invoice net totals grouped by client sales area within the selected date range.");
  const duplicateClientNames = data.clients.length - new Set(data.clients.map((client) => String(client.name || "").trim().toLowerCase()).filter(Boolean)).size;
  const duplicateItemCodes = data.items.length - new Set(data.items.map((item) => String(item.code || "").trim().toLowerCase()).filter(Boolean)).size;
  const duplicateReceipts = data.payments.length - new Set(data.payments.map((payment) => String(payment.receiptNo || "").trim().toLowerCase()).filter(Boolean)).size;
  const pendingDeposit = data.payments.filter((payment) => ["For Deposition", "Posted Date"].includes(payment.collectionStatus)).length;
  const bounced = data.payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce")).length;
  qs("#health-list").innerHTML = [
    [`${data.clients.length} client records`, duplicateClientNames ? `${duplicateClientNames} duplicate name risk` : "Names OK"],
    [`${data.items.length} products`, duplicateItemCodes ? `${duplicateItemCodes} duplicate code risk` : "Codes OK"],
    [`${data.sales.length} SI/TS/DR`, `${salesAlerts.length} AR alerts`],
    [`${pendingDeposit} pending deposit`, bounced ? `${bounced} bounced payment${bounced === 1 ? "" : "s"}` : "No bounced payments"],
    [`${invAlerts.length} stock alerts`, `${duplicateReceipts} duplicate receipt risk`],
    ["Backup safety", "R2 restore + delete guard ready"],
  ].map(([label, status]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(status)}</strong></li>`).join("");
  registerCalendarWidget("dash-cal", "#dashboard-calendar-widget", true);
  renderCalendarWidget("dash-cal");
  const trendChart = qs("#dashboard-trend-chart");
  if (trendChart) {
    const monthlyTrend = visibleSales.reduce((acc, sale) => {
      const month = sale.date.slice(0, 7);
      if (!acc[month]) acc[month] = { sales: 0, collections: 0, outstanding: 0 };
      acc[month].sales += sale.net;
      acc[month].collections += sale.paid;
      acc[month].outstanding += Math.max(sale.net - sale.paid, 0);
      return acc;
    }, {});
    const trendMonths = Object.keys(monthlyTrend).sort((a, b) => a.localeCompare(b));
    trendChart.innerHTML = trendMonths.length
      ? multiSeriesChart(trendMonths.map(monthLabel), [
          { label: "Sales", type: "bar", color: "#7c3aed", values: trendMonths.map((m) => monthlyTrend[m].sales), format: (v) => peso.format(v) },
          { label: "Collections", type: "line", color: "#12a67e", values: trendMonths.map((m) => monthlyTrend[m].collections), format: (v) => peso.format(v) },
          { label: "Outstanding", type: "line", dashed: true, color: "#e11d48", values: trendMonths.map((m) => monthlyTrend[m].outstanding), format: (v) => peso.format(v) },
        ]) + graphNote("Computed from invoice net totals, payments received, and open balances grouped by invoice month within the selected date range.")
      : `<p>No sales trend available for this view.</p>`;
  }
}

const calendarWidgetRegistry = {};
const calendarViewState = {};
function registerCalendarWidget(prefix, containerId, compact) { calendarWidgetRegistry[prefix] = { containerId, compact }; }
function calendarState(prefix) { return calendarViewState[prefix] || (calendarViewState[prefix] = { year: today.getFullYear(), month: today.getMonth() + 1 }); }
function renderCalendarWidget(prefix) {
  const config = calendarWidgetRegistry[prefix];
  const container = config && qs(config.containerId);
  if (!container) return;
  const state = calendarState(prefix);
  const events = calendarEventsForMonth(state.year, state.month);
  container.innerHTML = calendarWidgetHtml(state.year, state.month, events, { idPrefix: prefix, compact: config.compact });
}
function navigateCalendarWidget(prefix, delta) {
  const state = calendarState(prefix);
  state.month += delta;
  if (state.month > 12) { state.month = 1; state.year += 1; }
  if (state.month < 1) { state.month = 12; state.year -= 1; }
  renderCalendarWidget(prefix);
}
function showCalendarDayDetail(prefix, dateKey) {
  const state = calendarState(prefix);
  const events = calendarEventsForMonth(state.year, state.month);
  const detail = qs(`#${prefix}-day-detail`);
  if (!detail) return;
  detail.innerHTML = calendarDayDetailHtml(dateKey, events[dateKey] || []);
  detail.hidden = false;
}
function renderCalendarSection() {
  registerCalendarWidget("calendar-page", "#calendar-page-widget", false);
  renderCalendarWidget("calendar-page");
}

function renderAnalytics() {
  const visibleSales = byBranch(data.sales, "area");
  const visibleInventory = byBranch(data.inventory);
  const totalSales = visibleSales.reduce((sum, sale) => sum + sale.net, 0);
  const totalPaid = visibleSales.reduce((sum, sale) => sum + sale.paid, 0);
  const collectionRate = totalSales ? Math.round((totalPaid / totalSales) * 100) : 0;
  const monthlySales = visibleSales.reduce((acc, sale) => {
    const month = sale.date.slice(0, 7);
    acc[month] = (acc[month] || 0) + sale.net;
    return acc;
  }, {});
  qs("#analytics-sales-trend").innerHTML = lineChart(Object.entries(monthlySales).sort(([a], [b]) => a.localeCompare(b))) + graphNote("Computed from invoice net totals grouped by invoice month in the selected branch view.");
  const salespersonSales = Object.entries(sumBy(visibleSales, "salesperson", (sale) => sale.net)).sort((a, b) => b[1] - a[1]);
  qs("#analytics-salesperson-bars").innerHTML = verticalBars(salespersonSales) + graphNote("Computed from invoice net totals grouped by assigned salesperson.");
  const branchSales = Object.entries(sumBy(visibleSales, "area", (sale) => sale.net));
  qs("#analytics-branch-sales").innerHTML = barRows(branchSales, (value) => peso.format(value), ["", "green"]) + graphNote("Computed from invoice net totals grouped by client sales area.");
  const dealerClients = data.clients.filter((client) => client.dealer !== "Direct");
  const dealersByArea = Object.entries(sumBy(dealerClients, "area", () => 1)).sort((a, b) => b[1] - a[1]);
  qs("#analytics-dealers-area").innerHTML = barRows(dealersByArea, (value) => `${value} dealer${value === 1 ? "" : "s"}`, ["green", "orange"]) + graphNote("Computed from client masterlist records marked as dealer accounts by area.");
  const dealerSales = visibleSales.filter((sale) => sale.dealer !== "Direct").reduce((sum, sale) => sum + sale.net, 0);
  const directSales = Math.max(totalSales - dealerSales, 0);
  const dealerEnd = totalSales ? Math.round((directSales / totalSales) * 100) : 0;
  qs("#analytics-area-dealer").innerHTML = `<div class="donut" style="--paid:${dealerEnd}%; --partial:${dealerEnd}%; --end:100%;" data-label="${totalSales ? Math.round((dealerSales / totalSales) * 100) : 0}%\ndealer"></div><div class="legend"><span class="green">Direct ${peso.format(directSales)}</span><span class="red">Dealer ${peso.format(dealerSales)}</span></div>${graphNote("Computed from invoice net totals split by client account type: Direct vs Dealer.")}`;
  const topBrands = Object.entries(sumBy(visibleSales, "brand", (sale) => sale.net)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs("#analytics-top-brands").innerHTML = barRows(topBrands, (value) => peso.format(value), ["", "green", "orange", "red"]) + graphNote("Computed from invoice line subtotals grouped by item brand.");

  const paidCount = visibleSales.filter((sale) => statusForSale(sale) === "Paid").length;
  const partialCount = visibleSales.filter((sale) => statusForSale(sale) === "Partially Paid" || statusForSale(sale) === "Near Due").length;
  const unpaidCount = Math.max(visibleSales.length - paidCount - partialCount, 0);
  const totalCount = Math.max(visibleSales.length, 1);
  const paidEnd = Math.round((paidCount / totalCount) * 100);
  const partialEnd = Math.round(((paidCount + partialCount) / totalCount) * 100);
  qs("#analytics-ar-mix").innerHTML = `<div class="donut" style="--paid:${paidEnd}%; --partial:${partialEnd}%; --end:100%;" data-label="${collectionRate}%\ncollected"></div><div class="legend"><span class="green">Paid ${paidCount}</span><span class="orange">Partial/Near due ${partialCount}</span><span class="red">Unpaid/Overdue ${unpaidCount}</span></div>${graphNote("Computed from invoice payment status using paid amount, net amount, due date, and terms.")}`;

  const topItems = Object.entries(sumBy(visibleSales, "item", (sale) => sale.net)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs("#analytics-top-items").innerHTML = barRows(topItems, (value) => peso.format(value), ["", "green", "orange", "red"]) + graphNote("Computed from invoice line subtotals grouped by item name.");
  qs("#analytics-collection-rate").textContent = `${collectionRate}%`;
  qs("#analytics-collection-note").textContent = `${peso.format(totalPaid)} collected out of ${peso.format(totalSales)} sales in the selected branch view.`;
  const uncollected = Math.max(totalSales - totalPaid, 0);
  const collectedEnd = totalSales ? Math.round((totalPaid / totalSales) * 100) : 0;
  qs("#analytics-collection-pie").innerHTML = `<div class="donut" style="--paid:${collectedEnd}%; --partial:${collectedEnd}%; --end:100%;" data-label="${collectionRate}%\ncollected"></div><div class="legend"><span class="green">Collected ${peso.format(totalPaid)}</span><span class="red">Uncollected ${peso.format(uncollected)}</span></div>${graphNote("Computed from invoice paid amount versus remaining receivable balance in the selected branch view.")}`;

  const stockCounts = ["Available", "Near Expiry", "Low Stock", "Critical", "For Disposal"].map((status) => [status, visibleInventory.filter((item) => inventoryStatus(item) === status).length]);
  qs("#analytics-stock-health").innerHTML = barRows(stockCounts, (value) => `${value} records`, ["green", "orange", "red", "red", "red"]) + graphNote("Computed from inventory records using quantity vs minimum and expiry date rules. Expired lots are marked for disposal.");
  const visibleExpenses = byBranch(data.replenishments, "office");
  const expenseByClassification = Object.entries(sumBy(visibleExpenses, "type", (expense) => Number(expense.amount || 0))).sort((a, b) => b[1] - a[1]);
  qs("#analytics-expense-classification").innerHTML = barRows(expenseByClassification, (value) => peso.format(value), ["orange", "red", "", "green"]) + graphNote("Computed from expense requests grouped by expense type/classification.");
  const totalExpenses = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  qs("#analytics-revenue-expenses").innerHTML = barRows([["Revenue", totalSales], ["Expenses", totalExpenses], ["Net", totalSales - totalExpenses]], (value) => peso.format(value), ["green", "red", ""]) + graphNote("Computed as invoice revenue compared with expense request totals in the selected view.");

  const issueCounts = ["Open", "In Progress", "Pass to Product Specialist", "Pass to Engineering", "Resolved"].map((status) => [status, data.productIssues.filter((report) => report.status === status).length]);
  const resolvedIssues = data.productIssues.filter((report) => report.status === "Resolved");
  const avgIssueTurnaround = resolvedIssues.length ? Math.round(resolvedIssues.reduce((sum, report) => sum + (productIssueTurnaroundDays(report) || 0), 0) / resolvedIssues.length) : null;
  qs("#analytics-product-issues").innerHTML = barRows(issueCounts, (value) => `${value} report${value === 1 ? "" : "s"}`, ["red", "purple", "orange", "orange", "green"]) + graphNote(`Computed from support report status across all logged cases.${avgIssueTurnaround === null ? "" : ` Average turnaround: ${avgIssueTurnaround} day${avgIssueTurnaround === 1 ? "" : "s"}.`}`);

  const overdue = visibleSales.filter((sale) => statusForSale(sale) === "Overdue");
  const lowStock = visibleInventory.filter((item) => ["Low Stock", "Critical"].includes(inventoryStatus(item)));
  const nearExpiry = visibleInventory.filter((item) => inventoryStatus(item) === "Near Expiry");
  const forDisposal = visibleInventory.filter((item) => inventoryStatus(item) === "For Disposal");
  const openIssues = data.productIssues.filter((report) => report.status === "Open").length;
  const topClient = Object.entries(sumBy(visibleSales, "client", (sale) => sale.net)).sort((a, b) => b[1] - a[1])[0];
  const insights = [
    overdue.length ? `${overdue.length} overdue invoice/s need collection follow-up.` : "No overdue invoices in the selected view.",
    lowStock.length ? `${lowStock.length} inventory record/s are low or critical. Reorder or transfer stock.` : "No low or critical stock records in the selected view.",
    forDisposal.length ? `${forDisposal.length} expired inventory lot/s are for disposal and blocked from invoicing.` : nearExpiry.length ? `${nearExpiry.length} reagent/item record/s are near expiry. Prioritize selling or replacement.` : "No near-expiry stock in the selected view.",
    openIssues ? `${openIssues} open support report/s need action.` : "No open support reports.",
    topClient ? `Top client by sales: ${topClient[0]} at ${peso.format(topClient[1])}.` : "No sales data available.",
  ];
  qs("#analytics-insights").innerHTML = insights.map((text) => `<li><span>${escapeHtml(text)}</span></li>`).join("");
  renderGrowthAnalytics(visibleSales, visibleInventory, totalSales, totalPaid);
}

function renderGrowthAnalytics(visibleSales, visibleInventory, totalSales, totalPaid) {
  const monthlySales = Object.entries(visibleSales.reduce((acc, sale) => { acc[sale.date.slice(0, 7)] = (acc[sale.date.slice(0, 7)] || 0) + sale.net; return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));
  const lastMonth = monthlySales.at(-1)?.[0] || fmtDate(today).slice(0, 7);
  const base = monthlySales.at(-1)?.[1] || totalSales || 1;
  const forecast = [...monthlySales, ...[1, 2, 3].map((step) => {
    const d = new Date(`${lastMonth}-01T00:00:00`);
    d.setMonth(d.getMonth() + step);
    return [fmtDate(d).slice(0, 7), Math.round(base * (1 + step * 0.08))];
  })];
  qs("#growth-sales-forecast").innerHTML = lineChart(forecast) + graphNote("Projection starts from the latest monthly sales total and applies the configured growth step.");
  qs("#growth-client-pipeline").innerHTML = barRows(Object.entries(sumBy(data.clients, "area", () => 1)).map(([area, count]) => [area, count + visibleSales.filter((sale) => sale.area === area).length]), (value) => `${value} accounts/orders`, ["", "green", "orange"]);
  const demand = Object.entries(sumBy(visibleSales, "item", (sale) => sale.qty || (sale.lines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0))).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs("#growth-product-demand").innerHTML = verticalBars(demand.map(([label, value]) => [label, value * 4200])) + graphNote("Computed from sold item quantities and configured unit pricing.");
  const recoverable = Math.max(totalSales - totalPaid, 0);
  const recoveryRate = totalSales ? Math.round((recoverable / totalSales) * 100) : 0;
  qs("#growth-collection-potential").innerHTML = `<div class="donut" style="--paid:${Math.min(100, recoveryRate)}%; --partial:${Math.min(100, recoveryRate + 18)}%; --end:100%;" data-label="${recoveryRate}%\nAR upside"></div><div class="legend"><span class="orange">Recoverable ${peso.format(recoverable)}</span><span class="green">Collected ${peso.format(totalPaid)}</span></div>${graphNote("Computed from outstanding AR compared with collected payment totals.")}`;
  const coverage = visibleInventory.map((item) => [item.item, Math.max(0, item.qty - item.min)]).sort((a, b) => a[1] - b[1]).slice(0, 5);
  qs("#growth-stock-coverage").innerHTML = barRows(coverage, (value) => `${value} over min`, ["red", "orange", "", "green"]);
  qs("#growth-recommendations").innerHTML = [
    "Prioritize near-expiry reagents in sales bundles before new procurement.",
    "Push Region I repeat orders and dealer areas with open AR recovery.",
    "Use low-stock signals to plan transfer or reorder quantities before quarterly demand spikes.",
  ].map((text) => `<li><span>${escapeHtml(text)}</span></li>`).join("");
}

function renderMasterlists() {
  if (data.masterTab === "employees" && !canManageEmployees()) data.masterTab = "clients";
  qsa("#master-tabs .tab[data-master='employees']").forEach((tab) => { tab.hidden = !canManageEmployees(); });
  qsa("#master-tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.master === data.masterTab));
  qs("#platform-branch-panel").hidden = data.masterTab !== "branches";
  qs("#master-table").parentElement.hidden = data.masterTab === "branches";
  qs("#master-add-button").hidden = !canEditModule("masterlists") || data.masterTab === "branches";
  qs("#master-table").classList.toggle("employee-table", data.masterTab === "employees");
  qs("#master-table").classList.toggle("client-table", data.masterTab === "clients");
  const labels = { clients: "Add Client", items: "Add Item", suppliers: "Add Supplier", branches: "Add Branch", employees: "Add Employee", banks: "Add Bank" };
  qs("#master-add-button").textContent = labels[data.masterTab];
  qs("#master-add-button").hidden = !canEditModule("masterlists");
  const masterEditAction = (type, index) => canEditModule("masterlists") ? `<button class="mini-button" data-master-edit="${type}" data-index="${index}">Edit</button>` : "Approval required";
  const missingDocs = data.clients.reduce((sum, client) => sum + requiredClientDocs.filter((doc) => !client.docs?.includes(doc)).length, 0);
  qs("#master-overview").innerHTML = [
    ["Clients", data.clients.length, `${missingDocs} missing docs`, "◆"],
    ["Items", data.items.length, `${new Set(data.items.map((item) => item.brand)).size} brands`, "▤"],
    ["Suppliers", data.suppliers.length, "supplier records", "◇"],
    ["Banks", data.banks.length, "collection accounts", "●"],
  ].map(([title, value, note, icon]) => `<article class="master-card"><span class="feature-icon">${icon}</span><div><strong>${value}</strong><small>${title} · ${note}</small></div></article>`).join("");
  if (data.masterTab === "clients") table("#master-table", ["Code", "Client", "Area", "Account Type", "Sales Person", "Terms", "Contact", "TIN", "Status", "Credit Limit", "AR Used", "Required Docs", "Actions"], data.clients.filter((c) => includesSearch(Object.values(c))).map((c) => {
    const used = clientBalance(c.name);
    const creditClass = used > c.creditLimit ? "credit-warning" : "";
    return { focus: c.name, cells: [c.code || "-", c.name, c.area, c.dealer, c.salesperson || "Unassigned", `${c.terms || 30} days`, c.contact, c.tin, c.status || "Active", peso.format(c.creditLimit), `<span class="${creditClass}">${peso.format(used)}</span>`, docUploadButtons(c), masterEditAction("client", data.clients.indexOf(c))] };
  }));
  if (data.masterTab === "items") table("#master-table", ["Code", "Item", "Brand", "UOM", "Supplier", "Classification", "Actions"], data.items.filter((i) => includesSearch(Object.values(i))).map((i) => ({ focus: i.code, cells: [i.code, i.name, i.brand, i.uom, i.supplier, i.classification || i.category, masterEditAction("item", data.items.indexOf(i))] })));
  if (data.masterTab === "suppliers") table("#master-table", ["Code", "Supplier", "Classification", "TIN", "Address", "Contact", "Status", "Actions"], data.suppliers.filter((s) => includesSearch(Object.values(s))).map((s) => ({ focus: s.name, cells: [s.code || "-", s.name, s.classification || s.brand || "Multiple", s.tin || "-", s.address, s.contact, s.status || "Active", masterEditAction("supplier", data.suppliers.indexOf(s))] })));
  if (data.masterTab === "branches") table("#master-table", ["Branch", "Address", "Status", "Actions"], platformBranches().map((branch) => {
    const locked = data.inventory.some((item) => item.branch === branch) || data.pendingTransfers.some((transfer) => transfer.from === branch || transfer.to === branch);
    return { focus: branch, cells: [branch, branchAddresses()[branch] || "No address set", locked ? "Used by records" : "Unused", canEditModule("masterlists") ? `<button class="mini-button" data-edit-branch-address="${escapeHtml(branch)}">Address</button>${locked ? "" : `<button class="mini-button danger-button" data-remove-platform-branch="${escapeHtml(branch)}">Remove</button>`}` : "Approval required"] };
  }));
  if (data.masterTab === "employees") table("#master-table", ["Name", "Role", "Contact", "Salary", "Govt. Benefits", "Actions"], data.employees.filter((e) => includesSearch(Object.values(e))).map((e) => ({ focus: e.name, cells: [e.name, e.role, e.contact, canManageEmployeeSalary() ? peso.format(Number(e.salary || 0)) : "Superadmin Only", e.benefits, masterEditAction("employee", data.employees.indexOf(e))] })));
  if (data.masterTab === "banks") table("#master-table", ["Bank", "Account", "Notes", "Actions"], data.banks.filter((b) => includesSearch(Object.values(b))).map((b) => ({ focus: b.name, cells: [b.name, b.account, b.notes, masterEditAction("bank", data.banks.indexOf(b))] })));
}

function docUploadButtons(client) {
  const index = data.clients.indexOf(client);
  return `<div class="doc-upload-grid">${requiredClientDocs.map((doc) => {
    const uploaded = client.docs?.includes(doc);
    return `<label class="doc-upload-button ${uploaded ? "uploaded" : "missing"}"><span>${escapeHtml(doc)}</span><strong>${uploaded ? "Uploaded" : "Upload File"}</strong><em>${uploaded ? "Replace" : "Choose document"}</em><input class="doc-file-input" type="file" data-upload-doc="${escapeHtml(doc)}" data-client-index="${index}" /></label>`;
  }).join("")}</div>`;
}

function uploadAllClientDocs(index) {
  const client = data.clients[index];
  if (!client) return toast("Client not found.");
  const docs = new Set(String(client.docs || "").split(",").map((item) => item.trim()).filter(Boolean));
  requiredClientDocs.forEach((doc) => docs.add(doc));
  client.docs = [...docs].join(", ");
  log("Uploaded all required client docs", "Masterlists", client.name);
  saveData();
  renderMasterlists();
  toast(`All required documents marked uploaded for ${client.name}.`);
}

function uploadClientDoc(index, doc, fileName = "") {
  const client = data.clients[index];
  if (!client) return;
  const docs = new Set(String(client.docs || "").split(",").map((item) => item.trim()).filter(Boolean));
  docs.add(doc);
  client.docs = [...docs].join(", ");
  log("Uploaded required client document", "Masterlists", `${client.name}: ${doc}${fileName ? ` (${fileName})` : ""}`);
  saveData();
  renderMasterlists();
  toast(`${doc} uploaded for ${client.name}.`);
}

function inventoryItemLabel(item) {
  return `${item.item} · Lot ${item.lot || "-"} · Exp ${item.expiry || "N/A"}`;
}

function renderInventory() {
  const status = qs("#inventory-status").value;
  renderInventoryWorkflowTabs();
  renderInventoryBranchTabs();
  ensureInventoryDatalists();
  const rows = data.inventory.filter((item) => item.branch === inventoryBranchTab).filter((item) => status === "all" || inventoryStatus(item) === status).filter((item) => includesSearch(Object.values(item)));
  const visibleInventory = data.inventory;
  const low = visibleInventory.filter((item) => ["Low Stock", "Critical"].includes(inventoryStatus(item)));
  const nearExpiry = visibleInventory.filter((item) => inventoryStatus(item) === "Near Expiry");
  const forDisposal = visibleInventory.filter((item) => inventoryStatus(item) === "For Disposal");
  const expiringSoon = visibleInventory.filter((item) => item.expiry !== "N/A").sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry)).slice(0, 4);
  qs("#inventory-visuals").innerHTML = [
    visualCard("!", "Low Stock", `${low.length} records`, barRows(low.map((item) => [inventoryItemLabel(item), Math.max(item.min - item.qty, 0)]), (value) => `${value} short`, ["red", "orange"]), "risk", "Computed as minimum stock minus current quantity for records below minimum."),
    visualCard("⌁", "Near Expiry", `${nearExpiry.length} lots`, barRows(expiringSoon.map((item) => [inventoryItemLabel(item), daysUntil(item.expiry)]), (value) => value < 0 ? "expired" : `${value} days`, ["red", "orange", "green"]), "warning", "Computed from lot expiry dates and days remaining from today."),
    visualCard("×", "For Disposal", `${forDisposal.length} expired`, barRows(forDisposal.map((item) => [inventoryItemLabel(item), Math.abs(daysUntil(item.expiry))]), (value) => `${value} days expired`, ["red", "orange"]), "risk", "Expired inventory is marked for disposal and blocked from SI/TS/DR invoicing."),
    visualCard("▤", "Stock Health", `${visibleInventory.length} total`, barRows(["Available", "Near Expiry", "Low Stock", "Critical", "For Disposal"].map((itemStatus) => [itemStatus, visibleInventory.filter((item) => inventoryStatus(item) === itemStatus).length]), (value) => `${value} records`, ["green", "orange", "red", "red", "red"]), "info", "Computed by classifying each inventory record by quantity and expiry rules."),
  ].join("");
  qs("#inventory-compact-toggle")?.classList.toggle("active", inventoryCompactView);
  const inventoryHeaders = inventoryCompactView ? ["Item Name", "Serial No./Lot No.", "Expiry Date", "Qty", "Min", "Status"] : ["Receiving Branch", "Brand", "Item Code", "Item Name", "Serial No./Lot No.", "Expiry Date", "Qty", "Min", "Status"];
  table("#inventory-table", inventoryHeaders, rows.map((i) => {
    const fullCells = [i.branch, i.brand, i.code, i.item, i.serial ? `${i.serial}<small>${i.lot}</small>` : i.lot, i.expiry, i.qty, i.min, `<span class="pill ${statusClass(inventoryStatus(i))}">${inventoryStatus(i)}</span>`];
    return { focus: i.lot, cells: inventoryCompactView ? fullCells.slice(3) : fullCells };
  }));
  const inventoryPoLineItems = (po) => itemizedSummary(po.lines?.map((line) => ({ particulars: `${line.item} (${line.qty} ${line.uom}) Lot ${line.lot || "-"} Exp ${line.expiry || "N/A"}`, amount: line.qty * line.price - Number(line.discount || 0) })) || []);
  table("#inventory-po-table", ["PO", "Supplier", "Branch", "Date", "Terms", "Items", "Status", "Actions"], (data.inventoryPurchaseOrders || []).filter((po) => !inventoryPoTerminalStatuses.includes(po.status)).map((po) => ({ focus: po.id, cells: [po.id, po.supplier, po.branch || "-", po.date, `${po.terms || 30} days`, inventoryPoLineItems(po), `<span class="pill ${statusClass(po.status)}">${poStatusLabel(po.status)}</span>`, inventoryPoActionsCell(po, data.inventoryPurchaseOrders.indexOf(po))] })));
  table("#inventory-po-history-table", ["PO", "Supplier", "Branch", "Date", "Items", "Status", "Completed By", "Actions"], (data.inventoryPurchaseOrders || []).filter((po) => inventoryPoTerminalStatuses.includes(po.status)).map((po) => ({ focus: po.id, cells: [po.id, po.supplier, po.branch || "-", po.date, inventoryPoLineItems(po), `<span class="pill ${statusClass(po.status)}">${poStatusLabel(po.status)}</span>`, po.receivedBy || po.cancelledBy || "-", `<button class="mini-button" data-inventory-po-timeline="${escapeHtml(po.id)}">View Timeline</button><button class="mini-button" data-inventory-po-print="${escapeHtml(po.id)}">Print PO</button>`] })));
  table("#transfer-table", ["Transfer", "Items", "From", "To", "Total Qty", "Lots / Expiry", "Status", "Authorization"], data.pendingTransfers.map((transfer, index) => ({ focus: transfer.id, cells: [transfer.id, transferItemizedDetail(transfer), transfer.from, transfer.to, transfer.qty, (transfer.lines?.length ? transfer.lines : [transfer]).map((line) => `${line.lot || "-"}<small>${line.expiry || "N/A"}</small>`).join(""), `<span class="pill ${statusClass(transfer.status)}">${transfer.status}</span>`, `${transferAuthorizationCell(transfer, index)}<button class="mini-button" data-transfer-timeline="${escapeHtml(transfer.id)}">Timeline</button>`] })));
  table("#transfer-history-table", ["Date", "Transfer", "Action", "Item", "From", "To", "Qty", "Lot", "User", "Notes"], data.transferHistory.slice(0, 20).map((entry) => [entry.date, entry.transferId, entry.action, entry.item, entry.from, entry.to, entry.qty, entry.lot, entry.user, entry.notes]));
}

function renderInventoryWorkflowTabs() {
  const tabs = qs("#inventory-workflow-tabs");
  if (!tabs) return;
  const counts = {
    receiving: (data.inventoryPurchaseOrders || []).filter((po) => !inventoryPoTerminalStatuses.includes(po.status)).length,
    completed: (data.inventoryPurchaseOrders || []).filter((po) => inventoryPoTerminalStatuses.includes(po.status)).length,
    transfers: (data.pendingTransfers || []).filter((transfer) => !["Received", "Cancelled"].includes(transfer.status)).length,
    stocks: (data.inventory || []).filter((item) => item.branch === inventoryBranchTab).length,
  };
  const labels = { receiving: "Receiving POs", completed: "Completed POs", transfers: "Transfers", stocks: "Stocks" };
  tabs.querySelectorAll("[data-inventory-workflow]").forEach((button) => {
    const tab = button.dataset.inventoryWorkflow;
    button.classList.toggle("active", tab === inventoryWorkflowTab);
    button.innerHTML = `${escapeHtml(labels[tab] || tab)} <span class="tab-count">${counts[tab] || 0}</span>`;
  });
  qsa(".inventory-workflow-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.inventoryPanel === inventoryWorkflowTab));
}

function recordTransferHistory(transfer, action, notes) {
  const entry = { id: `TH-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), transferId: transfer.id, action, item: transfer.item, from: transfer.from, to: transfer.to, qty: transfer.qty, lot: transfer.sourceLot || transfer.lot, user: currentUser?.name || "System User", notes };
  data.transferHistory.unshift(entry);
  data.transferHistory = data.transferHistory.slice(0, 80);
  return entry;
}

function showTransferTimeline(id) {
  const transfer = data.pendingTransfers.find((item) => item.id === id) || {};
  const events = data.transferHistory.filter((entry) => entry.transferId === id);
  const dialog = document.createElement("dialog");
  dialog.className = "modal audit-detail-modal";
  dialog.innerHTML = `<div class="modal-header"><div><p class="eyebrow">Transfer Timeline</p><h2>${escapeHtml(id)}</h2></div><button class="icon-button" type="button" data-close-transfer-timeline aria-label="Close">x</button></div><div class="report-preview-grid invoice-mini-grid"><div class="report-preview-card"><small>Item</small><strong>${escapeHtml(transfer.item || events[0]?.item || "-")}</strong></div><div class="report-preview-card"><small>Route</small><strong>${escapeHtml([transfer.from || events[0]?.from, transfer.to || events[0]?.to].filter(Boolean).join(" -> ") || "-")}</strong></div><div class="report-preview-card"><small>Qty</small><strong>${escapeHtml(String(transfer.qty || events[0]?.qty || "-"))}</strong></div><div class="report-preview-card"><small>Status</small><strong>${escapeHtml(transfer.status || events.at(-1)?.action || "-")}</strong></div></div><details class="full-event-details" open><summary>Status timeline</summary><div class="event-timeline">${events.map((event) => `<div class="event-item ${/receive|complete/i.test(event.action) ? "done" : /incomplete|cancel/i.test(event.action) ? "blocked" : "pending"}"><span>${escapeHtml((event.action || "T")[0])}</span><time>${escapeHtml(event.date || "")}</time><div><strong>${escapeHtml(event.action || "")}</strong><p>${escapeHtml(event.notes || "-")}</p><small>${escapeHtml(event.user || "-")}</small></div></div>`).join("") || `<p>No transfer history recorded yet.</p>`}</div></details>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-close-transfer-timeline]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function ensureInventoryDatalists() {
  if (!qs("#inventory-code-options")) qs("#inventory").insertAdjacentHTML("beforeend", `<datalist id="inventory-code-options"></datalist><datalist id="inventory-item-options"></datalist><datalist id="inventory-brand-options"></datalist>`);
  qs("#inventory-code-options").innerHTML = data.items.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.name)} · ${escapeHtml(item.brand)}</option>`).join("");
  qs("#inventory-item-options").innerHTML = data.items.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.code)} · ${escapeHtml(item.brand)}</option>`).join("");
  qs("#inventory-brand-options").innerHTML = [...new Set(data.items.map((item) => item.brand).filter(Boolean))].map((brand) => `<option value="${escapeHtml(brand)}"></option>`).join("");
}

function stockSheetRow(index) {
  return `<tr><td><select class="stock-branch">${branchOptions(inventoryBranchTab)}</select></td><td><input class="stock-brand" list="inventory-brand-options" /></td><td><input class="stock-code" list="inventory-code-options" /></td><td><input class="stock-item" list="inventory-item-options" /></td><td><input class="stock-lot" /></td><td><input class="stock-expiry" type="date" min="${fmtDate(today)}" /></td><td><input class="stock-qty" type="number" min="1" /></td><td class="sheet-action-cell"><button class="icon-button danger-button remove-sheet-row" type="button" aria-label="Delete row" title="Delete row">×</button></td></tr>`;
}

function receivablePurchaseOrders() { return (data.inventoryPurchaseOrders || []).filter((po) => ["For Receiving", "Partially Received"].includes(po.status)); }

function renderStockSheet() {
  const tableEl = qs("#stock-sheet-table");
  if (!tableEl) return;
  const pickerOptions = `<option value="">Manual receive</option>${receivablePurchaseOrders().map((po) => `<option value="${escapeHtml(po.id)}">${escapeHtml(po.id)} · ${escapeHtml(po.supplier)}</option>`).join("")}`;
  if (!qs("#inventory-po-receive-picker")) tableEl.closest(".table-card")?.insertAdjacentHTML("beforebegin", `<div class="toolbar"><div class="field"><label for="inventory-po-receive-picker">Inventory Purchase Order</label><select id="inventory-po-receive-picker">${pickerOptions}</select></div></div>`);
  else qs("#inventory-po-receive-picker").innerHTML = pickerOptions;
  tableEl.innerHTML = `<thead><tr><th>Receiving Branch</th><th>Brand</th><th>Item Code</th><th>Item Name</th><th>Serial No./Lot No.</th><th>Expiry Date</th><th>Qty.</th><th>Action</th></tr></thead><tbody>${stockSheetRow(0)}</tbody>`;
}

function fillStockSheetFromInventoryPo(poId) {
  const po = (data.inventoryPurchaseOrders || []).find((entry) => entry.id === poId);
  if (!po) return renderStockSheet();
  const remainingLines = po.lines.filter((line) => Number(line.qty || 0) - Number(line.receivedQty || 0) > 0);
  const bodyRows = (remainingLines.length ? remainingLines : po.lines).map((line) => `<tr><td><select class="stock-branch">${branchOptions(po.branch || inventoryBranchTab)}</select></td><td><input class="stock-brand" list="inventory-brand-options" value="${escapeHtml(line.brand || "")}" /></td><td><input class="stock-code" list="inventory-code-options" value="${escapeHtml(line.code || "")}" /></td><td><input class="stock-item" list="inventory-item-options" value="${escapeHtml(line.item || "")}" /></td><td><input class="stock-lot" value="${escapeHtml(line.lot || "")}" /></td><td><input class="stock-expiry" type="date" min="${fmtDate(today)}" value="${escapeHtml(line.expiry || "")}" /></td><td><input class="stock-qty" type="number" min="1" value="${Number(line.qty || 0) - Number(line.receivedQty || 0)}" /></td><td class="sheet-action-cell"><button class="icon-button danger-button remove-sheet-row" type="button" aria-label="Delete row" title="Delete row">×</button></td></tr>`).join("");
  qs("#stock-sheet-table").innerHTML = `<thead><tr><th>Receiving Branch</th><th>Brand</th><th>Item Code</th><th>Item Name</th><th>Serial No./Lot No.</th><th>Expiry Date</th><th>Qty.</th><th>Action</th></tr></thead><tbody>${bodyRows}</tbody>`;
}

function addStockSheetRow() {
  const body = qs("#stock-sheet-table tbody");
  if (!body) return;
  body.insertAdjacentHTML("beforeend", stockSheetRow(body.children.length));
}

function transferSheetRow() {
  const uid = ++transferRowUid;
  return `<tr><td><input class="transfer-code" list="inventory-code-options" /></td><td><input class="transfer-item" list="inventory-item-options" /></td><td><input class="transfer-lot" list="transfer-lot-options-${uid}" /><datalist id="transfer-lot-options-${uid}"></datalist></td><td><select class="transfer-from">${branchOptions(platformBranches()[0])}</select></td><td><select class="transfer-to">${branchOptions(platformBranches()[1] || platformBranches()[0])}</select></td><td><input class="transfer-qty" type="number" min="1" /></td><td class="sheet-action-cell"><button class="icon-button danger-button remove-sheet-row" type="button" aria-label="Delete row" title="Delete row">×</button></td></tr>`;
}

function addTransferSheetRow() {
  const body = qs("#transfer-sheet-table tbody");
  if (!body) return;
  body.insertAdjacentHTML("beforeend", transferSheetRow());
}

function renderTransferSheet() {
  const tableEl = qs("#transfer-sheet-table");
  if (!tableEl) return;
  tableEl.innerHTML = `<thead><tr><th>Item Code</th><th>Item Name</th><th>Lot Number</th><th>From Branch</th><th>To Branch</th><th>Qty.</th><th>Action</th></tr></thead><tbody>${transferSheetRow()}</tbody>`;
}

function removeInventorySheetRow(button) {
  const row = button.closest("tr");
  const body = row?.parentElement;
  if (!row || !body) return;
  if (body.children.length <= 1) {
    row.querySelectorAll("input").forEach((input) => { input.value = ""; });
    return toast("At least one row is required. Row cleared instead.");
  }
  row.remove();
}

function syncStockSheetRow(input, allowPartial = false) {
  const row = input.closest("tr");
  if (!row) return;
  const codeInput = row.querySelector(".stock-code, .transfer-code");
  const itemInput = row.querySelector(".stock-item, .transfer-item");
  const brandInput = row.querySelector(".stock-brand");
  const match = findItemForSheetRow(row, input, allowPartial);
  if (!match) return;
  if (codeInput) codeInput.value = match.code;
  if (itemInput) itemInput.value = match.name;
  if (brandInput) brandInput.value = match.brand;
  const lotInput = row.querySelector(".transfer-lot");
  const lotDatalist = row.querySelector("datalist[id^='transfer-lot-options-']");
  const from = row.querySelector(".transfer-from")?.value;
  const matchingStock = data.inventory.filter((entry) => entry.code === match.code && (!from || entry.branch === from) && entry.qty > 0);
  if (lotDatalist) lotDatalist.innerHTML = matchingStock.map((entry) => `<option value="${escapeHtml(entry.lot)}">Exp ${escapeHtml(entry.expiry || "N/A")} · Qty ${entry.qty}</option>`).join("");
  if (lotInput && matchingStock[0] && !lotInput.value.trim()) lotInput.value = matchingStock[0].lot;
}

async function saveStockSheet() {
  const poId = qs("#inventory-po-receive-picker")?.value;
  const po = (data.inventoryPurchaseOrders || []).find((entry) => entry.id === poId);
  if (!canManagePoReceiving()) return toast("Receiving stock needs Logistics or Superadmin access.");
  if (po && !["For Receiving", "Partially Received"].includes(po.status)) return toast(`${po.id} is not ready for receiving.`);
  const rows = qsa("#stock-sheet-table tbody tr").map((row) => {
    const branch = row.querySelector(".stock-branch")?.value;
    const code = row.querySelector(".stock-code")?.value.trim();
    const itemName = row.querySelector(".stock-item")?.value.trim();
    const item = findItemByCodeOrName(code || itemName);
    const brand = row.querySelector(".stock-brand")?.value.trim() || item?.brand || "Medlane";
    const lot = row.querySelector(".stock-lot")?.value.trim();
    const expiry = row.querySelector(".stock-expiry")?.value;
    const qty = Number(row.querySelector(".stock-qty")?.value || 0);
    if (!code && !itemName && !lot && !qty) return null;
    return { branch, item, brand, lot, expiry, qty };
  }).filter(Boolean);
  if (!rows.length) return toast("No stock rows to save.");
  if (rows.some((row) => !row.item || !row.branch || !row.lot || !row.expiry || row.qty <= 0)) return toast("Complete all stock sheet fields before saving.");
  if (rows.some((row) => daysUntil(row.expiry) < 0)) return toast("Expiry date cannot be in the past.");
  if (po) {
    const lines = rows.map(({ item, branch, lot, qty }) => ({ code: item.code, branch, lot, qty }));
    const result = await MedlaneAPI.receivePurchaseOrderStock(po.id, lines).catch((error) => ({ error }));
    if (result.error) return toast(result.error.message || "Unable to receive stock for this purchase order.");
    replacePoRecord(result.po);
    // Mirror the server's inventory posting locally so the UI reflects it immediately;
    // the server call above is the authoritative write, this is display-only.
    rows.forEach(({ branch, item, brand, lot, expiry, qty }) => {
      const existing = data.inventory.find((entry) => entry.code === item.code && entry.branch === branch && entry.lot === lot);
      if (existing) existing.qty += qty;
      else data.inventory.push({ code: item.code, item: item.name, brand, branch, lot, serial: lot, expiry, qty, min: 10 });
    });
    notify("Purchase Order", `${po.id} ${result.po.status === "Fully Received" ? "fully received" : "partially received"}.`, "inventory", po.id);
    log("Received stock from purchase order", "Inventory", `${po.id}: ${rows.length} row(s)`);
  } else {
    rows.forEach(({ branch, item, brand, lot, expiry, qty }) => {
      const existing = data.inventory.find((entry) => entry.code === item.code && entry.branch === branch && entry.lot === lot);
      if (existing) existing.qty += qty;
      else data.inventory.push({ code: item.code, item: item.name, brand, branch, lot, serial: lot, expiry, qty, min: 10 });
    });
    log("Received stock from sheet", "Inventory", `${rows.length} row(s)`);
    saveData();
  }
  qs("#stock-sheet-modal")?.close();
  renderAll();
  toast(`${rows.length} stock row(s) saved.`);
}

async function saveTransferSheet() {
  const rows = qsa("#transfer-sheet-table tbody tr").map((row) => {
    const code = row.querySelector(".transfer-code")?.value.trim();
    const itemName = row.querySelector(".transfer-item")?.value.trim();
    const lot = row.querySelector(".transfer-lot")?.value.trim();
    const from = row.querySelector(".transfer-from")?.value;
    const to = row.querySelector(".transfer-to")?.value;
    const qty = Number(row.querySelector(".transfer-qty")?.value || 0);
    const item = findItemByCodeOrName(code || itemName);
    if (!code && !itemName && !lot && !qty) return null;
    const source = item && lot ? data.inventory.find((entry) => entry.code === item.code && entry.branch === from && entry.lot === lot && entry.qty >= qty) : null;
    return { item, lot, from, to, qty, source };
  }).filter(Boolean);
  if (!rows.length) return toast("No transfer rows to save.");
  if (rows.some((row) => !row.item || !row.lot || !row.from || !row.to || row.qty <= 0)) return toast("Complete all stock transfer fields before saving.");
  if (rows.some((row) => row.from === row.to)) return toast("Transfer source and destination must be different.");
  if (rows.some((row) => !row.source)) return toast("Not enough source stock for the selected item lot.");
  const transfers = [];
  const historyEntries = [];
  const touchedInventory = [];
  rows.forEach((row) => {
    row.source.qty -= row.qty;
    touchedInventory.push(row.source);
    const transfer = { id: nextId(data.pendingTransfers, "TR"), code: row.item.code, item: row.item.name, brand: row.source.brand || row.item.brand, from: row.from, to: row.to, qty: row.qty, lot: row.lot, sourceLot: row.lot, expiry: row.source.expiry || "N/A", lines: [{ code: row.item.code, item: row.item.name, brand: row.source.brand || row.item.brand, qty: row.qty, uom: row.item.uom || "unit", lot: row.lot, expiry: row.source.expiry || "N/A" }], status: "For Receiving", requestedBy: currentUser?.name || "System User" };
    data.pendingTransfers.push(transfer);
    transfers.push(transfer);
    historyEntries.push(recordTransferHistory(transfer, "Created", "Source stock deducted and transfer opened for dispatch."));
    notify("Transfer", `${transfer.id} requires receiving confirmation at ${transfer.to}.`, "inventory", transfer.id);
  });
  await persistRecords({ pendingTransfers: transfers, inventory: touchedInventory, transferHistory: historyEntries });
  log("Created stock transfer", "Inventory", `${rows.length} row(s)`, { save: false });
  saveData(["notifications"]);
  qs("#transfer-sheet-modal")?.close();
  renderAll();
  toast(`${rows.length} stock transfer row(s) created.`);
}

async function dispatchTransfer(index) {
  if (!canApproveInventoryChanges()) return toast("Stock transfer dispatch needs Admin approval.");
  const transfer = data.pendingTransfers[index];
  if (!transfer || transfer.status !== "For Receiving") return toast("Transfer is not ready for dispatch.");
  if (!confirm(`Mark ${transfer.id} as In Transit from ${transfer.from} to ${transfer.to}?`)) return;
  transfer.status = "In Transit";
  transfer.dispatchedBy = currentUser?.name || "System User";
  transfer.dispatchedAt = fmtDate(today);
  const historyEntry = recordTransferHistory(transfer, "Marked In Transit", `Dispatched from ${transfer.from} to ${transfer.to}.`);
  await persistRecords({ pendingTransfers: [transfer], transferHistory: [historyEntry] });
  log("Marked stock transfer in transit", "Inventory", `${transfer.id} ${transfer.from} to ${transfer.to}`, { save: false });
  renderAll();
  toast("Transfer marked in transit.");
}

async function receiveTransfer(index) {
  const transfer = data.pendingTransfers[index];
  if (!transfer || transfer.status !== "In Transit") return toast("Transfer must be in transit before receiving.");
  if (!confirm(`Confirm full receipt of ${transfer.qty} ${transfer.item} for ${transfer.id}?`)) return;
  const existing = data.inventory.find((item) => item.code === transfer.code && item.branch === transfer.to && item.lot === transfer.lot);
  let touchedInventory = existing;
  if (existing) existing.qty += transfer.qty;
  else { touchedInventory = { code: transfer.code, item: transfer.item, brand: transfer.brand || data.items.find((item) => item.code === transfer.code)?.brand || "Medlane", branch: transfer.to, lot: transfer.lot, serial: "N/A", expiry: transfer.expiry || "N/A", qty: transfer.qty, min: 10 }; data.inventory.push(touchedInventory); }
  transfer.status = "Received";
  transfer.receivedBy = currentUser?.name || "System User";
  transfer.receivedAt = fmtDate(today);
  const historyEntry = recordTransferHistory(transfer, "Confirmed Received", `Received at ${transfer.to}; destination inventory increased.`);
  await persistRecords({ pendingTransfers: [transfer], inventory: [touchedInventory], transferHistory: [historyEntry] });
  log("Confirmed stock transfer received", "Inventory", `${transfer.id} ${transfer.from} to ${transfer.to}`, { save: false });
  notify("Transfer", `${transfer.id} was received by ${transfer.receivedBy}. Inventory adjusted at ${transfer.to}.`, "inventory", transfer.id);
  saveData(["notifications"]);
  renderAll();
  toast("Transfer received and inventory adjusted.");
}

async function incompleteTransfer(index) {
  const transfer = data.pendingTransfers[index];
  if (!transfer || transfer.status !== "In Transit") return toast("Only in-transit transfers can be marked incomplete.");
  const received = Number(prompt(`Actual received quantity for ${transfer.id} (0 to ${transfer.qty - 1}):`, "0"));
  if (!Number.isFinite(received) || received < 0 || received >= transfer.qty) return toast("Enter a valid incomplete received quantity.");
  if (!confirm(`Mark ${transfer.id} incomplete? Received ${received}, missing ${transfer.qty - received}.`)) return;
  let touchedInventory = null;
  if (received > 0) {
    const existing = data.inventory.find((item) => item.code === transfer.code && item.branch === transfer.to && item.lot === transfer.lot);
    touchedInventory = existing;
    if (existing) existing.qty += received;
    else { touchedInventory = { code: transfer.code, item: transfer.item, brand: transfer.brand || data.items.find((item) => item.code === transfer.code)?.brand || "Medlane", branch: transfer.to, lot: transfer.lot, serial: "N/A", expiry: transfer.expiry || "N/A", qty: received, min: 10 }; data.inventory.push(touchedInventory); }
  }
  transfer.status = "Incomplete";
  transfer.receivedQty = received;
  transfer.missingQty = transfer.qty - received;
  transfer.incompleteBy = currentUser?.name || "System User";
  transfer.incompleteAt = fmtDate(today);
  const historyEntry = recordTransferHistory(transfer, "Marked Incomplete", `Received ${received}; missing ${transfer.missingQty}. Destination inventory updated only for received quantity.`);
  await persistRecords({ pendingTransfers: [transfer], inventory: touchedInventory ? [touchedInventory] : [], transferHistory: [historyEntry] });
  notify("Transfer", `${transfer.id} marked incomplete: ${transfer.missingQty} missing.`, "inventory", transfer.id);
  log("Marked stock transfer incomplete", "Inventory", `${transfer.id}: received ${received}, missing ${transfer.missingQty}`, { save: false });
  saveData(["notifications"]);
  renderAll();
  toast("Transfer marked incomplete.");
}

async function completeIncompleteTransfer(index) {
  const transfer = data.pendingTransfers[index];
  if (!transfer || transfer.status !== "Incomplete") return toast("Only incomplete transfers can receive missing quantity.");
  const missing = Number(transfer.missingQty || 0);
  if (missing <= 0) return toast("No missing quantity remains for this transfer.");
  if (!confirm(`Confirm missing ${missing} ${transfer.item} finally arrived for ${transfer.id}?`)) return;
  const existing = data.inventory.find((item) => item.code === transfer.code && item.branch === transfer.to && item.lot === transfer.lot);
  let touchedInventory = existing;
  if (existing) existing.qty += missing;
  else { touchedInventory = { code: transfer.code, item: transfer.item, brand: transfer.brand || data.items.find((item) => item.code === transfer.code)?.brand || "Medlane", branch: transfer.to, lot: transfer.lot, serial: "N/A", expiry: transfer.expiry || "N/A", qty: missing, min: 10 }; data.inventory.push(touchedInventory); }
  transfer.status = "Received";
  transfer.receivedQty = Number(transfer.receivedQty || 0) + missing;
  transfer.missingQty = 0;
  transfer.receivedBy = currentUser?.name || "System User";
  transfer.receivedAt = fmtDate(today);
  const historyEntry = recordTransferHistory(transfer, "Confirmed Missing Quantity", `Missing ${missing} received at ${transfer.to}; transfer is now complete.`);
  await persistRecords({ pendingTransfers: [transfer], inventory: [touchedInventory], transferHistory: [historyEntry] });
  notify("Transfer", `${transfer.id} missing quantity was received by ${transfer.receivedBy}. Inventory adjusted at ${transfer.to}.`, "inventory", transfer.id);
  log("Confirmed missing transfer quantity", "Inventory", `${transfer.id}: received missing ${missing}`, { save: false });
  saveData(["notifications"]);
  renderAll();
  toast("Missing quantity received and transfer completed.");
}

function renderSales() {
  const status = qs("#sales-status").value;
  const type = qs("#sales-type").value;
  const canViewAllSales = ["Accounting", "Admin", "Superadmin", "CEO"].includes(currentUser?.role);
  const rows = byBranch(data.sales, "area").filter((s) => ["SI", "TS"].includes(documentType(s.type))).filter((s) => canViewAllSales || s.salesperson === currentUser?.name).filter((s) => status === "all" || statusForSale(s) === status).filter((s) => type === "all" || documentType(s.type) === type).filter((s) => includesSearch(Object.values(s)));
  const nearExpiry = byBranch(data.inventory).filter((item) => inventoryStatus(item) === "Near Expiry");
  const firstNearExpiry = nearExpiry[0];
  qs("#near-expiry-sales-alert").innerHTML = nearExpiry.length
    ? `<button class="near-expiry-banner-button" type="button" data-go-section="inventory" data-focus-record="${escapeHtml(firstNearExpiry.lot)}"><span class="feature-icon">!</span><div><strong>Near-expiry sales alert</strong><small>${nearExpiry.map((item) => `${item.item} (${item.branch}, ${item.expiry})`).join(" · ")}</small></div></button>`
    : `<span class="feature-icon">✓</span><div><strong>No near-expiry sales alert</strong><small>All selected branch inventory is outside the near-expiry window.</small></div>`;
  table("#sales-table", ["Document", "Client", "Area", "Sales Person", "Date", "Total Due", "Terms", "Source", "Status", "Actions"], rows.map((s) => ({ focus: s.documentNo || s.id, attrs: { "data-sale-row": s.id }, cells: [`<span class="invoice-type-badge type-${escapeHtml(documentType(s.type))}"><span>${invoiceTypeIcon(s.type)}</span>${escapeHtml(s.documentNo || s.id)}</span>`, s.client, s.area, s.salesperson, s.date, peso.format(s.net), `${s.terms} days`, s.migrated ? `<span class="pill warning">Migrated</span>` : `<span class="pill success">Native</span>`, `<span class="pill ${statusClass(statusForSale(s))}">${statusForSale(s)}</span>`, `<div class="inline-actions"><button class="mini-button sticky-view" data-sale-detail="${s.id}">View</button><button class="mini-button" data-sale-timeline="${s.id}">View Timeline</button></div>`] })));
  const totalSales = rows.reduce((sum, sale) => sum + Number(sale.net || 0), 0);
  const totalCollected = rows.reduce((sum, sale) => sum + Number(sale.paid || 0), 0);
  const outstanding = rows.reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
  const paidCount = rows.filter((sale) => statusForSale(sale) === "Paid").length;
  const unpaidCount = rows.filter((sale) => statusForSale(sale) === "Unpaid").length;
  const overdueCount = rows.filter((sale) => statusForSale(sale) === "Overdue").length;
  const overdueAmount = rows.filter((sale) => statusForSale(sale) === "Overdue").reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
  const partialAmount = rows.filter((sale) => statusForSale(sale) === "Partially Paid").reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
  const largestInvoice = rows.reduce((max, sale) => Math.max(max, Number(sale.net || 0)), 0);
  const averageInvoice = rows.length ? Math.round(totalSales / rows.length) : 0;
  const collectionRate = totalSales ? Math.round((totalCollected / totalSales) * 100) : 0;
  qs("#sales-summary-grid").innerHTML = `
    <div class="sales-summary-hero">
      <article class="sales-summary-card primary"><span>Total displayed sales</span><strong>${peso.format(totalSales)}</strong><small>${rows.length} invoice${rows.length === 1 ? "" : "s"} in this view</small></article>
      <article class="sales-summary-card success"><span>Total collected</span><strong>${peso.format(totalCollected)}</strong><small>${collectionRate}% collection rate</small></article>
      <article class="sales-summary-card warning"><span>Outstanding balance</span><strong>${peso.format(outstanding)}</strong><small>${peso.format(overdueAmount)} overdue</small></article>
    </div>
    <div class="sales-summary-groups">
      <article class="sales-summary-group"><h3>Status Count</h3><div class="summary-pills"><span>Paid <strong>${paidCount}</strong></span><span>Unpaid <strong>${unpaidCount}</strong></span><span>Overdue <strong>${overdueCount}</strong></span></div></article>
      <article class="sales-summary-group"><h3>Invoice Size</h3><div class="summary-pairs"><span>Average <strong>${peso.format(averageInvoice)}</strong></span><span>Largest <strong>${peso.format(largestInvoice)}</strong></span></div></article>
      <article class="sales-summary-group"><h3>Risk Amounts</h3><div class="summary-pairs"><span>Overdue <strong>${peso.format(overdueAmount)}</strong></span><span>Partial AR <strong>${peso.format(partialAmount)}</strong></span></div></article>
    </div>`;
}

function renderFinancialSummary(target, heroCards, groups) {
  qs(target).innerHTML = `
    <div class="sales-summary-hero">
      ${heroCards.map((card) => `<article class="sales-summary-card ${card.tone || ""}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.note || "")}</small></article>`).join("")}
    </div>
    <div class="sales-summary-groups">
      ${groups.map((group) => `<article class="sales-summary-group"><h3>${escapeHtml(group.title)}</h3><div class="${group.kind === "pairs" ? "summary-pairs" : "summary-pills"}">${group.items.map((item) => `<span>${escapeHtml(item.label)} <strong>${escapeHtml(String(item.value))}</strong></span>`).join("")}</div></article>`).join("")}
    </div>`;
}

function renderPurchaseOrders() {
  const from = qs("#po-date-from")?.value || "";
  const to = qs("#po-date-to")?.value || "";
  const visible = byBranch(data.purchaseOrders || [], "area")
    .filter((po) => dateInRange(po.date, from, to))
    .filter((po) => includesSearch([po.id, po.client, po.area, po.salesperson, poStatus(po), ...(po.lines || []).map((line) => line.item)]));
  const pending = visible.filter((po) => poStatus(po) === "Pending Orders");
  const forInvoicing = visible.filter((po) => poStatus(po) === "For Invoicing");
  qs("#purchase-order-visuals").innerHTML = [
    visualCard("!", "Pending Orders", `${pending.length} PO${pending.length === 1 ? "" : "s"}`, pending.length ? barRows(pending.map((po) => [po.id, (po.lines || []).reduce((sum, line) => sum + poLineStatus(po, line).pending, 0)]), (value) => `${value} pending qty`, ["orange", "red"]) : "<p>No partially served orders.</p>", pending.length ? "warning" : "success", "Computed as ordered quantity minus served invoice quantity per PO line."),
    visualCard("▧", "For Invoicing", `${forInvoicing.length} unserved`, forInvoicing.length ? barRows(forInvoicing.map((po) => [po.id, (po.lines || []).length]), (value) => `${value} line${value === 1 ? "" : "s"}`, ["", "green"]) : "<p>No unserved POs.</p>", "info", "Computed from POs with no served invoice quantity yet."),
    visualCard("✓", "Completed", `${visible.filter((po) => ["Sales Invoice", "Transmittal Slip"].includes(poStatus(po))).length} served`, "<p>Completed POs are tagged by the document that fully served them.</p>", "success", "Computed from POs whose ordered quantities are fully served by SI or TS."),
  ].join("");
  qs("#purchase-order-grid").innerHTML = visible.map((po) => {
    const status = poStatus(po);
    const lines = (po.lines || []).map((line) => {
      const served = poLineStatus(po, line);
      return `<li><span>${escapeHtml(line.item)}</span><strong>${served.served}/${line.qty} served · ${served.pending} pending</strong></li>`;
    }).join("");
    return `<details class="invoice-card collapsible-invoice" data-focus-record="${escapeHtml(po.id)}"><summary><div class="invoice-type-icon type-PO">PO</div><div class="invoice-headline"><div class="invoice-title-row"><strong class="invoice-number">${escapeHtml(po.client)}</strong><strong class="invoice-amount">${peso.format((po.lines || []).reduce((sum, line) => sum + lineSubtotal(line), 0))}</strong></div><div class="invoice-subrow"><span class="pill ${statusClass(status)}">${escapeHtml(status)}</span><small class="invoice-client-line">${escapeHtml(po.id)}</small><small>${escapeHtml(po.date)}</small></div></div></summary><div class="invoice-details"><ul class="compact-list">${lines}</ul><div class="modal-actions"><button class="ghost-button" data-create-invoice-po="${escapeHtml(po.id)}">Create invoice/DR</button></div></div></details>`;
  }).join("");
}

function openInvoiceForPurchaseOrder(poId) {
  const po = data.purchaseOrders.find((entry) => entry.id === poId);
  if (!po) return toast("Purchase Order not found.");
  showSection("invoicing");
  openModal("invoice");
  qs("#client").value = po.client;
  syncInvoicePurchaseOrders(true);
  qs("#po").value = po.id;
  syncInvoiceFromPurchaseOrder();
}

function invoiceTaxMetaHtml(sale) {
  const breakdown = saleTaxBreakdown(sale);
  const salesLabel = sale.type === "SI" ? "Total Sales (VAT Inclusive)" : "Total Sales (VAT Exclusive)";
  const paid = Number(sale.paid || 0);
  const pending = Math.max(Number(sale.net || 0) - paid, 0);
  return `<div class="invoice-tax-summary"><div class="invoice-meta"><span>${salesLabel}</span><strong>${peso.format(breakdown.totalSalesVatInclusive)}</strong></div>${breakdown.withholdingTax ? `<div class="invoice-meta"><span>Withholding Tax 5%</span><strong>${peso.format(breakdown.withholdingTax)}</strong></div>` : ""}${breakdown.expandedWithholdingTax ? `<div class="invoice-meta"><span>Expanded Withholding Tax 1%</span><strong>${peso.format(breakdown.expandedWithholdingTax)}</strong></div>` : ""}${breakdown.addVat ? `<div class="invoice-meta"><span>Amount Net VAT</span><strong>${peso.format(breakdown.amountNetVat)}</strong></div><div class="invoice-meta"><span>Add VAT</span><strong>${peso.format(breakdown.addVat)}</strong></div>` : ""}<div class="invoice-meta total-line"><span>Total Amount Due</span><strong>${peso.format(breakdown.totalAmountDue)}</strong></div>${paid > 0 ? `<div class="invoice-meta"><span>Paid Balance</span><strong>${peso.format(paid)}</strong></div><div class="invoice-meta total-line"><span>Pending Balance</span><strong>${peso.format(pending)}</strong></div>` : ""}</div>`;
}

function renderInvoicing() {
  qs("#invoice-grid").innerHTML = byBranch(data.sales, "area").filter((s) => includesSearch(Object.values(s))).map((s) => {
    const due = fmtDate(addDays(s.date, s.terms));
    const paid = Number(s.paid || 0);
    const pending = Math.max(Number(s.net || 0) - paid, 0);
    const balanceLine = paid > 0 ? `<small class="invoice-balance-line">Paid ${peso.format(paid)} · Pending ${peso.format(pending)}</small>` : "";
    return `<details class="invoice-card collapsible-invoice" data-invoice-id="${s.id}" data-focus-record="${escapeHtml(s.documentNo || s.id)}"><summary><div class="invoice-type-icon type-${escapeHtml(documentType(s.type))}">${invoiceTypeIcon(s.type)}</div><div class="invoice-headline"><div class="invoice-title-row"><strong class="invoice-number">${escapeHtml(s.documentNo || s.id)}</strong><strong class="invoice-amount">${peso.format(s.net)}</strong></div><div class="invoice-subrow"><span class="pill ${statusClass(statusForSale(s))}">${invoiceTypeLabel(s.type)} · ${statusForSale(s)}</span><small class="invoice-client-line">${escapeHtml(s.client)}</small><small class="invoice-due-line">Due ${due}</small>${balanceLine}</div></div></summary><div class="invoice-details"><p>${escapeHtml(saleSummary(s))}</p><small>${escapeHtml(saleTaxSummary(s))}</small>${s.cancelledFrom ? `<small>Replacement for cancelled ${escapeHtml(s.cancelledFrom)}</small>` : ""}${s.replacementId ? `<small>Cancelled and replaced by ${escapeHtml(s.replacementId)}</small>` : ""}${invoiceTaxMetaHtml(s)}<div class="invoice-meta"><span>Terms</span><strong>${s.terms} days</strong></div><div class="invoice-meta"><span>Delivery Status</span>${canUpdateDeliveryStatus() ? `<select class="delivery-status-select" data-sale-id="${escapeHtml(s.id)}">${deliveryStatusOptions.map((option) => `<option ${option === (s.deliveryStatus || "Pending") ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>` : `<strong>${escapeHtml(s.deliveryStatus || "Pending")}</strong>`}</div><div class="modal-actions"><button class="ghost-button" data-sale-detail="${s.id}">View</button><button class="ghost-button" data-print-invoice="${s.id}">Print</button>${s.status === "Cancelled" ? "" : `<button class="ghost-button" data-cancel-replace="${s.id}">Cancel & Replace</button>`}</div></div></details>`;
  }).join("");
}

function clearPrintTarget() {
  document.body.classList.remove("print-single-invoice");
  document.body.classList.remove("print-template-overlay", "print-template-si", "print-template-ts", "print-template-dr", "print-template-tsr");
  qsa(".invoice-card").forEach((card) => card.classList.remove("print-target"));
}

function showReportPreviewLoading() {
  qs("#report-preview-title").textContent = "Loading print preview…";
  qs("#report-preview-description").textContent = "";
  qs("#report-preview-content").innerHTML = `<div class="print-loading"><span class="print-loading-spinner"></span><p>Preparing document…</p></div>`;
  if (qs("#report-preview-print")) qs("#report-preview-print").disabled = true;
  if (qs("#report-preview-print-no-date")) qs("#report-preview-print-no-date").disabled = true;
  const dialog = qs("#report-preview-modal");
  if (!dialog.open) dialog.showModal();
}

function showPaymentRequestPreviewLoading() {
  qs("#payment-request-preview-title").textContent = "Loading print preview…";
  qs("#payment-request-preview-content").innerHTML = `<div class="print-loading"><span class="print-loading-spinner"></span><p>Preparing document…</p></div>`;
  const dialog = qs("#payment-request-preview-modal");
  if (!dialog.open) dialog.showModal();
}

function closeReportPreview() {
  clearPrintTarget();
  currentReportSaleId = null;
  qs("#report-preview-modal").close();
}

async function printInvoice(invoiceId, noDate = false) {
  clearPrintTarget();
  currentPrintNoDate = noDate;
  showReportPreviewLoading();
  const printable = await MedlaneAPI.printableInvoice(invoiceId, noDate).catch((error) => {
    toast(error.message || "Unable to load printable invoice.");
    qs("#report-preview-modal").close();
    return null;
  });
  if (!printable) return;
  currentReportSaleId = printable.id || invoiceId;
  const type = String(printable.type || "SI").toLowerCase();
  qs("#report-preview-title").textContent = printable.title;
  qs("#report-preview-description").textContent = printable.description;
  qs("#report-preview-content").innerHTML = printable.html;
  document.body.classList.add("print-template-overlay", `print-template-${type}`);
  if (qs("#report-preview-print")) qs("#report-preview-print").disabled = false;
  if (qs("#report-preview-print-no-date")) qs("#report-preview-print-no-date").disabled = false;
}

function printReportPreview() {
  if (document.body.classList.contains("print-template-overlay")) return window.print();
  if (currentReportSaleId) return printInvoice(currentReportSaleId);
  window.print();
}

async function printReportPreviewNoDate() {
  if (!document.body.classList.contains("print-template-overlay")) return window.print();
  const title = qs("#report-preview-title")?.textContent || "";
  const sale = data.sales.find((item) => item.id === currentReportSaleId || title.includes(item.documentNo || item.id));
  if (sale || currentReportSaleId) await printInvoice(sale?.id || currentReportSaleId, true);
  window.print();
}

function formDocumentNo(sale) {
  const raw = String(sale.documentNo || sale.id || "");
  return raw.match(/\d{3,}$/)?.[0] || raw;
}

function saleLinkedPaymentRequests(sale) {
  return data.paymentRequests.filter((request) => request.invoice === sale.documentNo || request.invoice === sale.id);
}
function showSaleDetail(invoiceId) {
  const sale = data.sales.find((item) => item.id === invoiceId);
  if (!sale) return toast("Sale not found.");
  clearPrintTarget();
  currentReportSaleId = sale.id;
  if (qs("#report-preview-print")) qs("#report-preview-print").disabled = false;
  if (qs("#report-preview-print-no-date")) qs("#report-preview-print-no-date").disabled = false;
  const breakdown = saleTaxBreakdown(sale);
  const linkedRequests = saleLinkedPaymentRequests(sale);
  qs("#report-preview-title").textContent = `${sale.type} ${sale.documentNo || sale.id}`;
  qs("#report-preview-description").textContent = `${sale.client} · ${sale.area} · ${statusForSale(sale)}`;
  qs("#report-preview-content").innerHTML = `
    <div class="report-preview-grid">
      <div class="report-preview-card"><small>Document No.</small><strong>${escapeHtml(sale.documentNo || sale.id)}</strong></div>
      <div class="report-preview-card"><small>PO / Replacement</small><strong>${escapeHtml(sale.po || "-")}${sale.cancelledFrom ? ` / ${escapeHtml(sale.cancelledFrom)}` : ""}</strong></div>
      <div class="report-preview-card"><small>Total Amount Due</small><strong>${peso.format(breakdown.totalAmountDue)}</strong></div>
    </div>
    <p><strong>Tax treatment:</strong> ${escapeHtml(saleTaxSummary(sale))}</p>
    <div class="invoice-tax-summary">
      <div class="invoice-meta"><span>${sale.type === "SI" ? "Total Sales (VAT Inclusive)" : "Total Sales (VAT Exclusive)"}</span><strong>${peso.format(breakdown.totalSalesVatInclusive)}</strong></div>
      ${breakdown.withholdingTax ? `<div class="invoice-meta"><span>Withholding Tax 5%</span><strong>${peso.format(breakdown.withholdingTax)}</strong></div>` : ""}
      ${breakdown.expandedWithholdingTax ? `<div class="invoice-meta"><span>Expanded Withholding Tax 1%</span><strong>${peso.format(breakdown.expandedWithholdingTax)}</strong></div>` : ""}
      ${(breakdown.withholdingTax || breakdown.expandedWithholdingTax) ? `<div class="invoice-meta"><span>Amount Net VAT</span><strong>${peso.format(breakdown.amountNetVat)}</strong></div><div class="invoice-meta"><span>Add VAT</span><strong>${peso.format(breakdown.addVat)}</strong></div>` : ""}
      <div class="invoice-meta total-line"><span>Total Amount Due</span><strong>${peso.format(breakdown.totalAmountDue)}</strong></div>
    </div>
    <p><strong>Manual discount:</strong> ${peso.format(sale.discount || 0)} ${sale.discountReason ? `· ${escapeHtml(sale.discountReason)}` : ""}</p>
    <div class="table-card"><table><thead><tr><th>Item</th><th>Brand</th><th>Lot No.</th><th>Expiry</th><th>Qty</th><th>UOM</th><th>Price</th><th>Gross Subtotal</th></tr></thead><tbody>${(sale.lines || []).map((line) => `<tr><td>${escapeHtml(line.item)}</td><td>${escapeHtml(line.brand)}</td><td>${escapeHtml(line.lot || "-")}</td><td>${escapeHtml(line.expiry || "-")}</td><td>${line.qty}</td><td>${escapeHtml(line.uom)}</td><td>${peso.format(line.price)}</td><td>${peso.format(lineSubtotal(line))}</td></tr>`).join("")}</tbody></table></div>
    ${linkedRequests.length ? `<p class="graph-note">Payment request${linkedRequests.length === 1 ? "" : "s"} created for this invoice</p><div class="alert-list">${linkedRequests.map((request) => `<button type="button" class="alert-item clickable" data-open-payment-request="${escapeHtml(request.cvNo)}"><span class="alert-dot ${statusClass(request.requestStatus || request.status)}"></span><div><strong>${escapeHtml(request.cvNo)}</strong><span>${escapeHtml(request.employee || "-")} · ${peso.format(request.total || 0)} · ${escapeHtml(request.requestStatus || request.status || "-")}</span></div></button>`).join("")}</div>` : ""}
  `;
  qs("#report-preview-modal").showModal();
}

function saleCollectionTimeline(sale) {
  const events = [];
  events.push({ date: sale.date, status: "Created", note: `${sale.type} ${sale.documentNo || sale.id} created for ${sale.client}, ${peso.format(sale.net || 0)}.${sale.migrated ? " (migrated record)" : ""}`, by: sale.migrated ? "Migrated" : (sale.salesperson || "System User") });
  if (sale.cancelledFrom) events.push({ date: sale.date, status: "Replacement", note: `Created as a replacement for ${sale.cancelledFrom}.`, by: sale.cancelledBy || "-" });
  if (sale.status === "Cancelled") events.push({ date: sale.cancelledAt || sale.date, status: "Cancelled", note: `${sale.cancelReason || "No reason given."}${sale.replacementId ? ` Replaced by ${sale.replacementId}.` : ""}`, by: sale.cancelledBy || "-" });
  data.payments.filter((payment) => payment.invoice === sale.documentNo || payment.invoice === sale.id).forEach((payment) => {
    (payment.statusHistory || []).forEach((entry) => events.push({ date: entry.date, status: entry.status, note: `${payment.receiptNo} — ${peso.format(Number(payment.amount || 0))}${entry.status === "Posted Date" && payment.postedDate ? ` (claim ${payment.postedDate})` : ""}`, by: entry.user || "System User" }));
  });
  data.paymentRequests.filter((request) => request.invoice === sale.documentNo || request.invoice === sale.id).forEach((request) => {
    paymentRequestHistory(request).forEach((entry) => events.push({ date: entry.date, status: `Payment Request: ${entry.status}`, note: `${request.cvNo} — ${entry.note || "-"}`, by: entry.by || "-" }));
  });
  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function saleEventClass(status) {
  if (["Deposited", "Created"].includes(status)) return "done";
  if (["Bounced", "Cancelled"].includes(status)) return "blocked";
  return "pending";
}

function renderSaleDetail(invoiceId) {
  const sale = data.sales.find((item) => item.id === invoiceId);
  if (!sale) return toast("Invoice not found.");
  const events = saleCollectionTimeline(sale);
  const balance = Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0);
  qs("#sale-detail-title").textContent = `${sale.type} ${sale.documentNo || sale.id} · ${sale.client}`;
  qs("#sale-detail-panel").innerHTML = `<div class="panel-header"><div><p class="eyebrow">${escapeHtml(sale.client)}</p><h2>${escapeHtml(sale.area || "-")}</h2></div><span class="pill ${statusClass(statusForSale(sale))}">${escapeHtml(statusForSale(sale))}</span></div><div class="report-preview-grid invoice-mini-grid"><div class="report-preview-card"><small>Date</small><strong>${escapeHtml(sale.date || "-")}</strong></div><div class="report-preview-card"><small>Total</small><strong>${peso.format(sale.net || 0)}</strong></div><div class="report-preview-card"><small>Collected</small><strong>${peso.format(sale.paid || 0)}</strong></div><div class="report-preview-card"><small>Balance</small><strong>${peso.format(balance)}</strong></div></div><details class="full-event-details" open><summary>Collection timeline</summary><div class="event-timeline">${events.map((event) => `<div class="event-item ${saleEventClass(event.status)}"><span>${escapeHtml((event.status || "E")[0])}</span><time>${escapeHtml(event.date || "")}</time><div><strong>${escapeHtml(event.status || "")}</strong><p>${escapeHtml(event.note || "-")}</p><small>${escapeHtml(event.by || "-")}</small></div></div>`).join("")}</div></details>`;
  showSection("sale-detail");
}

function renderCollections() {
  syncCollectionContactsForBalances();
  syncPostedCollectionReminders();
  renderCollectionsWorkflowTabs();
  const visibleSales = byBranch(data.sales, "area").filter((s) => includesSearch(Object.values(s)));
  const visibleDocs = new Set(visibleSales.flatMap((sale) => [sale.id, sale.documentNo].filter(Boolean)));
  const visiblePayments = data.payments.filter((payment) => visibleDocs.has(payment.invoice));
  const totalDue = visibleSales.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
  const totalPaid = visibleSales.reduce((sum, sale) => sum + sale.paid, 0);
  const dueBuckets = ["Paid", "Partially Paid", "Near Due", "Overdue", "Unpaid"].map((status) => [status, visibleSales.filter((sale) => statusForSale(sale) === status).length]);
  const methodMix = Object.entries(sumBy(visiblePayments, "method", (payment) => Number(payment.amount || 0))).filter(([, amount]) => amount > 0);
  const depositedAmount = visiblePayments.filter((payment) => payment.collectionStatus === "Deposited").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const forDepositionAmount = visiblePayments.filter((payment) => payment.collectionStatus === "For Deposition").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const bouncedCount = visiblePayments.filter((payment) => payment.collectionStatus === "Bounced").length;
  const postedCount = visiblePayments.filter((payment) => payment.collectionStatus === "Posted Date").length;
  const largestPayment = visiblePayments.reduce((max, payment) => Math.max(max, Number(payment.amount || 0)), 0);
  const averagePayment = visiblePayments.length ? Math.round(visiblePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) / visiblePayments.length) : 0;
  renderFinancialSummary("#collections-summary-grid", [
    { tone: "primary", label: "Total displayed collections", value: peso.format(visiblePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)), note: `${visiblePayments.length} receipt${visiblePayments.length === 1 ? "" : "s"} in this view` },
    { tone: "success", label: "Deposited", value: peso.format(depositedAmount), note: `${forDepositionAmount ? `${peso.format(forDepositionAmount)} for deposition` : "No pending deposit amount"}` },
    { tone: "warning", label: "Open receivables", value: peso.format(totalDue), note: `${visibleSales.filter((sale) => statusForSale(sale) === "Overdue").length} overdue invoice${visibleSales.filter((sale) => statusForSale(sale) === "Overdue").length === 1 ? "" : "s"}` },
  ], [
    { title: "Collection Status", items: [{ label: "For Deposition", value: visiblePayments.filter((payment) => payment.collectionStatus === "For Deposition").length }, { label: "Deposited", value: visiblePayments.filter((payment) => payment.collectionStatus === "Deposited").length }, { label: "Bounced", value: bouncedCount }] },
    { title: "Receipt Size", kind: "pairs", items: [{ label: "Average", value: peso.format(averagePayment) }, { label: "Largest", value: peso.format(largestPayment) }] },
    { title: "Traceability", kind: "pairs", items: [{ label: "Posted Date", value: postedCount }, { label: "Cheque Ready", value: data.collectionContacts.filter((contact) => contact.status === "Cheque Available").length }] },
  ]);
  qs("#collections-visuals").innerHTML = [
    visualCard("₱", "Collection Progress", `${peso.format(totalPaid)} paid`, `<div class="donut-wrap"><div class="donut" style="--paid:${totalPaid + totalDue ? Math.round((totalPaid / (totalPaid + totalDue)) * 100) : 0}%; --partial:${totalPaid + totalDue ? Math.round((totalPaid / (totalPaid + totalDue)) * 100) : 0}%; --end:100%;" data-label="${totalPaid + totalDue ? Math.round((totalPaid / (totalPaid + totalDue)) * 100) : 0}%\ncollected"></div><div class="legend"><span class="green">Paid ${peso.format(totalPaid)}</span><span class="red">Open ${peso.format(totalDue)}</span></div></div>`, "success", "Computed as paid amount divided by paid plus remaining receivables."),
    visualCard("!", "Due Risk", `${visibleSales.filter((sale) => ["Near Due", "Overdue", "Unpaid"].includes(statusForSale(sale))).length} needs action`, barRows(dueBuckets, (value) => `${value} docs`, ["green", "orange", "orange", "red", "red"]), "warning", "Computed from each invoice balance, due date, and payment status."),
    visualCard("◆", "Payment Channels", `${data.payments.length} receipts`, barRows(methodMix, (value) => peso.format(value), ["green", "", "orange"]), "info", "Computed from collection records grouped by payment method."),
  ].join("");
  renderCollectionContactMap();
  const rows = byBranch(data.sales, "area").filter((s) => Math.max(Number(s.net || 0) - Number(s.paid || 0), 0) > 0 && includesSearch(Object.values(s))).map((s) => {
    const payments = data.payments.filter((payment) => payment.invoice === s.id || payment.invoice === s.documentNo);
    const latest = payments.at(-1) || {};
    const chequeInfo = latest.cheques?.length ? `${latest.cheques.length} cheques<small>${latest.cheques.map((cheque) => `${cheque.reference} · ${cheque.chequeDate} · ${peso.format(cheque.amount)}`).join("<br>")}</small>` : latest.chequeDate || "-";
    const status = latest.collectionStatus || "For Deposition";
    return { focus: [s.documentNo || s.id, latest.receiptNo, s.client].filter(Boolean).join("|"), cells: [s.documentNo || s.id, latest.tag || collectionTagForType(s.type), latest.receiptNo || "-", s.client, s.area, fmtDate(addDays(s.date, s.terms)), latest.dateRecorded || "-", latest.bank || "-", chequeInfo, `<span class="pill ${statusClass(status)}">${escapeHtml(status)}</span>${latest.postedDate ? `<small>Posted ${escapeHtml(latest.postedDate)}</small>` : ""}`, collectionStatusActions(latest, s), peso.format(Math.max(s.net - s.paid, 0)), `<span class="pill ${statusClass(statusForSale(s))}">${statusForSale(s)}</span>`] };
  });
  table("#collections-table", ["Document", "Tag", "Receipt No", "Client", "Area", "Due Date", "Date Recorded", "Bank", "Cheque Details", "Collection Status", "Actions", "Balance", "AR Status"], rows);
  table("#payment-request-table", ["CR/PR No.", "Date", "Client", "Invoice", "Department", "Payment", "Total", "Status", "Actions"], data.paymentRequests.map((r) => ({ focus: r.cvNo, cells: [r.cvNo, r.date, r.employee, r.invoice || "-", r.department, r.paymentType, peso.format(r.total), `<span class="pill ${statusClass(r.requestStatus || r.status)}">${escapeHtml(r.requestStatus || r.status || "-")}</span>`, paymentRequestActionsCell(r)] })));
}

function renderCollectionsWorkflowTabs() {
  const counts = {
    ledger: byBranch(data.sales, "area").filter((sale) => Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0) > 0).length,
    requests: data.paymentRequests.filter((request) => !["Completed", "Cancelled"].includes(request.requestStatus || request.status)).length,
    followups: data.collectionContacts.filter((contact) => ["Pending", "No Response", "Unreached", "Cheque Available"].includes(contact.status)).length,
  };
  const labels = { ledger: "AR Ledger", requests: "Payment Requests", followups: "Follow-ups Map" };
  qs("#collections-workflow-tabs")?.querySelectorAll("[data-collections-workflow]").forEach((button) => {
    const tab = button.dataset.collectionsWorkflow;
    button.classList.toggle("active", tab === collectionsWorkflowTab);
    button.innerHTML = `${escapeHtml(labels[tab])} <span class="tab-count">${counts[tab] || 0}</span>`;
  });
  qsa("[data-collections-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.collectionsPanel === collectionsWorkflowTab));
}

function collectionStatusActions(payment, sale) {
  const doc = sale?.documentNo || sale?.id;
  if (!doc) return "-";
  return `<button class="mini-button" data-make-payment-request="${escapeHtml(doc)}">Collection Status</button>`;
}

function openPaymentRequestForInvoice(documentNo) {
  openModal("paymentRequest");
  const sale = data.sales.find((entry) => (entry.documentNo || entry.id) === documentNo);
  if (!sale) return;
  if (qs("#employee")) qs("#employee").value = sale.client;
  syncPaymentRequestInvoiceOptions([documentNo]);
  syncPaymentRequestDeductionDefaults();
  syncPaymentRequestTotal();
}

async function updateCollectionPaymentStatus(receiptNo, status) {
  const payments = data.payments.filter((entry) => entry.receiptNo === receiptNo || entry.paymentRequestCvNo === receiptNo);
  if (!payments.length) return toast("Collection not found.");
  if (payments.some((payment) => payment.collectionStatus === "Deposited")) return toast("This payment is already Deposited and can no longer be changed.");
  const postedDate = status === "Posted Date" ? prompt("Posted / claim date (YYYY-MM-DD):", payments[0].postedDate || fmtDate(today)) || "" : "";
  payments.forEach((payment) => {
    if (status === "Deposited") applyCollectionPayment(payment);
    else reverseCollectionPayment(payment);
    payment.collectionStatus = status;
    payment.postedDate = status === "Posted Date" ? postedDate : "";
    payment.statusHistory ||= [];
    payment.statusHistory.push(...collectionStatusHistory(status));
  });
  const request = data.paymentRequests.find((entry) => entry.cvNo === (payments[0].paymentRequestCvNo || receiptNo));
  if (request) {
    request.history = paymentRequestHistory(request);
    const by = currentUser?.name || "System User";
    if (status === "Deposited") {
      request.requestStatus = "Completed";
      request.status = "Completed";
      request.completedAt = fmtDate(today);
      request.completedBy = by;
      request.history.push({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status: "Completed", note: `Marked Deposited by ${by}. Invoice paid amount updated.`, by });
    } else {
      request.requestStatus = "Approved";
      request.status = "Approved";
      request.history.push({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status, note: `${status} recorded by ${by}. Invoice paid amount was not updated.`, by });
    }
  }
  const affectedSales = [...new Map(payments.map((payment) => saleForPayment(payment)).filter(Boolean).map((sale) => [sale.documentNo || sale.id, sale])).values()];
  await persistRecords({ payments, paymentRequests: request ? [request] : [], sales: affectedSales });
  log("Changed collection status", "Collections", `${receiptNo}: ${status}`, { save: false });
  saveData(["notifications"]);
  renderAll();
  if (payments[0].paymentRequestCvNo && document.body.dataset.activeSection === "payment-request-detail") renderPaymentRequestDetail(payments[0].paymentRequestCvNo);
  toast(`${receiptNo} marked ${status}.`);
}

function syncCollectionContactsForBalances() {
  const clientsWithBalance = new Set(data.sales.filter((sale) => Number(sale.net || 0) - Number(sale.paid || 0) > 0).map((sale) => sale.client));
  data.collectionContacts = data.clients.filter((client) => clientsWithBalance.has(client.name)).map((client) => {
    const existing = data.collectionContacts.find((contact) => contact.client === client.name) || {};
    return { client: client.name, area: client.area, status: existing.status || "Pending", lastContact: existing.lastContact || "", employee: existing.employee || "", channels: existing.channels || [], notes: existing.notes || "Open balance pending follow-up.", chequeInvoice: existing.chequeInvoice || "", weekKey: existing.weekKey || followupWeekKey() };
  });
}

function collectionStatusHistory(status) {
  return [{ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status, user: currentUser?.name || "System User" }];
}

function syncPostedCollectionReminders() {
  const todayTime = new Date(fmtDate(today)).getTime();
  data.payments.forEach((payment) => {
    if (payment.collectionStatus !== "Posted Date" || !payment.postedDate) return;
    const diffDays = Math.round((new Date(payment.postedDate).getTime() - todayTime) / 86400000);
    if (![0, 1].includes(diffDays)) return;
    const key = `${payment.receiptNo}-${payment.postedDate}-${diffDays}`;
    if (payment.postedReminderKey === key) return;
    payment.postedReminderKey = key;
    notify("Collection", `${payment.client} cheque for ${payment.receiptNo} can be claimed ${diffDays === 0 ? "today" : "tomorrow"}.`, "collections", payment.receiptNo || payment.invoice);
  });
}

function parameterRowTemplate(row = {}) {
  const level = (prefix) => `<td><input class="param-${prefix}-range" placeholder="Ref. Range" value="${escapeHtml(row[`${prefix}Range`] || "")}" /></td><td><input class="param-${prefix}-result" placeholder="Result" value="${escapeHtml(row[`${prefix}Result`] || "")}" /></td><td class="param-p-cell"><input class="param-${prefix}-p" type="checkbox" ${row[`${prefix}P`] ? "checked" : ""} /></td><td class="param-f-cell"><input class="param-${prefix}-f" type="checkbox" ${row[`${prefix}F`] ? "checked" : ""} /></td>`;
  return `<tr class="parameter-row"><td><input class="param-name" placeholder="Parameter" value="${escapeHtml(row.parameter || "")}" /></td><td><input class="param-factor" placeholder="Factor" value="${escapeHtml(row.factor || "")}" /></td>${level("l1")}${level("l2")}${level("l3")}<td class="sheet-action-cell"><button class="icon-button danger-button remove-parameter-row" type="button" aria-label="Remove parameter" title="Remove parameter">×</button></td></tr>`;
}

function renderProductIssueParameterTable(rows = [{}], lots = {}) {
  return `<div class="field full parameter-table-editor" id="parameter-table-editor"><label>Calibration / Control Parameter Table</label><div class="parameter-table-lots"><div class="field"><label for="qcLevel1Lot">Level 1 Lot</label><input id="qcLevel1Lot" name="qcLevel1Lot" value="${escapeHtml(lots.qcLevel1Lot || "")}" /></div><div class="field"><label for="qcLevel2Lot">Level 2 Lot</label><input id="qcLevel2Lot" name="qcLevel2Lot" value="${escapeHtml(lots.qcLevel2Lot || "")}" /></div><div class="field"><label for="qcLevel3Lot">Level 3 Lot</label><input id="qcLevel3Lot" name="qcLevel3Lot" value="${escapeHtml(lots.qcLevel3Lot || "")}" /></div></div><div class="table-card compact-table"><table id="parameter-qc-table"><thead><tr><th rowspan="2">Parameters</th><th rowspan="2">Calibrator Factor</th><th colspan="4">Level 1</th><th colspan="4">Level 2</th><th colspan="4">Level 3</th><th rowspan="2"></th></tr><tr><th>Ref. Range</th><th>Result</th><th>P</th><th>F</th><th>Ref. Range</th><th>Result</th><th>P</th><th>F</th><th>Ref. Range</th><th>Result</th><th>P</th><th>F</th></tr></thead><tbody id="parameter-row-list">${rows.map((row) => parameterRowTemplate(row)).join("")}</tbody></table></div><button class="ghost-button" id="add-parameter-row" type="button">Add Parameter</button></div>`;
}

function collectProductIssueParameters() {
  return qsa(".parameter-row").map((row) => ({
    parameter: row.querySelector(".param-name")?.value.trim() || "",
    factor: row.querySelector(".param-factor")?.value.trim() || "",
    l1Range: row.querySelector(".param-l1-range")?.value.trim() || "",
    l1Result: row.querySelector(".param-l1-result")?.value.trim() || "",
    l1P: row.querySelector(".param-l1-p")?.checked || false,
    l1F: row.querySelector(".param-l1-f")?.checked || false,
    l2Range: row.querySelector(".param-l2-range")?.value.trim() || "",
    l2Result: row.querySelector(".param-l2-result")?.value.trim() || "",
    l2P: row.querySelector(".param-l2-p")?.checked || false,
    l2F: row.querySelector(".param-l2-f")?.checked || false,
    l3Range: row.querySelector(".param-l3-range")?.value.trim() || "",
    l3Result: row.querySelector(".param-l3-result")?.value.trim() || "",
    l3P: row.querySelector(".param-l3-p")?.checked || false,
    l3F: row.querySelector(".param-l3-f")?.checked || false,
  })).filter((row) => row.parameter || row.factor || row.l1Result || row.l2Result || row.l3Result);
}

function cvYear(value = today) { return new Date(value || today).getFullYear(); }
function nextCvNumber(year = cvYear()) {
  const next = (data.paymentRequests || []).filter((request) => cvYear(request.date || request.createdAt) === Number(year)).reduce((max, request) => Math.max(max, Number(String(request.cvNo || "").replace(/\D/g, "")) || 0), 0) + 1;
  return `CV${String(next).padStart(6, "0")}`;
}
const paymentRequestInstructions = "INSTRUCTIONS : This form must be accomplished in duplicate. All supporting documents must be attached with receipts issued to Medlane Diagnostics Solutions Inc. Incomplete information will delay processing of this payment request or no attached receipts will not receive any payment.";
function paymentRequestLineTemplate(line = {}) {
  return `<div class="payment-request-line-row"><div class="field"><label>Particulars</label><input class="payment-request-particulars" value="${escapeHtml(line.particulars || "")}" required /></div><div class="field"><label>Amount</label><input class="payment-request-amount" type="number" min="0" step="0.01" value="${line.amount || ""}" required /></div><button class="icon-button danger-button remove-payment-request-line" type="button" aria-label="Remove item">Remove</button></div>`;
}
function renderPaymentRequestEditor(lines = [{}]) {
  return `<div class="field full payment-request-editor"><label>Particulars and Amount</label><div id="payment-request-line-list">${lines.map((line) => paymentRequestLineTemplate(line)).join("")}</div><div class="payment-request-editor-actions"><button class="ghost-button" id="add-payment-request-line" type="button">Add Item</button><div class="field payment-request-total-field"><label for="total">Total</label><input id="total" name="total" readonly value="0.00" /></div></div><div id="payment-request-tax-preview" class="invoice-compute-preview payment-deduction-preview"></div><div class="payment-request-fixed-instructions"><strong>Instructions</strong><p>${escapeHtml(paymentRequestInstructions)}</p></div></div>`;
}
function collectPaymentRequestLines() {
  return qsa(".payment-request-line-row").map((row) => ({ particulars: row.querySelector(".payment-request-particulars")?.value.trim() || "", amount: Number(row.querySelector(".payment-request-amount")?.value || 0) })).filter((line) => line.particulars || line.amount);
}

function financialLineTemplate(line = {}) {
  return `<div class="payment-request-line-row financial-line-row"><div class="field"><label>Vendor</label><input class="payment-request-vendor" list="financial-vendor-options" value="${escapeHtml(line.vendor || "")}" /></div><div class="field"><label>Particulars</label><input class="payment-request-particulars" value="${escapeHtml(line.particulars || "")}" required /></div><div class="field"><label>Amount</label><input class="payment-request-amount" type="number" min="0" step="0.01" value="${line.amount || ""}" required /></div><button class="icon-button danger-button remove-payment-request-line" type="button" aria-label="Remove item">Remove</button></div>`;
}

function renderFinancialRequestEditor(lines = [{}]) {
  const vendorOptions = [...new Set(data.suppliers.map((s) => s.name))].map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  return `<div class="field full payment-request-editor"><label>Itemized Particulars</label><datalist id="financial-vendor-options">${vendorOptions}</datalist><div id="payment-request-line-list">${lines.map((line) => financialLineTemplate(line)).join("")}</div><div class="payment-request-editor-actions"><button class="ghost-button" id="add-payment-request-line" type="button">Add Item</button><div class="field payment-request-total-field"><label for="amount">Total</label><input id="amount" name="amount" readonly value="0.00" /></div></div></div>`;
}

function collectFinancialLines() {
  return qsa(".financial-line-row").map((row) => ({
    vendor: row.querySelector(".payment-request-vendor")?.value.trim() || "",
    particulars: row.querySelector(".payment-request-particulars")?.value.trim() || "",
    amount: Number(row.querySelector(".payment-request-amount")?.value || 0),
  })).filter((line) => line.vendor || line.particulars || line.amount);
}

function syncFinancialRequestTotal() {
  if (!["payable", "replenishment"].includes(modalType)) return;
  const total = collectFinancialLines().reduce((sum, line) => sum + Number(line.amount || 0), 0);
  if (qs("#amount")) qs("#amount").value = total.toFixed(2);
}
function paymentRequestDeductions(gross) {
  const withholdingTax = qs("#withholdingTax")?.checked ? Math.round(gross * 0.05) : 0;
  const expandedWithholdingTax = qs("#expandedWithholdingTax")?.checked ? Math.round(gross * 0.01) : 0;
  return { withholdingTax, expandedWithholdingTax, total: Math.max(gross - withholdingTax - expandedWithholdingTax, 0) };
}

function togglePaymentRequestChequeFields() {
  const type = qs("#paymentType")?.value;
  ["bank", "cheque", "chequeDate"].forEach((id) => {
    const field = qs(`#${id}`)?.closest(".field");
    if (!field) return;
    field.hidden = type !== "Check";
    qs(`#${id}`).required = type === "Check" && id !== "chequeDate";
  });
}

function syncPaymentRequestDeductionDefaults() {
  const payee = findClientByName(qs("#employee")?.value || "");
  if (qs("#withholdingTax")) qs("#withholdingTax").checked = Boolean(payee?.withholdingTax);
  if (qs("#expandedWithholdingTax")) qs("#expandedWithholdingTax").checked = Boolean(payee?.expandedWithholdingTax);
}
function syncPaymentRequestTotal() {
  const gross = collectPaymentRequestLines().reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const deductions = paymentRequestDeductions(gross);
  if (qs("#total")) qs("#total").value = deductions.total.toFixed(2);
  const preview = qs("#payment-request-tax-preview");
  if (preview) preview.innerHTML = `<div class="preview-tax-label">WTax/EWT applied per the checkboxes above</div><div class="invoice-tax-summary live-preview"><div class="invoice-meta"><span>Gross Request</span><strong>${peso.format(gross)}</strong></div><div class="invoice-meta"><span>Withholding Tax 5%</span><strong>${peso.format(deductions.withholdingTax)}</strong></div><div class="invoice-meta"><span>Expanded Withholding Tax 1%</span><strong>${peso.format(deductions.expandedWithholdingTax)}</strong></div><div class="invoice-meta total-line"><span>Total Payment Request</span><strong>${peso.format(deductions.total)}</strong></div></div>`;
}
function paymentRequestHtml(request) {
  const items = request.items?.length ? request.items : [{ particulars: request.particulars || "", amount: request.amount || request.total || 0 }];
  return `<section class="payment-request-print"><header><strong>MEDLANE DIAGNOSTIC SOLUTIONS, INC.</strong><span>${escapeHtml(request.cvNo)}</span></header><div class="pr-meta"><span>Client: <strong>${escapeHtml(request.employee)}</strong></span><span>Department: <strong>${escapeHtml(request.department)}</strong></span><span>Date: <strong>${escapeHtml(request.date)}</strong></span></div><div class="pr-checks"><strong>Mode of Payment:</strong><span>${request.paymentType === "Cash" ? "[x]" : "[ ]"} Cash</span><span>${request.paymentType === "Check" ? "[x]" : "[ ]"} Check</span><span>${request.paymentType === "Debit Memo" ? "[x]" : "[ ]"} Debit Memo</span></div><table><thead><tr><th>Date</th><th>Particulars</th><th>Amount</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index === 0 ? escapeHtml(request.date) : ""}</td><td>${escapeHtml(item.particulars)}</td><td>${peso.format(item.amount)}</td></tr>`).join("")}${request.withholdingTax ? `<tr><td colspan="2">Less: Withholding Tax 5%</td><td>${peso.format(request.withholdingTax)}</td></tr>` : ""}${request.expandedWithholdingTax ? `<tr><td colspan="2">Less: Expanded Withholding Tax 1%</td><td>${peso.format(request.expandedWithholdingTax)}</td></tr>` : ""}<tr><td colspan="2"><strong>Total</strong></td><td><strong>${peso.format(request.total)}</strong></td></tr></tbody></table><p class="pr-instructions"><strong>${escapeHtml(paymentRequestInstructions)}</strong></p><footer><div>Prepared by:<br><strong>${escapeHtml(request.preparedBy)}</strong><br>${escapeHtml(request.preparedRole)}</div><div>Approved by:<br><strong>Maria Emma F. Llorin</strong><br>CEO</div><div><strong>PAYMENT DETAILS:</strong><br>Bank Name: ${escapeHtml(request.bank || "-")}<br>Check no: ${escapeHtml(request.cheque || "-")}<br>Date: ${escapeHtml(request.chequeDate || "-")}<br>Name and Signature of approver:</div></footer></section>`;
}
async function previewPaymentRequest(identifier) {
  const request = typeof identifier === "number" ? data.paymentRequests[identifier] : data.paymentRequests.find((item) => item.cvNo === identifier || item.id === identifier);
  const id = request?.cvNo || request?.id || identifier;
  if (!id) return toast("Payment request not found.");
  showPaymentRequestPreviewLoading();
  const printable = await MedlaneAPI.printablePaymentRequest(id).catch((error) => { toast(error.message || "Unable to load payment request."); qs("#payment-request-preview-modal").close(); return null; });
  if (!printable) return;
  qs("#payment-request-preview-title").textContent = printable.title;
  qs("#payment-request-preview-content").innerHTML = printable.html;
}

function renderCollectionContactMap() {
  renderCollectionMapVisual();
  const grouped = Object.entries(data.collectionContacts.reduce((acc, contact) => { acc[contact.area] ||= []; acc[contact.area].push(contact); return acc; }, {}));
  qs("#collection-map-actions").innerHTML = grouped.map(([area, contacts], index) => `<details class="region-contact-group" ${index === 0 ? "open" : ""} data-focus-text="${escapeHtml(area)}"><summary><strong>${escapeHtml(area)}</strong><span>${contacts.length} client${contacts.length === 1 ? "" : "s"}</span></summary><div class="region-client-list">${contacts.map((contact) => `<details class="contact-action-card ${contactStatusClass(contact.status)}" data-focus-text="${escapeHtml(contact.client)} ${escapeHtml(contact.area)} ${escapeHtml(contact.status)}"><summary><div><strong>${escapeHtml(contact.client)}</strong><small>${escapeHtml(contact.lastContact || "Not contacted")} · ${escapeHtml(contact.employee || "Unassigned")}</small></div><span class="contact-status-badge ${contactStatusClass(contact.status)}">${escapeHtml(contactStatusLabel(contact.status))}</span></summary><p>${escapeHtml(contact.notes)}</p><div class="contact-control-group"><small>Channels used (select one or more)</small><div class="channel-buttons"><label class="channel-check ${contact.channels.includes("Call") ? "active" : ""}"><input type="checkbox" data-contact-channel="Call" data-contact-client="${escapeHtml(contact.client)}" ${contact.channels.includes("Call") ? "checked" : ""} /><span>☎</span>Call</label><label class="channel-check ${contact.channels.includes("Email") ? "active" : ""}"><input type="checkbox" data-contact-channel="Email" data-contact-client="${escapeHtml(contact.client)}" ${contact.channels.includes("Email") ? "checked" : ""} /><span>@</span>Email</label><label class="channel-check ${contact.channels.includes("Telephone") ? "active" : ""}"><input type="checkbox" data-contact-channel="Telephone" data-contact-client="${escapeHtml(contact.client)}" ${contact.channels.includes("Telephone") ? "checked" : ""} /><span>☎</span>Telephone</label></div></div><div class="contact-control-group"><small>Outcome</small><div class="contact-buttons"><button class="mini-button ${contact.status === "Answered" ? "active" : ""}" data-contact-status="Answered" data-contact-client="${escapeHtml(contact.client)}">Answered</button><button class="mini-button ${contact.status === "Unreached" ? "active" : ""}" data-contact-status="Unreached" data-contact-client="${escapeHtml(contact.client)}">Unreached</button><button class="mini-button ${contact.status === "No Response" ? "active" : ""}" data-contact-status="No Response" data-contact-client="${escapeHtml(contact.client)}">No Reply</button></div></div></details>`).join("")}</div></details>`).join("");
  qs("#collection-map-actions").innerHTML = grouped.map(([area, contacts], index) => `<details class="region-contact-group" ${index === 0 ? "open" : ""} data-focus-text="${escapeHtml(area)}"><summary><strong>${escapeHtml(area)}</strong><span>${contacts.length} client${contacts.length === 1 ? "" : "s"}</span></summary><div class="region-client-list">${contacts.map((contact) => contactActionCard(contact)).join("")}</div></details>`).join("") || `<article class="panel"><p>No clients with unpaid invoice balances need follow-up.</p></article>`;
  table("#collection-contact-history", ["Date", "Client", "Area", "Invoice", "Channel", "Status", "Employee", "Notes"], data.collectionContactHistory.map((item) => [item.date, item.client || item.area, item.area, item.invoice || "-", item.channels || "-", `<span class="pill ${statusClass(["Answered", "Cheque Available"].includes(item.status) ? "Paid" : item.status === "No Response" ? "Overdue" : "Near Due")}">${contactStatusLabel(item.status)}</span>`, item.employee, item.notes]));
}

function contactActionCard(contact) {
  const channels = contact.channels || [];
  const pendingInvoices = data.sales.filter((sale) => sale.client === contact.client && Number(sale.net || 0) - Number(sale.paid || 0) > 0);
  const invoiceList = `<details class="pending-invoice-list"><summary>Pending invoices (${pendingInvoices.length})</summary>${pendingInvoices.map((sale) => `<div><strong>${escapeHtml(sale.documentNo || sale.id)}</strong><span>${peso.format(Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0))}</span><small>Due ${fmtDate(addDays(sale.date, sale.terms))}</small></div>`).join("") || `<p>No unpaid invoices.</p>`}</details>`;
  const channelButton = (channel, icon) => `<label class="channel-check ${channels.includes(channel) ? "active" : ""}"><input type="checkbox" data-contact-channel="${channel}" data-contact-client="${escapeHtml(contact.client)}" ${channels.includes(channel) ? "checked" : ""} /><span>${icon}</span>${channel}</label>`;
  const statusButton = (status, label, tone = "") => `<button class="mini-button ${tone} ${contact.status === contactStatusFromLabel(status) ? "active" : ""}" data-contact-status="${escapeHtml(status)}" data-contact-client="${escapeHtml(contact.client)}">${escapeHtml(label)}</button>`;
  const chequeNote = contact.status === "Cheque Available" && contact.chequeInvoice ? `<div class="contact-control-group cheque-invoice-note"><small>Cheque invoice</small><strong>${escapeHtml(contact.chequeInvoice)}</strong></div>` : "";
  return `<details class="contact-action-card ${contactStatusClass(contact.status)}" data-focus-record="${escapeHtml(contact.client || contact.area)}" data-focus-text="${escapeHtml(contact.client)} ${escapeHtml(contact.area)} ${escapeHtml(contact.status)}"><summary><div><strong>${escapeHtml(contact.client)}</strong><small>${escapeHtml(contact.lastContact || "Not contacted")} · ${escapeHtml(contact.employee || "Unassigned")}</small></div><span class="contact-status-badge ${contactStatusClass(contact.status)}">${escapeHtml(contactStatusLabel(contact.status))}</span></summary><p>${escapeHtml(contact.notes)}</p>${chequeNote}${invoiceList}<div class="contact-control-group"><small>Channels used (select one or more)</small><div class="channel-buttons">${channelButton("Call", "☎")}${channelButton("Email", "@")}${channelButton("Telephone", "☎")}</div></div><div class="contact-control-group"><small>Outcome</small><div class="contact-buttons">${statusButton("Answered", "Answered")}${statusButton("Unreached", "Unreached")}${statusButton("No Reply", "No Reply", "danger-button")}${statusButton("Cheque Available", "Cheque Available")}</div></div></details>`;
}

function collectionContactsGeoJson() {
  return { type: "FeatureCollection", features: data.collectionContacts.map((contact) => {
    const coords = clientCoordinates[contact.client] || [12.8797, 121.7740];
    return { type: "Feature", properties: contact, geometry: { type: "Point", coordinates: [coords[1], coords[0]] } };
  }) };
}

function collectionRegionSummaries() {
  return Object.entries(data.collectionContacts.reduce((acc, contact) => { acc[contact.area] ||= []; acc[contact.area].push(contact); return acc; }, {})).map(([area, contacts]) => {
    const coords = contacts.map((contact) => clientCoordinates[contact.client]).filter(Boolean);
    const lat = coords.length ? coords.reduce((sum, item) => sum + item[0], 0) / coords.length : 12.8797;
    const lng = coords.length ? coords.reduce((sum, item) => sum + item[1], 0) / coords.length : 121.7740;
    const chequeReady = contacts.filter((contact) => contact.status === "Cheque Available").length;
    const noReply = contacts.filter((contact) => contact.status === "No Response").length;
    const answered = contacts.filter((contact) => contact.status === "Answered").length;
    const status = chequeReady ? "Cheque Available" : noReply ? "No Response" : answered === contacts.length ? "Answered" : contacts.some((contact) => contact.status === "Unreached") ? "Unreached" : "Pending";
    return { area, contacts, lat, lng, status };
  });
}

const collectionRegionSources = [
  ["Region I", "Region I"],
  ["CAR", "CAR"],
  ["Region II", "Region II"],
  ["Region III", "Region III"],
  ["NCR", "NCR"],
  ["Region IV-A", "Region IV-A"],
  ["MIMAROPA", "MIMAROPA"],
  ["Region V", "Region V"],
  ["Region VI", "Visayas Dealer"],
  ["Region VII", "Visayas Dealer"],
  ["Region VIII", "Visayas Dealer"],
  ["Region IX", "Mindanao Dealer"],
  ["Region X", "Mindanao Dealer"],
  ["Region XI", "Mindanao Dealer"],
  ["Region XII", "Mindanao Dealer"],
  ["Region XIII", "Mindanao Dealer"],
  ["BARMM", "Mindanao Dealer"],
];

const collectionMapLabelPositions = {
  "Region I": { dot: [1362, 535], card: [360, 420] },
  "CAR": { dot: [1548, 575], card: [410, 575] },
  "Region II": { dot: [1512, 560], card: [1770, 470] },
  "Region III": { dot: [1370, 755], card: [360, 750] },
  "NCR": { dot: [1432, 872], card: [410, 895] },
  "Region IV-A": { dot: [1476, 900], card: [1795, 820] },
  "Region V": { dot: [1575, 1050], card: [1810, 1035] },
  "Visayas Dealer": { dot: [1580, 1320], card: [360, 1280] },
  "Mindanao Dealer": { dot: [1745, 1780], card: [1770, 1740] },
};

function regionMapLabel(area, status, clientCount) {
  const regionClass = contactStatusClass(status);
  const shape = collectionMapLabelPositions[area] || collectionMapLabelPositions["Region I"];
  const [dotX, dotY] = shape.dot;
  const [cardX, cardY] = shape.card;
  const scale = Math.max(0.72, Math.min(1.35, 1 / collectionMapZoom));
  const cardWidth = Math.round(520 * scale);
  const cardHeight = Math.round(156 * scale);
  const cardFont = Math.round(34 * scale);
  const metaFont = Math.round(24 * scale);
  return `<g class="map-region-label ${regionClass}" data-map-region="${escapeHtml(area)}"><line x1="${dotX}" y1="${dotY}" x2="${cardX + cardWidth / 2}" y2="${cardY + cardHeight / 2}"></line><circle cx="${dotX}" cy="${dotY}" r="${Math.round(17 * scale)}"></circle><foreignObject x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}"><button xmlns="http://www.w3.org/1999/xhtml" class="svg-region-summary ${regionClass}" style="--map-label-font:${cardFont}px;--map-label-meta:${metaFont}px;" data-map-region="${escapeHtml(area)}"><strong>${escapeHtml(area)}</strong><span>${clientCount} client${clientCount === 1 ? "" : "s"}</span></button></foreignObject></g>`;
}

function collectionRegionSource(area) {
  return collectionRegionSources.find(([name]) => name === area)?.[1] || area;
}

function collectionRegionCount(area) {
  return data.collectionContacts.filter((contact) => contact.area === area).length;
}

function geoRegionName(feature) {
  const raw = featureRegionName(feature);
  const value = String(raw || "").toLowerCase();
  if (value.includes("ilocos")) return "Region I";
  if (value.includes("cordillera") || value === "car") return "CAR";
  if (value.includes("cagayan")) return "Region II";
  if (value.includes("central luzon")) return "Region III";
  if (value.includes("national capital") || value === "ncr") return "NCR";
  if (value.includes("calabarzon")) return "Region IV-A";
  if (value.includes("mimaropa")) return "MIMAROPA";
  if (value.includes("bicol")) return "Region V";
  if (value.includes("western visayas")) return "Region VI";
  if (value.includes("central visayas")) return "Region VII";
  if (value.includes("eastern visayas")) return "Region VIII";
  if (value.includes("zamboanga")) return "Region IX";
  if (value.includes("northern mindanao")) return "Region X";
  if (value.includes("davao")) return "Region XI";
  if (value.includes("soccsksargen")) return "Region XII";
  if (value.includes("caraga")) return "Region XIII";
  if (value.includes("armm") || value.includes("bangsamoro")) return "BARMM";
  return raw;
}

function projectedPoint(point, bounds) {
  const [lon, lat] = point;
  const mapBox = { x0: 918, y0: 112, x1: 2080, y1: 2138 };
  const x = mapBox.x0 + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (mapBox.x1 - mapBox.x0);
  const y = mapBox.y0 + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (mapBox.y1 - mapBox.y0);
  return [Math.round(x), Math.round(y)];
}

function pathArea(points) {
  let sum = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) sum += (points[previous][0] + points[index][0]) * (points[previous][1] - points[index][1]);
  return Math.abs(sum / 2);
}

function simplifyProjectedPoints(points, tolerance = 12) {
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return points.reduce((acc, point) => {
    if (!acc.length || distance(acc[acc.length - 1], point) >= tolerance) acc.push(point);
    return acc;
  }, []);
}

function projectedRingPath(ring, bounds) {
  const points = simplifyProjectedPoints(ring.map((point) => projectedPoint(point, bounds)));
  if (new Set(points.map((point) => point.join(","))).size < 4 || pathArea(points) < 450) return "";
  return `M${points.map((point) => point.join(" ")).join("L")}Z`;
}

function projectedRegionPath(feature, bounds) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map((ring) => projectedRingPath(ring, bounds))).filter(Boolean).join(" ");
}

function geoJsonBounds(geoJson) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  const scan = (coordinates) => {
    if (typeof coordinates[0] === "number") {
      bounds.minLon = Math.min(bounds.minLon, coordinates[0]);
      bounds.maxLon = Math.max(bounds.maxLon, coordinates[0]);
      bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
      bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
      return;
    }
    coordinates.forEach(scan);
  };
  geoJson.features.forEach((feature) => scan(feature.geometry.coordinates));
  return bounds;
}

function clientMapPosition(area, index) {
  const slots = {
    "Region I": { x: 210, y: 96, cols: 1 },
    "Region II": { x: 390, y: 150, cols: 1 },
    "Region III": { x: 210, y: 290, cols: 1 },
    "Region IV-A": { x: 392, y: 410, cols: 1 },
    "Region V": { x: 408, y: 542, cols: 1 },
    "Visayas Dealer": { x: 290, y: 650, cols: 1 },
    "Mindanao Dealer": { x: 382, y: 820, cols: 1 },
  };
  const slot = slots[area] || { x: 28, y: 22, cols: 1 };
  const col = index % slot.cols;
  const row = Math.floor(index / slot.cols);
  return [slot.x + col * 198, slot.y + row * 54];
}

async function renderCollectionMapVisual() {
  const labels = ["Region I", "CAR", "Region II", "Region III", "NCR", "Region IV-A", "Region V", "Visayas Dealer", "Mindanao Dealer"].map((area) => regionMapLabel(area, regionTrackingStatus(area), collectionRegionCount(area))).join("");
  let overlays = "";
  try {
    const geoJson = await loadPhilippinesRegionsGeoJson();
    const bounds = geoJsonBounds(geoJson);
    overlays = geoJson.features.map((feature) => {
      const regionName = geoRegionName(feature);
      const source = collectionRegionSource(regionName);
      const status = regionTrackingStatus(source);
      const path = projectedRegionPath(feature, bounds);
      return path ? `<path class="map-region-fill ${contactStatusClass(status)}" data-map-region="${escapeHtml(source)}" data-real-region="${escapeHtml(regionName)}" d="${path}"></path>` : "";
    }).join("");
  } catch {
    overlays = "";
  }
  qs("#collection-map").innerHTML = `<div class="map-topbar"><div class="map-legend static"><span class="answered">Answered</span><span class="tracked">Tracked</span><span class="unreached">Unreached</span><span class="no-response">No Reply</span><span class="pending">Pending</span></div></div><div class="map-pan-viewport"><svg class="static-ph-map" width="${Math.round(1000 * collectionMapZoom)}" height="${Math.round(891 * collectionMapZoom)}" viewBox="0 0 2524 2248" role="img" aria-label="Philippines client follow-up map"><rect width="2524" height="2248" rx="72"></rect><image class="ph-reference-map" href="ph-07.png" x="0" y="0" width="2524" height="2248" preserveAspectRatio="xMidYMid meet"></image><g class="map-overlay-layer">${overlays}</g><g class="map-label-layer">${labels}</g></svg></div>`;
}

function regionTrackingStatus(area) {
  const contacts = data.collectionContacts.filter((contact) => contact.area === area);
  if (!contacts.length) return "Pending";
  if (contacts.some((contact) => contact.status === "Cheque Available")) return "Cheque Available";
  if (contacts.every((contact) => contact.status === "Answered")) return "Answered";
  if (contacts.every((contact) => contact.status === "No Response")) return "No Response";
  if (contacts.every((contact) => ["Called", "Unreached"].includes(contact.status))) return "Unreached";
  if (contacts.some((contact) => contact.status === "No Response")) return "No Response";
  if (contacts.some((contact) => ["Called", "Unreached"].includes(contact.status))) return "Unreached";
  if (contacts.every((contact) => contact.status !== "Pending")) return "Tracked";
  return "Pending";
}

function regionStatusColor(status) {
  if (status === "Answered") return "#0f9f7a";
  if (status === "Tracked") return "#4755c7";
  if (status === "Unreached") return "#006eb6";
  if (status === "No Response") return "#d71920";
  return "#f59e0b";
}

function featureRegionName(feature) {
  const p = feature?.properties || {};
  return p.shapeName || p.ADM1_EN || p.REGION || p.Reg_Name || p.name || p.NAME_1 || p.region || "";
}

function normalizeRegionName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("ilocos") || value.includes("region i")) return "Region I";
  if (value.includes("cagayan") || value.includes("region ii")) return "Region II";
  if (value.includes("central luzon") || value.includes("region iii")) return "Region III";
  if (value.includes("calabarzon") || value.includes("region iv-a") || value.includes("region iva")) return "Region IV-A";
  if (value.includes("bicol") || value.includes("region v")) return "Region V";
  if (value.includes("visayas")) return "Visayas Dealer";
  if (value.includes("zamboanga") || value.includes("northern mindanao") || value.includes("davao") || value.includes("soccsksargen") || value.includes("caraga") || value.includes("bangsamoro") || value.includes("armm")) return "Mindanao Dealer";
  return "";
}

function philippinesGeoJson() {
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Luzon" }, geometry: { type: "Polygon", coordinates: [[[119.7, 18.8], [120.4, 20.3], [122.0, 18.8], [122.4, 16.9], [121.5, 15.6], [121.3, 14.2], [122.2, 13.3], [121.1, 12.6], [119.9, 13.9], [119.5, 16.0], [119.7, 18.8]]] } },
    { type: "Feature", properties: { name: "Mindoro-Palawan" }, geometry: { type: "MultiPolygon", coordinates: [
      [[[120.2, 13.5], [120.9, 13.4], [121.2, 12.6], [120.6, 11.8], [119.9, 12.3], [120.2, 13.5]]],
      [[[117.0, 11.4], [118.2, 10.7], [119.0, 9.5], [119.4, 8.3], [118.7, 7.7], [117.8, 8.8], [117.1, 10.0], [117.0, 11.4]]]
    ] } },
    { type: "Feature", properties: { name: "Visayas" }, geometry: { type: "MultiPolygon", coordinates: [
      [[[122.1, 12.3], [123.5, 12.0], [124.0, 11.0], [123.2, 10.4], [122.1, 10.8], [122.1, 12.3]]],
      [[[123.6, 10.9], [124.8, 10.7], [125.0, 9.8], [123.8, 9.5], [123.6, 10.9]]],
      [[[121.4, 10.9], [122.1, 10.3], [121.9, 9.6], [121.1, 9.8], [121.4, 10.9]]]
    ] } },
    { type: "Feature", properties: { name: "Mindanao" }, geometry: { type: "Polygon", coordinates: [[[123.7, 8.8], [124.8, 9.5], [126.2, 8.6], [126.4, 7.2], [125.5, 5.7], [124.0, 6.1], [122.9, 7.4], [123.7, 8.8]]] } },
  ] };
}

async function loadPhilippinesRegionsGeoJson() {
  if (philippinesRegionGeoJson) return philippinesRegionGeoJson;
  const response = await fetch(philippinesRegionsGeoJsonUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error("Unable to load Philippines region GeoJSON.");
  philippinesRegionGeoJson = await response.json();
  return philippinesRegionGeoJson;
}

async function renderLeafletCollectionMap() {
  const mapEl = qs("#collection-map");
  if (!mapEl || !window.L) {
    mapEl.innerHTML = `<p>Map library unavailable. Check internet connection for Leaflet assets.</p>`;
    return;
  }
  if (!mapEl.offsetWidth || !mapEl.offsetHeight) return;
  if (collectionLeafletMap) {
    collectionLeafletMap.remove();
    collectionLeafletMap = null;
    collectionLeafletLayer = null;
    collectionRegionLayer = null;
  }
  mapEl.innerHTML = "";
  collectionLeafletMap = L.map(mapEl, { attributionControl: false, scrollWheelZoom: false, zoomControl: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, preferCanvas: true });
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "leaflet-contact-legend");
    div.innerHTML = `<span class="answered">Answered</span><span class="tracked">Tracked</span><span class="unreached">Unreached</span><span class="no-response">No Reply</span><span class="pending">Pending</span>`;
    return div;
  };
  legend.addTo(collectionLeafletMap);
  try {
    const regionGeoJson = await loadPhilippinesRegionsGeoJson();
    collectionRegionLayer = L.geoJSON(regionGeoJson, {
      style: (feature) => {
        const appRegion = normalizeRegionName(featureRegionName(feature));
        const status = regionTrackingStatus(appRegion);
        const color = regionStatusColor(status);
        return { color, weight: 1.8, opacity: 0.72, fillColor: color, fillOpacity: appRegion ? 0.22 : 0.08 };
      },
      onEachFeature: (feature, layer) => {
        const appRegion = normalizeRegionName(featureRegionName(feature));
        if (appRegion) layer.on("click", () => openContactRegion(appRegion));
      },
    }).addTo(collectionLeafletMap);
  } catch {
    L.geoJSON(philippinesGeoJson(), { style: { color: "#0b8ed0", weight: 2, opacity: 0.35, fillColor: "#0f9f7a", fillOpacity: 0.16 } }).addTo(collectionLeafletMap);
  }
  if (collectionLeafletLayer) collectionLeafletLayer.remove();
  collectionLeafletLayer = L.geoJSON(collectionContactsGeoJson(), {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: L.divIcon({ className: `client-map-label ${contactStatusClass(feature.properties.status)}`, html: `<strong>${escapeHtml(feature.properties.client)}</strong><span>${escapeHtml(contactStatusLabel(feature.properties.status))}</span>`, iconSize: [156, 48], iconAnchor: [78, 24] }) }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindPopup(`<strong>${escapeHtml(p.client)}</strong><br>${escapeHtml(p.area)}<br>${escapeHtml(contactStatusLabel(p.status))}<br>${escapeHtml((p.channels || []).join(" + ") || "No channel set")}`);
      layer.on("click", () => openContactRegion(p.area, p.client));
    },
  }).addTo(collectionLeafletMap);
  collectionRegionLayer = L.layerGroup(collectionRegionSummaries().map((region) => L.marker([region.lat, region.lng], {
    icon: L.divIcon({ className: `region-map-label ${contactStatusClass(region.status)}`, html: `<strong>${escapeHtml(region.area)}</strong><span>${region.contacts.length} client${region.contacts.length === 1 ? "" : "s"}</span>`, iconSize: [142, 48], iconAnchor: [71, 24] }),
  }).on("click", () => openContactRegion(region.area)))).addTo(collectionLeafletMap);
  const bounds = collectionRegionLayer.getBounds?.().isValid?.() ? collectionRegionLayer.getBounds() : L.latLngBounds([[4.5, 116.0], [21.5, 127.5]]);
  setTimeout(() => { collectionLeafletMap.invalidateSize(); collectionLeafletMap.fitBounds(bounds, { padding: [34, 34] }); }, 160);
}

function statusColor(status) {
  if (status === "Answered") return "#0f9f7a";
  if (status === "Unreached") return "#006eb6";
  if (status === "No Response") return "#d71920";
  return "#f59e0b";
}

function openContactRegion(area, client = "", shouldScroll = true) {
  const group = qsa(".region-contact-group").find((item) => (item.dataset.focusText || "") === area);
  if (group) group.open = true;
  if (client) {
    const card = qsa(".contact-action-card").find((item) => (item.dataset.focusText || "").includes(client));
    if (card) card.open = true;
  }
  if (shouldScroll) focusRecord(client || area);
}

function toggleContactChannel(client, channel) {
  const contact = data.collectionContacts.find((item) => item.client === client);
  if (!contact) return;
  const channels = new Set(contact.channels || []);
  channels.has(channel) ? channels.delete(channel) : channels.add(channel);
  contact.channels = [...channels];
  contact.weekKey = followupWeekKey();
  saveData();
  renderCollectionContactMap();
  openContactRegion(contact.area, client, false);
}

function updateCollectionContact(client, status) {
  status = contactStatusFromLabel(status);
  const contact = data.collectionContacts.find((item) => item.client === client);
  if (!contact) return;
  let chequeInvoice = "";
  if (status === "Cheque Available") {
    const openInvoices = data.sales.filter((sale) => sale.client === client && Number(sale.net || 0) - Number(sale.paid || 0) > 0).map((sale) => sale.documentNo || sale.id);
    chequeInvoice = prompt(`Cheque is available for which invoice?${openInvoices.length ? `\nOpen invoices: ${openInvoices.join(", ")}` : ""}`, contact.chequeInvoice || openInvoices[0] || "") || "";
    if (!chequeInvoice.trim()) return toast("Invoice reference is required for Cheque Available.");
  }
  contact.status = status;
  contact.lastContact = fmtDate(followupDate());
  contact.employee = currentUser?.name || "System User";
  contact.weekKey = followupWeekKey();
  contact.chequeInvoice = status === "Cheque Available" ? chequeInvoice.trim() : "";
  const channelText = contact.channels?.length ? ` via ${contact.channels.join(" + ")}` : "";
  contact.notes = status === "Answered" ? `Client answered this week's follow-up${channelText}.` : status === "Cheque Available" ? `Cheque is available for ${contact.chequeInvoice}${channelText}; coordinate pickup or deposit.` : status === "Unreached" ? `Could not reach client${channelText}; try another channel.` : `No reply${channelText}; schedule another follow-up.`;
  data.collectionContactHistory.unshift({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), client, area: contact.area, invoice: contact.chequeInvoice || "", channels: contact.channels?.join(" + ") || "Not set", status, employee: contact.employee, notes: contact.notes });
  data.collectionContactHistory = data.collectionContactHistory.slice(0, 40);
  log("Updated collection contact map", "Collections", `${client}: ${status}`);
  saveData();
  renderCollectionContactMap();
  renderDashboard();
  renderNotifications();
  openContactRegion(contact.area, client, false);
  toast(`${client} marked ${status}.`);
}

function renderReceivablesTracker() {
  const allRows = byBranch(data.sales, "area").filter((sale) => Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0) > 0).filter((sale) => includesSearch(Object.values(sale)));
  const tabs = arTrackerTabs(allRows);
  qs("#ar-tracker-tabs").innerHTML = tabs.map(([key, label, count]) => `<button class="order-status-tab ${arTrackerTab === key ? "active" : ""}" data-ar-tab="${key}">${escapeHtml(label)}${key === "all" ? "" : ` <span>(${count})</span>`}</button>`).join("");
  const rows = arTrackerTab === "all" ? allRows : allRows.filter((sale) => arTrackerStage(sale) === arTrackerTab);
  const openBalance = rows.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
  const collected = rows.reduce((sum, sale) => sum + sale.paid, 0);
  qs("#ar-tracker-visuals").innerHTML = [
    visualCard("▦", "Current Tab", tabs.find(([key]) => key === arTrackerTab)?.[1] || "All", barRows(tabs.filter(([key]) => key !== "all").map(([, label, count]) => [label, count]), (value) => `${value} docs`, ["orange", "", "", "green", "red", "orange"]), "info", "Computed from invoice workflow status across PO, invoice, delivery, payment, and AR stages."),
    visualCard("₱", "Open AR", peso.format(openBalance), `<div class="big-number compact-big">${peso.format(openBalance)}</div><p>${rows.length} invoice${rows.length === 1 ? "" : "s"} in this view.</p>`, openBalance ? "warning" : "success", "Computed as invoice net amount minus paid amount for the filtered records."),
    visualCard("✓", "Collected", peso.format(collected), `<div class="big-number compact-big">${peso.format(collected)}</div><p>Paid amount from filtered invoices.</p>`, "success", "Computed as the sum of paid amounts from invoices in the current tracker tab."),
  ].join("");
  const byClientReceivables = Object.entries(allRows.reduce((acc, sale) => { acc[sale.client] ||= []; acc[sale.client].push(sale); return acc; }, {}))
    .map(([client, invoices]) => [client, invoices, invoices.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0)])
    .sort((a, b) => b[2] - a[2]);
  table("#client-receivables-table", ["Client", "Open Invoices", "Total Receivables", "Actions"], byClientReceivables.map(([client, invoices, total]) => [escapeHtml(client), invoices.length, peso.format(total), `<button class="mini-button" data-client-invoices="${escapeHtml(client)}">View</button>`]));
  const regional = Object.entries(allRows.filter((sale) => Math.max(sale.net - sale.paid, 0) > 0).reduce((acc, sale) => { acc[sale.area] ||= []; acc[sale.area].push(sale); return acc; }, {}));
  table("#regional-receivables-table", ["Region", "Clients", "Pending Invoices", "Open AR", "Invoices"], regional.map(([area, invoices]) => {
    const clients = [...new Set(invoices.map((sale) => sale.client))];
    return [area, clients.join("<br>"), invoices.length, peso.format(invoices.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0)), invoices.map((sale) => `${sale.documentNo || sale.id}<small>${sale.client} · ${peso.format(Math.max(sale.net - sale.paid, 0))}</small>`).join("")];
  }));
  const byClient = Object.entries(rows.reduce((acc, sale) => {
    acc[sale.client] ||= [];
    acc[sale.client].push(sale);
    return acc;
  }, {}));
  qs("#receivables-tracker-grid").innerHTML = byClient.map(([client, invoices]) => {
    const latest = invoices.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const balance = invoices.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
    const paid = invoices.reduce((sum, sale) => sum + sale.paid, 0);
    const total = invoices.reduce((sum, sale) => sum + sale.net, 0);
    const recent = invoices.slice(0, 3).map((sale) => trackerCard(sale, false)).join("");
    return `<article class="panel client-ar-card" data-focus-record="${escapeHtml(latest.documentNo || latest.id)}" data-focus-text="${escapeHtml(`${client} ${invoices.map((sale) => sale.documentNo || sale.id).join(" ")}`)}"><div class="panel-header"><div><p class="eyebrow">${escapeHtml(client)}</p><h2>${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · ${peso.format(balance)} AR</h2></div><span class="pill ${statusClass(balance ? "Near Due" : "Paid")}">${balance ? "Open AR" : "Cleared"}</span></div><p class="tracker-description">Order tracker groups all SI/TS/DR for this client. Each invoice shows PO, invoice, delivery, payment, and receivable status with dates so Accounting can follow progress like an ecommerce order timeline.</p><div class="report-preview-grid"><div class="report-preview-card"><small>Total Sales</small><strong>${peso.format(total)}</strong></div><div class="report-preview-card"><small>Collected</small><strong>${peso.format(paid)}</strong></div><div class="report-preview-card"><small>Latest Invoice</small><strong>${escapeHtml(latest.documentNo || latest.id)}</strong></div></div><div class="client-invoice-stack">${recent}</div>${invoices.length > 3 ? `<button class="ghost-button" data-client-invoices="${escapeHtml(client)}">View ${invoices.length - 3} more invoices</button>` : `<button class="ghost-button" data-client-invoices="${escapeHtml(client)}">View full timeline</button>`}</article>`;
  }).join("") || `<article class="panel"><p>No receivables found for this tab.</p></article>`;
}

function trackerCard(sale, detailed = false) {
    const status = statusForSale(sale);
    const balance = Math.max(sale.net - sale.paid, 0);
    const client = data.clients.find((item) => item.name === sale.client) || {};
    const payment = data.payments.find((entry) => entry.invoice === sale.id || entry.invoice === sale.documentNo);
    const due = fmtDate(addDays(sale.date, sale.terms));
    const steps = [
      ["PO", "Order placed", sale.po || `PO-${sale.id}`, `${sale.salesperson} created order for ${sale.client}`, sale.date, "done", "sales", sale.documentNo || sale.id],
      [invoiceTypeIcon(sale.type), "Invoice issued", sale.documentNo || sale.id, `${invoiceTypeLabel(sale.type)} prepared by ${sale.salesperson}`, sale.date, "done", "invoicing", sale.documentNo || sale.id],
      ["PK", "Packed / delivered", `${sale.qty} item(s) from ${warehouseForArea(sale.area)}`, `Delivery address: ${client.address || sale.area}`, sale.date, "done", "inventory", sale.item],
      ["₱", "Payment posted", peso.format(sale.paid), payment ? `${payment.method} ${payment.receiptNo || "receipt"} via ${payment.bank || "cash"}` : "Waiting for collection posting", payment?.dateRecorded || "Waiting", sale.paid > 0 ? "done" : "pending", "collections", sale.documentNo || sale.id],
      ["AR", "Receivable status", balance ? `${peso.format(balance)} ${status}` : "Cleared", `Due ${due} · Terms ${sale.terms} days`, due, balance ? (status === "Overdue" ? "blocked" : "pending") : "done", "collections", sale.documentNo || sale.id],
    ];
    if (sale.status === "Cancelled") steps.push(["↻", "Replacement", sale.replacementId || "No replacement", sale.cancelReason || "Cancellation review required", sale.date, sale.replacementId ? "done" : "blocked", "invoicing"]);
    if (sale.cancelledFrom) steps.unshift(["×", "Cancelled Source", sale.cancelledFrom, "This document replaced a cancelled source invoice", sale.date, "done", "invoicing"]);
    const summaryCards = [["Salesperson", sale.salesperson], ["Client Area", sale.area], ["PO", sale.po || "-"], ["Balance", peso.format(balance)]];
    if (!detailed) return `<article class="tracker-card compact-order-card" data-focus-record="${escapeHtml(sale.documentNo || sale.id)}"><div class="panel-header tracker-card-header"><div><p class="eyebrow">${escapeHtml(sale.documentNo || sale.id)}</p><h2><span class="invoice-type-badge type-${escapeHtml(sale.type)}"><span>${invoiceTypeIcon(sale.type)}</span>${invoiceTypeLabel(sale.type)}</span> ${peso.format(sale.net)}</h2><p class="tracker-item-summary">${escapeHtml(sale.client)} · ${escapeHtml(sale.salesperson)} · Due ${due}</p></div><span class="pill ${statusClass(status)}">${status}</span></div><div class="tracker-flow order-flow compact-flow">${steps.slice(0, 5).map(([icon, title, note, detail, date, state, section, focus]) => `<button class="tracker-step ${state}" data-go-section="${section}" data-focus-record="${escapeHtml(focus || note)}"><i>${escapeHtml(icon)}</i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span><small>${escapeHtml(date)}</small></button>`).join("")}</div><div class="modal-actions"><button class="primary-button" data-invoice-flow="${escapeHtml(sale.id)}">View Details</button></div></article>`;
    return `<article class="tracker-card" data-focus-record="${escapeHtml(sale.documentNo || sale.id)}"><div class="panel-header tracker-card-header"><div><p class="eyebrow">${escapeHtml(sale.documentNo || sale.id)}</p><h2><span class="invoice-type-badge type-${escapeHtml(sale.type)}"><span>${invoiceTypeIcon(sale.type)}</span>${invoiceTypeLabel(sale.type)}</span> ${peso.format(sale.net)}</h2><p class="tracker-item-summary">${escapeHtml(saleSummary(sale))}</p></div><span class="pill ${statusClass(status)}">${status}</span></div><div class="order-detail-layout"><aside class="delivery-address"><h3>Delivery Address</h3><strong>${escapeHtml(sale.client)}</strong><span>${escapeHtml(client.contact || "No contact recorded")}</span><small>${escapeHtml(client.address || sale.area)}</small><small>Salesperson: ${escapeHtml(sale.salesperson)}</small></aside><div><div class="report-preview-grid invoice-mini-grid">${summaryCards.map(([label, value]) => `<div class="report-preview-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>${sale.cancelReason ? `<p><strong>Cancel reason:</strong> ${escapeHtml(sale.cancelReason)}</p>` : ""}<div class="tracker-flow order-flow">${steps.map(([icon, title, note, detail, date, state, section, focus]) => `<button class="tracker-step ${state}" data-go-section="${section}" data-focus-record="${escapeHtml(focus || note)}"><i>${escapeHtml(icon)}</i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span><small>${escapeHtml(date)}</small><em>${escapeHtml(detail)}</em></button>`).join("")}</div><details class="full-event-details" open><summary>Full order timeline</summary><div class="event-timeline">${steps.map(([icon, title, note, detail, date, state]) => `<div class="event-item ${state}"><span>${escapeHtml(icon)}</span><time>${escapeHtml(date)}</time><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p><small>${escapeHtml(note)}</small></div></div>`).join("")}</div></details></div></div></article>`;
}

function renderInvoiceFlowDetail(invoiceId) {
  const sale = data.sales.find((item) => item.id === invoiceId || item.documentNo === invoiceId);
  if (!sale) return toast("Invoice not found.");
  currentInvoiceFlow = sale.id;
  qs("#invoice-flow-title").textContent = `${sale.documentNo || sale.id} order flow`;
  qs("#invoice-flow-detail-panel").innerHTML = trackerCard(sale, true);
  showSection("invoice-flow-detail");
}

function renderClientInvoices() {
  const client = currentClientView || data.sales[0]?.client;
  const invoices = data.sales.filter((sale) => sale.client === client);
  const clientRecord = data.clients.find((item) => item.name === client) || {};
  const total = invoices.reduce((sum, sale) => sum + sale.net, 0);
  const paid = invoices.reduce((sum, sale) => sum + sale.paid, 0);
  const balance = Math.max(total - paid, 0);
  const completed = invoices.filter((sale) => statusForSale(sale) === "Paid" || Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0) <= 0);
  const pending = invoices.filter((sale) => !completed.includes(sale));
  const overdue = pending.filter((sale) => daysUntil(addDays(sale.date, sale.terms)) < 0);
  const avgOrder = invoices.length ? Math.round(total / invoices.length) : 0;
  const lastPurchase = invoices.map((sale) => sale.date).sort().at(-1) || "No purchase";
  const clientGrade = !invoices.length ? "No activity" : overdue.length ? "Needs follow-up" : balance > 0 ? "Active AR" : "Good standing";
  qs("#client-invoices-title").textContent = `${client || "Client"} invoices`;
  qs("#client-invoices-grid").innerHTML = invoices.length ? `<article class="panel full-client-timeline"><div class="panel-header"><div><p class="eyebrow">Client Performance</p><h2>${escapeHtml(client)}</h2><p>${escapeHtml(clientRecord.address || "No address recorded")} · ${escapeHtml(clientRecord.contact || "No contact recorded")}</p></div><span class="pill ${statusClass(overdue.length ? "Overdue" : balance ? "Near Due" : "Paid")}">${escapeHtml(clientGrade)}</span></div><div class="report-preview-grid"><div class="report-preview-card"><small>Total invoices</small><strong>${invoices.length}</strong></div><div class="report-preview-card"><small>Pending invoices</small><strong>${pending.length}</strong></div><div class="report-preview-card"><small>Completed invoices</small><strong>${completed.length}</strong></div><div class="report-preview-card"><small>Overdue invoices</small><strong>${overdue.length}</strong></div><div class="report-preview-card"><small>Total sales</small><strong>${peso.format(total)}</strong></div><div class="report-preview-card"><small>Collected</small><strong>${peso.format(paid)}</strong></div><div class="report-preview-card"><small>AR balance</small><strong>${peso.format(balance)}</strong></div><div class="report-preview-card"><small>Average order</small><strong>${peso.format(avgOrder)}</strong></div><div class="report-preview-card"><small>Last purchase</small><strong>${escapeHtml(lastPurchase)}</strong></div></div><div class="chart-bars">${barRows([["Collected", paid], ["Open AR", balance]], (value) => peso.format(value), ["green", "orange"])}${graphNote("Client health is computed from all SI/TS/DR invoices: pending, completed, overdue, collected amount, and open AR balance.")}</div><div class="modal-actions"><button class="primary-button" data-create-soa="${escapeHtml(client)}">Create SOA</button></div></article><article class="panel"><div class="panel-header"><div><p class="eyebrow">Pending Invoices</p><h2>${pending.length} still open</h2></div></div>${pending.length ? pending.map((sale) => trackerCard(sale, false)).join("") : `<p class="page-description">No pending invoices.</p>`}</article><article class="panel"><div class="panel-header"><div><p class="eyebrow">Completed Invoices</p><h2>${completed.length} completed</h2></div></div>${completed.length ? completed.map((sale) => trackerCard(sale, false)).join("") : `<p class="page-description">No completed invoices.</p>`}</article>` : `<article class="panel"><p>No invoices found for this client.</p></article>`;
}

function soaHtml(client) {
  const clientRecord = data.clients.find((item) => item.name === client) || {};
  const invoices = data.sales.filter((sale) => sale.client === client && Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0) > 0).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const totalBalance = invoices.reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
  const shortDate = (value) => {
    const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "-";
    return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
  };
  const rows = invoices.map((sale) => {
    const dueDate = addDays(sale.date, sale.terms);
    const daysDue = Math.max(0, -daysUntil(dueDate));
    const balance = Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0);
    return `<tr><td>${escapeHtml(shortDate(sale.date))}</td><td>${escapeHtml(sale.documentNo || sale.id)}</td><td>${peso.format(balance).replace("₱", "")}</td><td>${daysDue || ""}</td></tr>`;
  });
  const blankRows = Array.from({ length: Math.max(0, 18 - rows.length) }, () => `<tr class="soa-blank-row"><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join("");
  return `<section class="soa-print"><header><img src="medlane.jpg" alt="Medlane Diagnostic Solutions" /><h1>Statement of Account</h1></header><div class="soa-meta"><div><span>Account Name:</span><strong>${escapeHtml(client)}</strong></div><div><span>Terms:</span><strong>${escapeHtml(`${Number(clientRecord.terms || 30)} Days`)}</strong></div><div><span>Address:</span><strong>${escapeHtml(clientRecord.address || "No address recorded")}</strong></div><div><span>TIN No.:</span><strong>${escapeHtml(clientRecord.tin || "")}</strong></div><div><span>SOA Date:</span><strong>${escapeHtml(shortDate(today))}</strong></div></div><table><thead><tr><th>Date</th><th>Reference Number</th><th>Amount</th><th>Days Due</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="4">No open invoices.</td></tr>`}${blankRows}<tr class="soa-total-row"><td></td><td>Total</td><td>${peso.format(totalBalance).replace("₱", "")}</td><td></td></tr></tbody></table><div class="soa-notes"><p>Should there be any discrepancies, you may reach us through our company's contact number.</p><p>We respectfully request that all <strong>overdue accounts</strong>, if any, be settled immediately to <strong>avoid delays in your future orders and transactions.</strong> Kindly make all checks payable to <strong>MEDLANE DIAGNOSTIC SOLUTIONS, INC.</strong></p><p>Please note that any payments and/or orders made <strong>after this billing date</strong> may not yet be reflected in this SOA. If payment has already been made, kindly disregard this notice.</p><p>Thank you very much.</p></div><div class="soa-signature"><p>Very truly yours,</p><strong>${escapeHtml(currentUser?.name || "Jessica Berry")}</strong><span>Accounting Staff</span><span>MEDLANE DIAGNOSTIC SOLUTIONS, INC.</span></div><footer>13 Gumamela St. Pilar Village, Las Piñas<br />Las Piñas City 1740<br />Tel. No. (02) 8836-2853 Email: receivables.mdsi@gmail.com</footer></section>`;
}

function previewSoa(client) {
  const dialog = qs("#payment-request-preview-modal");
  qs("#payment-request-preview-title").textContent = `Statement of Account — ${client}`;
  qs("#payment-request-preview-content").innerHTML = soaHtml(client);
  if (!dialog.open) dialog.showModal();
}

function renderWarranty() {
  const warranties = data.warranties.filter((w) => includesSearch(Object.values(w)));
  const endingSoon = warranties.filter((w) => daysUntil(w.warrantyEnd) <= 180).sort((a, b) => daysUntil(a.warrantyEnd) - daysUntil(b.warrantyEnd));
  const equipmentMix = Object.entries(sumBy(warranties, "equipment", () => 1));
  qs("#warranty-visuals").innerHTML = [
    visualCard("◉", "Active Coverage", `${warranties.filter((w) => w.status === "Active").length}/${warranties.length} active`, barRows([["Active", warranties.filter((w) => w.status === "Active").length], ["Ending soon", endingSoon.length]], (value) => `${value} units`, ["green", "orange"]), "success", "Computed from warranty records by current status and warranty end date."),
    visualCard("⌁", "Warranty Timeline", endingSoon.length ? `${endingSoon[0].serial} next` : "No urgent expiry", barRows(endingSoon.slice(0, 4).map((w) => [w.serial, Math.max(daysUntil(w.warrantyEnd), 0)]), (value) => `${value} days`, ["red", "orange", "green"]), "warning", "Computed as days remaining until warranty end for expiring units."),
    visualCard("▧", "Equipment Mix", `${equipmentMix.length} equipment types`, barRows(equipmentMix, (value) => `${value} unit${value === 1 ? "" : "s"}`, ["", "green", "orange"]), "info", "Computed from warranty records grouped by equipment name."),
  ].join("");
  table("#warranty-table", ["Client", "Equipment", "Serial No.", "Install Date", "Warranty End", "Status", "Service Notes"], data.warranties.filter((w) => includesSearch(Object.values(w))).map((w) => ({ focus: w.serial, cells: [w.client, w.equipment, w.serial, w.installDate, w.warrantyEnd, `<span class="pill ${statusClass(w.status)}">${w.status}</span>`, w.service] })));
}

function productIssueStatusClass(status) {
  if (status === "Resolved") return "green";
  if (status === "Pass to Engineering" || status === "Pass to Product Specialist") return "orange";
  if (status === "In Progress") return "purple";
  return "gray";
}

function productIssueTurnaroundDays(report) {
  if (!report.startDate) return null;
  const start = new Date(report.startDate).getTime();
  const end = report.resolvedAt ? new Date(report.resolvedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function productIssueTurnaroundLabel(report) {
  const days = productIssueTurnaroundDays(report);
  if (days === null) return "N/A";
  return `${days} day${days === 1 ? "" : "s"}${report.status === "Resolved" ? "" : " (ongoing)"}`;
}

function productIssueHistory(report) {
  return report.history?.length ? report.history : [{ date: report.startDate, status: "Open", note: "Report started", by: report.performedBy }];
}

const productIssueWorkflowRoles = ["Sales", "Product Specialist", "Engineering"];
function productIssueOriginRole(role) { return productIssueWorkflowRoles.includes(role) ? role : "Sales"; }
function canActOnProductIssue(report) {
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return true;
  return currentUser?.role === (report.currentActor || report.originRole || "Sales");
}

function productIssueActionsMenu(report) {
  const actor = report.currentActor || report.originRole || "Sales";
  const locked = report.status !== "Resolved" && !canActOnProductIssue(report);
  const canEdit = canEditModule("product-issues") && report.status !== "Resolved" && !locked;
  const passButtons = actor === "Sales"
    ? [`<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Pass to Product Specialist">Pass to Product Specialist</button>`, `<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Pass to Engineering">Pass to Engineer</button>`]
    : actor === "Product Specialist"
      ? [`<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Pass to Engineering">Pass to Engineer</button>`]
      : [`<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Pass to Product Specialist">Pass to Product Specialist</button>`];
  const statusButtons = canEdit ? [
    report.status !== "In Progress" ? `<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:In Progress">In Progress</button>` : "",
    report.status !== "Resolved" ? `<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Resolved">Mark Resolved</button>` : "",
    passButtons.join(""),
    report.status !== "Open" ? `<button class="mini-button" data-product-issue-status="${escapeHtml(report.id)}:Open">Reopen</button>` : "",
  ].join("") : (report.status === "Resolved" ? `<small>Resolved &amp; locked</small>` : locked ? `<small>Locked to ${escapeHtml(actor)}</small>` : "");
  return `<details class="row-action-menu"><summary>Actions</summary><div><button class="mini-button" data-product-issue-print="${escapeHtml(report.id)}">Print</button>${statusButtons}</div></details>`;
}

function renderProductIssues() {
  qs("#product-issues [data-action='open-modal'][data-type='productIssue']").hidden = !canEditModule("product-issues");
  const statusFilter = qs("#product-issue-status")?.value || "all";
  const reports = data.productIssues.filter((report) => statusFilter === "all" || report.status === statusFilter);
  const open = data.productIssues.filter((report) => report.status === "Open").length;
  const passed = data.productIssues.filter((report) => ["Pass to Engineering", "Pass to Product Specialist"].includes(report.status)).length;
  const resolved = data.productIssues.filter((report) => report.status === "Resolved");
  const avgTurnaround = resolved.length ? Math.round(resolved.reduce((sum, report) => sum + (productIssueTurnaroundDays(report) || 0), 0) / resolved.length) : null;
  qs("#product-issue-visuals").innerHTML = [
    visualCard("🛠", "Case Status", `${open} open`, barRows([["Open", open], ["Pass to Engineering", passed], ["Resolved", resolved.length]], (value) => `${value} report${value === 1 ? "" : "s"}`, ["red", "orange", "green"]), open ? "warning" : "success", "Computed from current support report status across all logged cases."),
    visualCard("⏱", "Avg. Turnaround", avgTurnaround === null ? "No resolved cases yet" : `${avgTurnaround} day${avgTurnaround === 1 ? "" : "s"}`, `<p>Average days between start date and resolution for resolved reports.</p>`, "info", "Computed as the average of (resolved date - start date) across resolved reports."),
  ].join("");
  table("#product-issues-table", ["Document No.", "Start Date", "Company", "Equipment", "Support Type", "Status", "Performed By", "Timeline", "Actions"], reports.filter((report) => includesSearch(Object.values(report))).map((report) => ({ focus: report.id, cells: [report.id, report.startDate, report.companyName, `${report.equipment || "-"}${report.serialNo ? `<small>${report.serialNo}</small>` : ""}`, report.typeOfSupport || "-", `<span class="pill ${productIssueStatusClass(report.status)}">${escapeHtml(report.status || "Open")}</span>`, report.performedBy, `<button class="mini-button" data-product-issue-timeline="${escapeHtml(report.id)}">View Timeline</button>`, productIssueActionsMenu(report)] })));
}

function productIssueParameterSummaryHtml(report) {
  const rows = report.qcParameters?.length ? report.qcParameters : [];
  if (!rows.length) return "";
  const cell = (row, prefix) => `<td>${escapeHtml(row[`${prefix}Range`] || "-")}</td><td>${escapeHtml(row[`${prefix}Result`] || "-")}</td><td>${row[`${prefix}P`] ? "✓" : ""}</td><td>${row[`${prefix}F`] ? "✓" : ""}</td>`;
  return `<details class="full-event-details"><summary>Calibration / control parameter table</summary><div class="table-card compact-table"><table><thead><tr><th>Parameters</th><th>Calibrator Factor</th><th colspan="4">Level 1 · Lot ${escapeHtml(report.qcLevel1Lot || "-")}</th><th colspan="4">Level 2 · Lot ${escapeHtml(report.qcLevel2Lot || "-")}</th><th colspan="4">Level 3 · Lot ${escapeHtml(report.qcLevel3Lot || "-")}</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.parameter || "-")}</td><td>${escapeHtml(row.factor || "-")}</td>${cell(row, "l1")}${cell(row, "l2")}${cell(row, "l3")}</tr>`).join("")}</tbody></table></div></details>`;
}

function renderProductIssueDetail(id) {
  const report = data.productIssues.find((item) => item.id === id);
  if (!report) return toast("Support report not found.");
  const events = productIssueHistory(report);
  qs("#product-issue-detail-title").textContent = `${report.id} · ${report.companyName}`;
  qs("#product-issue-detail-panel").innerHTML = `<div class="panel-header"><div><p class="eyebrow">${escapeHtml(report.companyName)}</p><h2>${escapeHtml(report.equipment || "Equipment")}${report.serialNo ? ` · ${escapeHtml(report.serialNo)}` : ""}</h2></div><span class="pill ${productIssueStatusClass(report.status)}">${escapeHtml(report.status || "Open")}</span></div><div class="report-preview-grid invoice-mini-grid"><div class="report-preview-card"><small>Start Date</small><strong>${escapeHtml(report.startDate || "-")}</strong></div><div class="report-preview-card"><small>Turnaround</small><strong>${escapeHtml(productIssueTurnaroundLabel(report))}</strong></div><div class="report-preview-card"><small>Currently With</small><strong>${escapeHtml(report.currentActor || report.originRole || "Sales")}</strong></div><div class="report-preview-card"><small>Resolved By</small><strong>${escapeHtml(report.resolvedBy || "-")}</strong></div></div><p><strong>Contact:</strong> ${escapeHtml(report.contactPerson || "-")} · ${escapeHtml(report.address || "-")}</p><p><strong>Type of Support:</strong> ${escapeHtml(report.typeOfSupport || "-")}</p><p><strong>Topics Discussed:</strong> ${escapeHtml(report.topicsDiscussed || "-")}</p><p><strong>Concerns / Inquiries:</strong> ${escapeHtml(report.concerns || "-")}</p><p><strong>Update / Actions Taken:</strong><br>${escapeHtml(report.actionsTaken || "-").replace(/\n/g, "<br>")}</p>${productIssueParameterSummaryHtml(report)}<details class="full-event-details" open><summary>Status timeline</summary><div class="event-timeline">${events.map((event) => `<div class="event-item ${event.status === "Resolved" ? "done" : ["Pass to Engineering", "Pass to Product Specialist", "In Progress"].includes(event.status) ? "pending" : "blocked"}"><span>${escapeHtml((event.status || "O")[0])}</span><time>${escapeHtml(event.date || "")}</time><div><strong>${escapeHtml(event.status || "")}</strong><p>${escapeHtml(event.note || "-")}</p><small>${escapeHtml(event.by || "-")}</small></div></div>`).join("")}</div></details>`;
  showSection("product-issue-detail");
}

async function previewProductIssue(id) {
  clearPrintTarget();
  showReportPreviewLoading();
  const printable = await MedlaneAPI.printableProductIssue(id).catch((error) => { toast(error.message || "Unable to load support report."); qs("#report-preview-modal").close(); return null; });
  if (!printable) return;
  qs("#report-preview-title").textContent = printable.title;
  qs("#report-preview-description").textContent = printable.description;
  qs("#report-preview-content").innerHTML = printable.html;
  document.body.classList.add("print-template-overlay", "print-template-tsr");
}

function confirmResolveProductIssue(id, currentResolvedBy) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal invite-confirm-modal";
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><div><p class="eyebrow">Confirm Resolution</p><h2>Mark ${escapeHtml(id)} Resolved</h2></div><button class="icon-button" value="cancel" aria-label="Close">x</button></div><div class="field"><label for="resolve-by-select">Resolved By</label><select id="resolve-by-select" required><option value="Product Specialist"${currentResolvedBy === "Product Specialist" ? " selected" : ""}>Product Specialist</option><option value="Service Engineer"${currentResolvedBy === "Service Engineer" ? " selected" : ""}>Service Engineer</option></select></div><div class="field full"><label for="resolve-note">Resolution Note</label><textarea id="resolve-note" placeholder="Describe how this was resolved (optional)"></textarea></div><label class="ios-check-row"><input type="checkbox" id="resolve-confirm-check" /><span></span><strong>I confirm this issue has been fully resolved and no further action is needed.</strong></label><div class="modal-actions"><button class="ghost-button" value="cancel">Go Back</button><button class="primary-button" value="confirm" disabled>Mark Resolved</button></div></form>`;
    document.body.appendChild(dialog);
    const checkbox = dialog.querySelector("#resolve-confirm-check");
    const confirmBtn = dialog.querySelector(".primary-button");
    checkbox.addEventListener("change", () => { confirmBtn.disabled = !checkbox.checked; });
    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "confirm" && checkbox.checked;
      const resolvedBy = dialog.querySelector("#resolve-by-select").value;
      const note = dialog.querySelector("#resolve-note").value.trim();
      dialog.remove();
      resolve(ok ? { resolvedBy, note } : null);
    });
    dialog.showModal();
  });
}

async function updateProductIssueStatus(id, status) {
  if (!canEditModule("product-issues")) return toast("Editing is disabled for this module in User Settings.");
  const report = data.productIssues.find((item) => item.id === id);
  if (!report) return toast("Support report not found.");
  if (report.status === "Resolved") return toast("This report is resolved and locked from further changes.");
  if (!canActOnProductIssue(report)) { const actor = report.currentActor || report.originRole || "Sales"; return toast(`This report is with ${actor}. Only ${actor}, Superadmin, or CEO can update it now.`); }
  const actingRole = report.currentActor || report.originRole || "Sales";
  let resolvedBy = report.resolvedBy || "";
  let note = "";
  if (status === "Resolved") {
    const result = await confirmResolveProductIssue(id, resolvedBy);
    if (!result) return;
    resolvedBy = result.resolvedBy;
    note = result.note;
  } else {
    note = (prompt(`Action taken for marking ${id} as ${status}:`, "") || "").trim();
  }
  report.status = status;
  if (status === "Pass to Engineering") report.currentActor = "Engineering";
  else if (status === "Pass to Product Specialist") report.currentActor = "Product Specialist";
  else if (status === "Open") report.currentActor = report.originRole || "Sales";
  report.resolvedBy = status === "Resolved" ? resolvedBy : status === "Open" ? "" : report.resolvedBy;
  report.resolvedAt = status === "Resolved" ? fmtDate(today) : "";
  report.history = productIssueHistory(report);
  report.history.push({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status, note: note || `Marked ${status}`, by: currentUser?.name || "System User" });
  if (note) {
    const tag = `Action: ${actingRole} — ${note}`;
    report.actionsTaken = report.actionsTaken ? `${report.actionsTaken}\n${tag}` : tag;
  }
  await persistRecords({ productIssues: [report] });
  log("Updated support report status", "Support Tracker", `${id}: ${status}`, { save: false });
  notify("Support Report", `${id} marked ${status}.`, "product-issues", id);
  saveData(["notifications"]);
  renderProductIssues();
  if (document.body.dataset.activeSection === "product-issue-detail") renderProductIssueDetail(id);
  toast(`${id} marked ${status}.`);
}

function renderPurchaseHistory() {
  const rows = data.clients.filter((client) => includesSearch(Object.values(client))).map((client) => {
    const purchases = data.sales.filter((sale) => sale.client === client.name);
    const total = purchases.reduce((sum, sale) => sum + sale.net, 0);
    const last = purchases.map((sale) => sale.date).sort().at(-1) || "No purchase";
    const items = [...new Set(purchases.map((sale) => sale.item))].join(", ") || "-";
    const balance = purchases.reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
    return [`<button class="link-button dark" data-client-invoices="${escapeHtml(client.name)}">${escapeHtml(client.name)}</button>`, client.area, purchases.length, items, peso.format(total), peso.format(balance), last];
  });
  table("#purchase-history-table", ["Client", "Area", "Orders", "Items Purchased", "Lifetime Value", "AR Balance", "Last Purchase"], rows);
}

function renderImports() {
  const canRevert = canApproveMigrations();
  table("#imports-table", ["Date", "Module", "Source", "Records", "Status", "Actions"], data.imports.map((item, index) => {
    const revertible = !item.reverted && item.recordType && item.recordKeys?.length;
    const action = item.reverted ? `<small>Reverted</small>` : revertible ? (canRevert ? `<button class="mini-button danger-button" data-revert-import="${index}">Revert</button>` : `<small>Superadmin/CEO only</small>`) : "-";
    return { focus: `${item.date} ${item.module} ${item.file}`, cells: [item.date, item.module, item.file, item.records, `<span class="pill ${statusClass(item.status)}">${item.status}</span>`, action] };
  }));
}

function splitImportLine(row, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (const char of row) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, '"'));
}
function parseImportText() {
  const lines = qs("#csv-input").value.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0]?.includes("\t") ? "\t" : ",";
  return lines.map((line) => splitImportLine(line, delimiter));
}
function normalizedImportHeader(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function rowValue(headers, row, labels) {
  for (const label of labels) {
    const index = headers.indexOf(normalizedImportHeader(label));
    if (index >= 0) return row[index] || "";
  }
  return "";
}
function importNumber(value) { return Number(String(value || "0").replace(/[^0-9.-]/g, "")) || 0; }
function importDate(value, year, month) {
  if (!value && year && month) value = `${month} 1 ${year}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fmtDate(today) : fmtDate(parsed);
}
function detectImportKind(rows) {
  const header = rows[0]?.map(normalizedImportHeader) || [];
  if (header.includes("itemcode") && header.includes("itemdescription")) return "productsMasterlist";
  if (header.includes("customertype") && header.includes("salesaccount") && header.includes("term")) return "clientsMasterlist";
  if (header.includes("classification") && header.includes("tin") && header.includes("contactperson") && !header.includes("customertype")) return "suppliersMasterlist";
  if (header.includes("client") && (header.includes("sino") || header.includes("tsdr") || header.includes("actualsales"))) return "salesMigration";
  if (header.includes("receiptno") && (header.includes("amountpaid") || header.includes("amount"))) return "collectionsMigration";
  return "clients";
}

function importAddress(parts) { return parts.map((part) => String(part || "").trim()).filter(Boolean).join(", "); }
function importContact(parts) { return parts.map(([label, value]) => String(value || "").trim() ? `${label}: ${String(value).trim()}` : "").filter(Boolean).join(" / "); }
function inferClientArea(row, headers) {
  const code = rowValue(headers, row, ["Code"]).trim().toUpperCase();
  const province = rowValue(headers, row, ["Province"]);
  const city = rowValue(headers, row, ["City"]);
  const street = rowValue(headers, row, ["Street"]);
  const text = `${code} ${province} ${city} ${street}`.toLowerCase();
  if (code.startsWith("NCR") || text.includes("manila") || text.includes("muntinlupa") || text.includes("quezon city")) return "NCR";
  if (code.startsWith("CAR") || text.includes("baguio") || text.includes("benguet")) return "CAR";
  if (code.startsWith("R1") || code.startsWith("REG1") || text.includes("ilocos") || text.includes("la union") || text.includes("pangasinan")) return "Region I";
  if (code.startsWith("R2") || code.startsWith("REG2") || text.includes("cagayan") || text.includes("tuguegarao")) return "Region II";
  if (code.startsWith("R3") || code.startsWith("REG3") || text.includes("pampanga") || text.includes("bulacan")) return "Region III";
  if (code.startsWith("R4") || code.startsWith("REG4") || text.includes("laguna") || text.includes("cavite") || text.includes("batangas") || text.includes("rizal")) return "Region IV-A";
  if (code.startsWith("R5") || code.startsWith("REG5") || text.includes("naga") || text.includes("bicol") || text.includes("camarines")) return "Region V";
  if (text.includes("cebu") || text.includes("visayas")) return "Visayas Dealer";
  if (text.includes("davao") || text.includes("mindanao")) return "Mindanao Dealer";
  return "Unassigned Area";
}
function importedCategory(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("service")) return "Service";
  if (text.includes("supply") || text.includes("supplies")) return "Supply";
  if (text.includes("equipment")) return "Equipment";
  if (text.includes("reagent") || text.includes("diagnostic")) return "Reagent";
  return value || "Other";
}

function validateClientsMasterlistRows(rows) {
  const headers = rows[0].map(normalizedImportHeader);
  const seen = new Set();
  return rows.slice(1).map((row, index) => {
    const code = rowValue(headers, row, ["Code"]);
    const name = rowValue(headers, row, ["Name"]);
    const area = inferClientArea(row, headers);
    const issues = [];
    const key = name.trim().toLowerCase();
    if (!name) issues.push("Missing client name");
    if (name && data.clients.some((client) => client.name.toLowerCase() === key || String(client.code || "").trim().toLowerCase() === String(code).trim().toLowerCase())) issues.push("Duplicate existing client/code");
    if (key && seen.has(key)) issues.push("Duplicate input client");
    if (key) seen.add(key);
    return { row: index + 2, kind: "clientsMasterlist", code, name, area, status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}

function buildImportedClient(row, headers) {
  const area = inferClientArea(row, headers);
  const contact = importContact([["Mobile", rowValue(headers, row, ["Mobile"])], ["Landline", rowValue(headers, row, ["Landline"])], ["Fax", rowValue(headers, row, ["Fax"])], ["Email", rowValue(headers, row, ["Email"])], ["Website", rowValue(headers, row, ["Website"])], ["Contact", [rowValue(headers, row, ["Contact Person"]), rowValue(headers, row, ["Contact Role"])].filter(Boolean).join(" - ")]]);
  const term = rowValue(headers, row, ["Term"]);
  return { code: rowValue(headers, row, ["Code"]).trim(), name: rowValue(headers, row, ["Name"]).trim(), area, dealer: rowValue(headers, row, ["Customer Type"]) || "Direct", bankName: rowValue(headers, row, ["Bank Name"]), bankAccountNumber: rowValue(headers, row, ["Bank Account Number"]), salesAccount: rowValue(headers, row, ["Sales Account"]), terms: term.trim() === "" ? 30 : importNumber(term), address: importAddress([rowValue(headers, row, ["Street"]), rowValue(headers, row, ["City"]), rowValue(headers, row, ["Province"]), rowValue(headers, row, ["Country"]), rowValue(headers, row, ["Zip Code"])]), contact, tin: rowValue(headers, row, ["Tin", "TIN"]), creditLimit: 150000, docs: "", status: rowValue(headers, row, ["Status"]) || "Active", migrated: true };
}

function validateSuppliersMasterlistRows(rows) {
  const headers = rows[0].map(normalizedImportHeader);
  const seen = new Set();
  return rows.slice(1).map((row, index) => {
    const code = rowValue(headers, row, ["Code"]);
    const name = rowValue(headers, row, ["Name"]);
    const issues = [];
    const key = name.trim().toLowerCase();
    if (!name) issues.push("Missing supplier/vendor name");
    if (name && data.suppliers.some((supplier) => supplier.name.toLowerCase() === key || String(supplier.code || "").trim().toLowerCase() === String(code).trim().toLowerCase())) issues.push("Duplicate existing supplier/code");
    if (key && seen.has(key)) issues.push("Duplicate input supplier");
    if (key) seen.add(key);
    return { row: index + 2, kind: "suppliersMasterlist", code, name, area: rowValue(headers, row, ["Classification"]), status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}

function buildImportedSupplier(row, headers) {
  const classification = rowValue(headers, row, ["Classification"]);
  const contact = importContact([["Mobile", rowValue(headers, row, ["Mobile"])], ["Landline", rowValue(headers, row, ["Landline"])], ["Fax", rowValue(headers, row, ["Fax"])], ["Email", rowValue(headers, row, ["Email"])], ["Website", rowValue(headers, row, ["Website"])], ["Contact", [rowValue(headers, row, ["Contact Person"]), rowValue(headers, row, ["Contact Role"])].filter(Boolean).join(" - ")]]);
  return { code: rowValue(headers, row, ["Code"]).trim(), name: rowValue(headers, row, ["Name"]).trim(), brand: classification || "Multiple", classification, tin: rowValue(headers, row, ["Tin", "TIN"]), address: rowValue(headers, row, ["Address"]), country: rowValue(headers, row, ["Country"]), contact, status: rowValue(headers, row, ["Status"]) || "Active", migrated: true };
}

function validateProductsMasterlistRows(rows) {
  const headers = rows[0].map(normalizedImportHeader);
  const seen = new Set();
  return rows.slice(1).map((row, index) => {
    const code = rowValue(headers, row, ["ITEM CODE", "Item Code"]);
    const name = rowValue(headers, row, ["ITEM DESCRIPTION", "Item Description"]);
    const issues = [];
    const key = code.trim().toLowerCase();
    if (!code) issues.push("Missing item code");
    if (!name) issues.push("Missing item description");
    if (code && data.items.some((item) => item.code.toLowerCase() === key)) issues.push("Duplicate existing item code");
    if (key && seen.has(key)) issues.push("Duplicate input item code");
    if (key) seen.add(key);
    return { row: index + 2, kind: "productsMasterlist", code, name, area: importedCategory(rowValue(headers, row, ["ITEM CLASSIFICATION", "Item Classification"])), status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}

function buildImportedProduct(row, headers) {
  const classification = rowValue(headers, row, ["ITEM CLASSIFICATION", "Item Classification"]);
  return { code: rowValue(headers, row, ["ITEM CODE", "Item Code"]).trim(), name: rowValue(headers, row, ["ITEM DESCRIPTION", "Item Description"]).trim(), brand: "Medlane", source: "Supplier", supplier: "", category: importedCategory(classification), classification, uom: rowValue(headers, row, ["UOM"]) || "unit", terms: 30, cost: 0, price: 0, lot: "", expiry: "", migrated: true };
}
function validateSalesMigrationRows(rows) {
  const headers = rows[0].map(normalizedImportHeader);
  const seenDocuments = new Set();
  return rows.slice(1).map((row, index) => {
    const siNo = rowValue(headers, row, ["SI No."]);
    const tsDr = rowValue(headers, row, ["TS/DR"]);
    const documentNo = siNo || tsDr;
    const type = siNo ? "SI" : String(tsDr).toUpperCase().startsWith("DR") ? "DR" : "TS";
    const client = rowValue(headers, row, ["CLIENT"]);
    const product = rowValue(headers, row, ["PRODUCT"]);
    const amount = importNumber(rowValue(headers, row, ["Actual Sales", "NET Sales", "Total Price", "Invoice Amount", "Amount"]));
    const issues = [];
    if (!documentNo) issues.push("Missing SI No. or TS/DR");
    if (documentNo && documentExists(documentNo)) issues.push("Duplicate existing document");
    if (documentNo && seenDocuments.has(String(documentNo).trim().toLowerCase())) issues.push("Duplicate input document");
    if (!client) issues.push("Missing client");
    if (!product) issues.push("Missing product");
    if (amount < 0) issues.push("Invalid amount");
    if (documentNo) seenDocuments.add(String(documentNo).trim().toLowerCase());
    return { row: index + 2, kind: "salesMigration", documentNo, type, client, area: rowValue(headers, row, ["Area"]), product, status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}
function buildMigratedSale(row, headers) {
  const siNo = rowValue(headers, row, ["SI No."]);
  const tsDr = rowValue(headers, row, ["TS/DR"]);
  const documentNo = siNo || tsDr;
  const type = siNo ? "SI" : String(tsDr).toUpperCase().startsWith("DR") ? "DR" : "TS";
  const clientName = rowValue(headers, row, ["CLIENT"]);
  const area = rowValue(headers, row, ["Area"]) || "Region I";
  const product = rowValue(headers, row, ["PRODUCT"]);
  const brand = rowValue(headers, row, ["Brand"]) || "Migrated";
  const qty = importNumber(rowValue(headers, row, ["Qty"])) || 1;
  const uom = rowValue(headers, row, ["U/M", "UOM"]) || "unit";
  const price = importNumber(rowValue(headers, row, ["Unit Price"])) || importNumber(rowValue(headers, row, ["Amount", "Total Price", "Actual Sales"])) / qty || 0;
  const amount = type === "DR" ? 0 : importNumber(rowValue(headers, row, ["Amount", "Total Price", "Actual Sales", "Invoice Amount"]));
  const discount = importNumber(rowValue(headers, row, ["Discount", "LESS TPC"]));
  const tax = type === "DR" ? 0 : importNumber(rowValue(headers, row, ["12% VAT"]));
  const net = type === "DR" ? 0 : importNumber(rowValue(headers, row, ["NET Sales", "Actual Sales", "Invoice Amount", "Total Price"])) || Math.max(amount - discount + tax, 0);
  const item = data.items.find((entry) => entry.name.toLowerCase() === product.toLowerCase() || entry.code.toLowerCase() === product.toLowerCase());
  const client = data.clients.find((entry) => entry.name.toLowerCase() === clientName.toLowerCase());
  if (!client) data.clients.push({ name: clientName, area, dealer: rowValue(headers, row, ["Classification"]) || "Direct", salesperson: rowValue(headers, row, ["Sales Rep"]), terms: 30, address: rowValue(headers, row, ["Office", "Branch"]), contact: "Migrated record", tin: rowValue(headers, row, ["TIN"]), creditLimit: 150000, docs: "Migrated" });
  if (area && !platformAreas().some((entry) => entry.toLowerCase() === area.toLowerCase())) data.platformAreas.push(area);
  return { id: documentNo, documentNo, po: `MIG-${documentNo}`, client: clientName, area, dealer: rowValue(headers, row, ["Classification"]) || client?.dealer || "Direct", salesperson: rowValue(headers, row, ["Sales Rep"]) || "Migrated", type, date: importDate(rowValue(headers, row, ["Date"]), rowValue(headers, row, ["Year"]), rowValue(headers, row, ["Month"])), item: product, brand, qty, uom, amount, discount, discountReason: discount ? "Migrated discount" : "", tax, net, terms: Number(client?.terms || 30), paid: 0, status: "Active", migrated: true, migrationSource: "Sales/Collections import", migrationRemarks: rowValue(headers, row, ["Remarks"]), lines: [{ item: product, code: item?.code || `MIG-${documentNo}`.slice(0, 24), brand, qty, uom, price, lot: "Migrated", expiry: "N/A", terms: Number(client?.terms || 30) }] };
}
function validateCollectionsMigrationRows(rows) {
  const headers = rows[0].map(normalizedImportHeader);
  const seenReceipts = new Set();
  return rows.slice(1).map((row, index) => {
    const invoice = rowValue(headers, row, ["SI / TS / DR", "Document", "Invoice"]);
    const receiptNo = rowValue(headers, row, ["Receipt No."]) || `MIG-CR-${String(index + 1).padStart(4, "0")}`;
    const amount = importNumber(rowValue(headers, row, ["Amount Paid", "Amount"]));
    const sale = findSaleByDocumentInput(invoice);
    const issues = [];
    if (!sale) issues.push("Missing matching sales document");
    if (amount <= 0) issues.push("Amount must be greater than zero");
    if (sale && amount > Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0)) issues.push("Overpayment exceeds remaining balance");
    if (receiptExists(receiptNo)) issues.push("Duplicate existing receipt");
    if (seenReceipts.has(String(receiptNo).trim().toLowerCase())) issues.push("Duplicate input receipt");
    seenReceipts.add(String(receiptNo).trim().toLowerCase());
    return { row: index + 2, kind: "collectionsMigration", name: invoice, receiptNo, area: sale?.area || "-", status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}

function validateImportRows() {
  const parsed = parseImportText();
  if (!parsed.length) return [];
  const kind = detectImportKind(parsed);
  if (kind === "clientsMasterlist") return validateClientsMasterlistRows(parsed);
  if (kind === "suppliersMasterlist") return validateSuppliersMasterlistRows(parsed);
  if (kind === "productsMasterlist") return validateProductsMasterlistRows(parsed);
  if (kind === "salesMigration") return validateSalesMigrationRows(parsed);
  if (kind === "collectionsMigration") return validateCollectionsMigrationRows(parsed);
  const allowedAreas = ["Region I", "Region II", "Region III", "Region IV-A", "Region V", "Visayas Dealer", "Mindanao Dealer"];
  const seen = new Set();
  return parsed.map((cells, index) => {
    const [type, name, area, address, contact, tin] = cells;
    const issues = [];
    if (type?.toLowerCase() !== "client") issues.push("Type must be client");
    if (!name) issues.push("Missing client name");
    if (!allowedAreas.includes(area)) issues.push("Invalid area");
    if (!address || !contact || !tin) issues.push("Missing address, contact, or TIN");
    if (data.clients.some((client) => client.name.toLowerCase() === String(name).toLowerCase())) issues.push("Duplicate existing client");
    if (seen.has(String(name).toLowerCase())) issues.push("Duplicate input row");
    seen.add(String(name).toLowerCase());
    return { row: index + 1, kind: "clients", type, name, area, address, contact, tin, status: issues.length ? "Blocked" : "Ready", issues: issues.join("; ") || "Safe to import" };
  });
}

function renderImportCheck() {
  const checked = validateImportRows();
  const ready = checked.filter((row) => row.status === "Ready");
  const blocked = checked.filter((row) => row.status !== "Ready");
  const duplicateWarnings = blocked.filter((row) => /duplicate/i.test(row.issues)).length;
  const missingWarnings = blocked.filter((row) => /missing|required/i.test(row.issues)).length;
  const summary = qs("#import-preview-summary");
  if (summary) summary.innerHTML = `<article><span>Valid rows</span><strong>${ready.length}</strong></article><article><span>Skipped rows</span><strong>${blocked.length}</strong></article><article><span>Duplicate warnings</span><strong>${duplicateWarnings}</strong></article><article><span>Missing-field warnings</span><strong>${missingWarnings}</strong></article>`;
  table("#import-check-table", ["Row", "Record", "Area", "Type", "Status", "Safety Notes"], checked.map((row) => [row.row, row.name || row.documentNo || "-", row.area || "-", row.kind || "clients", `<span class="pill ${statusClass(row.status === "Ready" ? "Paid" : "Critical")}">${row.status}</span>`, row.issues]));
  return checked;
}

function importCheckedRows(checked) {
  const ready = checked.filter((row) => row.status === "Ready");
  const kind = ready[0]?.kind || checked[0]?.kind || "clients";
  if (["clientsMasterlist", "suppliersMasterlist", "productsMasterlist"].includes(kind)) {
    const parsed = parseImportText();
    const headers = parsed[0].map(normalizedImportHeader);
    if (kind === "clientsMasterlist") {
      const recordKeys = [];
      const clients = [];
      ready.forEach((item) => {
        const client = buildImportedClient(parsed[item.row - 1], headers);
        if (client.area && !platformAreas().some((area) => area.toLowerCase() === client.area.toLowerCase())) data.platformAreas.push(client.area);
        data.clients.push(client);
        clients.push(client);
        recordKeys.push(client.name);
      });
      return { module: "Clients", records: ready.length, skipped: checked.length - ready.length, recordType: "clients", recordKeys, createdRecords: { clients } };
    }
    if (kind === "suppliersMasterlist") {
      const recordKeys = [];
      const suppliers = [];
      ready.forEach((item) => { const supplier = buildImportedSupplier(parsed[item.row - 1], headers); data.suppliers.push(supplier); suppliers.push(supplier); recordKeys.push(supplier.name); });
      return { module: "Suppliers/Vendors", records: ready.length, skipped: checked.length - ready.length, recordType: "suppliers", recordKeys, createdRecords: { suppliers } };
    }
    const recordKeys = [];
    const items = [];
    ready.forEach((item) => { const product = buildImportedProduct(parsed[item.row - 1], headers); data.items.push(product); items.push(product); recordKeys.push(product.code); });
    return { module: "Products/Services", records: ready.length, skipped: checked.length - ready.length, recordType: "items", recordKeys, createdRecords: { items } };
  }
  if (kind === "salesMigration") {
    const parsed = parseImportText();
    const headers = parsed[0].map(normalizedImportHeader);
    const clientsBefore = new Set(data.clients.map((client) => client.name));
    const sales = [];
    ready.forEach((item) => { const sale = buildMigratedSale(parsed[item.row - 1], headers); data.sales.push(sale); sales.push(sale); });
    const newClients = data.clients.filter((client) => !clientsBefore.has(client.name));
    return { module: "Sales/Collections", records: ready.length, skipped: checked.length - ready.length, createdRecords: { sales, clients: newClients } };
  }
  if (kind === "collectionsMigration") {
    const parsed = parseImportText();
    const headers = parsed[0].map(normalizedImportHeader);
    let imported = 0;
    const payments = [];
    const sales = [];
    ready.forEach((item) => {
      const row = parsed[item.row - 1];
      const sale = findSaleByDocumentInput(rowValue(headers, row, ["SI / TS / DR", "Document", "Invoice"]));
      const amount = importNumber(rowValue(headers, row, ["Amount Paid", "Amount"]));
      if (!sale || amount <= 0) return;
      sale.paid = Number(sale.paid || 0) + amount;
      const payment = { invoice: sale.documentNo || sale.id, tag: collectionTagForType(sale.type), receiptNo: item.receiptNo, method: rowValue(headers, row, ["Method"]) || "Migrated", bank: rowValue(headers, row, ["Bank"]), reference: rowValue(headers, row, ["Reference", "Cheque/Reference No."]), chequeDate: rowValue(headers, row, ["Cheque Date"]), dateCollected: importDate(rowValue(headers, row, ["Date of Collection", "Date"])), dateRecorded: fmtDate(today), client: sale.client, amount, collectionStatus: "Deposited", statusHistory: collectionStatusHistory("Deposited"), migrated: true };
      data.payments.push(payment);
      payments.push(payment);
      sales.push(sale);
      imported += 1;
    });
    return { module: "Collections", records: imported, skipped: checked.length - ready.length, createdRecords: { payments, sales } };
  }
  const recordKeys = [];
  const clients = [];
  ready.forEach(({ name, area, address, contact, tin }) => {
    if (area && !platformAreas().some((item) => item.toLowerCase() === area.toLowerCase())) data.platformAreas.push(area);
    const client = { name, area, dealer: area.includes("Dealer") ? area : "Direct", address, contact, tin, creditLimit: 150000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA", migrated: true };
    data.clients.push(client);
    clients.push(client);
    recordKeys.push(name);
  });
  return { module: "Clients", records: ready.length, skipped: checked.length - ready.length, recordType: "clients", recordKeys, createdRecords: { clients } };
}

function importRevertBlockers(recordType, key) {
  const needle = String(key || "").trim().toLowerCase();
  if (!needle) return [];
  const scopes = {
    clients: ["sales", "payments", "paymentRequests", "collectionContacts", "collectionContactHistory", "warranties", "productIssues"],
    suppliers: ["inventoryPurchaseOrders", "payables", "items"],
    items: ["inventory", "sales", "inventoryPurchaseOrders", "purchaseOrders"],
  };
  const modules = scopes[recordType] || [];
  const blockers = [];
  modules.forEach((moduleKey) => {
    const records = data[moduleKey] || [];
    const matches = records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle));
    if (matches.length) blockers.push(`${matches.length} record(s) in ${moduleKey}`);
  });
  return blockers;
}

async function revertImportBatch(index) {
  if (!canApproveMigrations()) return toast("Only Superadmin or CEO can revert a migration import.");
  const entry = data.imports[index];
  if (!entry || entry.reverted || !entry.recordType || !entry.recordKeys?.length) return toast("This import cannot be reverted.");
  const blockedKeys = [];
  entry.recordKeys.forEach((key) => {
    const blockers = importRevertBlockers(entry.recordType, key);
    if (blockers.length) blockedKeys.push(`${key} (${blockers.join(", ")})`);
  });
  if (blockedKeys.length) return toast(`Cannot revert: these records are already in use — ${blockedKeys.slice(0, 3).join("; ")}${blockedKeys.length > 3 ? "…" : ""}`);
  const ok = await confirmDetailsModal({ eyebrow: "Confirm Revert", title: `Revert ${entry.module} import`, fields: [["File", entry.file], ["Records", entry.records], ["Imported", entry.date]], confirmLabel: "Revert Import", danger: true, note: "This permanently removes the records created by this import." });
  if (!ok) return;
  const keySet = new Set(entry.recordKeys.map((value) => String(value).trim().toLowerCase()));
  if (entry.recordType === "clients") data.clients = data.clients.filter((client) => !keySet.has(String(client.name).trim().toLowerCase()));
  if (entry.recordType === "suppliers") data.suppliers = data.suppliers.filter((supplier) => !keySet.has(String(supplier.name).trim().toLowerCase()));
  if (entry.recordType === "items") data.items = data.items.filter((item) => !keySet.has(String(item.code).trim().toLowerCase()));
  entry.reverted = true;
  entry.revertedAt = fmtDate(today);
  entry.revertedBy = currentUser?.name || "System User";
  await persistRecords({ imports: [entry] });
  log("Reverted migration import", "Imports", `${entry.module}: ${entry.records} record(s)`, { save: false });
  renderAll();
  toast(`${entry.module} import reverted.`);
}

function renderPayables() {
  renderPayablesWorkflowTabs();
  const requests = data.payables.filter((p) => p.requestStatus !== "Approved" && p.requestStatus !== "Cancelled");
  const approved = data.payables.filter((p) => p.requestStatus === "Approved" && !p.paymentConfirmed);
  const rows = data.payables.filter((p) => includesSearch(Object.values(p)));
  const totalPayables = rows.reduce((sum, payable) => sum + Number(payable.amount || 0), 0);
  const totalPaid = rows.reduce((sum, payable) => sum + Number(payable.paid || 0), 0);
  const balance = rows.reduce((sum, payable) => sum + Math.max(Number(payable.amount || 0) - Number(payable.paid || 0), 0), 0);
  const pendingCount = rows.filter((payable) => !["Approved", "Cancelled", "Paid"].includes(payable.requestStatus || payable.status)).length;
  const approvedCount = rows.filter((payable) => (payable.requestStatus || payable.status) === "Approved" && !payable.paymentConfirmed).length;
  const paidCount = rows.filter((payable) => payable.paymentConfirmed || (payable.status || "") === "Paid").length;
  const chequeCount = rows.filter((payable) => payable.method === "Cheque").length;
  const largestPayable = rows.reduce((max, payable) => Math.max(max, Number(payable.amount || 0)), 0);
  const averagePayable = rows.length ? Math.round(totalPayables / rows.length) : 0;
  renderFinancialSummary("#payables-summary-grid", [
    { tone: "primary", label: "Total displayed payables", value: peso.format(totalPayables), note: `${rows.length} payable${rows.length === 1 ? "" : "s"} in this view` },
    { tone: "success", label: "Total paid", value: peso.format(totalPaid), note: `${paidCount} confirmed payment${paidCount === 1 ? "" : "s"}` },
    { tone: "warning", label: "Outstanding balance", value: peso.format(balance), note: `${approvedCount} approved awaiting payment` },
  ], [
    { title: "Status Count", items: [{ label: "Pending", value: pendingCount }, { label: "Approved", value: approvedCount }, { label: "Paid", value: paidCount }] },
    { title: "Payable Size", kind: "pairs", items: [{ label: "Average", value: peso.format(averagePayable) }, { label: "Largest", value: peso.format(largestPayable) }] },
    { title: "Payment Risk", kind: "pairs", items: [{ label: "Balance", value: peso.format(balance) }, { label: "Cheques", value: chequeCount }] },
  ]);
  table("#payable-requests-table", ["ID", "Supplier", "Items", "Total", "Status", "Actions"], requests.map((p) => ({ focus: p.id, cells: [p.id, p.supplier, itemizedSummary(p.items), peso.format(p.amount), `<span class="pill ${statusClass(p.requestStatus)}">${p.requestStatus}</span>`, requestActions("payable", data.payables.indexOf(p), p)] })));
  table("#final-payables-table", ["ID", "Supplier", "Total", "Status", "Set payment type"], approved.map((p) => ({ focus: p.id, cells: [p.id, p.supplier, peso.format(p.amount), `<span class="pill success">Approved</span>`, paymentConfirmActions("payable", data.payables.indexOf(p))] })));
  table("#payables-table", ["ID", "Supplier", "Contact", "Items/Service", "Method", "Total", "Paid", "Balance", "Cheque Details", "Tag"], rows.map((p) => ({ focus: p.id, cells: [p.id, p.supplier, p.contact, itemizedSummary(p.items), p.method || "-", peso.format(p.amount), peso.format(p.paid), peso.format(p.amount - p.paid), p.method === "Cheque" ? `${p.cheque || "-"}<small>${p.bank || "No bank"}${p.chequeDate ? ` · ${p.chequeDate}` : ""}</small>` : "-", `<span class="pill ${statusClass(p.requestStatus || p.status)}">${p.requestStatus || p.status}</span>`] })));
}

function renderPayablesWorkflowTabs() {
  const counts = {
    requests: data.payables.filter((p) => p.requestStatus !== "Approved" && p.requestStatus !== "Cancelled").length,
    payment: data.payables.filter((p) => p.requestStatus === "Approved" && !p.paymentConfirmed).length,
    all: data.payables.length,
  };
  const labels = { requests: "Requests", payment: "For Payment", all: "All Payables" };
  qs("#payables-workflow-tabs")?.querySelectorAll("[data-payables-workflow]").forEach((button) => {
    const tab = button.dataset.payablesWorkflow;
    button.classList.toggle("active", tab === payablesWorkflowTab);
    button.innerHTML = `${escapeHtml(labels[tab])} <span class="tab-count">${counts[tab] || 0}</span>`;
  });
  qsa("[data-payables-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.payablesPanel === payablesWorkflowTab));
}

function renderReplenishments() {
  renderReplenishmentsWorkflowTabs();
  const rows = byBranch(data.replenishments, "office").filter((r) => includesSearch(Object.values(r)));
  const requests = rows.filter((r) => r.requestStatus !== "Approved" && r.requestStatus !== "Cancelled");
  const approved = rows.filter((r) => r.requestStatus === "Approved" && !r.paymentConfirmed);
  const totalExpenses = rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paidExpenses = rows.filter((expense) => expense.paymentConfirmed || (expense.status || "") === "Paid").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingAmount = rows.filter((expense) => !["Approved", "Cancelled", "Paid"].includes(expense.requestStatus || expense.status)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const approvedAmount = approved.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const largestExpense = rows.reduce((max, expense) => Math.max(max, Number(expense.amount || 0)), 0);
  const averageExpense = rows.length ? Math.round(totalExpenses / rows.length) : 0;
  const topType = Object.entries(sumBy(rows, "type", (expense) => Number(expense.amount || 0))).sort((a, b) => b[1] - a[1])[0];
  renderFinancialSummary("#expenses-summary-grid", [
    { tone: "primary", label: "Total displayed expenses", value: peso.format(totalExpenses), note: `${rows.length} expense request${rows.length === 1 ? "" : "s"} in this view` },
    { tone: "success", label: "Paid expenses", value: peso.format(paidExpenses), note: `${rows.filter((expense) => expense.paymentConfirmed || (expense.status || "") === "Paid").length} confirmed payment${rows.filter((expense) => expense.paymentConfirmed || (expense.status || "") === "Paid").length === 1 ? "" : "s"}` },
    { tone: "warning", label: "Pending approval", value: peso.format(pendingAmount), note: `${requests.length} request${requests.length === 1 ? "" : "s"} pending` },
  ], [
    { title: "Status Count", items: [{ label: "Pending", value: requests.length }, { label: "Approved", value: approved.length }, { label: "Paid", value: rows.filter((expense) => expense.paymentConfirmed || (expense.status || "") === "Paid").length }] },
    { title: "Expense Size", kind: "pairs", items: [{ label: "Average", value: peso.format(averageExpense) }, { label: "Largest", value: peso.format(largestExpense) }] },
    { title: "Classification", kind: "pairs", items: [{ label: topType?.[0] || "Top Type", value: topType ? peso.format(topType[1]) : peso.format(0) }, { label: "Approved", value: peso.format(approvedAmount) }] },
  ]);
  table("#expense-requests-table", ["ID", "Type", "Requester", "Items", "Amount", "Status", "Actions"], requests.map((r) => ({ focus: r.id, cells: [r.id, r.type, r.requester, itemizedSummary(r.items), peso.format(r.amount), `<span class="pill ${statusClass(r.requestStatus)}">${r.requestStatus}</span>`, requestActions("expense", data.replenishments.indexOf(r), r)] })));
  table("#confirmed-expenses-table", ["ID", "Type", "Requester", "Amount", "Status", "Payment"], approved.map((r) => ({ focus: r.id, cells: [r.id, r.type, r.requester, peso.format(r.amount), `<span class="pill success">Approved</span>`, paymentConfirmActions("expense", data.replenishments.indexOf(r))] })));
  table("#replenishments-table", ["ID", "Expense Type", "Requester", "Office", "Amount", "Receipt/File", "Status", "Payment"], rows.map((r) => ({ focus: r.id, cells: [r.id, r.type, r.requester, r.office, peso.format(r.amount), r.file, `<span class="pill ${statusClass(r.requestStatus || r.status)}">${r.requestStatus || r.status}</span>`, r.paymentConfirmed ? `${escapeHtml(r.method)}<small>${escapeHtml(r.bank || r.cheque || "")}</small>` : "-"] })));
}

function renderReplenishmentsWorkflowTabs() {
  const scoped = byBranch(data.replenishments, "office");
  const counts = {
    requests: scoped.filter((r) => r.requestStatus !== "Approved" && r.requestStatus !== "Cancelled").length,
    payment: scoped.filter((r) => r.requestStatus === "Approved" && !r.paymentConfirmed).length,
    all: scoped.length,
  };
  const labels = { requests: "Requests", payment: "For Payment", all: "All Expenses" };
  qs("#replenishments-workflow-tabs")?.querySelectorAll("[data-replenishments-workflow]").forEach((button) => {
    const tab = button.dataset.replenishmentsWorkflow;
    button.classList.toggle("active", tab === replenishmentsWorkflowTab);
    button.innerHTML = `${escapeHtml(labels[tab])} <span class="tab-count">${counts[tab] || 0}</span>`;
  });
  qsa("[data-replenishments-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.replenishmentsPanel === replenishmentsWorkflowTab));
}

function itemizedSummary(items = []) { return items.map((item) => `${escapeHtml(item.particulars || item.item || "Item")}<small>${peso.format(item.amount || 0)}</small>`).join("") || "-"; }

function requestActions(type, index) { return `<div class="inline-actions"><button class="mini-button" data-request-preview="${type}:${index}">Print</button><button class="mini-button" data-request-approve="${type}:${index}">Approve</button><button class="mini-button danger-button" data-request-cancel="${type}:${index}">Cancel</button></div>`; }

function paymentConfirmActions(type, index) { return `<div class="inline-actions"><button class="mini-button" data-confirm-payment="${type}:${index}:Cash">Cash</button><button class="mini-button" data-confirm-payment="${type}:${index}:Bank Transfer">Bank</button><button class="mini-button" data-confirm-payment="${type}:${index}:Cheque">Cheque</button></div>`; }

function requestRecord(type, index) { return type === "payable" ? data.payables[index] : data.replenishments[index]; }

async function previewFinancialRequest(type, index) {
  const record = requestRecord(type, index);
  if (!record) return toast("Request not found.");
  showReportPreviewLoading();
  const printable = await MedlaneAPI.printableFinancialRequest(type, record.id).catch((error) => { toast(error.message || "Unable to load request printable."); qs("#report-preview-modal").close(); return null; });
  if (!printable) return;
  qs("#report-preview-title").textContent = printable.title;
  qs("#report-preview-description").textContent = printable.description;
  qs("#report-preview-content").innerHTML = printable.html;
}

function confirmDetailsModal({ eyebrow = "Confirm Action", title, fields = [], note = "", confirmLabel = "Confirm", danger = false, collectReason = false, reasonLabel = "Reason" }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal invite-confirm-modal";
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">x</button></div><div class="report-preview-grid">${fields.map(([label, value]) => `<div class="report-preview-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value ?? "-"))}</strong></div>`).join("")}</div>${note ? `<p class="page-description">${escapeHtml(note)}</p>` : ""}${collectReason ? `<div class="field full"><label for="confirm-modal-reason">${escapeHtml(reasonLabel)}</label><textarea id="confirm-modal-reason" required></textarea></div>` : ""}<div class="modal-actions"><button class="ghost-button" value="cancel" formnovalidate>Go Back</button><button class="primary-button${danger ? " danger-button" : ""}" value="confirm">${escapeHtml(confirmLabel)}</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "confirm";
      const reason = collectReason ? (dialog.querySelector("#confirm-modal-reason")?.value || "").trim() : "";
      dialog.remove();
      resolve(collectReason ? { ok, reason } : ok);
    });
    dialog.showModal();
  });
}

function financialRequestDetailFields(record, type) {
  return [
    ["ID", record.id],
    [type === "payable" ? "Supplier" : "Requester", type === "payable" ? record.supplier : record.requester],
    ["Items", itemizedSummary(record.items).replace(/<[^>]*>/g, " ").trim() || "-"],
    ["Amount", peso.format(record.amount || 0)],
    ["Status", record.requestStatus || record.status || "-"],
  ];
}

async function approveFinancialRequest(type, index) {
  const record = requestRecord(type, index);
  if (!record) return;
  if (type === "payable" && !["Superadmin", "CEO"].includes(currentUser?.role)) return toast("Only Superadmin or CEO can approve payable requests.");
  const ok = await confirmDetailsModal({ eyebrow: "Confirm Approval", title: `Approve ${record.id}`, fields: financialRequestDetailFields(record, type), confirmLabel: "Approve" });
  if (!ok) return;
  record.requestStatus = "Approved"; record.status = "Approved"; record.approvedBy = currentUser?.name || "System User"; record.approvedAt = fmtDate(today);
  await persistRecords(type === "payable" ? { payables: [record] } : { replenishments: [record] });
  log(`Approved ${type} request`, type === "payable" ? "Payables" : "Expenses", record.id, { save: false });
  notify(type === "payable" ? "Payable" : "Expense", `${record.id} approved.`, type === "payable" ? "payables" : "replenishments", record.id);
  saveData(["notifications"]); renderAll(); toast(`${record.id} approved.`);
}

async function cancelFinancialRequest(type, index) {
  const record = requestRecord(type, index);
  if (!record) return;
  const ok = await confirmDetailsModal({ eyebrow: "Confirm Cancellation", title: `Cancel ${record.id}`, fields: financialRequestDetailFields(record, type), confirmLabel: "Cancel Request", danger: true });
  if (!ok) return;
  record.requestStatus = "Cancelled"; record.status = "Cancelled"; record.cancelledBy = currentUser?.name || "System User"; record.cancelledAt = fmtDate(today);
  await persistRecords(type === "payable" ? { payables: [record] } : { replenishments: [record] });
  log(`Cancelled ${type} request`, type === "payable" ? "Payables" : "Expenses", record.id, { save: false });
  notify(type === "payable" ? "Payable" : "Expense", `${record.id} cancelled.`, type === "payable" ? "payables" : "replenishments", record.id);
  saveData(["notifications"]); renderAll(); toast(`${record.id} cancelled.`);
}

function confirmPaymentDetailsModal(record, type, method) {
  return new Promise((resolve) => {
    const needsBank = ["Bank Transfer", "Cheque"].includes(method);
    const needsCheque = method === "Cheque";
    const hasBanks = data.banks.length > 0;
    const bankOptions = hasBanks
      ? data.banks.map((bank) => `<option value="${escapeHtml(bank.name)}"${bank.name === record.bank ? " selected" : ""}>${escapeHtml(bank.name)}</option>`).join("")
      : `<option value="">No banks available yet</option>`;
    const dialog = document.createElement("dialog");
    dialog.className = "modal invite-confirm-modal";
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><div><p class="eyebrow">Confirm Payment</p><h2>Mark ${escapeHtml(record.id)} Paid via ${escapeHtml(method)}</h2></div><button class="icon-button" value="cancel" aria-label="Close">x</button></div><div class="report-preview-grid">${financialRequestDetailFields(record, type).map(([label, value]) => `<div class="report-preview-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value ?? "-"))}</strong></div>`).join("")}</div>${needsBank ? `<div class="field"><label for="payment-bank-select">Bank</label><select id="payment-bank-select" ${hasBanks ? "required" : ""}>${bankOptions}</select></div>` : ""}${needsCheque ? `<div class="field"><label for="payment-cheque-number">Cheque Number</label><input id="payment-cheque-number" value="${escapeHtml(record.cheque || "")}" required /></div><div class="field"><label for="payment-cheque-date">Cheque Date</label><input id="payment-cheque-date" type="date" value="${escapeHtml(record.chequeDate || "")}" required /></div>` : ""}<div class="modal-actions"><button class="ghost-button" value="cancel">Go Back</button><button class="primary-button" value="confirm">Confirm Payment</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "confirm";
      const bank = needsBank ? dialog.querySelector("#payment-bank-select")?.value || "" : "";
      const cheque = needsCheque ? dialog.querySelector("#payment-cheque-number")?.value.trim() || "" : "";
      const chequeDate = needsCheque ? dialog.querySelector("#payment-cheque-date")?.value || "" : "";
      dialog.remove();
      resolve(ok ? { bank, cheque, chequeDate } : null);
    });
    dialog.showModal();
  });
}

async function confirmFinancialPayment(type, index, method) {
  const record = requestRecord(type, index);
  if (!record || record.requestStatus !== "Approved") return toast("Only approved requests can be confirmed paid.");
  const result = await confirmPaymentDetailsModal(record, type, method);
  if (!result) return;
  record.method = method;
  record.bank = result.bank;
  record.cheque = result.cheque;
  record.chequeDate = result.chequeDate;
  record.paid = record.amount; record.paymentConfirmed = true; record.status = "Paid";
  await persistRecords(type === "payable" ? { payables: [record] } : { replenishments: [record] });
  log(`Confirmed ${type} payment`, type === "payable" ? "Payables" : "Expenses", `${record.id} · ${method} · ${peso.format(record.amount)}`, { save: false });
  notify(type === "payable" ? "Payable" : "Expense", `${record.id} paid via ${method}.`, type === "payable" ? "payables" : "replenishments", record.id);
  saveData(["notifications"]); renderAll(); toast(`${record.id} marked paid by ${method}.`);
}

function expenseApprovalAction(expense, index) {
  if (expense.status === "For HR Approval") return `<button class="mini-button" data-approve-expense="${index}" data-next-status="Approved by HR">Approve HR</button>`;
  if (expense.status === "Approved by HR" || expense.status === "For Accounting Approval") return `<button class="mini-button" data-approve-expense="${index}" data-next-status="Approved">Approve Accounting</button>`;
  return expense.approvedBy ? `Approved by ${escapeHtml(expense.approvedBy)}` : "Completed";
}

async function approveExpense(index, nextStatus) {
  const expense = data.replenishments[index];
  if (!expense) return;
  const allowed = nextStatus === "Approved by HR" ? ["Superadmin", "HR", "Admin", "CEO"] : ["Superadmin", "Accounting", "Admin", "CEO"];
  if (!allowed.includes(currentUser?.role)) return toast(`${nextStatus} requires ${nextStatus.includes("HR") ? "HR" : "Accounting"} approval.`);
  expense.status = nextStatus;
  expense.approvedBy = currentUser?.name || "System User";
  expense.approvedAt = fmtDate(today);
  await persistRecords({ replenishments: [expense] });
  notify("Expense", `${expense.id} ${nextStatus} by ${expense.approvedBy}.`, "replenishments", expense.id);
  log("Approved expense", "Expenses", `${expense.id}: ${nextStatus}`, { save: false });
  saveData(["notifications"]);
  renderAll();
  toast(`${expense.id} ${nextStatus}.`);
}

async function renderReports() {
  if (MedlaneAPI?.session()?.access_token) {
    try {
      const payload = await MedlaneAPI.listReports(data.branch || "all");
      serverReportDefinitions = payload.reports || null;
    } catch (error) {
      serverReportDefinitions = null;
      console.warn("Server reports unavailable", error);
    }
  }
  const cards = getReportDefinitions();
  qs("#report-grid").innerHTML = cards.map((report, index) => `<article class="report-card report-launch" data-focus-record="${escapeHtml(report.title)}" data-focus-text="${escapeHtml(`${report.title} ${report.body}`)}"><div><span class="feature-icon">${report.icon}</span><strong>${report.title}</strong><p>${report.body}</p></div><button class="primary-button" data-report-preview="${index}">Open full report</button></article>`).join("");
}

function renderReportPage(index) {
  currentReportSaleId = null;
  const report = getReportDefinitions()[index];
  if (!report) return toast("Report not found.");
  qs("#report-detail-title").textContent = report.title;
  const chartRows = report.rows.slice(0, 6).map((row, rowIndex) => {
    const numeric = row.map((cell) => Number(String(cell).replace(/[^0-9.-]/g, ""))).filter(Number.isFinite).at(-1);
    return [String(row[0] || row[1] || `Row ${rowIndex + 1}`), numeric || row.length];
  });
  qs("#report-page-detail").innerHTML = `<div class="panel-header"><div><p class="eyebrow">Report Page</p><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.body)}</p></div><span class="badge">${report.rows.length} records</span></div><div class="modal-actions report-detail-actions"><button class="ghost-button" data-go-section="reports">Back to Reports</button><button class="ghost-button" data-go-section="${report.section}">${escapeHtml(report.actionLabel)}</button><button class="primary-button" id="print-report-inline" type="button">Print This Report</button></div><div class="report-preview-grid"><div class="report-preview-card"><small>Branch View</small><strong>${data.branch === "all" ? "All Areas" : escapeHtml(data.branch)}</strong></div><div class="report-preview-card"><small>Records</small><strong>${report.rows.length}</strong></div><div class="report-preview-card"><small>Connected Module</small><strong>${escapeHtml(report.actionLabel)}</strong></div></div><div class="chart-bars">${barRows(chartRows, (value) => Number(value).toLocaleString("en-PH"), ["", "green", "orange", "red"])}${graphNote("Computed from the report rows below; the last numeric value in each row drives the bar length.")}</div><div class="table-card"><table><tbody>${report.rows.slice(0, 12).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td>No records found.</td></tr>`}</tbody></table></div>`;
  showSection("report-detail");
}

function getReconRange() {
  const from = qs("#recon-date-from")?.value || "";
  const to = qs("#recon-date-to")?.value || "";
  return { from, to, label: from || to ? `${from || "Start"} to ${to || "Today"}` : "All dates" };
}

function isWithinReconRange(dateValue, range = getReconRange()) {
  if (!dateValue) return !range.from && !range.to;
  const value = fmtDate(dateValue);
  return (!range.from || value >= range.from) && (!range.to || value <= range.to);
}

function getReconScope(range = getReconRange()) {
  const sales = data.sales.filter((sale) => isWithinReconRange(sale.date, range));
  const payments = data.payments.filter((payment) => isWithinReconRange(payment.dateRecorded || payment.dateCollected, range));
  const clients = range.from || range.to ? data.clients.filter((client) => sales.some((sale) => sale.client === client.name) || payments.some((payment) => payment.client === client.name)) : data.clients;
  const transfers = data.pendingTransfers.filter((transfer) => !transfer.receivedAt || isWithinReconRange(transfer.receivedAt, range));
  return { range, sales, payments, clients, transfers };
}

function getScopedClientBalance(clientName, sales) {
  return sales.filter((sale) => sale.client === clientName && sale.status !== "Cancelled").reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
}

function getReconciliationFindings(scope = getReconScope()) {
  const findings = [];
  const docCounts = scope.sales.reduce((acc, sale) => { acc[sale.documentNo] = (acc[sale.documentNo] || 0) + 1; return acc; }, {});
  Object.entries(docCounts).filter(([, count]) => count > 1).forEach(([documentNo]) => findings.push(["Duplicate Document", documentNo, "Manual SI/TS/DR number appears more than once", "High", "sales", documentNo]));
  scope.sales.forEach((sale) => {
    const lineTotal = saleAmount(sale.lines || []);
    if (Math.abs(lineTotal - sale.amount) > 1) findings.push(["Sales Amount", sale.documentNo, `Line total ${peso.format(lineTotal)} does not match gross ${peso.format(sale.amount)}`, "High", "sales", sale.documentNo]);
    if (sale.paid > sale.net) findings.push(["Collection", sale.documentNo, "Paid amount is higher than invoice net", "High", "collections", sale.documentNo]);
    if (sale.status === "Cancelled" && !sale.replacementId) findings.push(["Cancellation", sale.documentNo, "Cancelled document has no replacement link", "Medium", "invoicing", sale.documentNo]);
    if (sale.replacementId && !scope.sales.some((entry) => entry.documentNo === sale.replacementId) && !data.sales.some((entry) => entry.documentNo === sale.replacementId)) findings.push(["Cancellation", sale.documentNo, `Replacement ${sale.replacementId} not found`, "High", "invoicing", sale.documentNo]);
    (sale.lines || []).forEach((line) => {
      if (!uomOptions.includes(line.uom)) findings.push(["UOM", sale.documentNo, `${line.item} uses unsupported UOM ${line.uom}`, "Medium", "sales", sale.documentNo]);
      if (!data.items.some((item) => item.code === line.code || item.name === line.item)) findings.push(["Item Link", sale.documentNo, `${line.item} is not in item masterlist`, "High", "masterlists", line.item]);
    });
  });
  scope.payments.forEach((payment) => {
    if (!data.sales.some((sale) => sale.id === payment.invoice || sale.documentNo === payment.invoice)) findings.push(["Payment Link", payment.invoice, "Payment does not match a sales document", "High", "collections", payment.invoice]);
    if (!payment.receiptNo) findings.push(["Collections", payment.invoice, "Missing receipt number", "High", "collections", payment.invoice]);
    if (payment.method === "Cheque" && (!payment.bank || !payment.chequeDate)) findings.push(["Collections", payment.invoice, "Cheque payment missing bank or cheque date", "High", "collections", payment.invoice]);
  });
  Object.entries(sumBy(scope.payments, "receiptNo", () => 1)).filter(([receiptNo, count]) => receiptNo && count > 1).forEach(([receiptNo]) => findings.push(["Collections", receiptNo, "Duplicate receipt number", "High", "collections", receiptNo]));
  scope.clients.forEach((client) => {
    const balance = getScopedClientBalance(client.name, scope.sales);
    if (client.creditLimit > 0 && balance > client.creditLimit) findings.push(["Credit Limit", client.name, `${peso.format(balance)} exceeds ${peso.format(client.creditLimit)} for selected dates`, "Medium", "masterlists", client.name]);
    requiredClientDocs.forEach((doc) => { if (!client.docs?.includes(doc)) findings.push(["Client Docs", client.name, `Missing ${doc}`, "Low", "masterlists", client.name]); });
  });
  scope.transfers.filter((transfer) => transfer.status === "For Receiving").forEach((transfer) => findings.push(["Stock Transfer", transfer.id, "Pending receiving confirmation", "Medium", "inventory", transfer.id]));
  return findings;
}

function getReconciliationSuccesses(findings, scope = getReconScope()) {
  const issueRecords = new Set(findings.map((row) => row[1]));
  return [
    ...scope.sales.filter((sale) => !issueRecords.has(sale.documentNo)).slice(0, 6).map((sale) => ["Sales", sale.documentNo, "Gross, net, item links, and payment balance passed", "sales", sale.documentNo]),
    ...scope.payments.filter((payment) => !issueRecords.has(payment.invoice) && !issueRecords.has(payment.receiptNo)).slice(0, 4).map((payment) => ["Collections", payment.receiptNo, "Receipt, method, and invoice link passed", "collections", payment.invoice]),
    ...scope.clients.filter((client) => !issueRecords.has(client.name)).slice(0, 4).map((client) => ["Client", client.name, "Credit limit and required documents passed", "masterlists", client.name]),
  ];
}

function periodKey(dateValue, period) {
  const d = new Date(dateValue);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  if (period === "day") return fmtDate(d);
  if (period === "quarter") return `${year} Q${Math.floor(d.getMonth() / 3) + 1}`;
  if (period === "year") return String(year);
  return `${year}-${month}`;
}

function renderReconciliationHistory() {
  table("#reconciliation-history-table", ["Run Date", "Range", "Compare By", "Findings", "High", "Medium", "Low", "Pass Rate", "View"], data.reconHistory.slice(0, 10).map((run, index) => ({ focus: run.date, cells: [run.date, run.range, run.period, run.findings, run.high, run.medium, run.low, `${run.passRate}%`, `<button class="mini-button" data-recon-history="${index}">Load Run</button>`] })));
}

function renderReconciliationTabs() {
  qsa("#reconciliation-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.reconTab === reconciliationTab));
  qsa(".recon-tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.reconPanel === reconciliationTab));
}

function applyReconciliationHistory(index) {
  const run = data.reconHistory[index];
  if (!run) return toast("Reconciliation run not found.");
  const [from, to] = String(run.range || "").split(" to ");
  qs("#recon-date-from").value = from && from !== "All dates" && from !== "Start" ? from : "";
  qs("#recon-date-to").value = to && to !== "Today" ? to : "";
  qs("#recon-period").value = run.period || "month";
  selectedReconHistoryIndex = index;
  reconciliationTab = "current";
  renderReconciliation();
  toast(`Loaded reconciliation run from ${run.date}.`);
}

function recordReconciliationRun(findings, passRate, scope) {
  const high = findings.filter((item) => item[3] === "High").length;
  const medium = findings.filter((item) => item[3] === "Medium").length;
  const low = findings.filter((item) => item[3] === "Low").length;
  const run = { id: `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), range: scope.range.label, period: qs("#recon-period")?.value || "month", findings: findings.length, high, medium, low, passRate };
  data.reconHistory.unshift(run);
  data.reconHistory = data.reconHistory.slice(0, 30);
  return run;
}

function renderReconciliation() {
  const scope = getReconScope();
  const findings = getReconciliationFindings(scope);
  const successes = getReconciliationSuccesses(findings, scope);
  const high = findings.filter((item) => item[3] === "High").length;
  const medium = findings.filter((item) => item[3] === "Medium").length;
  const low = findings.filter((item) => item[3] === "Low").length;
  const totalChecks = scope.sales.length * 5 + scope.payments.length * 3 + scope.clients.length * requiredClientDocs.length + scope.transfers.length;
  const passed = Math.max(totalChecks - findings.length, 0);
  const passRate = totalChecks ? Math.round((passed / totalChecks) * 100) : 100;
  const selectedRun = selectedReconHistoryIndex == null ? null : data.reconHistory[selectedReconHistoryIndex];
  renderReconciliationTabs();
  qs("#reconciliation-summary").innerHTML = [
    ["High Issues", high, "Needs correction"],
    ["Medium Issues", medium, "Needs review"],
    ["Low Issues", low, "Cleanup"],
    ["Pass Rate", `${passRate}%`, `${passed} passed checks of ${totalChecks}`],
    ["Date Scope", scope.range.label, `${scope.sales.length} sales · ${scope.payments.length} payments`],
  ].map(([title, value, note]) => `<article class="stat-card"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
  qs("#reconciliation-description").innerHTML = `<div class="panel-header"><div><p class="eyebrow">How It Computes</p><h2>Comparison Preview and Record Checks</h2>${selectedRun ? `<p class="selected-history-note">Viewing saved run from ${escapeHtml(selectedRun.date)}: ${selectedRun.findings} findings, ${selectedRun.passRate}% pass rate.</p>` : ""}</div><span class="badge">${scope.range.label} · ${findings.length} to fix · ${successes.length} examples passed</span></div><div class="recon-visual-grid"><div><h3>Issue Severity</h3><div class="chart-bars">${barRows([["High", high], ["Medium", medium], ["Low", low], ["Passed", passed]], (value) => `${value} check${value === 1 ? "" : "s"}`, ["red", "orange", "", "green"])}</div></div><div><h3>What is compared</h3><ul class="compact-list"><li><span>Date scope</span><strong>sales by invoice date, payments by recorded/collected date</strong></li><li><span>Sales amount</span><strong>sum(qty x price) vs gross before discount/VAT</strong></li><li><span>Collections</span><strong>paid vs net, receipt uniqueness, cheque bank/date</strong></li><li><span>Client risk</span><strong>selected-date AR against credit limit plus required docs</strong></li></ul></div></div><details class="recon-correct-records"><summary><strong><i class="collapse-icon" aria-hidden="true">›</i> Correct Records Preview</strong><span>${successes.length} passed example${successes.length === 1 ? "" : "s"}</span></summary><div class="table-card compact-table"><table><tbody>${successes.slice(0, 8).map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td><td><button class="mini-button" data-go-section="${row[3]}" data-focus-record="${escapeHtml(row[4])}">View</button></td></tr>`).join("") || `<tr><td>No passing examples available for the selected dates.</td></tr>`}</tbody></table></div></details>`;
  const period = qs("#recon-period")?.value || "month";
  const buckets = scope.sales.reduce((acc, sale) => {
    const key = periodKey(sale.date, period);
    acc[key] ||= { sales: 0, findings: 0 };
    acc[key].sales += 1;
    acc[key].findings += findings.filter((finding) => finding[1] === sale.documentNo).length;
    return acc;
  }, {});
  scope.payments.forEach((payment) => {
    const key = periodKey(payment.dateRecorded || payment.dateCollected, period);
    buckets[key] ||= { sales: 0, findings: 0 };
    buckets[key].findings += findings.filter((finding) => finding[1] === payment.invoice || finding[1] === payment.receiptNo).length;
  });
  qs("#reconciliation-comparison").innerHTML = barRows(Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => [label, values.findings]), (value) => `${value} issue${value === 1 ? "" : "s"}`, ["green", "orange", "red"]) + graphNote("Computed by grouping reconciliation findings by invoice/payment date using the selected period.");
  table("#reconciliation-table", ["Area", "Record", "What Needs Fixing", "Severity", "Fix"], findings.map((row) => [row[0], row[1], row[2], `<span class="pill ${statusClass(row[3] === "High" ? "Critical" : row[3] === "Medium" ? "Near Due" : "Available")}">${row[3]}</span>`, `<button class="mini-button" data-go-section="${row[4]}" data-focus-record="${escapeHtml(row[5])}">Fix in ${row[4]}</button>`]));
  renderReconciliationHistory();
}

function getReportDefinitions() {
  if (serverReportDefinitions) return serverReportDefinitions;
  const totalSales = byBranch(data.sales, "area").reduce((sum, s) => sum + s.net, 0);
  const totalPaid = byBranch(data.sales, "area").reduce((sum, s) => sum + s.paid, 0);
  const overdue = byBranch(data.sales, "area").filter((s) => statusForSale(s) === "Overdue").length;
  const lowStock = byBranch(data.inventory).filter((i) => ["Low Stock", "Critical"].includes(inventoryStatus(i))).length;
  return [
    { icon: "₱", title: "Sales by Territory", body: `Area, client, salesperson, SI/TS/DR, and item movement. ${peso.format(totalSales)} current view.`, section: "sales", actionLabel: "Open Sales", rows: byBranch(data.sales, "area").map((s) => [s.area, s.client, s.salesperson, s.documentNo || s.id, saleSummary(s), peso.format(s.net)]) },
    { icon: "●", title: "Collections & AR", body: `${peso.format(totalPaid)} collected. ${overdue} overdue invoice/s.`, section: "collections", actionLabel: "Open Collections", rows: byBranch(data.sales, "area").map((s) => [s.id, s.client, statusForSale(s), peso.format(s.paid), peso.format(Math.max(s.net - s.paid, 0)), fmtDate(addDays(s.date, s.terms))]) },
    { icon: "▤", title: "Reagent Expiry", body: `${lowStock} low or critical stock records with lot and expiry tracking.`, section: "inventory", actionLabel: "Open Inventory", rows: byBranch(data.inventory).map((i) => [i.item, i.branch, i.lot, i.expiry, i.qty, inventoryStatus(i)]) },
    { icon: "◆", title: "Client Documents", body: "BIR, SEC, TIN, required permits, and account attachments.", section: "masterlists", actionLabel: "Open Masterlists", rows: data.clients.map((c) => [c.name, c.area, c.tin, peso.format(c.creditLimit), c.docs]) },
    { icon: "◇", title: "Supplier Payables", body: `${data.payables.length} supplier payable records with payment method tracking.`, section: "payables", actionLabel: "Open Payables", rows: data.payables.map((p) => [p.supplier, p.item, p.method, peso.format(p.amount), peso.format(p.paid), peso.format(p.amount - p.paid), p.status]) },
    { icon: "◉", title: "Service & Warranty", body: "Equipment install, serial number, warranty, and customer support history.", section: "warranty", actionLabel: "Open Warranty", rows: data.warranties.map((w) => [w.client, w.equipment, w.serial, w.installDate, w.warrantyEnd, w.status]) },
    { icon: "◎", title: "Compliance Audit", body: "Traceable changes for corrections, exports, and approvals.", section: "logs", actionLabel: "Open Audit Logs", rows: [] },
  ];
}

function openReportPreview(index) {
  const report = getReportDefinitions()[index];
  if (!report) return toast("Report not found.");
  const totalRows = report.rows.length;
  const previewRows = report.rows.slice(0, 8);
  qs("#report-preview-title").textContent = report.title;
  qs("#report-preview-description").textContent = report.body;
  qs("#report-preview-content").innerHTML = `
    <div class="report-preview-grid">
      <div class="report-preview-card"><small>Report Type</small><strong>${escapeHtml(report.title)}</strong></div>
      <div class="report-preview-card"><small>Records</small><strong>${totalRows}</strong></div>
      <div class="report-preview-card"><small>Branch View</small><strong>${data.branch === "all" ? "All" : data.branch}</strong></div>
    </div>
    <div class="table-card"><table><tbody>${previewRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td>No records found.</td></tr>`}</tbody></table></div>
  `;
  qs("#report-preview-modal").showModal();
}

function canManageUsers() { return ["Superadmin", "CEO"].includes(currentUser?.role); }
function canUpdateDeliveryStatus() { return ["Accounting", "Superadmin", "CEO"].includes(currentUser?.role); }
function formatSessionDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
function backupRunLabel(type = "manual") {
  return String(type).toLowerCase() === "manual" ? `<span class="pill purple">Manual</span>` : `<span class="pill green">Automatic</span>`;
}
let backupsLoaded = false;
async function renderBackup() {
  if (!qs("#backup-table") || !canManageUsers()) return;
  backupsLoaded = true;
  tableSkeleton("#backup-table", ["Created", "Run", "Type", "Mode", "Records", "Size", "Source", "Actions"], 4);
  try {
    const [trackedResult, objectResult] = await Promise.allSettled([MedlaneAPI.listBackups(), MedlaneAPI.listBackupObjects()]);
    const backups = trackedResult.status === "fulfilled" ? trackedResult.value.backups || [] : [];
    const objects = objectResult.status === "fulfilled" ? objectResult.value.objects || [] : [];
    const objectKeys = new Set(backups.map((backup) => backup.object_key).filter(Boolean));
    const r2Only = objects.filter((object) => !objectKeys.has(object.key));
    const totalBytes = [...backups.map((backup) => Number(backup.size_bytes || 0)), ...r2Only.map((object) => Number(object.size || 0))].reduce((sum, size) => sum + size, 0);
    const latestObject = objects.sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0))[0];
    qs("#backup-summary-grid").innerHTML = [
      ["Backup Files", backups.length + r2Only.length, r2Only.length ? `${r2Only.length} recovered from R2 listing` : "Stored in R2"],
      ["Backup Storage", formatBytes(totalBytes), "Compressed JSON"],
      ["Latest Backup", backups[0] ? formatSessionDate(backups[0].created_at) : latestObject ? formatSessionDate(latestObject.uploaded) : "None", "Most recent recovery point"],
      ["Schedule", "3 cadences", "Weekly, monthly, yearly"],
    ].map(([title, value, note]) => `<article class="stat-card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(note)}</small></article>`).join("");
    const trackedRows = backups.map((backup) => ({ focus: backup.id, cells: [formatSessionDate(backup.created_at), backupRunLabel(backup.backup_type), `<span class="pill ${backup.backup_type === "manual" ? "purple" : "green"}">${escapeHtml(backup.backup_type)}</span>`, backup.mode, backup.records_count, formatBytes(backup.size_bytes), "Metadata + R2 verified", `<button class="mini-button" data-download-backup="${escapeHtml(backup.id)}">Download</button><button class="mini-button danger-button" data-restore-backup-id="${escapeHtml(backup.id)}" data-restore-backup-created="${escapeHtml(formatSessionDate(backup.created_at))}" data-restore-backup-records="${escapeHtml(backup.records_count)}" data-restore-backup-size="${escapeHtml(formatBytes(backup.size_bytes))}" data-restore-backup-source="Metadata">Restore</button>`] }));
    const objectRows = r2Only.map((object) => {
      const parts = String(object.key || "").split("/");
      const type = parts[2] || object.customMetadata?.backupType || "backup";
      return { focus: object.key, cells: [formatSessionDate(object.uploaded), backupRunLabel(type), `<span class="pill ${type === "manual" ? "purple" : "green"}">${escapeHtml(type)}</span>`, "compressed-full", object.customMetadata?.records || "-", formatBytes(object.size), "R2 object", `<button class="mini-button" data-download-backup-key="${escapeHtml(object.key)}">Download</button><button class="mini-button danger-button" data-restore-backup-key="${escapeHtml(object.key)}" data-restore-backup-created="${escapeHtml(formatSessionDate(object.uploaded))}" data-restore-backup-records="${escapeHtml(object.customMetadata?.records || "-")}" data-restore-backup-size="${escapeHtml(formatBytes(object.size))}" data-restore-backup-source="R2 object">Restore</button>`] };
    });
    table("#backup-table", ["Created", "Run", "Type", "Mode", "Records", "Size", "Source", "Actions"], [...trackedRows, ...objectRows]);
  } catch (error) {
    qs("#backup-summary-grid").innerHTML = `<article class="stat-card accent-red"><span>Setup Required</span><strong>Backups unavailable</strong><small>${escapeHtml(error.message)}</small></article>`;
    table("#backup-table", ["Created", "Run", "Type", "Mode", "Records", "Size", "Source", "Actions"], [["Backup tracking unavailable", "-", "Run updated Supabase schema", "-", "-", "-", "-", escapeHtml(error.message)]]);
  }
}
async function renderUserSessions(target = selectedUserSessionsTarget) {
  const modal = qs("#user-devices-modal");
  if (!modal) return;
  selectedUserSessionsTarget = target;
  if (!canManageUsers() || !target) return;
  qs("#user-devices-title").textContent = `Logged-in Devices · ${target.name || target.email || "User"}`;
  tableSkeleton("#user-sessions-table", ["User", "Device", "IP Address", "Browser", "Logged In", "Last Seen", "Status", "Action"], 4);
  try {
    const payload = await MedlaneAPI.listUserSessions({ userId: target.id, email: target.email });
    const currentSessionId = MedlaneAPI.session()?.app_session_id || "";
    const latestSessions = [...(payload.sessions || [])].sort((a, b) => new Date(b.last_seen_at || b.created_at || 0) - new Date(a.last_seen_at || a.created_at || 0)).reduce((map, session) => {
      const key = [session.user_id, session.device_name, session.browser, session.ip_address, session.revoked_at ? session.id : "active"].join("|");
      if (!map.has(key)) map.set(key, session);
      return map;
    }, new Map());
    const rows = [...latestSessions.values()].map((session) => {
      const user = session.profile || payload.user || {};
      const active = !session.revoked_at;
      const isCurrent = session.id === currentSessionId;
      return { focus: session.id, cells: [
        `${escapeHtml(user.full_name || user.email || session.user_id)}<small>${escapeHtml(user.role || "")}</small>`,
        escapeHtml(session.device_name || "Unknown device"),
        escapeHtml(session.ip_address || "-"),
        escapeHtml(session.browser || "Unknown browser"),
        formatSessionDate(session.created_at),
        formatSessionDate(session.last_seen_at),
        `<span class="pill ${active ? "green" : "gray"}">${active ? "Active" : "Revoked"}${isCurrent ? " · This device" : ""}</span>`,
        active ? `<button class="mini-button danger-button" data-revoke-session="${escapeHtml(session.id)}" ${isCurrent ? "disabled title='Use Logout for this device'" : ""}>Force Logout</button>` : "-",
      ] };
    });
    table("#user-sessions-table", ["User", "Device", "IP Address", "Browser", "Logged In", "Last Seen", "Status", "Action"], rows.length ? rows : [["No tracked sessions yet", "User must log in again after this update", "-", "-", "-", "-", "None", "-"]]);
  } catch (error) {
    table("#user-sessions-table", ["User", "Device", "IP Address", "Browser", "Logged In", "Last Seen", "Status", "Action"], [["Session tracking unavailable", "Run updated Supabase schema", "-", "-", "-", "-", "Setup required", escapeHtml(error.message)]]);
  }
}
function dedupedUsers() {
  const map = new Map();
  data.users.forEach((user, index) => {
    const key = String(user.email || user.id || user.name || "").trim().toLowerCase();
    if (!key) return;
    const previous = map.get(key) || {};
    map.set(key, { ...previous, ...user, customPermissions: user.customPermissions || previous.customPermissions, _sourceIndex: index });
  });
  return [...map.values()];
}
function userStatusClass(status = "Active") {
  const value = String(status).toLowerCase();
  if (value.includes("active")) return "green";
  if (value.includes("pending") || value.includes("invite")) return "orange";
  if (value.includes("not sent") || value.includes("disabled") || value.includes("archived")) return "red";
  return "gray";
}
function renderRoleTester() {
  const select = qs("#role-tester-select");
  const output = qs("#role-tester-output");
  if (!select || !output) return;
  const roles = Object.keys(accounts);
  const selected = roles.includes(select.value) ? select.value : currentUser?.role || roles[0];
  select.innerHTML = roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("");
  select.value = selected;
  const view = accounts[selected]?.modules || [];
  const edit = roleEditableModules[selected] || [];
  const restricted = permissionModules().filter((module) => !view.includes(module));
  output.innerHTML = [
    ["View Access", `${view.length} modules`, view.join(", ") || "None"],
    ["Edit Access", `${edit.length} modules`, edit.join(", ") || "None"],
    ["Hidden", `${restricted.length} modules`, restricted.join(", ") || "None"],
    ["Risk Level", ["Superadmin", "CEO"].includes(selected) ? "Full platform control" : edit.length ? "Operational editor" : "View / task limited", "Use custom permissions for exceptions."],
  ].map(([title, value, note]) => `<div class="report-preview-card"><small>${escapeHtml(title)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(note)}</span></div>`).join("");
}
function renderUsers() {
  qs("#users [data-action='open-modal'][data-type='user']").hidden = !canManageUsers();
  renderRoleTester();
  const users = dedupedUsers();
  table("#users-table", ["Name", "Email", "Role", "Status", "Superadmin", "Access", "Actions"], users.filter((u) => includesSearch(Object.values(u))).map((u) => {
    const index = u._sourceIndex ?? data.users.indexOf(u);
    const email = String(u.email || u.username || "").trim();
    const displayName = String(u.name || u.full_name || "").trim();
    const name = displayName && displayName.toLowerCase() !== email.toLowerCase() ? displayName : email || "-";
    const isSuperadmin = u.superadminPermissions || u.role === "Superadmin";
    const grantControl = `<label class="ios-check-row compact-doc-check user-superadmin-check"><input type="checkbox" data-user-superadmin="${index}" ${isSuperadmin ? "checked" : ""} ${canManageUsers() ? "" : "disabled"} /><span></span><strong>${isSuperadmin ? "Granted" : "Not granted"}</strong></label>`;
    const accessSummary = u.customPermissions?.enabled ? `${u.customPermissions.view?.length || 0} view / ${u.customPermissions.edit?.length || 0} edit modules` : u.access || `${u.role} default permissions`;
    const inviteStatus = u.inviteStatus || "Active";
    const resend = String(inviteStatus).toLowerCase().includes("active") ? "" : `<button class="mini-button" data-resend-invite="${index}">Resend Invite</button>`;
    const disabled = /disabled|archived/i.test(inviteStatus);
    const isSelf = String(u.email || "").trim().toLowerCase() === String(currentUser?.email || "").trim().toLowerCase() || (u.id && u.id === currentUser?.id);
    const statusAction = isSelf ? "" : `<button class="mini-button ${disabled ? "" : "danger-button"}" data-toggle-user-disabled="${index}">${disabled ? "Enable" : "Disable"}</button>`;
    const statusCell = `<span class="pill ${userStatusClass(inviteStatus)}">${escapeHtml(inviteStatus)}</span>${u.disabledReason ? `<small>${escapeHtml(u.disabledReason)}</small>` : ""}`;
    const archiveAction = isSelf ? "" : `<button class="mini-button danger-button" data-archive-user="${index}">Archive User</button>`;
    const actions = `<details class="row-action-menu"><summary>Actions</summary><div><button class="mini-button" data-view-user-sessions="${index}">Devices</button><button class="mini-button" data-copy-invite-link="${index}">Copy Invite Link</button><button class="mini-button" data-reset-user-password="${index}">Set Password</button>${resend}${statusAction}${archiveAction}</div></details>`;
    return { focus: email || name, cells: [escapeHtml(name), email || "-", `<span class="pill ${statusClass(u.role)}">${escapeHtml(u.role)}</span>`, statusCell, grantControl, escapeHtml(accessSummary), canManageUsers() ? actions : "Superadmin/CEO only"] };
  }));
}
function notificationItem(notice, index) {
  return `<div class="alert-item clickable" data-notice-index="${index}" data-go-section="${escapeHtml(notice.section || "notifications")}" data-focus-record="${escapeHtml(notice.record || "")}"><span class="alert-dot ${notice.status === "Unread" ? "orange" : "green"}"></span><div><strong>${escapeHtml(notice.type)} · ${escapeHtml(notice.status)}</strong><span>${escapeHtml(notice.message)} · ${escapeHtml(notice.date)}</span></div></div>`;
}
function renderNotifications() {
  syncGeneratedNotifications();
  const notices = visibleNotifications();
  const unread = notices.filter((notice) => notice.status === "Unread").length;
  qs("#notification-count").textContent = unread;
  qs("#notification-count").hidden = unread === 0;
  qs("#notification-toggle").classList.toggle("has-unread", unread > 0);
  qs("#notification-recent-list").innerHTML = notices.slice(0, 5).map((notice) => notificationItem(notice, data.notifications.indexOf(notice))).join("") || `<div class="alert-item"><span class="alert-dot green"></span><div><strong>No notifications</strong><span>System alerts will appear here.</span></div></div>`;
  qs("#notification-list").innerHTML = notices.map((notice) => notificationItem(notice, data.notifications.indexOf(notice))).join("") || `<div class="alert-item"><span class="alert-dot green"></span><div><strong>No notifications</strong><span>System alerts will appear here.</span></div></div>`;
}
function renderSecurity() {
  const controls = [
    ["Role-Based Access", "Users only see modules allowed for their role. Masterlist edits require Superadmin approval; money overrides are limited to Superadmin/Admin/CEO."],
    ["Money Approval Gates", requiredSecurityApprovals.join(", ")],
    ["Lost Phone Response", "Admin can immediately switch accounts, clear sessions, and review audit logs after a lost device report."],
    ["Compromised Password Response", "Use Supabase password reset, MFA, session expiry, and audit review for account recovery."],
    ["Audit Trail", "Every action is recorded server-side with user, module, date, and affected record — see Audit Logs."],
    ["Collection Safety", "Receipt numbers, collection tags, banks, cheque dates, and date-recorded values are captured for reconciliation."],
  ];
  qs("#security-grid").innerHTML = controls.map(([title, body], index) => `<article class="panel security-card"><span class="feature-icon">${["⌖", "₱", "⌕", "●", "◎", "▧"][index]}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></article>`).join("");
}
function formatLogCell(value) { return escapeHtml(String(value || "-")); }
function formatLogRecord(record) {
  const compact = String(record || "-").replace(/\s+/g, " ");
  const short = compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
  return `<span class="log-record" title="${escapeHtml(compact)}">${escapeHtml(short)}</span>`;
}
const auditLogModules = ["Add Bank", "Add Client", "Add Employee", "Add Item", "Add Supplier", "Add Warranty Record", "Audit Logs", "Authentication", "Backup", "Cancel Invoice And Make Replacement", "Collections", "Create PO", "Create Sales Invoice", "Expense Request", "Expenses", "Imports", "Inventory", "Inventory Purchase Order", "Invoicing", "Masterlists", "Payable Request", "Payables", "Payment Request", "Support Tracker", "Reconciliation", "Reports", "Settings", "User Settings", "Users"];
function renderLogFilters() {
  const selectedRole = qs("#logs-role-filter")?.value || "all";
  const selectedModule = qs("#logs-module-filter")?.value || "all";
  const roles = Object.keys(roleEditableModules).sort();
  qs("#logs-role-filter").innerHTML = [`<option value="all">All Roles</option>`, ...roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`)].join("");
  qs("#logs-module-filter").innerHTML = [`<option value="all">All Modules</option>`, ...auditLogModules.map((module) => `<option value="${escapeHtml(module)}">${escapeHtml(module)}</option>`)].join("");
  qs("#logs-role-filter").value = roles.includes(selectedRole) ? selectedRole : "all";
  qs("#logs-module-filter").value = auditLogModules.includes(selectedModule) ? selectedModule : "all";
  const userOptions = qs("#logs-user-options");
  if (userOptions) userOptions.innerHTML = dedupedUsers().map((u) => `<option value="${escapeHtml(u.name)}"></option>`).join("");
}
let logsState = { entries: [], nextCursor: null, loading: false };
function logFilterParams() {
  const from = qs("#logs-date-from")?.value || "";
  const to = qs("#logs-date-to")?.value || "";
  const role = qs("#logs-role-filter")?.value || "all";
  const module = qs("#logs-module-filter")?.value || "all";
  return {
    dateFrom: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    dateTo: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    role: role === "all" ? "" : role,
    module: module === "all" ? "" : module,
  };
}
function renderLogTable() {
  table("#logs-table", ["Date", "Role", "User", "Action", "Module", "Record", "Device", "Browser", "IP Address", "Details"], logsState.entries.map((l, index) => ({ focus: [l.record, l.action, l.user, l.ipAddress].filter(Boolean).join("|"), cells: [formatLogCell(l.date), formatLogCell(l.role), formatLogCell(l.user), formatLogCell(l.action), formatLogCell(l.module), formatLogRecord(l.record), formatLogCell(l.device || "-"), formatLogCell(l.browser || "-"), formatLogCell(l.ipAddress || "-"), `<button class="mini-button" data-log-detail="${index}">Details</button>`] })));
  const loadMoreButton = qs("#load-more-logs");
  if (loadMoreButton) loadMoreButton.hidden = !logsState.nextCursor;
}

function showAuditLogDetail(index) {
  const entry = logsState.entries[index];
  if (!entry) return toast("Audit log entry not found.");
  const dialog = document.createElement("dialog");
  dialog.className = "modal audit-detail-modal";
  const primaryRows = [["When", entry.date], ["Who", entry.user], ["Role", entry.role], ["Module", entry.module]].map(([label, value]) => `<div class="audit-detail-stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value || "-"))}</strong></div>`).join("");
  const technicalRows = [["Server captured", entry.serverCapturedAt || "-"], ["Device", entry.device], ["Browser", entry.browser], ["IP address", entry.ipAddress], ["User agent", entry.userAgent]].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><code>${escapeHtml(String(value || "-"))}</code></div>`).join("");
  dialog.innerHTML = `<div class="modal-header"><div><p class="eyebrow">Audit Detail</p><h2>${escapeHtml(entry.action || "Recorded action")}</h2></div><button class="icon-button" type="button" data-close-audit-detail aria-label="Close">x</button></div><div class="audit-detail-summary"><span class="pill ${statusClass(entry.action || "")}">${escapeHtml(entry.action || "Recorded action")}</span><strong>${escapeHtml(entry.record || "No record value captured")}</strong><small>${escapeHtml(entry.module || "System")}</small></div><div class="audit-detail-grid">${primaryRows}</div><details class="audit-technical-detail"><summary><strong>Technical details</strong><span>Device, IP, browser, user agent</span></summary><div>${technicalRows}</div></details>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-close-audit-detail]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
async function renderLogs() {
  renderLogFilters();
  logsState = { entries: [], nextCursor: null, loading: true };
  tableSkeleton("#logs-table", ["Date", "Role", "User", "Action", "Module", "Record", "Device", "Browser", "IP Address", "Details"], 6);
  try {
    const result = await MedlaneAPI.listLogs({ ...logFilterParams(), limit: 50 });
    logsState = { entries: result.entries || [], nextCursor: result.nextCursor || null, loading: false };
  } catch (error) {
    logsState = { entries: [], nextCursor: null, loading: false };
    toast(error.message || "Could not load audit logs.");
  }
  renderLogTable();
}
async function loadMoreLogs() {
  if (!logsState.nextCursor || logsState.loading) return;
  logsState.loading = true;
  try {
    const result = await MedlaneAPI.listLogs({ ...logFilterParams(), limit: 50, before: logsState.nextCursor });
    logsState.entries = [...logsState.entries, ...(result.entries || [])];
    logsState.nextCursor = result.nextCursor || null;
  } catch (error) {
    toast(error.message || "Could not load more audit logs.");
  }
  logsState.loading = false;
  renderLogTable();
}
let notificationLogsState = { entries: [], nextCursor: null, loading: false };
function notificationLogFilterParams() {
  const from = qs("#notification-logs-date-from")?.value || "";
  const to = qs("#notification-logs-date-to")?.value || "";
  const channel = qs("#notification-logs-channel-filter")?.value || "all";
  return {
    dateFrom: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    dateTo: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    module: channel === "all" ? "Discord,Email" : channel,
  };
}
function notificationLogToneClass(action) {
  const value = String(action || "").toLowerCase();
  if (value.includes("failed")) return "red";
  if (value.includes("skipped")) return "orange";
  return "green";
}
function renderNotificationLogTable() {
  table("#notification-logs-table", ["Date", "Channel", "Action", "Details"], notificationLogsState.entries.map((l) => ({ focus: [l.record, l.action].filter(Boolean).join("|"), cells: [formatLogCell(l.date), `<span class="pill ${notificationLogToneClass(l.action)}">${formatLogCell(l.module)}</span>`, formatLogCell(l.action), formatLogRecord(l.record)] })));
  const loadMoreButton = qs("#load-more-notification-logs");
  if (loadMoreButton) loadMoreButton.hidden = !notificationLogsState.nextCursor;
}
async function renderNotificationLogs() {
  notificationLogsState = { entries: [], nextCursor: null, loading: true };
  tableSkeleton("#notification-logs-table", ["Date", "Channel", "Action", "Details"], 5);
  try {
    const result = await MedlaneAPI.listLogs({ ...notificationLogFilterParams(), limit: 50 });
    notificationLogsState = { entries: result.entries || [], nextCursor: result.nextCursor || null, loading: false };
  } catch (error) {
    notificationLogsState = { entries: [], nextCursor: null, loading: false };
    toast(error.message || "Could not load Discord/email logs.");
  }
  renderNotificationLogTable();
}
async function loadMoreNotificationLogs() {
  if (!notificationLogsState.nextCursor || notificationLogsState.loading) return;
  notificationLogsState.loading = true;
  try {
    const result = await MedlaneAPI.listLogs({ ...notificationLogFilterParams(), limit: 50, before: notificationLogsState.nextCursor });
    notificationLogsState.entries = [...notificationLogsState.entries, ...(result.entries || [])];
    notificationLogsState.nextCursor = result.nextCursor || null;
  } catch (error) {
    toast(error.message || "Could not load more Discord/email logs.");
  }
  notificationLogsState.loading = false;
  renderNotificationLogTable();
}
let userAuditLogState = { user: "", entries: [], nextCursor: null, loading: false };
const userAuditLogWideDateFrom = "2020-01-01T00:00:00.000Z";
function userAuditLogEventTone(action) {
  const value = String(action || "").toLowerCase();
  if (value.includes("delete") || value.includes("cancel") || value.includes("reject") || value.includes("disable") || value.includes("revert")) return "blocked";
  if (value.includes("approve") || value.includes("resolve") || value.includes("complete") || value.includes("add") || value.includes("create") || value.includes("invite")) return "done";
  return "pending";
}
function renderUserAuditLogTimeline() {
  const timeline = qs("#user-audit-log-timeline");
  if (!timeline) return;
  timeline.innerHTML = userAuditLogState.entries.length
    ? userAuditLogState.entries.map((entry) => {
        const tone = userAuditLogEventTone(entry.action);
        const details = [entry.device, entry.browser, entry.ipAddress].filter(Boolean).join(" · ");
        return `<div class="event-item ${tone}"><span>${escapeHtml((entry.module || entry.action || "?")[0])}</span><time>${escapeHtml(entry.date || "-")}</time><div><strong>${escapeHtml(entry.action || "-")}</strong><p>${escapeHtml(entry.module || "-")}${entry.record ? ` — ${escapeHtml(String(entry.record).slice(0, 160))}` : ""}</p>${details ? `<small>${escapeHtml(details)}</small>` : ""}</div></div>`;
      }).join("")
    : `<p>No recorded actions found for this user.</p>`;
  const loadMoreButton = qs("#load-more-user-logs");
  if (loadMoreButton) loadMoreButton.hidden = !userAuditLogState.nextCursor;
  const summary = qs("#user-audit-log-summary");
  if (summary) summary.textContent = userAuditLogState.entries.length ? `${userAuditLogState.entries.length} action${userAuditLogState.entries.length === 1 ? "" : "s"} found for ${userAuditLogState.user}, newest first.` : `No actions found for ${userAuditLogState.user}.`;
}
async function openUserAuditLog(userName) {
  const name = String(userName || "").trim();
  if (!name) return toast("Type a user's name to search.");
  qs("#user-audit-log-title").textContent = `${name}'s Activity Log`;
  userAuditLogState = { user: name, entries: [], nextCursor: null, loading: true };
  showSection("user-audit-log");
  renderUserAuditLogTimeline();
  try {
    const result = await MedlaneAPI.listLogs({ user: name, dateFrom: userAuditLogWideDateFrom, limit: 50 });
    userAuditLogState = { user: name, entries: result.entries || [], nextCursor: result.nextCursor || null, loading: false };
  } catch (error) {
    userAuditLogState.loading = false;
    toast(error.message || "Could not load this user's activity log.");
  }
  renderUserAuditLogTimeline();
}
async function loadMoreUserAuditLog() {
  if (!userAuditLogState.nextCursor || userAuditLogState.loading) return;
  userAuditLogState.loading = true;
  try {
    const result = await MedlaneAPI.listLogs({ user: userAuditLogState.user, dateFrom: userAuditLogWideDateFrom, limit: 50, before: userAuditLogState.nextCursor });
    userAuditLogState.entries = [...userAuditLogState.entries, ...(result.entries || [])];
    userAuditLogState.nextCursor = result.nextCursor || null;
  } catch (error) {
    toast(error.message || "Could not load more activity.");
  }
  userAuditLogState.loading = false;
  renderUserAuditLogTimeline();
}
function renderAll() { renderBranchFilter(); renderDashboard(); renderCalendarSection(); renderAnalytics(); renderMasterlists(); renderInventory(); renderSales(); renderPurchaseOrders(); renderInvoicing(); renderCollections(); renderReceivablesTracker(); renderClientInvoices(); renderWarranty(); renderProductIssues(); renderPurchaseHistory(); renderImports(); renderPayables(); renderReplenishments(); renderReports(); renderReconciliation(); renderUsers(); renderNotifications(); renderSecurity(); renderPlatformSettings(); if (backupsLoaded || document.body.dataset.activeSection === "backup") renderBackup(); if (document.body.dataset.activeSection === "logs") renderLogs(); renderUserMenu(); renderUserSettings(); renderWorkflowAssistAll(); }

async function runReconciliationWorkflow() {
  const scope = getReconScope();
  const findings = getReconciliationFindings(scope);
  const totalChecks = scope.sales.length * 5 + scope.payments.length * 3 + scope.clients.length * requiredClientDocs.length + scope.transfers.length;
  const passRate = totalChecks ? Math.round((Math.max(totalChecks - findings.length, 0) / totalChecks) * 100) : 100;
  const run = recordReconciliationRun(findings, passRate, scope);
  await persistRecords({ reconHistory: [run] });
  renderReconciliation();
  renderWorkflowAssist("reconciliation");
  log("Ran reconciliation", "Reconciliation", `${scope.range.label} · ${findings.length} findings`, { save: false });
  toast("Reconciliation completed and saved to history.");
}

function handleWorkflowAction(action) {
  if (action.startsWith("open-inventory:")) {
    const record = action.slice("open-inventory:".length);
    qs("#inventory-status").value = "all";
    renderInventory();
    goToFocused("inventory", record);
    return toast("Inventory record opened.");
  }
  if (action.startsWith("open-ar:")) {
    const record = action.slice("open-ar:".length);
    arTrackerTab = "all";
    renderReceivablesTracker();
    goToFocused("receivables-tracker", record);
    return toast("AR tracker record opened.");
  }
  if (action.startsWith("open-warranty:")) {
    const record = action.slice("open-warranty:".length);
    renderWarranty();
    goToFocused("warranty", record);
    return toast("Warranty record opened.");
  }
  if (action.startsWith("open-payable:")) {
    const record = action.slice("open-payable:".length);
    renderPayables();
    goToFocused("payables", record);
    return toast("Payable record opened.");
  }
  if (action.startsWith("open-issue:")) {
    const record = action.slice("open-issue:".length);
    renderProductIssues();
    goToFocused("product-issues", record);
    return toast("Support report opened.");
  }
  if (action === "filter-low-stock") {
    qs("#inventory-status").value = "Low Stock";
    renderInventory();
    showSection("inventory");
    return toast("Inventory filtered to low stock.");
  }
  if (action === "queue-collections") {
    showSection("collections");
    const target = data.collectionContacts.find((contact) => ["Pending", "Unreached", "No Response"].includes(contact.status));
    if (target) setTimeout(() => openContactRegion(target.area, target.client), 80);
    return toast("Collections queue opened.");
  }
  if (action === "bulk-remind") {
    let count = 0;
    data.collectionContacts.forEach((contact) => {
      if (["Pending", "Unreached", "No Response"].includes(contact.status)) {
        contact.channels = [...new Set([...(contact.channels || []), "Email"])] ;
        contact.status = contact.status === "Pending" ? "Unreached" : contact.status;
        contact.lastContact = fmtDate(today);
        contact.employee = currentUser?.name || "System User";
        contact.notes = "Batch reminder sent; waiting for reply.";
        count += 1;
      }
    });
    if (count) {
      data.collectionContactHistory.unshift({ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), area: "All", client: "Batch reminder", channels: "Email", status: "Unreached", employee: currentUser?.name || "System User", notes: `${count} pending clients reminded.` });
      log("Sent batch collection reminders", "Collections", `${count} clients`);
      saveData();
      renderAll();
    }
    showSection("collections");
    return toast(count ? `${count} reminder(s) marked.` : "No pending reminders.");
  }
  if (action === "check-import") {
    showSection("imports");
    renderImportCheck();
    return toast("Import safety check completed.");
  }
  if (action === "run-reconciliation") {
    showSection("reconciliation");
    return runReconciliationWorkflow();
  }
}

const modalConfigs = {
  client: { title: "Add Client", fields: [["name", "Client Name"], ["area", "Area", "select", () => platformAreas()], ["dealer", "Account Type", "select", ["Direct", "Dealer"]], ["salesperson", "Assigned Sales Person", "select", () => data.users.filter((user) => ["Sales", "Admin", "CEO"].includes(user.role)).map((user) => user.name)], ["terms", "Client Terms (days)", "number"], ["address", "Address", "textarea"], ["contact", "Contact Information", "department-contacts"], ["tin", "TIN No.", "tin"], ["creditLimit", "Credit Limit", "number"], ["docs", "Required Documents", "doc-files"]] },
  item: { title: "Add Item", fields: [["code", "Item Code"], ["name", "Item Name"], ["brand", "Brand", "datalist", () => [...new Set([...data.items.map((item) => item.brand), ...data.suppliers.map((supplier) => supplier.brand)].filter(Boolean))]], ["classification", "Classification", "select", productClassificationOptions], ["uom", "Default Unit of Measurement", "select", uomOptions], ["supplier", "Supplier", "datalist", () => data.suppliers.map((supplier) => supplier.name)]] },
  bank: { title: "Add Bank", fields: [["name", "Bank Name"], ["account", "Account / Purpose"], ["notes", "Notes", "textarea"]] },
  supplier: { title: "Add Supplier", fields: [["name", "Supplier Name"], ["classification", "Classification", "select", supplierClassificationOptions], ["brand", "Brand Supplied", "datalist", () => [...new Set(data.items.map((item) => item.brand).filter(Boolean))]], ["address", "Address", "textarea"], ["contact", "Contact Information"], ["tin", "TIN No.", "tin"]] },
  employee: { title: "Add Employee", fields: [["name", "Employee Name"], ["role", "Role"], ["contact", "Contact Information"], ["salary", "Salary Amount", "number"], ["benefits", "Govt. Benefits", "benefit-checkboxes"]] },
  purchaseOrder: { title: "Create PO", fields: [["client", "Client", "datalist", () => data.clients.map((c) => c.name)], ["date", "Purchase Order Date", "date"]] },
  invoice: { title: "Create Sales Invoice", fields: [["type", "Type", "select", ["SI", "TS", "DR"]], ["documentNo", "Manual SI / TS / DR No."], ["client", "Client", "datalist", () => data.clients.map((c) => c.name)], ["po", "Purchase Order No.", "datalist", () => data.purchaseOrders.filter(poInvoiceable).map((po) => po.id)], ["sourceBranch", "Stock From", "select", () => platformBranches()], ["date", "Invoice Date", "date"], ["vatCode", "VAT Code", "select", ["VAT", "NO VAT"]], ["discount", "Overall Discount", "number"], ["discountReason", "Overall Discount Reason", "textarea"]] },
  cancelReplace: { title: "Cancel Invoice And Make Replacement", fields: [["oldInvoice", "Cancelled Invoice", "hidden"], ["reason", "Cancellation Reason", "textarea"], ["type", "New Type", "select", ["SI", "TS", "DR"]], ["documentNo", "New Manual SI / TS / DR No."], ["client", "Client", "datalist", () => data.clients.map((c) => c.name)], ["po", "New Purchase Order No.", "datalist", () => data.purchaseOrders.filter((po) => !["Sales Invoice", "Transmittal Slip"].includes(poStatus(po))).map((po) => po.id)], ["sourceBranch", "Stock From", "select", () => platformBranches()], ["date", "Invoice Date", "date"], ["vatCode", "VAT Code", "select", ["VAT", "NO VAT"]], ["discount", "Overall Discount", "number"], ["discountReason", "Overall Discount Reason", "textarea"]] },
  paymentRequest: { title: "Add Collection", fields: [["employee", "Client", "datalist", () => data.clients.map((client) => client.name)], ["invoice", "Invoice(s) Being Paid (optional)", "multi-invoice"], ["department", "Department"], ["cvNo", "CR/PR No."], ["date", "Date", "date"], ["paymentType", "Type of Payment", "select", ["Cash", "Check", "Debit Memo"]], ["bank", "Bank", "select", () => data.banks.map((bank) => bank.name)], ["cheque", "Cheque No."], ["chequeDate", "Cheque Date", "date"], ["withholdingTax", "Eligible for WTax 5%", "checkbox"], ["expandedWithholdingTax", "Eligible for EWT 1%", "checkbox"]] },
  payable: { title: "Payable Request", fields: [["supplier", "Vendor", "datalist", () => data.suppliers.map((s) => s.name)], ["contact", "Contact Info"], ["date", "Date", "date"], ["requestNote", "Request Notes", "textarea"]] },
  replenishment: { title: "Expense Request", fields: [["type", "Type", "select", ["Petty Cash", "Per Diem", "Operating Expense", "Revolving Fund"]], ["requester", "Requester", "readonly"], ["office", "Office", "select", ["Las Pinas", "Naga"]], ["date", "Date", "date"], ["file", "Receipt/File Name"]] },
  inventoryPurchaseOrder: { title: "Inventory Purchase Order", fields: [["supplier", "Supplier", "datalist", () => data.suppliers.map((s) => s.name)], ["branch", "Receiving Branch", "select", () => platformBranches()], ["date", "PO Date", "date"]] },
  warranty: { title: "Add Warranty Record", fields: [["client", "Client", "select", () => data.clients.map((c) => c.name)], ["equipment", "Equipment"], ["serial", "Serial No."], ["installDate", "Install Date", "date"], ["warrantyEnd", "Warranty End", "date"], ["status", "Status", "select", ["Active", "Expiring Soon", "Expired", "For Service"]], ["service", "Service Notes", "textarea"]] },
  user: { title: "Invite User", fields: [["name", "Name"], ["email", "Email", "email"], ["role", "Role", "select", ["Superadmin", "Admin", "Sales", "Accounting", "Logistics", "Product Specialist", "Engineering", "CEO", "HR"]], ["permissions", "Custom Permissions", "user-permissions"]] },
  productIssue: { title: "New Support Report", fields: [["id", "Document Number"], ["startDate", "Start Date", "date"], ["companyName", "Company Name", "datalist", () => data.clients.map((c) => c.name)], ["address", "Address", "textarea"], ["contactPerson", "Contact Person"], ["typeOfSupport", "Type of Support", "checkbox-group", supportTypeOptions], ["topicsDiscussed", "Topics Discussed", "checkbox-group", supportTopicOptions], ["equipment", "Equipment / Model", "datalist", () => data.items.map((item) => item.name)], ["serialNo", "Serial No./ Lot No."], ["concerns", "Concerns / Inquiries", "textarea"], ["actionsTaken", "Update / Actions Taken", "textarea-optional"], ["status", "Resolution Status", "select", ["Open", "In Progress", "Resolved", "Pass to Engineering", "Pass to Product Specialist"]], ["resolvedBy", "Resolved By", "select", ["", "Product Specialist", "Service Engineer"]], ["performedBy", "Performed By (started the report)", "readonly"], ["conforme", "Conforme (Client Representative)"]] },
};

function openModal(type, edit = null) {
  modalType = type;
  editContext = edit?.record ? edit : null;
  const config = modalConfigs[type];
  qs("#demo-modal").classList.toggle("wide-modal", ["invoice", "cancelReplace", "purchaseOrder", "inventoryPurchaseOrder", "user", "productIssue"].includes(type));
  qs("#demo-modal").classList.toggle("inventory-po-modal", type === "inventoryPurchaseOrder");
  const isEditRecord = Boolean(edit?.record);
  qs("#modal-title").textContent = isEditRecord ? config.title.replace("Add", "Edit") : config.title;
  qs("#modal-submit").textContent = type === "paymentRequest" ? "Save & Preview" : "Save Record";
  qs("#modal-kicker").textContent = isEditRecord ? "Admin Correction" : "Admin Input";
  const fields = config.fields;
  qs("#modal-fields").innerHTML = fields.map(([name, label, kind = "text", options]) => {
    const full = kind === "textarea" ? " full" : "";
    if (kind === "select") {
      const values = typeof options === "function" ? options() : options;
      const hasValues = values.length > 0;
      const optionsHtml = hasValues ? values.map((value) => `<option>${escapeHtml(value)}</option>`).join("") : `<option value="">No ${label.toLowerCase()} available yet</option>`;
      return `<div class="field${full}"><label for="${name}">${label}</label><select id="${name}" name="${name}" ${hasValues ? "required" : ""}>${optionsHtml}</select></div>`;
    }
    if (kind === "tin") return `<div class="field${full}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="text" inputmode="numeric" placeholder="000-000-000-000" maxlength="15" pattern="\\d{3}-\\d{3}-\\d{3}-\\d{3}" title="Enter a 12-digit TIN as 000-000-000-000" data-tin-input /></div>`;
    if (kind === "datalist" || kind === "datalist-optional") {
      const values = typeof options === "function" ? options() : options;
      return `<div class="field${full}"><label for="${name}">${label}</label><input id="${name}" name="${name}" list="${name}-options" ${kind === "datalist" ? "required" : ""} /><datalist id="${name}-options">${values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist></div>`;
    }
    if (kind === "readonly") return `<div class="field${full}"><label for="${name}">${label}</label><input id="${name}" name="${name}" readonly required /></div>`;
    if (kind === "textarea" || kind === "textarea-optional") return `<div class="field full"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" ${kind === "textarea" ? "required" : ""}></textarea></div>`;
    if (kind === "hidden") return `<input id="${name}" name="${name}" type="hidden" />`;
    if (kind === "checkbox") return `<label class="ios-check-row"><input id="${name}" name="${name}" type="checkbox" value="true" /><span></span><strong>${label}</strong></label>`;
    if (kind === "doc-files") return `<div class="field full"><label>${label}</label><div class="doc-upload-grid modal-doc-upload-grid">${requiredClientDocs.map((doc) => `<label class="doc-upload-button missing"><span>${escapeHtml(doc)}</span><strong>Upload File</strong><em>Choose document</em><input class="doc-file-input" name="docsSelected" type="file" data-doc-name="${escapeHtml(doc)}" /></label>`).join("")}</div><input id="docs" name="docs" type="hidden" /></div>`;
    if (kind === "user-permissions") return `<div class="field full user-permissions-field"><label>${label}</label><p class="field-help">Selecting a role preselects the allowed modules. Check extra boxes to grant additional view or edit access.</p><div id="user-permissions-panel"></div></div>`;
    if (kind === "benefit-checkboxes") return `<div class="field full"><label>${label}</label><div class="doc-checkbox-grid">${employeeBenefitOptions.map((benefit) => `<label class="ios-check-row compact-doc-check"><input name="benefitsSelected" type="checkbox" value="${escapeHtml(benefit)}" /><span></span><strong>${escapeHtml(benefit)}</strong></label>`).join("")}</div><input id="benefits" name="benefits" type="hidden" /></div>`;
    if (kind === "checkbox-group") {
      const values = typeof options === "function" ? options() : options;
      return `<div class="field full"><label>${label}</label><div class="doc-checkbox-grid">${values.map((value) => `<label class="ios-check-row compact-doc-check"><input name="${name}Selected" type="checkbox" value="${escapeHtml(value)}" /><span></span><strong>${escapeHtml(value)}</strong></label>`).join("")}</div><input id="${name}" name="${name}" type="hidden" /></div>`;
    }
    if (kind === "multi-invoice") return `<div class="field full"><label>${label}</label><div id="payment-request-invoice-list" class="doc-checkbox-grid"><p class="field-help">Select a client to see their unpaid/partially paid invoices.</p></div><p class="field-help">Payment is applied to the oldest selected invoice first.</p><input id="${name}" name="${name}" type="hidden" /></div>`;
    if (kind === "department-contacts") return `<div class="field full department-contacts-field"><label>${label}</label><p class="field-help">Format shown below is a guide, not required — leave any line blank if not applicable.</p><div class="department-contacts-grid">${clientContactDepartments.map(([key, deptLabel]) => `<fieldset class="department-contact-block"><legend>${escapeHtml(deptLabel)}</legend><div class="field"><label>Contact Person</label><input class="dept-contact-input" data-dept="${key}" data-dept-field="person" /></div><div class="field"><label>Contact No.</label><input class="dept-contact-input" data-dept="${key}" data-dept-field="phone" /></div><div class="field"><label>E-mail Add.</label><input class="dept-contact-input" data-dept="${key}" data-dept-field="email" type="email" /></div></fieldset>`).join("")}</div><input id="${name}" name="${name}" type="hidden" /><input id="contactDepartments" name="contactDepartments" type="hidden" /></div>`;
    return `<div class="field${full}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${kind}" ${kind === "date" && name.toLowerCase().includes("expiry") ? `min="${fmtDate(today)}"` : ""} ${kind !== "date" && name !== "creditLimit" ? "required" : ""} /></div>`;
  }).join("");
  if (type === "purchaseOrder") qs("#modal-fields").insertAdjacentHTML("beforeend", renderInvoiceEditor([{}], { requireLot: false }));
  if (["invoice", "cancelReplace"].includes(type)) qs("#modal-fields").insertAdjacentHTML("beforeend", renderInvoiceEditor());
  if (type === "inventoryPurchaseOrder") qs("#modal-fields").insertAdjacentHTML("beforeend", renderInvoiceEditor([{}], { requireLot: true, allowDiscount: true }));
  if (type === "productIssue") qs("#modal-fields").insertAdjacentHTML("beforeend", renderProductIssueParameterTable(edit?.record?.qcParameters?.length ? edit.record.qcParameters : [{}], edit?.record || {}));
  if (type === "purchaseOrder") qs("#date").value = fmtDate(today);
  if (type === "inventoryPurchaseOrder") qs("#date").value = fmtDate(today);
  if (type === "invoice") {
    const date = qs("#date");
    date.value = fmtDate(today);
    qs("#sourceBranch").value = inventoryBranchTab || platformBranches()[0] || "";
    qs("#vatCode").value = "VAT";
    qs("#discount").value = 0;
    qs("#discountReason").required = false;
    updateDocumentLabel();
    syncInvoicePurchaseOrders();
  }
  if (type === "cancelReplace") {
    const oldSale = data.sales.find((sale) => sale.id === edit?.oldInvoice);
    qs("#oldInvoice").value = edit?.oldInvoice || "";
    qs("#date").value = fmtDate(today);
    qs("#sourceBranch").value = oldSale?.sourceBranch || oldSale?.lines?.[0]?.sourceBranch || inventoryBranchTab || platformBranches()[0] || "";
    qs("#vatCode").value = oldSale?.vatCode || "VAT";
    qs("#discount").value = oldSale?.discount || 0;
    qs("#discountReason").required = false;
    updateDocumentLabel();
    if (oldSale) {
      qs("#client").value = oldSale.client;
      qs("#po").value = oldSale.po || "";
      qs("#discountReason").value = oldSale.discountReason || "";
      qs("#invoice-line-list").innerHTML = (oldSale.lines || []).map((line) => invoiceLineTemplate(line)).join("");
    }
  }
  if (["payable", "replenishment"].includes(type)) {
    qs("#modal-fields").insertAdjacentHTML("beforeend", renderFinancialRequestEditor());
    syncFinancialRequestTotal();
    if (!edit) qs("#date").value = fmtDate(today);
  }
  if (type === "paymentRequest") qs("#modal-fields").insertAdjacentHTML("beforeend", renderPaymentRequestEditor(edit?.record?.items || [{}]));
  if (type === "payable") togglePayableFields();
  if (type === "user") {
    qs("#role").value = "Admin";
    syncInviteUserPermissions();
  }
  if (type === "productIssue" && !edit) {
    qs("#id").value = nextProductIssueId();
    qs("#startDate").value = fmtDate(today);
    qs("#performedBy").value = currentUser?.name || "System User";
    qs("#status").value = "Open";
    toggleProductIssueResolvedByField();
  }
  if (type === "replenishment" && !edit) {
    qs("#requester").value = currentUser?.name || "System User";
  }
  if (type === "client" && !edit) {
    qs("#creditLimit").value = 150000;
    qs("#terms").value = 30;
    syncClientDocsHidden();
  }
  if (type === "paymentRequest" && !edit) {
    qs("#department").value = currentUser?.role || "Accounting";
    qs("#date").value = fmtDate(today);
    qs("#cvNo").value = nextCvNumber(cvYear(qs("#date").value));
    qs("#total").value = "0.00";
    togglePaymentRequestChequeFields();
    syncPaymentRequestInvoiceOptions();
    syncPaymentRequestTotal();
  }
  if (type === "employee" && !edit) {
    qsa("input[name='benefitsSelected']").forEach((input) => { input.checked = true; });
    syncEmployeeBenefitsHidden();
    if (!canManageEmployeeSalary()) {
      qs("#salary").value = "";
      qs("#salary").placeholder = "CEO Only";
      qs("#salary").readOnly = true;
      qs("#salary").required = false;
    }
  }
  if (isEditRecord) {
    Object.entries(edit.record).forEach(([key, value]) => {
      const field = qs(`#${key}`);
      if (key === "docs") {
        const docs = new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
        qsa("input[name='docsSelected']").forEach((input) => {
          const uploaded = docs.has(input.dataset.docName);
          input.closest(".doc-upload-button")?.classList.toggle("uploaded", uploaded);
          input.closest(".doc-upload-button")?.classList.toggle("missing", !uploaded);
          const label = input.closest(".doc-upload-button")?.querySelector("strong");
          if (label) label.textContent = uploaded ? "Uploaded" : "Choose File";
          const helper = input.closest(".doc-upload-button")?.querySelector("em");
          if (helper) helper.textContent = uploaded ? "Replace" : "Choose document";
        });
        syncClientDocsHidden();
      } else if (key === "benefits") {
        const benefits = new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
        qsa("input[name='benefitsSelected']").forEach((input) => { input.checked = benefits.has(input.value); });
        syncEmployeeBenefitsHidden();
      } else if (key === "contactDepartments" && type === "client") {
        populateClientDepartmentContacts(value);
        if (field) field.value = value;
      } else if (field?.type === "checkbox") field.checked = Boolean(value);
      else if (field) field.value = value;
    });
    if (type === "payable") togglePayableFields();
    if (type === "employee" && !canManageEmployeeSalary()) {
      qs("#salary").value = "";
      qs("#salary").placeholder = "CEO Only";
      qs("#salary").readOnly = true;
      qs("#salary").required = false;
    }
  }
  if (["invoice", "cancelReplace"].includes(type)) renderInvoiceComputePreview();
  qs("#demo-modal").showModal();
}

function updateDocumentLabel() {
  const type = qs("#type")?.value || "SI";
  const label = qs("label[for='documentNo']");
  if (label) label.textContent = `Manual ${type} No.`;
  if (qs("#documentNo")) qs("#documentNo").placeholder = `${type}-2026-___`;
}

function syncClientDepartmentContactsHidden() {
  const contactField = qs("#contact");
  const departmentsField = qs("#contactDepartments");
  if (!contactField || !departmentsField) return;
  const departments = {};
  clientContactDepartments.forEach(([key]) => {
    const person = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="person"]`)?.value.trim() || "";
    const phone = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="phone"]`)?.value.trim() || "";
    const email = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="email"]`)?.value.trim() || "";
    if (person || phone || email) departments[key] = { person, phone, email };
  });
  departmentsField.value = JSON.stringify(departments);
  contactField.value = clientContactDepartments.filter(([key]) => departments[key]).map(([key, deptLabel]) => {
    const entry = departments[key];
    return `${deptLabel}: ${[entry.person, entry.phone, entry.email].filter(Boolean).join(", ")}`;
  }).join(" | ");
}

function populateClientDepartmentContacts(json) {
  let departments = {};
  try { departments = JSON.parse(json || "{}"); } catch { departments = {}; }
  clientContactDepartments.forEach(([key]) => {
    const entry = departments[key] || {};
    const personInput = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="person"]`);
    const phoneInput = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="phone"]`);
    const emailInput = qs(`.dept-contact-input[data-dept="${key}"][data-dept-field="email"]`);
    if (personInput) personInput.value = entry.person || "";
    if (phoneInput) phoneInput.value = entry.phone || "";
    if (emailInput) emailInput.value = entry.email || "";
  });
}

function syncClientDocsHidden() {
  const docsField = qs("#docs");
  if (!docsField) return;
  docsField.value = qsa("input[name='docsSelected']").filter((input) => input.files?.length || input.closest(".doc-upload-button")?.classList.contains("uploaded")).map((input) => input.dataset.docName).join(", ");
}

function syncInviteUserPermissions() {
  const panel = qs("#user-permissions-panel");
  if (!panel) return;
  const role = qs("#role")?.value || "Admin";
  const viewDefaults = new Set(accounts[role]?.modules || []);
  const editDefaults = new Set(roleEditableModules[role] || []);
  const modules = permissionModules();
  const groups = [
    ["Core", ["dashboard", "analytics", "notifications", "user-settings"]],
    ["Master Data", ["masterlists", "users", "settings", "backup", "security", "logs"]],
    ["Inventory & Orders", ["inventory", "purchase-orders", "warranty"]],
    ["Sales & Receivables", ["sales", "invoicing", "collections", "receivables-tracker", "purchase-history"]],
    ["Support", ["product-issues"]],
    ["Finance", ["payables", "replenishments", "reconciliation", "reports", "imports"]],
  ].map(([label, items]) => [label, items.filter((module) => modules.includes(module))]).filter(([, items]) => items.length);
  const renderGroup = (name, items, inputName, defaults) => `<details class="permission-feature-group"><summary><strong>${escapeHtml(name)}</strong><span>${items.filter((module) => defaults.has(module)).length}/${items.length} selected</span></summary><div>${items.map((module) => `<label class="ios-check-row compact-doc-check"><input name="${inputName}" type="checkbox" value="${escapeHtml(module)}" ${defaults.has(module) ? "checked" : ""} /><span></span><strong>${escapeHtml(module)}</strong></label>`).join("")}</div></details>`;
  panel.innerHTML = `<div class="invite-permission-grid"><section><h3>View Access</h3>${groups.map(([name, items], index) => renderGroup(name, items, "userViewModules", viewDefaults, index)).join("")}</section><section><h3>Edit Access</h3>${groups.map(([name, items], index) => renderGroup(name, items, "userEditModules", editDefaults, index)).join("")}</section></div>`;
}

function syncEmployeeBenefitsHidden() {
  const benefitsField = qs("#benefits");
  if (!benefitsField) return;
  benefitsField.value = qsa("input[name='benefitsSelected']:checked").map((input) => input.value).join(", ");
}

function syncCheckboxGroupHidden(name) {
  const field = qs(`#${name}`);
  if (!field) return;
  field.value = qsa(`input[name='${name}Selected']:checked`).map((input) => input.value).join(", ");
}

function toggleProductIssueResolvedByField() {
  const status = qs("#status")?.value;
  const field = qs("#resolvedBy");
  if (!field) return;
  field.closest(".field").hidden = status !== "Resolved";
  field.required = status === "Resolved";
}

function nextProductIssueId() {
  const year = new Date(fmtDate(today)).getFullYear();
  const count = data.productIssues.filter((report) => String(report.id || "").includes(`-${year}-`)).length + 1;
  return `TSR-${year}-${String(count).padStart(3, "0")}`;
}

function canManageEmployeeSalary() {
  return ["Superadmin", "CEO"].includes(currentUser?.role);
}

function canManageEmployees() {
  return ["Admin", "Superadmin", "CEO"].includes(currentUser?.role);
}

function syncItemSupplierBrand() {
  if (modalType !== "item") return;
  const supplier = data.suppliers.find((entry) => entry.name.toLowerCase() === (qs("#supplier")?.value || "").trim().toLowerCase());
  if (supplier?.brand && qs("#brand")) qs("#brand").value = supplier.brand;
}

function syncProductIssueClientAddress() {
  if (modalType !== "productIssue") return;
  const client = data.clients.find((entry) => entry.name.toLowerCase() === (qs("#companyName")?.value || "").trim().toLowerCase());
  if (client?.address && qs("#address")) qs("#address").value = client.address;
  if (client?.contact && qs("#contactPerson") && !qs("#contactPerson").value.trim()) qs("#contactPerson").value = client.contact;
}

function openMasterEditModal(type, index) {
  const canEdit = ["Superadmin", "CEO"].includes(currentUser?.role);
  if (!canEdit) {
    const listByType = { client: data.clients, item: data.items, supplier: data.suppliers, employee: data.employees, bank: data.banks };
    const record = listByType[type]?.[index];
    notify("Approval", `${currentUser?.name || "System User"} requested Superadmin/CEO approval to edit ${type}: ${record?.name || record?.code || "record"}.`, "masterlists", record?.name || record?.code || "");
    saveData(["notifications"]);
    renderNotifications();
    return toast("Masterlist edits require Superadmin/CEO approval. Request sent.");
  }
  const listByType = { client: data.clients, item: data.items, supplier: data.suppliers, employee: data.employees, bank: data.banks };
  openModal(type, { list: listByType[type], index, record: listByType[type][index] });
}

function openCancelReplaceModal(invoiceId) {
  openModal("cancelReplace", { oldInvoice: invoiceId });
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

function recordLabel(type, record) {
  return record?.name || record?.code || record?.supplier || record?.id || record?.documentNo || Object.values(record || {})[0] || "record";
}

function masterlistRecordKey(type, record) {
  if (type === "item") return String(record?.code || record?.name || "");
  if (type === "employee") return String(record?.email || record?.name || "");
  return String(record?.name || record?.code || record?.email || "");
}

function masterlistModuleKey(type) {
  return ({ client: "clients", item: "items", supplier: "suppliers", employee: "employees", bank: "banks" })[type] || "";
}

function validateMasterRecord(type, values, exceptIndex = -1) {
  if (type === "client") {
    const name = values.name?.trim().toLowerCase();
    const tin = values.tin?.trim();
    if (tin && String(tin).replace(/\D/g, "").length !== 12) throw new Error("TIN No. must be exactly 12 digits (000-000-000-000) if provided.");
    if (data.clients.some((client, index) => index !== exceptIndex && client.name.trim().toLowerCase() === name)) throw new Error("Duplicate client name detected.");
    if (tin && data.clients.some((client, index) => index !== exceptIndex && client.tin === tin)) throw new Error("Duplicate client TIN detected.");
    if (Number(values.creditLimit || 0) < 0) throw new Error("Credit limit cannot be negative.");
  }
  if (type === "supplier") {
    const tin = values.tin?.trim();
    if (tin && String(tin).replace(/\D/g, "").length !== 12) throw new Error("TIN No. must be exactly 12 digits (000-000-000-000) if provided.");
    if (tin && data.suppliers.some((supplier, index) => index !== exceptIndex && supplier.tin === tin)) throw new Error("Duplicate supplier TIN detected.");
  }
  if (type === "item") {
    const code = values.code?.trim().toLowerCase();
    const name = values.name?.trim().toLowerCase();
    if (data.items.some((item, index) => index !== exceptIndex && item.code.trim().toLowerCase() === code)) throw new Error("Duplicate item code detected.");
    if (data.items.some((item, index) => index !== exceptIndex && item.name.trim().toLowerCase() === name)) throw new Error("Duplicate item name detected.");
  }
  if (type === "bank" && data.banks.some((bank, index) => index !== exceptIndex && bank.name.trim().toLowerCase() === values.name?.trim().toLowerCase())) throw new Error("Duplicate bank name detected.");
}

function nextPurchaseOrderId() {
  const next = data.purchaseOrders.reduce((max, po) => Math.max(max, Number(String(po.id || "").replace(/\D/g, "")) || 0), 40) + 1;
  return `PO-${String(next).padStart(3, "0")}`;
}

function nextInventoryPurchaseOrderId() {
  const next = (data.inventoryPurchaseOrders || []).reduce((max, po) => Math.max(max, Number(String(po.id || "").replace(/\D/g, "")) || 0), 0) + 1;
  return `IPO-${String(next).padStart(3, "0")}`;
}

function buildInventoryPurchaseOrder(values) {
  const supplier = data.suppliers.find((entry) => entry.name === values.supplier);
  if (!supplier) throw new Error("Supplier is required.");
  const branch = values.branch;
  if (!branch || !platformBranches().includes(branch)) throw new Error("Receiving branch is required.");
  const lines = parseInvoiceLines(values.itemsText || "", { requireLot: true }).map((line) => ({ ...line, receivedQty: 0 }));
  if (!lines.length) throw new Error("At least one inventory PO line is required.");
  const by = currentUser?.name || "System User";
  return { id: nextInventoryPurchaseOrderId(), supplier: supplier.name, branch, date: values.date || fmtDate(today), terms: 30, status: "Pending Approval", approvedBy: "", approvedAt: "", cancelledBy: "", cancelledAt: "", history: [{ date: poHistoryTimestamp(), status: "Pending Approval", note: `Purchase order created for ${branch}.`, by }], lines };
}

function poHistoryTimestamp() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function poHistory(po) {
  return po.history?.length ? po.history : [{ date: po.date, status: po.status || "Pending Approval", note: "Purchase order created.", by: "System User" }];
}

async function previewInventoryPurchaseOrder(identifier) {
  const po = typeof identifier === "number" ? (data.inventoryPurchaseOrders || [])[identifier] : (data.inventoryPurchaseOrders || []).find((item) => item.id === identifier);
  const id = po?.id || identifier;
  if (!id) return toast("Inventory PO not found.");
  showReportPreviewLoading();
  const printable = await MedlaneAPI.printableInventoryPurchaseOrder(id).catch((error) => { toast(error.message || "Unable to load inventory PO."); qs("#report-preview-modal").close(); return null; });
  if (!printable) return;
  qs("#report-preview-title").textContent = printable.title;
  qs("#report-preview-description").textContent = printable.description;
  qs("#report-preview-content").innerHTML = printable.html;
}

function buildPurchaseOrder(values) {
  const client = findClientByName(values.client);
  if (!client) throw new Error("Client is required.");
  const lines = parseInvoiceLines(values.itemsText || "", { requireLot: false });
  if (!lines.length) throw new Error("At least one purchase order line is required.");
  return { id: nextPurchaseOrderId(), client: client.name, area: client.area, salesperson: currentUser?.name || "System User", date: values.date || fmtDate(today), lines: lines.map(({ lot, expiry, ...line }) => line), status: "For Invoicing" };
}

function inventoryTouchedBySale(sale) {
  const warehouse = warehouseForArea(sale.area);
  const touched = (sale.lines || []).map((line) => data.inventory.find((item) => item.code === line.code && item.branch === (line.sourceBranch || line.branch || warehouse) && item.lot === line.lot)).filter(Boolean);
  return [...new Map(touched.map((item) => [`${item.code}|${item.branch}|${item.lot}`, item])).values()];
}

function purchaseOrdersTouchedBySales(sales = []) {
  const ids = new Set(sales.map((sale) => sale?.po).filter(Boolean));
  return data.purchaseOrders.filter((po) => ids.has(po.id));
}

function buildSale(values, replacementOf = null) {
  const client = findClientByName(values.client);
  if (!client) throw new Error("Client is required.");
  values.client = client.name;
  const documentNo = values.documentNo?.trim();
  if (!documentNo) throw new Error("Manual document number is required.");
  if (documentExists(documentNo)) throw new Error(`Duplicate document number: ${documentNo}`);
  values.type = documentType(values.type);
  const po = data.purchaseOrders.find((entry) => entry.id === values.po);
  if (!po) throw new Error("Choose an incomplete or unserved Purchase Order for this account.");
  if (po.client !== client.name) throw new Error("Purchase Order does not belong to this client.");
  if (!platformBranches().includes(values.sourceBranch)) throw new Error("Choose one valid stock source branch for this invoice.");
  const lines = parseInvoiceLines(values.itemsText || "").map((line) => ({ ...line, sourceBranch: values.sourceBranch, branch: values.sourceBranch }));
  if (!lines.length) throw new Error("At least one invoice line is required.");
  for (const line of lines) {
    const ordered = (po.lines || []).find((entry) => entry.code === line.code);
    if (!ordered) throw new Error(`${line.item} is not in ${po.id}.`);
    const pending = poLineStatus(po, ordered).pending;
    if (line.qty > pending) throw new Error(`${line.item} exceeds pending PO quantity (${pending}).`);
  }
  const canAuthorize = ["Superadmin", "Admin", "CEO"].includes(currentUser?.role);
  const discount = Number(values.discount || 0);
  if (discount < 0) throw new Error("Discount cannot be negative.");
  if (discountNeedsApproval(discount) && !canAuthorize) throw new Error("Discounts need Admin/CEO approval.");
  for (const line of lines) {
    if (line.expiry !== "N/A" && daysUntil(line.expiry) < 0) throw new Error(`Expired lot blocked for ${line.item}.`);
    const stock = data.inventory.find((i) => i.code === line.code && i.branch === line.sourceBranch && i.lot === line.lot && i.qty >= line.qty);
    if (!stock) throw new Error(`No sufficient ${line.item} stock in ${line.sourceBranch} for lot ${line.lot}.`);
  }
  const amount = values.type === "DR" ? 0 : saleAmount(lines);
  if (discount > amount) throw new Error("Discount cannot exceed gross amount.");
  const totalSalesVatInclusive = amount - discount;
  const net = totalSalesVatInclusive;
  const credit = clientCreditState(client.name, net);
  if (credit.exceeded && !canAuthorize) throw new Error("Credit limit exceeded. Needs Admin/CEO authorization.");
  lines.forEach((line) => {
    const stock = data.inventory.find((i) => i.code === line.code && i.branch === line.sourceBranch && i.lot === line.lot && i.qty >= line.qty);
    stock.qty -= line.qty;
  });
  if (credit.exceeded) notify("Credit", `${currentUser.name} authorized ${client.name} to exceed credit limit: ${peso.format(credit.projected)} / ${peso.format(credit.limit)}.`, "masterlists", client.name);
  if (discount) notify("Approval", `${currentUser.name} approved ${peso.format(discount)} discount for ${documentNo}.`, "sales", documentNo);
  po.completedType = values.type;
  const remaining = (po.lines || []).reduce((sum, line) => sum + Math.max(line.qty - (poServedQty(po, line.code) + lines.filter((served) => served.code === line.code).reduce((lineSum, served) => lineSum + served.qty, 0)), 0), 0);
  if (remaining > 0) notify("Pending Orders", `${po.id} still has ${remaining} item quantity pending after ${documentNo}.`, "purchase-orders", po.id);
  else notify("Purchase Order", `${po.id} completely served by ${documentNo}.`, "purchase-orders", po.id);
  const primaryLine = lines[0];
  const terms = Number(client.terms || 30);
  return { id: documentNo, documentNo, vatCode: values.vatCode || "VAT", po: values.po || `PO-${documentNo}`, client: values.client, area: client.area, dealer: client.dealer, salesperson: currentUser?.name || "System User", type: values.type, sourceBranch: values.sourceBranch, date: values.date || fmtDate(today), item: primaryLine.item, brand: primaryLine.brand, qty: lines.reduce((sum, line) => sum + line.qty, 0), uom: primaryLine.uom, lines, amount, discount, discountReason: values.discountReason || "", net, terms, paid: 0, status: "Active", deliveryStatus: "Pending", cancelledFrom: replacementOf };
}

function togglePayableFields() {
  const method = qs("#method")?.value;
  ["bank", "cheque", "chequeDate"].forEach((id) => {
    const field = qs(`#${id}`)?.closest(".field");
    if (!field) return;
    field.hidden = method !== "Cheque";
    qs(`#${id}`).required = method === "Cheque" && id !== "chequeDate";
  });
}

function restoreCancelledStock(sale) {
  const warehouse = warehouseForArea(sale.area);
  (sale.lines || []).forEach((line) => {
    const existing = data.inventory.find((item) => item.code === line.code && item.branch === (line.sourceBranch || line.branch || warehouse) && item.lot === line.lot);
    if (existing) existing.qty += line.qty;
  });
}

function deductSaleStock(sale) {
  const warehouse = warehouseForArea(sale.area);
  (sale.lines || []).forEach((line) => {
    const existing = data.inventory.find((item) => item.code === line.code && item.branch === (line.sourceBranch || line.branch || warehouse) && item.lot === line.lot);
    if (existing) existing.qty = Math.max(0, existing.qty - line.qty);
  });
}

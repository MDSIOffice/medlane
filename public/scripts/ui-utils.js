// @ts-check
/** @param {AnyEl} container @param {string} message */
function showActionLoading(container, message) {
  if (!container) return;
  container.querySelector(":scope > .action-loading-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "action-loading-overlay";
  overlay.innerHTML = `<div class="action-loading-card"><div class="action-loading-orbit"><img src="medlane.jpg" alt="" /><span></span></div><small>${escapeHtml(message || "Working...")}</small></div>`;
  container.appendChild(overlay);
}
/** @param {AnyEl} container */
function hideActionLoading(container) {
  container?.querySelector(":scope > .action-loading-overlay")?.remove();
}
/** @param {boolean} active */
function setGlobalLoading(active) {
  document.getElementById("global-loading-bar")?.classList.toggle("active", active);
}
/** @param {Sale} sale */
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
/** @param {Sale} sale */
function paymentStatusForSale(sale) {
  const balance = Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0);
  if (balance <= 0) return "Paid";
  if (Number(sale.paid || 0) > 0) return "Partially Paid";
  return "Unpaid";
}
/** @param {{ keepsDraft?: any }} options */
function confirmCloseDialog({ keepsDraft = false } = {}) {
  if (keepsDraft) {
    return confirmDetailsModal({
      eyebrow: "Close Window",
      title: "Close this window?",
      note: "What you have entered is kept as a draft on this device and will be waiting when you reopen this window. Nothing is submitted yet. To throw the entries away instead, use Cancel.",
      confirmLabel: "Close, Keep Draft",
      danger: false,
    });
  }
  return confirmDetailsModal({
    eyebrow: "Unsaved Changes",
    title: "Close this window?",
    note: "Anything you entered here will be lost if you close without saving.",
    confirmLabel: "Close Without Saving",
    danger: true,
  });
}
/** @param {() => any} closeFn @param {Record<string, any>} [options] */
async function guardedDialogClose(closeFn, options) {
  if (await confirmCloseDialog(options)) closeFn();
}
// A second, deliberate click-through before anything is actually written to the
// database — separate from any module-specific confirm dialog (which describes
// WHAT is being saved). This one is a plain misclick guard: same question, same
// button, everywhere a save/write is about to happen. Stacks as its own native
// <dialog> on top of whatever modal triggered it (including another confirm
// dialog), so no manual z-index bookkeeping is needed.
/** @param {string} [title] @param {string} [note] */
function confirmFinalSave(title = "Save this change?", note = "This will write the change to the database. Please confirm you meant to click Save.") {
  return confirmDetailsModal({
    eyebrow: "Final Confirmation",
    title,
    note,
    confirmLabel: "Yes, Save",
    danger: true,
  });
}
/** @param {AnyEl} dialog @param {Record<string, any>} [options] */
function guardDialogEscape(dialog, options) {
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    guardedDialogClose(() => dialog.close(), options);
  });
}
/** @param {string} filename @param {any[]} rows */
function downloadCsv(filename, rows) {
  /** @param {any} value */
  const escapeCsv = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/** @param {Record<string, any>} item */
function inventoryStatus(item) {
  if (item.expiry !== "N/A" && daysUntil(item.expiry) < 0) return "For Disposal";
  if (item.qty <= Math.ceil(item.min * 0.5)) return "Critical";
  if (item.qty < item.min) return "Low Stock";
  if (item.expiry !== "N/A" && daysUntil(item.expiry) <= 183) return "Near Expiry";
  return "Available";
}
/** @param {string} status */
function statusClass(status) {
  const value = String(status).toLowerCase();
  if (value.includes("paid") && !value.includes("unpaid") && !value.includes("partial")) return "green";
  if (value.includes("partial") || value.includes("near") || value.includes("approval") || value.includes("pending") || value.includes("delivered") || value.includes("incomplete")) return "orange";
  if (value.includes("overdue") || value.includes("critical") || value.includes("low") || value.includes("unpaid") || value.includes("cancelled") || value.includes("disposal")) return "red";
  if (value.includes("si") || value.includes("admin")) return "purple";
  return "gray";
}
/** @param {string | undefined} status */
function deliveryStatusPillClass(status) { return status === "Pending" || !status ? "orange" : "green"; }
/** @param {string} type */
function documentType(type) { return type === "DRS" ? "DR" : type; }
/** @param {string} type */
function invoiceTypeIcon(type) {
  return ({ SI: "₱", TS: "T", DR: "D", DRS: "D" }[type] || "#");
}
/** @param {string} type */
function invoiceTypeLabel(type) {
  return ({ SI: "Sales Invoice", TS: "Transmittal Slip", DR: "Delivery Receipt", DRS: "Delivery Receipt" }[type] || "Document");
}
/** @param {string} status */
function contactStatusClass(status) {
  return String(status || "Pending").toLowerCase().replace(/\s+/g, "-");
}
/** @param {string} status */
function contactStatusLabel(status) {
  if (status === "Called") return "Unreached";
  if (status === "No Response") return "No Reply";
  if (status === "Cheque Available") return "Cheque Available";
  return status || "Pending";
}
/** @param {string} status */
function contactStatusFromLabel(status) {
  if (status === "Unreached") return "Unreached";
  if (status === "No Reply") return "No Response";
  return status;
}
/** @param {string} clientName */
function clientBalance(clientName) {
  return data.sales.filter((sale) => sale.client === clientName && sale.status !== "Cancelled").reduce((sum, sale) => sum + Math.max(sale.net - sale.paid, 0), 0);
}
/** @param {string} clientName @param {number} [pendingAmount] */
function clientCreditState(clientName, pendingAmount = 0) {
  const client = data.clients.find((item) => item.name === clientName);
  const used = clientBalance(clientName);
  const limit = Number(client?.creditLimit || 0);
  return { client, used, limit, projected: used + pendingAmount, exceeded: limit > 0 && used + pendingAmount > limit };
}
// Leaves an explicitly-cleared or user-set range alone — only fills in both fields when both
// are empty, so "Clear Dates" buttons (which blank both before re-rendering) land on this
// default instead of an unbounded range.
/** @param {string} fromId @param {string} toId */
function defaultDateRangeIfEmpty(fromId, toId) {
  const fromEl = qs(`#${fromId}`), toEl = qs(`#${toId}`);
  if (!fromEl || !toEl || fromEl.value || toEl.value) return;
  fromEl.value = `${fmtDate(today).slice(0, 4)}-01-01`;
  toEl.value = fmtDate(today);
}
/** @param {Record<string, any> | undefined} client */
function clientTaxRate(client) {
  return (client?.withholdingTax ? 0.05 : 0) + (client?.expandedWithholdingTax ? 0.01 : 0);
}
/** @param {Record<string, any> | undefined} client */
function clientTaxLabels(client) {
  return [client?.withholdingTax ? "Withholding Tax 5%" : "", client?.expandedWithholdingTax ? "Expanded Withholding Tax 1%" : ""].filter(Boolean);
}
/** @param {Record<string, any> | undefined} client */
function clientTaxBadge(client) {
  const labels = clientTaxLabels(client);
  return labels.length ? labels.map((label) => `<span class="pill orange">${escapeHtml(label)}</span>`).join(" ") : "";
}
/** @param {Sale} sale */
function saleTaxBreakdown(sale) {
  const subtotal = Number(sale.amount || 0) - Number(sale.discount || 0);
  const totalAmountDue = Number(sale.net || subtotal);
  const isSi = documentType(sale.type) === "SI";
  const totalSalesVatInclusive = isSi ? totalAmountDue : subtotal;
  const isVatable = isSi && sale.vatCode !== "NO VAT";
  const addVat = isVatable ? Math.max(totalSalesVatInclusive - totalSalesVatInclusive / 1.12, 0) : 0;
  const amountNetVat = totalSalesVatInclusive - addVat;
  return { totalSalesVatInclusive, withholdingTax: 0, expandedWithholdingTax: 0, amountNetVat, addVat, totalAmountDue };
}
/** @param {Sale} sale */
function saleTaxSummary(sale) {
  return "";
}
/** @param {Sale} sale */
function arTrackerStage(sale) {
  if (sale.status === "Cancelled") return "cancelled";
  if (sale.paid >= sale.net) return "completed";
  const dueIn = daysUntil(addDays(sale.date, sale.terms));
  if (dueIn < 0) return "overdue";
  if (dueIn <= 7) return "due-soon";
  return "open-ar";
}
/** @param {Sale[]} sales */
function arTrackerTabs(sales) {
  return [
    ["all", "All", sales.length],
    ["open-ar", "Open AR", sales.filter((sale) => arTrackerStage(sale) === "open-ar").length],
    ["due-soon", "Due Soon", sales.filter((sale) => arTrackerStage(sale) === "due-soon").length],
    ["overdue", "Overdue", sales.filter((sale) => arTrackerStage(sale) === "overdue").length],
    ["cancelled", "Cancelled", sales.filter((sale) => arTrackerStage(sale) === "cancelled").length],
  ];
}
/** @param {string} area */
function warehouseForArea(area) {
  return ["Region I", "Region II", "Region III", "Region IV-A", "Visayas Dealer", "Mindanao Dealer"].includes(area) ? "Las Pinas" : "Naga";
}
/** @param {string} dateValue @param {string} [from] @param {string} [to] */
function dateInRange(dateValue, from = "", to = "") {
  if (!dateValue) return !from && !to;
  const value = fmtDate(dateValue);
  return (!from || value >= from) && (!to || value <= to);
}
function getDashboardRange() {
  return { from: qs("#dashboard-date-from")?.value || "", to: qs("#dashboard-date-to")?.value || "" };
}
/** @param {string} action @param {string} module @param {string} record @param {Record<string, any>} [options] */
function log(action, module, record, options = {}) {
  MedlaneAPI.recordLog({ action, module, record: String(record ?? "") }).catch(() => {});
  if (options.save !== false) saveData();
}
/** @param {string} type @param {string} message @param {string} [section] @param {string} [record] @param {string[] | null} [audience] @param {string | null} [targetUser] */
function notify(type, message, section = "notifications", record = "", audience = null, targetUser = null) {
  /** @type {AppNotification} */
  const entry = { date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }), type, message, section, record, status: "Unread" };
  if (Array.isArray(audience)) entry.audience = audience;
  if (targetUser) entry.targetUser = targetUser;
  data.notifications.unshift(entry);
  data.notifications = data.notifications.slice(0, 80);
}
/** @param {AppNotification} notice */
function canSeeNotification(notice) {
  // A notice with targetUser is private to that one account — it bypasses every other rule
  // (including the Superadmin/CEO see-everything rule and the security-keyword blackout below)
  // since it's addressed to a specific person, not broadcast by role or module.
  if (notice?.targetUser) return notice.targetUser === currentUser?.email;
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return true;
  const section = notice?.section || "notifications";
  if (["users", "settings", "backup", "security", "logs"].includes(section)) return false;
  if (/user|account|permission|password|security|audit|login|logout|session/i.test(`${notice?.type || ""} ${notice?.message || ""}`)) return false;
  if (Array.isArray(notice?.audience) && !notice.audience.includes(currentUser?.role)) return false;
  return section === "notifications" || effectiveModules().includes(section);
}
function visibleNotifications() {
  return (data.notifications || []).filter(canSeeNotification);
}
function generatedNoticeDate() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}
function syncGeneratedNotifications() {
  if (!data?.notifications) return;
  const previous = new Map(data.notifications.filter((notice) => notice.generated && notice.key).map((notice) => [notice.key, notice]));
  const dismissed = new Set(data.notificationsDismissed || []);
  /** @type {AppNotification[]} */
  const notices = [];
  /** @param {string} key @param {string} type @param {string} message @param {string} [section] @param {string} [record] */
  const add = (key, type, message, section = "notifications", record = "") => {
    const existing = previous.get(key);
    if (existing) { notices.push({ key, generated: true, date: existing.date, type, message, section, record, status: existing.status }); return; }
    if (dismissed.has(`${key}::${record}`)) return;
    notices.push({ key, generated: true, date: generatedNoticeDate(), type, message, section, record, status: "Unread" });
  };
  const facts = workflowFacts();
  const openPurchaseOrders = data.purchaseOrders.filter((po) => poInvoiceable(po));
  const receivingPurchaseOrders = data.inventoryPurchaseOrders.filter((po) => !inventoryPoTerminalStatuses.includes(po.status));
  const expiredStock = data.inventory.filter((item) => item.expiry !== "N/A" && daysUntil(item.expiry) < 0);
  const warrantyExpired = data.warranties.filter((item) => daysUntil(item.warrantyEnd) < 0 || String(item.status).toLowerCase().includes("expired"));
  const warrantySoon = data.warranties.filter((item) => daysUntil(item.warrantyEnd) >= 0 && daysUntil(item.warrantyEnd) <= 180);
  const bouncedCheques = data.payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce"));
  const forDepositCheques = data.payments.filter((payment) => ["Cheque", "Multiple Cheques"].includes(payment.method) && ["For Deposition", "Posted Date"].includes(payment.collectionStatus));
  const blockedImports = data.imports.filter((item) => /blocked|invalid|skipped|no valid/i.test(item.status));
  const latestRecon = data.reconHistory[0];

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
  if (data.backupStatus?.stale) add("backup-overdue", "Backup Overdue", "No successful backup has been recorded in the last 7 days.", "backup", data.backupStatus?.latest?.id || "backup");
  if (latestRecon?.high > 0) add("recon-high-findings", "Reconciliation Risk", `Latest reconciliation has ${latestRecon.high} high-severity finding${latestRecon.high === 1 ? "" : "s"}.`, "reconciliation", latestRecon.date || "High");
  if (facts.overdue.length || facts.lowStock.length || facts.duePayables.length) add("reports-management-pack", "Report Pack", "Management reports have current AR, inventory, or payable risks to export.", "reports", facts.overdue.length ? "Collections & AR" : facts.lowStock.length ? "Reagent Expiry" : "Supplier Payables");
  const manual = data.notifications.filter((notice) => !notice.generated);
  data.notifications = [...notices, ...manual].slice(0, 100);
}
/** @param {string} message */
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
/** @param {string} target @param {string[]} headers @param {any[]} rows */
function table(target, headers, rows) {
  const normalizedRows = rows.map((rowSpec) => {
    const row = Array.isArray(rowSpec) ? rowSpec : rowSpec.cells;
    const focusRecord = Array.isArray(rowSpec) ? "" : rowSpec.focus || "";
    return { cells: row, focus: focusRecord, attrs: Array.isArray(rowSpec) ? {} : rowSpec.attrs || /** @type {Record<string, any>} */ ({}), focusText: row.map((/** @type {any} */ cell) => String(cell).replace(/<[^>]*>/g, "")).join(" ") };
  });
  tableState.set(target, { headers, rows: normalizedRows, rendered: 0, page: 0 });
  const tableEl = qs(target);
  tableEl.dataset.tableTarget = target;
  tableEl.classList.remove("is-loading-table");
  tableEl.innerHTML = `<thead><tr>${headers.map((h, index) => `<th><button class="sort-button" type="button" data-sort-col="${index}">${escapeHtml(h)}</button></th>`).join("")}</tr></thead><tbody></tbody>`;
  if (!normalizedRows.length) { tableEl.tBodies[0].innerHTML = `<tr><td colspan="${headers.length}">No records found.</td></tr>`; renderTablePager(target); }
  else showTablePage(target, 0);
  requestAnimationFrame(updateTableScrollHints);
}

/** @param {string} target @param {string[]} headers @param {number} [rowCount] */
function tableSkeleton(target, headers, rowCount = 5) {
  const tableEl = qs(target);
  if (!tableEl) return;
  tableState.set(target, { headers, rows: [], rendered: 0, page: 0 });
  tableEl.dataset.tableTarget = target;
  tableEl.classList.add("is-loading-table");
  tableEl.innerHTML = `<thead><tr>${headers.map((h) => `<th><span>${escapeHtml(h)}</span></th>`).join("")}</tr></thead><tbody>${Array.from({ length: rowCount }, () => `<tr>${headers.map((header, index) => `<td data-label="${escapeHtml(header)}"><span class="skeleton-cell" style="--skeleton-width:${Math.max(38, 88 - index * 6)}%"></span></td>`).join("")}</tr>`).join("")}</tbody>`;
  requestAnimationFrame(updateTableScrollHints);
}

// Defence-in-depth against stored XSS: record text (client names, notes, template overrides...)
// is interpolated into HTML strings in many places. This strips anything that can execute script
// — active elements, on* handlers, javascript:/data: URLs — while keeping normal markup,
// classes, data-* attributes and styles used by the app's own templates.
const SANITIZE_DROP_TAGS = new Set(["SCRIPT", "IFRAME", "FRAME", "FRAMESET", "OBJECT", "EMBED", "APPLET", "LINK", "META", "BASE", "FORM", "NOSCRIPT", "TEMPLATE"]);
/** @param {string} html */
function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const doomed = [];
  for (let node = /** @type {Element | null} */ (walker.nextNode()); node; node = /** @type {Element | null} */ (walker.nextNode())) {
    if (SANITIZE_DROP_TAGS.has(node.tagName.toUpperCase()) || /^(script|animate|set|foreignobject)$/i.test(node.localName)) { doomed.push(node); continue; }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/[\u0000-\u0020\u007f-\u009f]+/g, "").toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction") { node.removeAttribute(attr.name); continue; }
      if (["href", "src", "xlink:href", "action", "poster", "data"].includes(name)) {
        const safe = !/^[a-z][a-z0-9+.-]*:/.test(value) || /^(https?:|mailto:|tel:|blob:)/.test(value) || (name === "src" && /^data:image\/(png|jpe?g|gif|webp);/.test(value));
        if (!safe) node.removeAttribute(attr.name);
      }
      if (name === "style" && /expression\(|javascript:|url\(\s*['"]?\s*data:text/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  doomed.forEach((node) => node.remove());
  return template.innerHTML;
}

/** @param {AnyEl} row @param {any[]} [headers] */
function rowHtml(row, headers = []) {
  const attrs = Object.entries(row.attrs || /** @type {Record<string, any>} */ ({})).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ");
  return `<tr ${attrs} ${row.focus ? `data-focus-record="${escapeHtml(row.focus)}"` : ""} data-focus-text="${escapeHtml(row.focusText)}">${row.cells.map((/** @type {any} */ cell, /** @type {number} */ index) => `<td data-label="${escapeHtml(headers[index] || "")}">${sanitizeHtml(cell)}</td>`).join("")}</tr>`;
}

// Tables paginate like Inventory: a fixed page of rows plus a "Showing X of N records · page p of
// P" footer with Previous/Next. Rows are the locally loaded ones; for server-paginated modules
// (modulePagination[key].hasMore) the footer shows "N+" and Next on the last local page fetches
// the next server page, then advances into it.
/** @param {string} target @param {number} page */
function showTablePage(target, page) {
  const state = tableState.get(target);
  const tableEl = qs(target);
  if (!state || !tableEl?.tBodies[0]) return;
  const pageCount = Math.max(1, Math.ceil(state.rows.length / tablePageSize));
  state.page = Math.min(Math.max(page, 0), pageCount - 1);
  const start = state.page * tablePageSize;
  const pageRows = state.rows.slice(start, start + tablePageSize);
  tableEl.classList.remove("is-loading-table");
  tableEl.tBodies[0].innerHTML = pageRows.map((/** @type {any} */ row) => rowHtml(row, state.headers)).join("");
  state.rendered = start + pageRows.length;
  renderTablePager(target);
  requestAnimationFrame(updateTableScrollHints);
}

/** @param {string} target */
function renderTablePager(target) {
  const state = tableState.get(target);
  const tableEl = qs(target);
  const card = tableEl?.closest(".table-card");
  if (!state || !card) return;
  const total = state.rows.length;
  const serverHasMore = Boolean(paginatedModuleButtons[target] && entryHasMore(paginatedModuleButtons[target]));
  const pageCount = Math.max(1, Math.ceil(total / tablePageSize));
  const page = Math.min(state.page || 0, pageCount - 1);
  /** @type {any} */ let pager = card.nextElementSibling;
  if (!pager?.classList?.contains("table-pager")) {
    pager = document.createElement("div");
    pager.className = "table-pager";
    pager.dataset.tableTarget = target;
    pager.innerHTML = `<span class="table-pager-text"></span><div class="table-pager-buttons"><button type="button" class="ghost-button" data-pager-dir="-1">Previous</button><button type="button" class="ghost-button" data-pager-dir="1">Next</button></div>`;
    card.insertAdjacentElement("afterend", pager);
    pager.querySelectorAll("[data-pager-dir]").forEach((/** @type {AnyEl} */ button) => button.addEventListener("click", () => changeTablePage(target, Number(/** @type {string} */ (button.dataset.pagerDir)))));
  }
  const plus = serverHasMore ? "+" : "";
  const shown = Math.min(tablePageSize, Math.max(total - page * tablePageSize, 0));
  pager.hidden = total === 0 && !serverHasMore;
  pager.querySelector(".table-pager-text").textContent = `Showing ${shown} of ${total}${plus} records · page ${page + 1} of ${pageCount}${plus}`;
  const [prev, next] = pager.querySelectorAll("button");
  prev.disabled = page <= 0;
  next.disabled = page >= pageCount - 1 && !serverHasMore;
  refreshLoadPreviousButton(target);
}

/** @param {string} target @param {number} delta */
async function changeTablePage(target, delta) {
  const state = tableState.get(target);
  if (!state) return;
  const pageCount = Math.max(1, Math.ceil(state.rows.length / tablePageSize));
  const targetPage = (state.page || 0) + delta;
  const entry = paginatedModuleButtons[target];
  if (delta > 0 && targetPage >= pageCount && entry && entryHasMore(entry)) {
    const pager = qs(target)?.closest(".table-card")?.nextElementSibling;
    pager?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try { await entry.loadMore(); } finally { /* table() re-render below rebuilds button state */ }
    showTablePage(target, targetPage);
    return;
  }
  showTablePage(target, targetPage);
}

// A "Load Previous" button (server pagination, fetches older records not loaded locally yet)
// sits right after the same table-card as the "View More" button above (client-side reveal of
// rows already loaded). Showing both at once reads as two competing pagination controls, so
// "Load Previous" only appears once "View More" has nothing left to reveal.
// Superseded by the table pager: Next now fetches server pages itself, so these separate
// buttons stay hidden (callers hide them when this returns false).
/** @param {string} target */
function tableFullyRevealed(target) {
  return false;
}

// Each render*() function (renderSales(), renderPayables(), ...) sets its "Load Previous"
// button's hidden state once, at redraw time — when tableFullyRevealed() is still false because
// only the initial batch is locally revealed. Clicking "View More" afterward never re-ran that
// render*() function, so the button stayed hidden forever even once all local rows were
// revealed. Re-checking it here, every time "View More" finishes revealing a table, fixes that
// for every paginated module without duplicating each module's render*() logic. `loadMore` (used
// by loadMoreTableRows() below) is wrapped in an arrow function since modules.js, which defines
// loadMoreSales() etc., loads after this file — a bare reference here would fail at parse time.
// Most modules key into modulePagination (trimmed by /api/modules/state); the cursor-paginated
// logs-style tables below instead read their own nextCursor via `hasMore()` — without an entry
// here at all, the scroll observer stops dead once the locally-loaded page is exhausted, since
// loadMoreTableRows() has nothing to call to fetch the next page from the server.
/** @type {Record<string, any>} */
const paginatedModuleButtons = {
  "#sales-table": { button: "#load-more-sales", key: "sales", loadMore: () => loadMoreSales() },
  "#purchase-order-table": { button: "#load-more-purchase-orders", key: "purchaseOrders", loadMore: () => loadMorePurchaseOrders() },
  "#inventory-po-table": { button: "#load-more-inventory-pos", key: "inventoryPurchaseOrders", loadMore: () => loadMoreInventoryPurchaseOrders() },
  "#transfer-table": { button: "#load-more-transfers", key: "pendingTransfers", loadMore: () => loadMoreTransfers() },
  "#payables-table": { button: "#load-more-payables", key: "payables", loadMore: () => loadMorePayables() },
  "#collections-table": { button: "#load-more-collections", key: "payments", loadMore: () => loadMoreCollections() },
  "#payment-request-table": { button: "#load-more-payment-requests", key: "paymentRequests", loadMore: () => loadMorePaymentRequests() },
  "#logs-table": { button: "#load-more-logs", hasMore: () => Boolean(logsState.nextCursor), loadMore: () => loadMoreLogs() },
  "#notification-logs-table": { button: "#load-more-notification-logs", hasMore: () => Boolean(notificationLogsState.nextCursor), loadMore: () => loadMoreNotificationLogs() },
  "#collections-history-table": { button: "#load-more-collections-history", hasMore: () => Boolean(collectionsHistoryState.nextCursor), loadMore: () => loadMoreCollectionsHistory() },
};
/** @param {Record<string, any>} entry */
function entryHasMore(entry) {
  return entry.hasMore ? Boolean(entry.hasMore()) : Boolean(modulePagination[entry.key]?.hasMore);
}
/** @param {string} target */
function refreshLoadPreviousButton(target) {
  const entry = paginatedModuleButtons[target];
  if (!entry) return;
  const button = qs(entry.button);
  if (button) button.hidden = !entryHasMore(entry) || !tableFullyRevealed(target);
}

/** @param {string[]} records */
function ensureFocusedRecordsRendered(records) {
  qsa(".section.active table[data-table-target]").forEach((tableEl) => {
    const target = /** @type {string} */ (tableEl.dataset.tableTarget);
    const state = tableState.get(target);
    if (!state) return;
    const index = state.rows.findIndex((/** @type {any} */ row) => records.some((record) => String(row.focus || "").toLowerCase().split("|").map((item) => item.trim()).includes(record) || row.focusText.toLowerCase().includes(record)));
    if (index >= 0 && Math.floor(index / tablePageSize) !== (state.page || 0)) showTablePage(target, Math.floor(index / tablePageSize));
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

/** @param {string} section @param {string} [record] */
function goToFocused(section, record = "") {
  prepareFocusedSection(section, record);
  showSection(section);
  if (record) setTimeout(() => focusRecord(record), 80);
}

/** @param {string} section @param {string} record */
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
  if (section === "product-issues") return renderProductIssues();
  if (section === "replenishments") return renderReplenishments();
  if (section === "collections") return renderCollections();
  if (section === "sales") return renderSales();
  if (section === "purchase-orders") { poWorkflowTab = "pending"; return renderPurchaseOrders(); }
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
    if (inventoryBranchView !== "all") inventoryBranchView = stock.branch;
    inventoryWorkflowTab = "stocks";
    inventorySearch = "";
    inventoryFocusQuery = query;
    renderInventory();
    return;
  }
  const transfer = data.pendingTransfers.find((item) => [item.id, item.lot].some((value) => String(value || "").toLowerCase() === query));
  if (transfer) renderInventory();
}

/** @param {string} record */
function focusRecord(record) {
  const queries = String(record).split("|").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!queries.length) return;
  ensureFocusedRecordsRendered(queries);
  const active = qs(".section.active");
  const candidates = qsa("[data-focus-record], tr, .invoice-card, .tracker-card, .client-ar-card, .report-card, .alert-item, .contact-action-card, .map-marker, .platform-area-chip, .security-card").filter((el) => active?.contains(el) && !el.closest(".workflow-assist"));
  /** @type {AnyEl[]} */
  const targets = /** @type {any} */ (queries.map((query) => candidates.find((el) => String(el.dataset.focusRecord || "").toLowerCase().split("|").map((item) => item.trim()).includes(query)) || candidates.find((el) => (el.dataset.focusText || el.innerText || "").toLowerCase().includes(query))).filter(Boolean));
  if (!targets.length) return;
  qsa(".focus-target").forEach((el) => el.classList.remove("focus-target"));
  targets.forEach((target) => target.classList.add("focus-target"));
  targets[0].scrollIntoView({ behavior: "smooth", block: "center" });
  if (targets.length > 1) toast(`${targets.length} matching records highlighted. Scroll to review the rest.`);
  setTimeout(() => targets.forEach((target) => target.classList.remove("focus-target")), 5200);
}

/** @param {AnyEl} button */
function sortTable(button) {
  const tableEl = button.closest("table");
  const target = /** @type {string} */ (tableEl?.dataset.tableTarget);
  const state = tableState.get(target);
  if (!tableEl?.tBodies[0] || !state) return;
  const col = Number(/** @type {string} */ (button.dataset.sortCol));
  const dir = button.dataset.sortDir === "asc" ? "desc" : "asc";
  tableEl.querySelectorAll("[data-sort-dir]").forEach((item) => delete /** @type {AnyEl} */ (item).dataset.sortDir);
  button.dataset.sortDir = dir;
  state.rows.sort((/** @type {any} */ a, /** @type {any} */ b) => {
    const av = String(a.cells[col] || "").replace(/<[^>]*>/g, "").trim();
    const bv = String(b.cells[col] || "").replace(/<[^>]*>/g, "").trim();
    const an = Number(av.replace(/[^0-9.-]/g, ""));
    const bn = Number(bv.replace(/[^0-9.-]/g, ""));
    const result = Number.isFinite(an) && Number.isFinite(bn) && av.match(/\d/) && bv.match(/\d/) ? an - bn : av.localeCompare(bv);
    return dir === "asc" ? result : -result;
  });
  showTablePage(target, 0);
}

/** @param {any[]} items @param {string} key @param {(row: any) => number} valueFn */
function sumBy(items, key, valueFn) {
  return items.reduce((acc, item) => {
    const label = item[key];
    acc[label] = (acc[label] || 0) + valueFn(item);
    return acc;
  }, {});
}

/** @param {any[]} entries @param {(value: any) => any} [formatter] @param {string[]} [colors] */
function barRows(entries, formatter = (/** @type {any} */ value) => value, colors = []) {
  if (!entries.length) return `<p>No data available for this view.</p>`;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return entries.map(([label, value], index) => `<div class="chart-row"><span class="chart-label">${escapeHtml(label)}</span><div class="chart-track"><span class="chart-fill ${colors[index] || ""}" style="width:${Math.max(4, Math.round((value / max) * 100))}%"></span></div><span class="chart-value">${formatter(value)}</span></div>`).join("");
}

/** @param {string} text */
function graphNote(text) { return `<p class="graph-note">${escapeHtml(text)}</p>`; }
/** @param {string} icon @param {string} title @param {any} value @param {string} body @param {string} [tone] @param {string} [note] */
function visualCard(icon, title, value, body, tone = "info", note = "") {
  return `<article class="visual-card ${tone}"><div class="visual-card-head"><span class="feature-icon">${escapeHtml(icon)}</span><div><small>${escapeHtml(title)}</small><strong>${escapeHtml(value)}</strong></div></div><div class="visual-card-body">${body}${note ? graphNote(note) : ""}</div></article>`;
}

/** @param {string} label @param {string} section @param {string} [record] @param {string} [action] */
function workflowButton(label, section, record = "", action = "") {
  const actionAttr = action ? ` data-workflow-action="${escapeHtml(action)}"` : ` data-go-section="${escapeHtml(section)}" data-focus-record="${escapeHtml(record)}"`;
  return `<button class="mini-button workflow-action" type="button"${actionAttr}>${escapeHtml(label)}</button>`;
}

/** @type {Record<string, string>} */
const WORKFLOW_TONE_BADGE = { risk: "Urgent", warning: "Action Needed", info: "Review", success: "On Track" };

/** @param {{ title: string, text: string, section?: string, record?: string, action?: string, actionLabel?: string, tone?: string, meta?: string, badge?: string }} options */
function workflowCard({ title, text, section = "", record = "", action = "", actionLabel = "Open", tone = "info", meta = "", badge = "" }) {
  const hasTarget = action || section || record;
  const badgeLabel = badge || WORKFLOW_TONE_BADGE[tone] || "";
  return `<article class="workflow-card ${tone}" data-focus-text="${escapeHtml(`${title} ${text} ${record}`)}"><div><strong>${escapeHtml(title)}${badgeLabel ? `<span class="workflow-card-badge">${escapeHtml(badgeLabel)}</span>` : ""}</strong><span>${escapeHtml(text)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</div>${hasTarget ? workflowButton(actionLabel, section, record, action) : ""}</article>`;
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
  const pendingExpenses = data.replenishments.filter((item) => (item.requestStatus || item.status) !== "Approved" && (item.requestStatus || item.status) !== "Cancelled");
  const duePayables = data.payables.filter((payable) => payable.amount > payable.paid);
  const chequeReviews = data.payments.filter((payment) => payment.method === "Cheque" && (!payment.bank || !payment.chequeDate));
  const duplicateClients = data.clients.filter((client, index) => data.clients.findIndex((item) => item.name.toLowerCase() === client.name.toLowerCase() || item.tin === client.tin) !== index);
  const openIssues = data.productIssues.filter((report) => report.status === "Open");
  const escalatedIssues = data.productIssues.filter((report) => ["Pass to Engineering", "Pass to Product Specialist"].includes(report.status));
  return { activeSales, openSales, overdue, nearDue, lowStock, nearExpiry, missingDocs, pendingContacts, pendingTransfers, pendingExpenses, duePayables, chequeReviews, duplicateClients, openIssues, escalatedIssues };
}

/** @param {number} year @param {number} month */
function calendarEventsForMonth(year, month) {
  /** @type {Record<string, any[]>} */
  const events = {};
  /** @param {any} dateValue @param {Record<string, any>} entry */
  const add = (dateValue, entry) => {
    const key = String(dateValue || "").slice(0, 10);
    if (!key) return;
    const parsed = new Date(`${key}T00:00:00`);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month) return;
    (events[key] ||= []).push(entry);
  };
  (data.sales || []).forEach((sale) => {
    if (sale.status === "Cancelled") return;
    add(sale.date, { type: "Invoice issued", label: `${sale.id} — ${sale.client}`, tone: "blue", section: "receivables-tracker", record: sale.id });
    const balance = sale.net - sale.paid;
    if (balance > 0) {
      const status = statusForSale(sale);
      add(fmtDate(addDays(sale.date, sale.terms)), { type: "Invoice due", label: `${sale.id} — ${sale.client} (${peso.format(balance)})`, tone: status === "Overdue" ? "red" : status === "Near Due" ? "orange" : "gray", section: "receivables-tracker", record: sale.id });
    }
  });
  (data.purchaseOrders || []).forEach((po) => add(po.date, { type: "Purchase order", label: `${po.id} — ${po.client}`, tone: "purple", section: "purchase-orders", record: po.id }));
  (data.inventoryPurchaseOrders || []).forEach((po) => add(po.date, { type: "Inventory PO", label: `${po.id} — ${po.supplier}`, tone: "purple", section: "purchase-orders", record: po.id }));
  (data.warranties || []).forEach((warranty) => {
    if (!warranty.warrantyEnd) return;
    const days = daysUntil(warranty.warrantyEnd);
    add(warranty.warrantyEnd, { type: "Warranty ends", label: `${warranty.equipment} — ${warranty.client}`, tone: days < 0 ? "red" : days <= 30 ? "orange" : "green", section: "warranty", record: warranty.serial });
  });
  (data.paymentRequests || []).forEach((request) => add(request.date, { type: "Payment request", label: `${request.cvNo || request.id || "CV"} — ${request.employee || ""}`.trim(), tone: "teal", section: "collections", record: request.cvNo || request.id || "" }));
  (data.productIssues || []).forEach((issue) => {
    add(issue.startDate, { type: "Support report opened", label: `${issue.id} — ${issue.client || issue.equipment || ""}`.trim(), tone: "orange", section: "product-issues", record: issue.id });
    if (issue.resolvedAt) add(issue.resolvedAt, { type: "Support report resolved", label: `${issue.id} resolved`, tone: "green", section: "product-issues", record: issue.id });
  });
  (data.replenishments || []).forEach((expense) => add(expense.date, { type: "Expense", label: `${expense.id} — ${expense.type || "Expense"} (${peso.format(Number(expense.amount || 0))})`, tone: "gray", section: "replenishments", record: expense.id }));
  (data.payables || []).forEach((payable) => add(payable.date, { type: "Payable", label: `${payable.id} — ${payable.supplier || ""} (${peso.format(Number(payable.amount || 0))})`, tone: "gray", section: "payables", record: payable.id }));
  return events;
}

const calendarToneOrder = ["red", "orange", "purple", "teal", "blue", "green", "gray"];
/** @param {number} year @param {number} month @param {Record<string, Record<string, any>[]>} events @param {Record<string, any>} [opts] */
function calendarWidgetHtml(year, month, events, opts = {}) {
  const { compact = false, idPrefix = "calendar" } = opts;
  const firstOfMonth = new Date(year, month - 1, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = fmtDate(today);
  const monthName = firstOfMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(`<div class="calendar-cell outside" aria-hidden="true"></div>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = (events[key] || []).slice().sort((a, b) => calendarToneOrder.indexOf(a.tone) - calendarToneOrder.indexOf(b.tone));
    const dots = dayEvents.slice(0, 3).map((entry) => `<span class="calendar-dot ${entry.tone}"></span>`).join("");
    const overflow = dayEvents.length > 3 ? `<span class="calendar-more">+${dayEvents.length - 3}</span>` : "";
    cells.push(`<button type="button" class="calendar-cell${key === todayKey ? " is-today" : ""}${dayEvents.length ? " has-events" : ""}" data-calendar-day="${key}"><strong>${day}</strong><span class="calendar-dots">${dots}${overflow}</span></button>`);
  }
  return `<div class="calendar-widget${compact ? " compact" : ""}" data-calendar-year="${year}" data-calendar-month="${month}" data-calendar-prefix="${idPrefix}">
    <div class="calendar-widget-header">
      <button type="button" class="icon-button" data-calendar-nav="-1" aria-label="Previous month">‹</button>
      <strong>${escapeHtml(monthName)}</strong>
      <button type="button" class="icon-button" data-calendar-nav="1" aria-label="Next month">›</button>
    </div>
    <div class="calendar-weekday-row">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="calendar-grid">${cells.join("")}</div>
    <div class="calendar-day-detail" id="${idPrefix}-day-detail" hidden></div>
  </div>`;
}
/** @param {string} dateKey @param {any[]} entries */
function calendarDayDetailHtml(dateKey, entries) {
  const label = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const rows = entries.length
    ? entries.map((entry) => `<div class="alert-item clickable" data-go-section="${escapeHtml(entry.section)}" data-focus-record="${escapeHtml(entry.record || "")}"><span class="alert-dot ${entry.tone}"></span><div><strong>${escapeHtml(entry.type)}</strong><span>${escapeHtml(entry.label)}</span></div></div>`).join("")
    : `<div class="alert-item"><span class="alert-dot green"></span><div><strong>Nothing on this date</strong><span>No invoices, orders, expenses, or expirations recorded.</span></div></div>`;
  return `<div class="calendar-day-detail-header"><strong>${escapeHtml(label)}</strong></div>${rows}`;
}

// --- Custom combobox replacing native <input list> + <datalist> suggestions ---------------
// Chromium renders the native datalist popup as browser UI outside page CSS, and it paints
// with a broken/see-through background when it opens above a <dialog> shown via showModal()
// (confirmed: removing backdrop-filter from .modal::backdrop did not fix it — the popup
// itself is the problem, not anything in our stylesheet). We keep every <datalist> element
// as-is (the data source) but suppress the native `list` wiring and drive our own always-
// opaque dropdown instead. Wired up via delegated listeners in events-bootstrap.js.
/** @type {AnyEl | null} */
let comboOpenInput = null;
let comboHighlightIndex = -1;

/** @param {AnyEl} input */
function comboSuppressNative(input) {
  if (input.tagName === "INPUT" && input.hasAttribute("list")) {
    input.dataset.comboList = /** @type {string} */ (input.getAttribute("list"));
    input.removeAttribute("list");
  }
}

/** @param {AnyEl} input */
function comboOptionsFor(input) {
  const datalist = /** @type {HTMLDataListElement | null} */ (input.dataset.comboList ? document.getElementById(/** @type {string} */ (input.dataset.comboList)) : null);
  if (!datalist) return [];
  return Array.from(datalist.options).map((option) => ({ value: option.value, label: option.textContent || "" }));
}

/** @param {Record<string, any>} options @param {string} query */
function comboFilter(options, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return options;
  return options.filter((/** @type {Record<string, string>} */ option) => option.value.toLowerCase().includes(q) || option.label.toLowerCase().includes(q));
}

function comboClose() {
  document.getElementById("combo-dropdown")?.remove();
  comboOpenInput?.setAttribute("aria-expanded", "false");
  comboOpenInput = null;
  comboHighlightIndex = -1;
  window.removeEventListener("scroll", comboReposition, true);
  window.removeEventListener("resize", comboReposition);
}

function comboReposition() {
  const panel = document.getElementById("combo-dropdown");
  if (!panel || !comboOpenInput || !document.contains(comboOpenInput)) return comboClose();
  const rect = comboOpenInput.getBoundingClientRect();
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.width = `${rect.width}px`;
}

/** @param {Record<string, any>} options */
function comboRenderOptions(options) {
  const panel = document.getElementById("combo-dropdown");
  if (!panel) return;
  if (!options.length) { comboClose(); return; }
  panel.innerHTML = options.map((/** @type {Record<string, string>} */ option, /** @type {number} */ i) => `<div class="combo-option${i === comboHighlightIndex ? " active" : ""}" role="option" data-combo-value="${escapeHtml(option.value)}"><span>${escapeHtml(option.value)}</span>${option.label ? `<small>${escapeHtml(option.label)}</small>` : ""}</div>`).join("");
}

/** @param {AnyEl} input */
function comboOpen(input) {
  comboSuppressNative(input);
  if (!input.dataset.comboList) return;
  const options = comboFilter(comboOptionsFor(input), input.value);
  if (!options.length) { comboClose(); return; }
  comboOpenInput = input;
  comboHighlightIndex = -1;
  let panel = document.getElementById("combo-dropdown");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "combo-dropdown";
    panel.className = "combo-dropdown";
    panel.setAttribute("role", "listbox");
    // Appended inside the open <dialog> (not document.body): a showModal() dialog paints in
    // the browser's top layer, above all regular body-level stacking contexts regardless of
    // z-index, so a body-level panel would render *behind* it.
    (input.closest("dialog") || document.body).appendChild(panel);
  }
  input.setAttribute("aria-expanded", "true");
  comboReposition();
  comboRenderOptions(options);
  window.addEventListener("scroll", comboReposition, true);
  window.addEventListener("resize", comboReposition);
}

/** @param {AnyEl} input */
function comboRefresh(input) {
  if (input !== comboOpenInput) return;
  comboHighlightIndex = -1;
  comboRenderOptions(comboFilter(comboOptionsFor(input), input.value));
}

/** @param {AnyEl} input @param {any} value */
function comboSelect(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  comboClose();
}

/** @param {KeyboardEvent} event */
function comboHandleKeydown(event) {
  if (!comboOpenInput || event.target !== comboOpenInput) return;
  const panel = document.getElementById("combo-dropdown");
  if (!panel) return;
  const items = Array.from(panel.children);
  if (event.key === "ArrowDown") { event.preventDefault(); comboHighlightIndex = Math.min(comboHighlightIndex + 1, items.length - 1); comboRenderOptions(comboFilter(comboOptionsFor(comboOpenInput), comboOpenInput.value)); }
  else if (event.key === "ArrowUp") { event.preventDefault(); comboHighlightIndex = Math.max(comboHighlightIndex - 1, 0); comboRenderOptions(comboFilter(comboOptionsFor(comboOpenInput), comboOpenInput.value)); }
  else if (event.key === "Enter") { if (comboHighlightIndex >= 0 && items[comboHighlightIndex]) { event.preventDefault(); comboSelect(comboOpenInput, /** @type {HTMLElement} */ (items[comboHighlightIndex]).dataset.comboValue); } }
  else if (event.key === "Escape") { comboClose(); }
}


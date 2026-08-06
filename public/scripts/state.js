let data;
let modalType = null;
let editContext = null;
let currentUser = JSON.parse(localStorage.getItem("medlane-session") || "null");
function applyThemePreference(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}
applyThemePreference(currentUser?.themePreference);
let currentClientView = null;
let currentInvoiceFlow = null;
let currentPrintNoDate = false;
let currentPrintTemplateId = "default";
let paymentRequestPreselectedInvoice = null;
let selectedReconHistoryIndex = null;
let reconciliationTab = "current";
let collectionLeafletMap = null;
let collectionLeafletLayer = null;
let collectionRegionLayer = null;
let philippinesRegionGeoJson = null;
let arTrackerTab = "all";
let collectionsWorkflowTab = "ledger";
let collectionMapZoom = 1;
let inventoryBranchTab = "Las Pinas";
let inventoryWorkflowTab = "receiving";
let inventoryCompactView = false;
let payablesWorkflowTab = "requests";
let replenishmentsWorkflowTab = "requests";
let transferRowUid = 0;
let ptActiveType = "SI";
let ptOverrides = { fields: {}, row: null };
let ptSelectedField = null;
let ptSelectedKind = null;
let ptStepIn = 0.05;
const PRINT_TEMPLATE_FIELDS = {
  SI: {
    point: [
      ["si-date", "Date"], ["si-po", "P.O. No."], ["si-terms", "Terms of Payment"], ["si-sold", "Sold To"],
      ["si-registered", "Registered Name"], ["si-tin", "TIN"], ["si-address", "Address"],
      ["si-total-sales", "Total Sales (VAT Incl.)"], ["si-net-vat", "Amount Net of VAT"], ["si-discount", "Discount"],
      ["si-vat", "VAT"], ["si-amount-due", "Total Amount Due"], ["si-prepared", "Prepared By"], ["si-approved", "Approved By"],
    ],
    rowCols: [["si-item", "Item"], ["si-qty", "Qty"], ["si-price", "Price"], ["si-amount", "Amount"]],
  },
  TS: {
    point: [
      ["ts-date", "Date"], ["ts-po", "P.O. No."], ["ts-terms", "Terms"], ["ts-client", "Client"], ["ts-address", "Address"],
      ["ts-tax-label", "Tax Label"], ["ts-total", "Total"], ["ts-prepared", "Prepared By"], ["ts-approved", "Approved By"],
    ],
    rowCols: [["ts-code", "Code"], ["ts-item", "Item"], ["ts-qty", "Qty"], ["ts-amount", "Amount"]],
  },
  DR: {
    point: [
      ["dr-date", "Date"], ["dr-terms", "Terms"], ["dr-po", "P.O. No."], ["dr-client", "Client"], ["dr-address", "Address"],
      ["dr-prepared", "Prepared By"], ["dr-recorded", "Recorded By"], ["dr-approved", "Approved By"], ["dr-received", "Received By"],
    ],
    rowCols: [["dr-qty", "Qty"], ["dr-item", "Item"], ["dr-price", "Price"], ["dr-amount", "Amount"]],
  },
};
let pendingServerSave = null;
let serverRevision = 0;
function pendingSaveQueueKey() {
  const userKey = String(currentUser?.email || currentUser?.id || currentUser?.role || "guest").trim().toLowerCase();
  return `medlane-pending-save-queue:${location.host || "local"}:${userKey}`;
}

const frontendModuleRecordKeys = {
  dashboard: [],
  analytics: [],
  masterlists: ["clients", "items", "suppliers", "employees", "banks", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  inventory: ["inventory", "pendingTransfers", "transferHistory", "inventoryPurchaseOrders"],
  "purchase-orders": ["purchaseOrders"],
  sales: ["sales"],
  invoicing: ["sales"],
  collections: ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  "payment-request-detail": ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  "receivables-tracker": ["sales", "payments", "collectionContacts", "collectionContactHistory"],
  "client-invoices": ["sales", "payments", "paymentRequests"],
  "sale-detail": ["sales", "payments", "paymentRequests"],
  warranty: ["warranties"],
  "purchase-history": ["sales", "purchaseOrders", "payments"],
  payables: ["payables"],
  replenishments: ["replenishments"],
  imports: ["imports", "clients", "items", "suppliers", "sales", "payments"],
  reports: ["reports"],
  reconciliation: ["reconHistory"],
  notifications: ["notifications"],
  settings: ["platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  "product-issues": ["productIssues"],
  "product-issue-detail": ["productIssues"],
  "inventory-po-detail": ["inventoryPurchaseOrders", "inventory"],
  "print-templates": ["printTemplates"],
};

const philippinesRegionsGeoJsonUrl = "https://raw.githubusercontent.com/wmgeolab/geoBoundaries/41af8f1/releaseData/gbOpen/PHL/ADM1/geoBoundaries-PHL-ADM1_simplified.geojson";

const clientCoordinates = {
  "IlocosCare Laboratory": [16.6159, 120.3209],
  "Cagayan Valley Diagnostics": [17.6132, 121.7270],
  "Central Luzon MedLab": [15.0333, 120.6833],
  "CALABARZON Hospital Lab": [14.2117, 121.1653],
  "Bicol Diagnostics": [13.6218, 123.1948],
  "Visayas Dealer Hub": [10.3157, 123.8854],
  "Mindanao Dealer Hub": [7.1907, 125.4553],
};

const accounts = {
  Superadmin: { name: "Superadmin", role: "Superadmin", branch: "all", email: "superadmin@medlane.local", phone: "+63 900 000 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  Admin: { name: "Admin User", role: "Admin", branch: "all", email: "admin@medlane.local", phone: "+63 917 100 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  CEO: { name: "CEO", role: "CEO", branch: "all", email: "ceo@medlane.local", phone: "+63 917 200 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  Accounting: { name: "Joy Santos", role: "Accounting", branch: "all", email: "joy@medlane.local", phone: "+63 917 300 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings", "logs"] },
  Sales: { name: "Ana Cruz", role: "Sales", branch: "Region IV-A", email: "ana@medlane.local", phone: "+63 917 400 0000", modules: ["dashboard", "calendar", "masterlists", "inventory", "sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings", "product-issues"] },
  Logistics: { name: "Ramon Dela Cruz", role: "Logistics", branch: "all", email: "ramon@medlane.local", phone: "+63 917 500 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "reports", "notifications", "user-settings", "product-issues"] },
  "Product Specialist": { name: "Product Specialist", role: "Product Specialist", branch: "all", email: "product.specialist@medlane.local", phone: "+63 917 700 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "reports", "notifications", "user-settings", "product-issues"] },
  Engineering: { name: "Service Engineer", role: "Engineering", branch: "all", email: "engineering@medlane.local", phone: "+63 917 800 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "reports", "notifications", "user-settings", "product-issues"] },
  HR: { name: "HR User", role: "HR", branch: "all", email: "hr@medlane.local", phone: "+63 917 600 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "replenishments", "reports", "notifications", "user-settings"] },
};
if (currentUser?.role && accounts[currentUser.role] && !currentUser.id && !currentUser.customPermissions) currentUser = accounts[currentUser.role];

const sectionMeta = {
  notifications: ["Notifications", "Review system alerts for credit limits, stock transfers, collections, and inventory risks."],
  "user-settings": ["User Settings", "View and update your profile, contact details, and session preferences."],
  "client-invoices": ["Client Invoice Timeline", "Review every invoice for one client using an order-status timeline."],
  "report-detail": ["Report Detail", "Focused report view with graphs, source records, and connected module actions."],
  "product-issue-detail": ["Support Report Detail", "Full status history and turnaround timeline for this technical support report."],
  "inventory-po-detail": ["Purchase Order Detail", "Approval, dispatch, and receiving history for this purchase order."],
  "payment-request-detail": ["Payment Request Detail", "Approval and payment history for this collection payment request."],
  "sale-detail": ["Invoice Detail", "How and when this invoice was created and collected."],
  "user-audit-log": ["User Activity Log", "Every recorded action for one user, newest first."],
};

function userProfileKey() { return `medlane-profile-${currentUser?.role || "guest"}`; }
function passwordKey(role = currentUser?.role) { return `medlane-password-${role || "guest"}`; }
function savedPassword() { return ""; }
function emailPasswordKey(email) { return `medlane-password-email-${String(email || "").trim().toLowerCase()}`; }
function savedLoginPassword() { return ""; }
function platformAreas() { return data?.platformAreas?.length ? data.platformAreas : initialData.platformAreas; }
function platformBranches() { return data?.platformBranches?.length ? data.platformBranches : initialData.platformBranches; }
function branchAddresses() { return data?.branchAddresses || {}; }
function invoiceApprovals() { return data?.invoiceApprovals || { SI: "ECTOSOC", TS: "ECTOSOC", DR: "ECTOSOC" }; }
function isDevEnvironment() { return ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:"; }
function effectiveModules() { return currentUser?.customPermissions?.view?.length ? currentUser.customPermissions.view : currentUser?.modules || []; }
const roleEditableModules = {
  Superadmin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  Admin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  CEO: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  Accounting: ["purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings"],
  Sales: ["sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings", "product-issues"],
  Logistics: ["inventory", "reports", "notifications", "user-settings", "product-issues"],
  "Product Specialist": ["inventory", "reports", "notifications", "user-settings", "product-issues"],
  Engineering: ["inventory", "reports", "notifications", "user-settings", "product-issues"],
  HR: ["replenishments", "reports", "notifications", "user-settings"],
};
function editableModules() { return currentUser?.customPermissions?.enabled ? currentUser.customPermissions.edit || [] : roleEditableModules[currentUser?.role] || []; }
function canEditModule(sectionId) { return editableModules().includes(sectionId); }
function canEditActiveSection() { return editableModules().includes(qs(".section.active")?.id || "dashboard"); }
function permissionModules() { return [...new Set(Object.values(accounts).flatMap((account) => account.modules))].filter((module) => !["client-invoices", "invoice-flow-detail", "report-detail"].includes(module)); }
function followupDate() { return new Date(); }
function followupWeekKey(date = followupDate()) {
  const value = date instanceof Date ? new Date(date) : new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return "";
  const day = (value.getDay() + 6) % 7;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - day);
  return fmtDate(value);
}
function getCurrentProfile() {
  const saved = {};
  return { email: currentUser?.email || `${String(currentUser?.role || "user").toLowerCase()}@medlane.local`, phone: currentUser?.phone || "+63", notes: "", ...currentUser, ...saved };
}
function firstName(name) { return String(name || "User").split(/\s+/)[0]; }
function initials(name) { return String(name || "U").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

function emptyProductionData() {
  return {
    dataVersion: initialData.dataVersion,
    branch: "all",
    platformAreas: structuredClone(initialData.platformAreas),
    platformBranches: structuredClone(initialData.platformBranches),
    branchAddresses: structuredClone(initialData.branchAddresses),
    invoiceApprovals: structuredClone(initialData.invoiceApprovals),
    masterTab: "clients",
    clients: [],
    items: [],
    suppliers: [],
    employees: [],
    inventory: [],
    sales: [],
    purchaseOrders: [],
    inventoryPurchaseOrders: [],
    payments: [],
    payables: [],
    replenishments: [],
    users: [],
    warranties: [],
    productIssues: [],
    imports: [],
    pendingTransfers: [],
    paymentRequests: [],
    transferHistory: [],
    notifications: [],
    reconHistory: [],
    collectionContacts: [],
    collectionContactHistory: [],
    banks: [],
    printTemplates: [],
  };
}

function loadData() {
  return normalizeData(emptyProductionData());
}

function roundCurrency(value) { return Math.round(Number(value || 0) * 100) / 100; }
function withholdingBaseFromGross(gross) { return roundCurrency(Number(gross || 0) / 1.12); }
function hasWithholding(value) { return value === true || Number(value || 0) > 0; }
function itemGross(items = []) { return items.reduce((sum, item) => sum + Number(item.amount || 0), 0); }

function normalizePaymentRequestWithholding(request) {
  const items = request.items?.length ? request.items : [{ amount: request.amount || request.total || 0 }];
  const oldWithholdingTax = Number(request.withholdingTax || 0);
  const oldExpandedWithholdingTax = Number(request.expandedWithholdingTax || 0);
  const gross = Number(request.gross || 0) || itemGross(items) || Number(request.total || 0) + oldWithholdingTax + oldExpandedWithholdingTax;
  const base = withholdingBaseFromGross(gross);
  const withholdingTax = hasWithholding(request.withholdingTax) ? roundCurrency(base * 0.05) : 0;
  const expandedWithholdingTax = hasWithholding(request.expandedWithholdingTax) ? roundCurrency(base * 0.01) : 0;
  return { ...request, gross, withholdingTax, expandedWithholdingTax, total: roundCurrency(Math.max(gross - withholdingTax - expandedWithholdingTax, 0)) };
}

function normalizePayableWithholding(payable) {
  const oldWithholdingTax1 = Number(payable.withholdingTax1 || 0);
  const oldWithholdingTax2 = Number(payable.withholdingTax2 || 0);
  const grossAmount = Number(payable.grossAmount || 0) || itemGross(payable.items) || Number(payable.amount || 0) + oldWithholdingTax1 + oldWithholdingTax2;
  const base = withholdingBaseFromGross(grossAmount);
  const withholdingTax1 = hasWithholding(payable.withholdingTax1) ? roundCurrency(base * 0.01) : 0;
  const withholdingTax2 = hasWithholding(payable.withholdingTax2) ? roundCurrency(base * 0.02) : 0;
  const oldAmount = Number(payable.amount || 0);
  const amount = roundCurrency(Math.max(grossAmount - withholdingTax1 - withholdingTax2, 0));
  const paid = payable.paymentConfirmed && Number(payable.paid || 0) >= oldAmount ? amount : Number(payable.paid || 0);
  return { ...payable, grossAmount, withholdingTax1, withholdingTax2, amount, paid };
}

function normalizeData(next) {
  next.printTemplates ||= [];
  next.pendingTransfers ||= [];
  next.branchAddresses ||= { "Las Pinas": "13 Gumamela St. Pilar Village, Las Pinas City", Naga: "Naga City" };
  next.invoiceApprovals ||= { SI: "ECTOSOC", TS: "ECTOSOC", DR: "ECTOSOC" };
  next.transferHistory ||= [];
  next.notifications ||= [];
  next.notificationsDismissed ||= [];
  next.reconHistory ||= [];
  next.platformAreas ||= [];
  next.platformBranches ||= [];
  next.purchaseOrders ||= [];
  next.collectionContacts ||= [];
  next.collectionContactHistory ||= [];
  next.banks ||= [];
  next.paymentRequests ||= [];
  next.inventoryPurchaseOrders ||= [];
  next.productIssues = (next.productIssues || []).map((report) => ({ status: "Open", history: [], ...report }));
  next.clients = next.clients.map((client, index) => {
    const { terms, ...clientWithoutTerms } = client;
    const accountType = client.dealer === "Dealer" || client.dealer?.includes("Dealer") ? "Dealer" : "Direct";
    return { dealer: accountType, salesperson: client.salesperson || "Unassigned", terms: Number(client.terms || 30), creditLimit: [180000, 120000, 210000, 160000][index] || 150000, withholdingTax: Boolean(client.withholdingTax), expandedWithholdingTax: Boolean(client.expandedWithholdingTax), docs: client.docs || "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA", ...clientWithoutTerms, dealer: accountType };
  });
  next.items = next.items.map((item) => ({ brand: item.brand || item.supplier || "Medlane", uom: item.uom || "unit", ...item }));
  next.suppliers = next.suppliers.map((supplier) => ({ brand: supplier.brand || "Multiple", ...supplier }));
  next.employees = next.employees.map((employee, index) => {
    const salary = Number(String(employee.salary || "").replace(/[^0-9.-]/g, ""));
    return { ...employee, salary: Number.isFinite(salary) && salary > 0 ? salary : [85000, 52000, 42000][index] || 35000 };
  });
  next.inventory = next.inventory.map((stock) => ({ brand: stock.brand || next.items.find((item) => item.code === stock.code)?.brand || "Medlane", ...stock }));
  next.pendingTransfers = next.pendingTransfers.map((transfer) => {
    const lot = transfer.sourceLot || String(transfer.lot || "").replace(/-TR$/, "");
    const source = next.inventory.find((item) => item.code === transfer.code && item.lot === lot) || {};
    const expiry = transfer.expiry || source.expiry || "N/A";
    const lines = transfer.lines?.length ? transfer.lines : [{ code: transfer.code, item: transfer.item, brand: transfer.brand || source.brand || "Medlane", qty: Number(transfer.qty || 0), uom: transfer.uom || "unit", lot, expiry }];
    return { ...transfer, lot, sourceLot: lot, expiry, lines };
  });
  next.sales = next.sales.map((sale) => {
    const client = next.clients.find((c) => c.name === sale.client);
    const item = next.items.find((i) => i.name === sale.item);
    const stock = next.inventory.find((entry) => entry.code === item?.code || entry.item === sale.item) || {};
    const line = { item: sale.item, code: item?.code || sale.code || sale.item, brand: sale.brand || item?.brand || "Medlane", qty: Number(sale.qty || 1), uom: sale.uom || item?.uom || "unit", price: sale.qty ? Math.round((sale.amount || 0) / sale.qty) : item?.price || 0, lot: sale.lot || stock.lot || "Manual", expiry: sale.expiry || stock.expiry || "N/A", discount: Number(sale.discount || 0), discountReason: sale.discountReason || "", terms: Number(sale.terms || item?.terms || 30) };
    const amount = Number(sale.amount || 0);
    const manualDiscount = Number(sale.discount || 0);
    const withholdingTax = Boolean(sale.withholdingTax);
    const expandedWithholdingTax = Boolean(sale.expandedWithholdingTax);
    return { po: sale.po || `PO-${sale.id}`, documentNo: sale.documentNo || sale.id, dealer: sale.dealer || client?.dealer || "Direct", brand: sale.brand || item?.brand || "Medlane", area: client?.area || sale.area, status: sale.status || "Active", lines: (sale.lines || [line]).map((entry) => ({ lot: stock.lot || "Manual", expiry: stock.expiry || "N/A", ...entry })), discount: manualDiscount, discountReason: sale.discountReason || "", withholdingTax, expandedWithholdingTax, autoTaxRate: 0, withholdingDiscount: 0, expandedWithholdingDiscount: 0, taxTreatment: sale.taxTreatment || [withholdingTax ? "Withholding Tax 5%" : "", expandedWithholdingTax ? "Expanded Withholding Tax 1%" : ""].filter(Boolean).join(" + "), ...sale };
  });
  next.paymentRequests = next.paymentRequests.map(normalizePaymentRequestWithholding);
  next.payables = next.payables.map((payable, index) => normalizePayableWithholding({ id: payable.id || `PAY-${String(index + 1).padStart(3, "0")}`, requestStatus: payable.requestStatus || (payable.status === "Cancelled" ? "Cancelled" : payable.status === "Approved" ? "Approved" : "For Approval"), paymentConfirmed: Boolean(payable.paymentConfirmed), items: payable.items || [{ particulars: payable.item || "Payable", qty: Number(payable.qty || 1), uom: payable.uom || "unit", amount: Number(payable.amount || 0) }], method: payable.method || (payable.cheque ? "Cheque" : "Cash"), bank: payable.bank || "", cheque: payable.cheque || "", chequeDate: payable.chequeDate || "", uom: payable.uom || "unit", qty: Number(payable.qty || 1), ...payable }));
  next.replenishments = next.replenishments.map((expense, index) => ({ id: expense.id || `REP-${String(index + 1).padStart(3, "0")}`, requestStatus: expense.requestStatus || (["Approved", "Approved by HR"].includes(expense.status) ? "Approved" : expense.status === "Cancelled" ? "Cancelled" : "For Approval"), paymentConfirmed: Boolean(expense.paymentConfirmed), method: expense.method || "Cash", bank: expense.bank || "", cheque: expense.cheque || "", chequeDate: expense.chequeDate || "", items: expense.items || [{ particulars: expense.file || expense.type || "Expense", amount: Number(expense.amount || 0) }], ...expense }));
  next.payments = next.payments.map((payment) => ({ receiptNo: payment.receiptNo || payment.reference || "Manual", tag: payment.tag || (String(payment.invoice).startsWith("TS") ? "TS-PR" : "SI-CR"), dateRecorded: payment.dateRecorded || fmtDate(today), bank: payment.bank || "", chequeDate: payment.chequeDate || "", collectionStatus: payment.collectionStatus || "For Deposition", postedDate: payment.postedDate || "", cheques: payment.cheques || [], statusHistory: payment.statusHistory || [{ date: payment.dateRecorded || fmtDate(today), status: payment.collectionStatus || "For Deposition", user: payment.client || "Imported" }], ...payment }));
  next.purchaseOrders = next.purchaseOrders.map((po) => {
    const client = next.clients.find((item) => item.name === po.client);
    const lines = (po.lines || []).map((line) => {
      const item = next.items.find((entry) => entry.code === line.code || entry.name === line.item) || {};
      return { item: line.item || item.name, code: line.code || item.code || line.item, brand: line.brand || item.brand || "Medlane", qty: Number(line.qty || 0), uom: line.uom || item.uom || "unit", price: Number(line.price || 0) };
    });
    return { id: po.id, client: po.client, area: po.area || client?.area || "Region I", salesperson: po.salesperson || currentUser?.name || "System User", date: po.date || fmtDate(today), lines, status: po.status || "For Invoicing" };
  });
  const legacyPoStatus = { "Purchase Receiving": "Pending Approval", "For Receiving": "Pending Approval", Received: "Fully Received" };
  next.inventoryPurchaseOrders = next.inventoryPurchaseOrders.map((po) => ({ id: po.id, supplier: po.supplier, branch: po.branch || "", date: po.date || fmtDate(today), terms: po.terms || 30, status: legacyPoStatus[po.status] || po.status || "Pending Approval", approvedBy: po.approvedBy || "", approvedAt: po.approvedAt || "", cancelledBy: po.cancelledBy || "", cancelledAt: po.cancelledAt || "", receivedBy: po.receivedBy || "", receivedAt: po.receivedAt || "", history: po.history || [], lines: (po.lines || []).map((line) => ({ ...line, receivedQty: Number(line.receivedQty || 0) })) }));
  const clientsWithBalance = new Set(next.sales.filter((sale) => Number(sale.net || 0) - Number(sale.paid || 0) > 0).map((sale) => sale.client));
  next.collectionContacts = next.clients.filter((client) => clientsWithBalance.has(client.name)).map((client) => {
    const existing = next.collectionContacts.find((contact) => contact.client === client.name || contact.area === client.area) || {};
    const status = existing.status === "Called" ? "Unreached" : existing.status || "Pending";
    const currentWeek = followupWeekKey();
    const savedWeek = existing.weekKey || followupWeekKey(existing.lastContact);
    const hasWeeklyWork = status !== "Pending" || existing.lastContact || existing.employee || existing.channels?.length;
    const shouldReset = hasWeeklyWork && savedWeek !== currentWeek;
    return shouldReset
      ? { client: client.name, area: client.area, status: "Pending", lastContact: "", employee: "", channels: [], notes: "Fresh weekly follow-up. Not yet contacted this week.", weekKey: currentWeek }
      : { client: client.name, area: client.area, status, lastContact: existing.lastContact || "", employee: existing.employee || "", channels: existing.channels || [], notes: existing.notes || "Not yet contacted this week.", weekKey: savedWeek || currentWeek };
  });
  return next;
}

function savePayloadForKeys(keys) {
  const payload = {};
  [...new Set(keys)].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(data || {}, key)) payload[key] = data[key];
  });
  return payload;
}

function readPendingSaveQueue() {
  try { return JSON.parse(localStorage.getItem(pendingSaveQueueKey()) || "{}"); }
  catch { return {}; }
}

function writePendingSaveQueue(payload) {
  const cleaned = Object.fromEntries(Object.entries(payload || {}).filter(([, value]) => value !== undefined));
  if (Object.keys(cleaned).length) localStorage.setItem(pendingSaveQueueKey(), JSON.stringify(cleaned));
  else localStorage.removeItem(pendingSaveQueueKey());
}

function mergePendingSaveQueue(payload) {
  writePendingSaveQueue({ ...readPendingSaveQueue(), ...(payload || {}) });
}

function hasPendingSaveQueue() {
  return Object.keys(readPendingSaveQueue()).length > 0;
}

function applyPendingSaveQueueToLocal() {
  const pending = readPendingSaveQueue();
  if (!Object.keys(pending).length || !data) return;
  data = normalizeData({ ...emptyProductionData(), ...data, ...pending });
}

function setGlobalSaveStatus(status, text) {
  const indicator = typeof qs === "function" ? qs("#save-status-indicator") : null;
  const label = typeof qs === "function" ? qs("#save-status-text") : null;
  if (!indicator || !label) return;
  indicator.classList.remove("saving", "saved", "error");
  indicator.classList.add(status);
  label.textContent = text;
}

function inferredSaveKeys() {
  const activeSection = document.body.dataset.activeSection || qs(".section.active")?.id || "dashboard";
  const keys = [...(frontendModuleRecordKeys[activeSection] || [])];
  if (data?.notifications) keys.push("notifications");
  return keys;
}

function saveData(keys = null) {
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return;
  if (typeof syncGeneratedNotifications === "function") syncGeneratedNotifications();
  const payload = savePayloadForKeys(keys || inferredSaveKeys());
  if (!Object.keys(payload).length) return;
  mergePendingSaveQueue(payload);
  clearTimeout(pendingServerSave);
  setGlobalSaveStatus("saving", "Saving...");
  pendingServerSave = setTimeout(() => {
    const queuedPayload = readPendingSaveQueue();
    if (!navigator.onLine) {
      setGlobalSaveStatus("error", "Offline - pending save");
      return;
    }
    MedlaneAPI.saveAppState(queuedPayload, serverRevision).then((result) => {
      if (result?.revision) {
        serverRevision = Number(result.revision);
      }
      writePendingSaveQueue({});
      setGlobalSaveStatus("saved", "Saved");
    }).catch(async (error) => {
      if (error.message.includes("APP_STATE_CONFLICT")) {
        const latest = await MedlaneAPI.loadAppState().catch(() => null);
        if (latest?.data) {
          serverRevision = Number(latest.revision || 0);
          data = normalizeData({ ...emptyProductionData(), ...latest.data });
          if (typeof renderAll === "function") renderAll();
          if (typeof toast === "function") toast("Another user saved first. Reloaded latest server data.");
          setGlobalSaveStatus("saved", "Reloaded");
          return;
        }
      }
      setGlobalSaveStatus("error", "Save failed");
      if (typeof toast === "function") toast(`Server save failed: ${error.message}`);
    });
  }, 450);
}

function flushPendingSaveQueue() {
  if (!hasPendingSaveQueue() || !currentUser || !MedlaneAPI?.session()?.access_token || !navigator.onLine) return;
  clearTimeout(pendingServerSave);
  setGlobalSaveStatus("saving", "Saving pending changes...");
  const queuedPayload = readPendingSaveQueue();
  MedlaneAPI.saveAppState(queuedPayload, serverRevision).then((result) => {
    if (result?.revision) serverRevision = Number(result.revision);
    writePendingSaveQueue({});
    setGlobalSaveStatus("saved", "Saved");
  }).catch((error) => {
    setGlobalSaveStatus("error", "Pending save failed");
    if (typeof toast === "function") toast(`Pending save still needs retry: ${error.message}`);
  });
}

async function persistRecords(records, recordKeys = {}) {
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return null;
  const filtered = Object.fromEntries(Object.entries(records || {}).filter(([, value]) => Array.isArray(value) && value.length));
  if (!Object.keys(filtered).length) return null;
  setGlobalSaveStatus("saving", "Saving...");
  try {
    const result = await MedlaneAPI.saveRecords(filtered, recordKeys);
    if (result?.revision) serverRevision = Number(result.revision);
    setGlobalSaveStatus("saved", "Saved");
    return result;
  } catch (error) {
    mergePendingSaveQueue(savePayloadForKeys(Object.keys(filtered)));
    setGlobalSaveStatus("error", "Save failed");
    if (typeof toast === "function") toast(`Server save failed; queued for retry: ${error.message}`);
    return { ok: false, queued: true, error: error.message };
  }
}
function nextId(items, prefix) {
  const next = items.reduce((max, item) => Math.max(max, Number(String(item.id || "").replace(`${prefix}-`, "")) || 0), 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
function qs(selector) { return document.querySelector(selector); }
function qsa(selector) { return [...document.querySelectorAll(selector)]; }
function includesSearch(values) {
  const term = qs("#global-search").value.trim().toLowerCase();
  return !term || values.some((value) => String(value ?? "").toLowerCase().includes(term));
}
function byBranch(items, key = "branch") { return data.branch === "all" ? items : items.filter((item) => item[key] === data.branch || item[key] === "Both" || item.area === data.branch || item.office === data.branch || item.dealer === data.branch); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + Number(days)); return d; }
function fmtDate(date) { return new Date(date).toISOString().slice(0, 10); }
function daysUntil(date) { return Math.ceil((new Date(date) - today) / 86400000); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }

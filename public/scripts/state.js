// @ts-check
/** @type {AppData} */
let data;
// Per-module { hasMore, cursor, loading } for the transactional modules /api/modules/state trims
// to "open + most recent 50" — populated from the state payload's `pagination` field, read/written
// by the loadMore<Module>() handlers in modules.js to drive each list's "Load previous" button.
/** @type {Record<string, any>} */
let modulePagination = {};
/** @type {any} */
let modalType = null;
/** @type {any} */
let currentOperationalReportKey = null; // set by applyOperationalReport() in modules.js; was an undeclared implicit global
/** @type {any} */
let editContext = null;
let modalReadOnly = false;
let currentUser = JSON.parse(localStorage.getItem("medlane-session") || "null");
/** @param {string} theme */
function applyThemePreference(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}
applyThemePreference(currentUser?.themePreference);
/** @type {any} */
let currentClientView = null;
let clientInvoicesStatusFilter = "all";
let clientInvoicesFrom = "";
let clientInvoicesTo = "";
/** @type {any} */
let currentInvoiceFlow = null;
let currentPrintNoDate = false;
let currentPrintTemplateId = "default";
/** @type {any} */
let paymentRequestPreselectedInvoice = null;
let paymentRequestRowUid = 0;
/** @type {any[]} */
let uploadedFilesCache = [];
let uploadedFilesLoaded = false;
/** @type {any} */
let selectedReconHistoryIndex = null;
/** @type {any} */
let reconciliationTab = "current";
let reconciliationAreaFilter = "";
/** @type {any} */
let collectionLeafletMap = null;
/** @type {any} */
let collectionLeafletLayer = null;
/** @type {any} */
let collectionRegionLayer = null;
/** @type {any} */
let philippinesRegionGeoJson = null;
/** @type {any} */
let arTrackerTab = "all";
let arTrackerStatusFilter = "all";
/** @type {any} */
let collectionsWorkflowTab = "ledger";
let collectionsClientSearch = "";
let collectionMapZoom = 1;
let inventoryBranchTab = "Las Pinas";
// Inventory page view state. Seeded from the URL (?section=inventory&tab=…&branch=…) so a
// refresh or shared link restores the same view; read here at parse time because showSection()
// rewrites the URL later during startup.
const INVENTORY_TABS = /** @type {(string | null)[]} */ (["stocks", "receiving", "receipts", "completed", "transfers", "demos", "rhist", "thist"]);
const INVENTORY_SORT_KEYS = /** @type {(string | null)[]} */ (["item", "lot", "branch", "expiry", "qty"]);
const INVENTORY_STATUS_KEYS = /** @type {(string | null)[]} */ (["all", "available", "near", "low", "critical", "disposal"]);
const inventoryUrlParams = (() => {
  try { const p = new URLSearchParams(location.search); return p.get("section") === "inventory" ? p : new URLSearchParams(); } catch { return new URLSearchParams(); }
})();
/** @type {any} */
let inventoryWorkflowTab = INVENTORY_TABS.includes(inventoryUrlParams.get("tab")) ? inventoryUrlParams.get("tab") : "stocks";
let inventoryCompactView = inventoryUrlParams.get("compact") === "1";
/** @type {any} */
let inventoryBranchView = inventoryUrlParams.get("branch") || "all"; // "all" or a branch name
/** @type {any} */
let inventoryStatusKey = INVENTORY_STATUS_KEYS.includes(inventoryUrlParams.get("status")) ? inventoryUrlParams.get("status") : "all";
let inventorySearch = inventoryUrlParams.get("q") || "";
/** @type {any} */
let inventorySort = { key: INVENTORY_SORT_KEYS.includes(inventoryUrlParams.get("sort")) ? inventoryUrlParams.get("sort") : "expiry", dir: inventoryUrlParams.get("dir") === "desc" ? -1 : 1 };
let inventoryPage = Math.max(0, (Number(inventoryUrlParams.get("page")) || 1) - 1);
/** @type {any} */
let inventorySelectedRef = null;
let inventoryFocusQuery = "";
/** @type {any} */
let poViewMode = "table";
/** @type {any} */
let poWorkflowTab = "pending";
/** @type {any} */
let creditInvoiceWorkflowTab = "pending";
let masterShowArchived = false;
/** @type {any} */
let currentSalesBreakdownDimension = null;
let clientInvoicesReturnSection = "receivables-tracker";
/** @type {any} */
let editingPoId = null;
// The invoice being cancelled while its Cancel & Replace modal is open. It still reads as active
// until the save, but must not count against its own PO's pending qty or the client's credit,
// or the replacement can never be raised against the same PO.
/** @type {string | null} */
let cancelReplaceSaleId = null;
// Set while the maker edits an expense request that an approver returned to them.
/** @type {string | null} */
let editingExpenseId = null;
let userStatusFilter = "all";
/** @type {any} */
let invoiceViewMode = "table";
/** @type {any} */
let clientHistoryTab = "invoices";
/** @type {Record<string, number>} */
let purchaseHistoryVisibleCounts = {};
let itemForecastMonths = 3;
let itemForecastFilters = { brand: "", client: "", item: "", division: "", region: "", classification: "" };
/** @type {any} */
let payablesWorkflowTab = "all";
/** @type {any} */
let replenishmentsWorkflowTab = "all";
let transferRowUid = 0;
let invoiceRowUid = 0;
let stockSheetRowUid = 0;
let demoRowUid = 0;
/** @type {any} */
let ptActiveType = "SI";
/** @type {{ fields: Record<string, any>, row: any }} */
let ptOverrides = { fields: {}, row: null };
/** @type {any} */
let ptSelectedField = null;
/** @type {any} */
let ptSelectedKind = null;
let ptStepIn = 0.05;
/** @type {Record<string, any>} */
const PRINT_TEMPLATE_FIELDS = {
  SI: {
    point: [
      ["si-date", "Date"], ["si-po", "P.O. No."], ["si-terms", "Terms of Payment"], ["si-sold", "Sold To"],
      ["si-registered", "Registered Name"], ["si-tin", "TIN"], ["si-address", "Address"],
      ["si-total-sales", "Total Sales (VAT Incl.)"], ["si-net-vat", "Amount Net of VAT"], ["si-discount", "Discount"],
      ["si-vat", "VAT"], ["si-amount-due", "Total Amount Due"], ["si-prepared", "Prepared By"], ["si-approved", "Approved By"],
    ],
    rowCols: [["si-item", "Item"], ["si-lot", "Lot / Expiry"], ["si-qty", "Qty"], ["si-price", "Price"], ["si-amount", "Amount"]],
  },
  TS: {
    point: [
      ["ts-date", "Date"], ["ts-po", "P.O. No."], ["ts-terms", "Terms"], ["ts-client", "Client"], ["ts-address", "Address"],
      ["ts-tax-label", "Tax Label"], ["ts-total", "Total"], ["ts-prepared", "Prepared By"], ["ts-approved", "Approved By"],
    ],
    rowCols: [["ts-code", "Code"], ["ts-item", "Item"], ["ts-lot", "Lot / Expiry"], ["ts-qty", "Qty"], ["ts-amount", "Amount"]],
  },
  DR: {
    point: [
      ["dr-date", "Date"], ["dr-terms", "Terms"], ["dr-po", "P.O. No."], ["dr-client", "Client"], ["dr-address", "Address"],
      ["dr-prepared", "Prepared By"], ["dr-recorded", "Recorded By"], ["dr-approved", "Approved By"], ["dr-received", "Received By"],
    ],
    rowCols: [["dr-qty", "Qty"], ["dr-item", "Item"], ["dr-lot", "Lot / Expiry"], ["dr-price", "Price"], ["dr-amount", "Amount"]],
  },
};
/** @type {any} */
let pendingServerSave = null;
let serverRevision = 0;
function pendingSaveQueueKey() {
  const userKey = String(currentUser?.email || currentUser?.id || currentUser?.role || "guest").trim().toLowerCase();
  return `medlane-pending-save-queue:${location.host || "local"}:${userKey}`;
}

/** @type {Record<string, string[]>} */
const frontendModuleRecordKeys = {
  dashboard: [],
  analytics: [],
  masterlists: ["clients", "items", "suppliers", "employees", "banks", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  inventory: ["inventory", "pendingTransfers", "transferHistory", "inventoryPurchaseOrders", "inventoryDemoRequests", "stockReceipts"],
  "purchase-orders": ["purchaseOrders"],
  "item-forecast": [],
  sales: ["sales"],
  invoicing: ["sales", "pendingCreditInvoices"],
  collections: ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  "payment-request-detail": ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  "receivables-tracker": ["sales", "payments", "collectionContacts", "collectionContactHistory"],
  "client-invoices": ["sales", "payments", "paymentRequests", "inventoryDemoRequests"],
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
  memos: ["memos"],
  calendar: ["calendarEvents"],
};

const philippinesRegionsGeoJsonUrl = "https://raw.githubusercontent.com/wmgeolab/geoBoundaries/41af8f1/releaseData/gbOpen/PHL/ADM1/geoBoundaries-PHL-ADM1_simplified.geojson";

/** @type {Record<string, number[]>} */
const clientCoordinates = {
  "IlocosCare Laboratory": [16.6159, 120.3209],
  "Cagayan Valley Diagnostics": [17.6132, 121.7270],
  "Central Luzon MedLab": [15.0333, 120.6833],
  "CALABARZON Hospital Lab": [14.2117, 121.1653],
  "Bicol Diagnostics": [13.6218, 123.1948],
  "Visayas Dealer Hub": [10.3157, 123.8854],
  "Mindanao Dealer Hub": [7.1907, 125.4553],
};

/** @type {Record<string, any>} */
const accounts = {
  Superadmin: { name: "Superadmin", role: "Superadmin", branch: "all", email: "superadmin@medlane.local", phone: "+63 900 000 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  Admin: { name: "Admin User", role: "Admin", branch: "all", email: "admin@medlane.local", phone: "+63 917 100 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  CEO: { name: "CEO", role: "CEO", branch: "all", email: "ceo@medlane.local", phone: "+63 917 200 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"] },
  Accounting: { name: "Joy Santos", role: "Accounting", branch: "all", email: "joy@medlane.local", phone: "+63 917 300 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings", "logs"] },
  Sales: { name: "Ana Cruz", role: "Sales", branch: "Region IV-A", email: "ana@medlane.local", phone: "+63 917 400 0000", modules: ["dashboard", "calendar", "inventory", "sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings", "product-issues"] },
  Logistics: { name: "Ramon Dela Cruz", role: "Logistics", branch: "all", email: "ramon@medlane.local", phone: "+63 917 500 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "item-forecast", "reports", "notifications", "user-settings"] },
  "Product Specialist": { name: "Product Specialist", role: "Product Specialist", branch: "all", email: "product.specialist@medlane.local", phone: "+63 917 700 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "item-forecast", "reports", "notifications", "user-settings", "product-issues"] },
  Engineering: { name: "Service Engineer", role: "Engineering", branch: "all", email: "engineering@medlane.local", phone: "+63 917 800 0000", modules: ["dashboard", "calendar", "analytics", "inventory", "reports", "notifications", "user-settings", "product-issues"] },
  HR: { name: "HR User", role: "HR", branch: "all", email: "hr@medlane.local", phone: "+63 917 600 0000", modules: ["dashboard", "calendar", "analytics", "masterlists", "replenishments", "reports", "notifications", "user-settings"] },
};
// Every role can view memos (audience targeting is enforced per-memo); only Superadmin/CEO/HR
// get "memos" in roleEditableModules below, which is what actually gates posting one.
Object.values(accounts).forEach((account) => account.modules.push("memos"));
if (currentUser?.role && accounts[currentUser.role] && !currentUser.id && !currentUser.customPermissions) currentUser = accounts[currentUser.role];

/** @type {Record<string, string[]>} */
const sectionMeta = {
  notifications: ["Notifications", "Review system alerts for credit limits, stock transfers, collections, and inventory risks."],
  "user-settings": ["User Settings", "View and update your profile, contact details, and session preferences."],
  "client-invoices": ["Client Invoice Timeline", "Review every invoice for one client using an order-status timeline."],
  "report-detail": ["Report Detail", "Focused report view with graphs, source records, and connected module actions."],
  "product-issue-detail": ["Support Report Detail", "Full status history and turnaround timeline for this technical support report."],
  "inventory-po-detail": ["Purchase Order Detail", "Approval, dispatch, and receiving history for this purchase order."],
  "payment-request-detail": ["Payment Received Detail", "Approval and payment history for this collection payment received."],
  "sale-detail": ["Invoice Detail", "How and when this invoice was created and collected."],
  "user-audit-log": ["User Activity Log", "Every recorded action for one user, newest first."],
  memos: ["Memos", "Company memos and announcements, with acknowledgment tracking."],
};

function userProfileKey() { return `medlane-profile-${currentUser?.role || "guest"}`; }
/** @param {any} [role] */
function passwordKey(role = currentUser?.role) { return `medlane-password-${role || "guest"}`; }
function savedPassword() { return ""; }
/** @param {string} email */
function emailPasswordKey(email) { return `medlane-password-email-${String(email || "").trim().toLowerCase()}`; }
function savedLoginPassword() { return ""; }
function platformAreas() {
  // Union, not replace: data.platformAreas only ever grows via import-migration pushes of
  // extra custom areas. Falling back to the 7 built-in defaults purely on emptiness would
  // permanently hide them the moment even one custom area got pushed onto an otherwise-empty
  // array (bug: an account whose only pushed area was "Visayas Dealer" showed ONLY that option).
  const custom = Array.isArray(data?.platformAreas) ? data.platformAreas : [];
  return [...new Set([...initialData.platformAreas, ...custom])];
}
/** @returns {string[]} */
function platformBranches() { return data?.platformBranches?.length ? data.platformBranches : initialData.platformBranches; }
function branchAddresses() { return data?.branchAddresses || /** @type {Record<string, any>} */ ({}); }
function invoiceApprovals() { return data?.invoiceApprovals || { SI: "ECTOSOC", TS: "ECTOSOC", DR: "ECTOSOC" }; }
function isDevEnvironment() { return ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:"; }
function effectiveModules() {
  // Superadmin/CEO are hard-allowed on every module server-side (canAccessKey in worker.js), so a
  // stale or partial custom-permission set must never hide nav from them — e.g. a Superadmin whose
  // stored per-module permission rows predate a newer module like "print-templates" would otherwise
  // lose the Print Templates nav item while other Superadmins (no custom rows) keep it.
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return accounts[currentUser.role]?.modules || currentUser?.modules || [];
  const modules = currentUser?.customPermissions?.view?.length ? currentUser.customPermissions.view : currentUser?.modules || [];
  const blocked = roleBlockedModules[currentUser?.role] || [];
  return blocked.length ? modules.filter((/** @type {string} */ module) => !blocked.includes(module)) : modules;
}
// Mirrors ROLE_BLOCKED_MODULES in worker.js (which also strips these from the server profile).
/** @type {Record<string, string[]>} */
const roleBlockedModules = { Logistics: ["logs", "product-issues"] };
/** @type {Record<string, string[]>} */
const roleEditableModules = {
  Superadmin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates", "memos"],
  Admin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  CEO: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates", "memos"],
  Accounting: ["purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings"],
  Sales: ["sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings", "product-issues"],
  Logistics: ["inventory", "reports", "notifications", "user-settings"],
  "Product Specialist": ["inventory", "reports", "notifications", "user-settings", "product-issues"],
  Engineering: ["inventory", "reports", "notifications", "user-settings", "product-issues"],
  HR: ["replenishments", "reports", "notifications", "user-settings", "memos"],
};
// Support Tracker: only Sales, Admin, CEO and Superadmin can REQUEST (create) service reports.
// Engineering and Product Specialist can only update status on existing reports; every other role
// is view-only. Mirrored server-side in canAccessKey() + assertSupportReportChangesAllowed().
const supportReportRequesterRoles = ["Sales", "Admin", "CEO", "Superadmin"];
const supportReportEditorRoles = [...supportReportRequesterRoles, "Engineering", "Product Specialist"];
function canRequestSupportReport() { return supportReportRequesterRoles.includes(currentUser?.role) && canEditModule("product-issues"); }
function editableModules() {
  // Same reasoning as effectiveModules(): Superadmin/CEO always get their full editable set so a
  // partial stored permission set can't strip edit access the server would still grant them.
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return roleEditableModules[currentUser.role] || [];
  const list = currentUser?.customPermissions?.enabled ? currentUser.customPermissions.edit || [] : roleEditableModules[currentUser?.role] || [];
  return supportReportEditorRoles.includes(currentUser?.role) ? list : list.filter((/** @type {string} */ id) => id !== "product-issues");
}
/** @param {string} sectionId */
function canEditModule(sectionId) { return editableModules().includes(sectionId); }
function canEditActiveSection() { return editableModules().includes(qs(".section.active")?.id || "dashboard"); }
// Directly correcting a stored stock row's quantity / expiry / note is a higher bar than the
// "inventory" module permission (which also covers receiving and transfers for Logistics et al.).
// Superadmin/CEO always; Admin only when they also hold inventory-edit (so the server, which
// still requires the inventory key in writableKeys, agrees). Also enforced server-side.
function canEditStockRecord() {
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return true;
  return currentUser?.role === "Admin" && canEditModule("inventory");
}
function permissionModules() { return [...new Set(Object.values(accounts).flatMap((account) => account.modules))].filter((module) => !["client-invoices", "invoice-flow-detail", "report-detail"].includes(module)); }
function followupDate() { return new Date(); }
/** @param {any} [date] */
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
/** @param {string} name */
function firstName(name) { return String(name || "User").split(/\s+/)[0]; }
/** @param {string} name */
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
    pendingCreditInvoices: [],
    purchaseOrders: [],
    inventoryPurchaseOrders: [],
    inventoryDemoRequests: [],
    payments: [],
    payables: [],
    replenishments: [],
    users: [],
    warranties: [],
    productIssues: [],
    imports: [],
    pendingTransfers: [],
    stockReceipts: [],
    paymentRequests: [],
    transferHistory: [],
    notifications: [],
    reconHistory: [],
    collectionContacts: [],
    collectionContactHistory: [],
    banks: [],
    printTemplates: [],
    memos: [],
    calendarEvents: [],
  };
}

function loadData() {
  return normalizeData(emptyProductionData());
}

/** @param {any} value */
function roundCurrency(value) { return Math.round(Number(value || 0) * 100) / 100; }
/** @param {number} gross */
function withholdingBaseFromGross(gross) { return roundCurrency(Number(gross || 0) / 1.12); }
/** @param {any} value */
function hasWithholding(value) { return value === true || Number(value || 0) > 0; }
/** @param {any[]} [items] */
function itemGross(items = []) { return items.reduce((sum, item) => sum + Number(item.amount || 0), 0); }

/** @param {PaymentRequest} request */
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

/** @param {Record<string, any>} payable */
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

// Records that were never assigned an explicit id (e.g. hand-authored seed/legacy data)
// used to get one invented purely from their position in the array (`${prefix}-${index+1}`).
// That position isn't stable — it depends on server read order, which can shift between
// loads — so the same fabricated id could land on a different record next time, or worse,
// collide with a real record's genuine id elsewhere in the array. When that happens, both
// records save under the same key and one silently overwrites the other. Assign fallback
// ids only from numbers not already taken by a real id in this array, so a fabricated id
// can never collide with one someone actually owns.
/** @param {any[]} records @param {string} prefix */
function withStableFallbackIds(records, prefix) {
  const used = new Set(records.map((record) => record.id).filter(Boolean));
  let next = 1;
  return records.map((record) => {
    if (record.id) return record;
    let candidate = `${prefix}-${String(next).padStart(3, "0")}`;
    while (used.has(candidate)) { next += 1; candidate = `${prefix}-${String(next).padStart(3, "0")}`; }
    used.add(candidate);
    next += 1;
    return { ...record, id: candidate };
  });
}

/** @param {RawData} next @returns {AppData} */
function normalizeData(next) {
  next.printTemplates ||= [];
  next.memos ||= [];
  next.calendarEvents ||= [];
  next.pendingTransfers ||= [];
  next.pendingCreditInvoices ||= [];
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
  next.inventoryDemoRequests ||= [];
  next.stockReceipts ||= [];
  next.productIssues = (next.productIssues || []).map((report) => ({ status: "Open", history: [], ...report }));
  next.clients = next.clients.map((client, index) => {
    const { terms, ...clientWithoutTerms } = client;
    const accountType = client.dealer === "Dealer" || client.dealer?.includes("Dealer") ? "Dealer" : "Direct";
    return { salesperson: client.salesperson || "Unassigned", terms: Number(client.terms || 30), creditLimit: [180000, 120000, 210000, 160000][index] || 150000, withholdingTax: Boolean(client.withholdingTax), expandedWithholdingTax: Boolean(client.expandedWithholdingTax), docs: client.docs || "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA", ...clientWithoutTerms, dealer: accountType };
  });
  next.items = next.items.map((item) => ({ brand: item.brand || item.supplier || "Medlane", ...item, uom: normalizeUom(item.uom) || "unit" }));
  next.suppliers = next.suppliers.map((supplier) => ({ brand: supplier.brand || "Multiple", ...supplier }));
  next.employees = next.employees.map((employee, index) => {
    const salary = Number(String(employee.salary || "").replace(/[^0-9.-]/g, ""));
    return { ...employee, salary: Number.isFinite(salary) && salary > 0 ? salary : [85000, 52000, 42000][index] || 35000 };
  });
  next.inventory = next.inventory.map((stock) => ({ brand: stock.brand || next.items.find((item) => item.code === stock.code)?.brand || "Medlane", ...stock }));
  next.pendingTransfers = next.pendingTransfers.map((transfer) => {
    const lot = transfer.sourceLot || String(transfer.lot || "").replace(/-TR$/, "");
    const source = next.inventory.find((item) => item.code === transfer.code && item.lot === lot) || /** @type {Record<string, any>} */ ({});
    const expiry = transfer.expiry || source.expiry || "N/A";
    const lines = transfer.lines?.length ? transfer.lines : [{ code: transfer.code, item: transfer.item, brand: transfer.brand || source.brand || "Medlane", qty: Number(transfer.qty || 0), uom: transfer.uom || "unit", lot, expiry }];
    return { ...transfer, lot, sourceLot: lot, expiry, lines };
  });
  next.sales = next.sales.map((sale) => {
    const client = next.clients.find((c) => c.name === sale.client);
    const item = next.items.find((i) => i.name === sale.item);
    const stock = next.inventory.find((entry) => entry.code === item?.code || entry.item === sale.item) || /** @type {Record<string, any>} */ ({});
    const line = { item: sale.item, code: item?.code || sale.code || sale.item, brand: sale.brand || item?.brand || "Medlane", qty: Number(sale.qty || 1), uom: sale.uom || item?.uom || "unit", price: sale.qty ? Math.round(((sale.amount || 0) / sale.qty) * 100) / 100 : item?.price || 0, lot: sale.lot || stock.lot || "Manual", expiry: sale.expiry || stock.expiry || "N/A", discount: Number(sale.discount || 0), discountReason: sale.discountReason || "", terms: Number(sale.terms || item?.terms || 30) };
    const amount = Number(sale.amount || 0);
    const manualDiscount = Number(sale.discount || 0);
    const withholdingTax = Boolean(sale.withholdingTax);
    const expandedWithholdingTax = Boolean(sale.expandedWithholdingTax);
    return { po: sale.po || `PO-${sale.id}`, documentNo: sale.documentNo || sale.id, dealer: sale.dealer || client?.dealer || "Direct", brand: sale.brand || item?.brand || "Medlane", area: client?.area || sale.area, status: sale.status || "Active", lines: (sale.lines || [line]).map((/** @type {any} */ entry) => ({ lot: stock.lot || "Manual", expiry: stock.expiry || "N/A", ...entry })), discount: manualDiscount, discountReason: sale.discountReason || "", withholdingTax, expandedWithholdingTax, autoTaxRate: 0, withholdingDiscount: 0, expandedWithholdingDiscount: 0, taxTreatment: sale.taxTreatment || [withholdingTax ? "Withholding Tax 5%" : "", expandedWithholdingTax ? "Expanded Withholding Tax 1%" : ""].filter(Boolean).join(" + "), ...sale };
  });
  next.paymentRequests = next.paymentRequests.map(normalizePaymentRequestWithholding);
  next.payables = withStableFallbackIds(next.payables, "PAY").map((payable) => normalizePayableWithholding({ id: payable.id, requestStatus: payable.requestStatus || (payable.status === "Cancelled" ? "Cancelled" : payable.status === "Approved" ? "Approved" : "For Approval"), paymentConfirmed: Boolean(payable.paymentConfirmed), items: payable.items || [{ particulars: payable.item || "Payable", qty: Number(payable.qty || 1), uom: payable.uom || "unit", amount: Number(payable.amount || 0) }], method: payable.method || (payable.cheque ? "Cheque" : "Cash"), bank: payable.bank || "", cheque: payable.cheque || "", chequeDate: payable.chequeDate || "", uom: payable.uom || "unit", qty: Number(payable.qty || 1), ...payable }));
  next.replenishments = withStableFallbackIds(next.replenishments, "REP").map((expense) => ({ id: expense.id, requestStatus: expense.requestStatus || (["Approved", "Approved by HR"].includes(expense.status) ? "Approved" : expense.status === "Cancelled" ? "Cancelled" : "For Approval"), paymentConfirmed: Boolean(expense.paymentConfirmed), method: expense.method || "Cash", bank: expense.bank || "", cheque: expense.cheque || "", chequeDate: expense.chequeDate || "", items: expense.items || [{ particulars: expense.file || expense.type || "Expense", amount: Number(expense.amount || 0) }], ...expense }));
  next.payments = next.payments.map((payment) => ({ receiptNo: payment.receiptNo || payment.reference || "Manual", tag: payment.tag || (String(payment.invoice).startsWith("TS") ? "TS-PR" : "SI-CR"), dateRecorded: payment.dateRecorded || fmtDate(today), bank: payment.bank || "", chequeDate: payment.chequeDate || "", collectionStatus: payment.collectionStatus || "For Deposit", postedDate: payment.postedDate || "", cheques: payment.cheques || [], statusHistory: payment.statusHistory || [{ date: payment.dateRecorded || fmtDate(today), status: payment.collectionStatus || "For Deposit", user: payment.client || "Imported" }], ...payment }));
  // "For Deposition" was renamed "For Deposit"; payments saved before the rename still carry the old label.
  next.payments = next.payments.map((payment) => payment.collectionStatus === "For Deposition" || payment.statusHistory?.some((/** @type {any} */ entry) => entry.status === "For Deposition")
    ? { ...payment, collectionStatus: payment.collectionStatus === "For Deposition" ? "For Deposit" : payment.collectionStatus, statusHistory: (payment.statusHistory || []).map((/** @type {any} */ entry) => entry.status === "For Deposition" ? { ...entry, status: "For Deposit" } : entry) }
    : payment);
  next.purchaseOrders = next.purchaseOrders.map((po) => {
    const client = next.clients.find((item) => item.name === po.client);
    const lines = (po.lines || []).map((/** @type {any} */ line) => {
      const item = next.items.find((entry) => entry.code === line.code || entry.name === line.item) || /** @type {Record<string, any>} */ ({});
      return { ...line, item: line.item || item.name, code: line.code || item.code || line.item, brand: line.brand || item.brand || "Medlane", qty: Number(line.qty || 0), uom: line.uom || item.uom || "unit", price: Number(line.price || 0) };
    });
    return { ...po, id: po.id, client: po.client, area: po.area || client?.area || "Region I", salesperson: po.salesperson || currentUser?.name || "System User", date: po.date || fmtDate(today), lines, status: po.status || "For Invoicing" };
  });
  /** @type {Record<string, string>} */
  const legacyPoStatus = { "Purchase Receiving": "Pending Approval", "For Receiving": "Pending Approval", Received: "Fully Received" };
  next.inventoryPurchaseOrders = next.inventoryPurchaseOrders.map((po) => ({ ...po, id: po.id, supplier: po.supplier, branch: po.branch || "", date: po.date || fmtDate(today), terms: po.terms || 30, status: legacyPoStatus[po.status] || po.status || "Pending Approval", approvedBy: po.approvedBy || "", approvedAt: po.approvedAt || "", cancelledBy: po.cancelledBy || "", cancelledAt: po.cancelledAt || "", receivedBy: po.receivedBy || "", receivedAt: po.receivedAt || "", history: po.history || [], lines: (po.lines || []).map((/** @type {any} */ line) => ({ ...line, receivedQty: Number(line.receivedQty || 0) })) }));
  next.inventoryDemoRequests = withStableFallbackIds(next.inventoryDemoRequests, "DEMO").map((request) => ({ id: request.id, date: request.date || fmtDate(today), requestedBy: request.requestedBy || "System User", client: request.client || "", salesAgent: request.salesAgent || request.requestedBy || "", demoDate: request.demoDate || "", returnDate: request.returnDate || "", purpose: request.purpose || "", location: request.location || "", contactPerson: request.contactPerson || "", contactNumber: request.contactNumber || "", status: request.status || "For Sales Approval", salesApprovedBy: request.salesApprovedBy || "", managementApprovedBy: request.managementApprovedBy || "", closedBy: request.closedBy || "", history: request.history || [], lines: (request.lines || []).map((/** @type {any} */ line) => ({ type: line.type || "Machine", code: line.code || "", item: line.item || "", brand: line.brand || "", qty: Number(line.qty || 0), lot: line.lot || "", notes: line.notes || "" })), ...request }));
  const clientsWithBalance = new Set(next.sales.filter((sale) => Number(sale.net || 0) - Number(sale.paid || 0) > 0).map((sale) => sale.client));
  next.collectionContacts = next.clients.filter((client) => clientsWithBalance.has(client.name)).map((client) => {
    const existing = next.collectionContacts.find((contact) => contact.client === client.name || contact.area === client.area) || /** @type {Record<string, any>} */ ({});
    const status = existing.status === "Called" ? "Unreached" : existing.status || "Pending";
    const currentWeek = followupWeekKey();
    const savedWeek = existing.weekKey || followupWeekKey(existing.lastContact);
    const hasWeeklyWork = status !== "Pending" || existing.lastContact || existing.employee || existing.channels?.length;
    const shouldReset = hasWeeklyWork && savedWeek !== currentWeek;
    return shouldReset
      ? { client: client.name, area: client.area, status: "Pending", lastContact: "", employee: "", channels: [], notes: "Fresh weekly follow-up. Not yet contacted this week.", weekKey: currentWeek }
      : { client: client.name, area: client.area, status, lastContact: existing.lastContact || "", employee: existing.employee || "", channels: existing.channels || [], notes: existing.notes || "Not yet contacted this week.", weekKey: savedWeek || currentWeek };
  });
  return /** @type {AppData} */ (/** @type {unknown} */ (next));
}

// Mirrors the server's recordKeyFor() (src/worker.js) so arrays can be de-duplicated by the
// same identity the database uses, before they're ever sent. Two records that would resolve
// to the same key in a single upsert make Postgres reject the whole batch with "ON CONFLICT
// DO UPDATE command cannot affect row a second time" — this stops that from ever reaching the
// server, and self-heals any already-duplicated local data on the very next save.
/** @param {string} key @param {any} value @param {number} [index] */
function saveRecordKeyFor(key, value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (key === "inventory") return [value.code || value.item || "stock", value.branch || "branch", value.lot || value.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
  if (key === "transferHistory") return String(value.id || [value.transferId, value.date, value.action].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "warranties") return String(value.serial || value.id || `${value.client || "client"}|${value.equipment || "equipment"}|${value.warrantyEnd || index}`);
  if (key === "imports") return String(value.id || [value.date, value.module, value.file].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "reconHistory") return String(value.id || [value.date, value.range, value.period].filter(Boolean).join("|") || `${key}-${index}`);
  return String(value.id || value.documentNo || value.receiptNo || value.cvNo || value.code || value.name || value.email || `${key}-${index}`);
}

// Merges rows from the live-update feed (/api/modules/changes) into `data` in place. Returns the
// set of module keys that actually changed. Modules with unsaved local edits in the pending-save
// queue are skipped so a background poll can never clobber work the user hasn't saved yet.
const LIVE_SINGLETON_KEYS = ["branchAddresses", "invoiceApprovals"];
/** @param {any[]} rows */
function mergeLiveChanges(rows) {
  const changed = new Set();
  if (!Array.isArray(rows) || !rows.length || !data) return changed;
  const pending = readPendingSaveQueue();
  for (const { module, key, data: record } of rows) {
    if (!module || pending[module] !== undefined || !record || typeof record !== "object") continue;
    if (LIVE_SINGLETON_KEYS.includes(module)) {
      if (JSON.stringify(data[module]) !== JSON.stringify(record.value)) { data[module] = record.value; changed.add(module); }
      continue;
    }
    if (!Array.isArray(data[module])) continue;
    const list = data[module];
    // Match on the stored record_key first; fall back to the key the incoming record itself
    // computes to (a save with an explicit/previous key can store it under a key that no longer
    // matches its contents), so an edit replaces the local copy instead of duplicating it.
    let index = list.findIndex((entry, i) => saveRecordKeyFor(module, entry, i) === key);
    if (index < 0) {
      const ownKey = saveRecordKeyFor(module, record, list.length);
      if (ownKey && !ownKey.startsWith(`${module}-`)) index = list.findIndex((entry, i) => saveRecordKeyFor(module, entry, i) === ownKey);
    }
    if (index >= 0) {
      if (JSON.stringify(list[index]) === JSON.stringify({ ...list[index], ...record })) continue;
      list[index] = record;
    } else list.push(record);
    changed.add(module);
  }
  if (changed.size) data = normalizeData({ ...emptyProductionData(), ...data });
  return changed;
}

/** @param {string} key @param {any[]} records @param {Record<string, any>} [explicitKeys] */
function dedupeRecordsForSave(key, records, explicitKeys) {
  if (!Array.isArray(records)) return records;
  const seen = new Map();
  /** @type {string[]} */
  const order = [];
  records.forEach((record, index) => {
    const recordKey = (explicitKeys && explicitKeys[index]) || saveRecordKeyFor(key, record, index) || `__no-key-${index}`;
    if (!seen.has(recordKey)) order.push(recordKey);
    seen.set(recordKey, record);
  });
  return order.map((recordKey) => seen.get(recordKey));
}

/** @param {string[]} keys */
function savePayloadForKeys(keys) {
  /** @type {Record<string, any>} */
  const payload = {};
  [...new Set(keys)].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(data || /** @type {Record<string, any>} */ ({}), key)) payload[key] = Array.isArray(data[key]) ? dedupeRecordsForSave(key, data[key]) : data[key];
  });
  return payload;
}

// In-memory mirror of the pending-save queue, keyed to the same per-user key as before. Every
// synchronous read/write in this codebase goes through this object only — it's the thing the
// retry loop (flushPendingSaveQueue, the periodic timer in events-bootstrap.js) actually depends
// on, so saving/retrying keeps working for the rest of the tab session even if disk storage is
// slow or full. IndexedDB below is a pure write-behind backstop for recovering the queue after a
// reload/crash, never something the live save path has to wait on.
/** @type {any} */
let pendingSaveQueueMemoryKey = null;
/** @type {Record<string, any>} */
let pendingSaveQueueMemory = /** @type {any} */ (null);
// Which key's IndexedDB copy has already been loaded into pendingSaveQueueMemory, so
// ensurePendingSaveQueueHydrated() below only does real work once per user per tab session.
/** @type {any} */
let pendingSaveQueueHydratedKey = null;
// Per-module stamp for each queued snapshot: queuedAt = client time it was queued (drives the
// 12-hour expiry), basedOn = server time the data it was built from was loaded (compared against
// the server's data-reset marker). Kept beside the queue, never inside it, because every reader
// treats each queue key as a module name to save.
/** @typedef {{ queuedAt: number, basedOn: string | null }} PendingSaveMeta */
/** @type {Record<string, PendingSaveMeta>} */
let pendingSaveQueueMeta = {};
// Matches the server's 12-hour app-session limit: anything queued longer ago belongs to a login
// that has already ended, so replaying it would push a snapshot nobody is watching over newer data.
const PENDING_SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** @param {string} key */
function pendingSaveMetaDbKey(key) { return `${key}::meta`; }

const PENDING_SAVE_DB_NAME = "medlane-pending-save";
const PENDING_SAVE_DB_STORE = "queue";

function openPendingSaveDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const request = indexedDB.open(PENDING_SAVE_DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(PENDING_SAVE_DB_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

/** @param {string} key @returns {Promise<Record<string, unknown>>} */
function readPendingSaveQueueFromDb(key) {
  return openPendingSaveDb().then((db) => new Promise((resolve, reject) => {
    const getRequest = db.transaction(PENDING_SAVE_DB_STORE, "readonly").objectStore(PENDING_SAVE_DB_STORE).get(key);
    getRequest.onsuccess = () => resolve(getRequest.result || /** @type {Record<string, any>} */ ({}));
    getRequest.onerror = () => reject(getRequest.error || new Error("IndexedDB read failed"));
  }));
}

// Fire-and-forget: the caller (writePendingSaveQueue) has already updated pendingSaveQueueMemory
// synchronously, so nothing downstream waits on this resolving or needs to handle its failure.
/** @param {string} key @param {Record<string, any>} cleaned @param {Record<string, PendingSaveMeta>} [meta] */
function writePendingSaveQueueToDb(key, cleaned, meta = {}) {
  openPendingSaveDb().then((db) => {
    const store = db.transaction(PENDING_SAVE_DB_STORE, "readwrite").objectStore(PENDING_SAVE_DB_STORE);
    if (Object.keys(cleaned).length) { store.put(cleaned, key); store.put(meta, pendingSaveMetaDbKey(key)); }
    else { store.delete(key); store.delete(pendingSaveMetaDbKey(key)); }
  }).catch((error) => {
    console.warn("Could not persist pending save queue to IndexedDB (disk full or storage unavailable?) — staying queued in memory for this session:", error.message);
  });
}

function readPendingSaveQueue() {
  const key = pendingSaveQueueKey();
  if (pendingSaveQueueMemoryKey !== key) {
    pendingSaveQueueMemoryKey = key;
    pendingSaveQueueMemory = {};
    pendingSaveQueueMeta = {};
  }
  return pendingSaveQueueMemory;
}

/** @param {Record<string, any>} payload */
function writePendingSaveQueue(payload) {
  const key = pendingSaveQueueKey();
  const cleaned = Object.fromEntries(Object.entries(payload || /** @type {Record<string, any>} */ ({})).filter(([, value]) => value !== undefined));
  if (pendingSaveQueueMemoryKey !== key) pendingSaveQueueMeta = {};
  // Keep stamps only for modules still queued; a module that somehow has none is stamped now.
  /** @type {Record<string, PendingSaveMeta>} */
  const meta = {};
  Object.keys(cleaned).forEach((module) => { meta[module] = pendingSaveQueueMeta[module] || newPendingSaveMeta(); });
  pendingSaveQueueMemoryKey = key;
  pendingSaveQueueMemory = cleaned;
  pendingSaveQueueMeta = meta;
  writePendingSaveQueueToDb(key, cleaned, meta);
}

/** @returns {PendingSaveMeta} */
function newPendingSaveMeta() {
  return { queuedAt: Date.now(), basedOn: MedlaneAPI?.dataLoadedAt?.() || null };
}

/** @param {Record<string, any>} payload */
function mergePendingSaveQueue(payload) {
  const incoming = payload || /** @type {Record<string, any>} */ ({});
  const current = readPendingSaveQueue();
  // Each module in this payload is a fresh snapshot of the current in-memory data, so re-stamp it.
  Object.keys(incoming).forEach((module) => { pendingSaveQueueMeta[module] = newPendingSaveMeta(); });
  writePendingSaveQueue({ ...current, ...incoming });
}

// The data generation a save of these queued modules is built on: the oldest `basedOn` among them,
// so one stale module can't ride along inside an otherwise-fresh save.
/** @param {string[]} keys @returns {string | null} */
function pendingSaveBasedOn(keys) {
  const stamps = keys.map((key) => pendingSaveQueueMeta[key]?.basedOn).filter((value) => value && Number.isFinite(Date.parse(String(value))));
  if (!stamps.length) return MedlaneAPI?.dataLoadedAt?.() || null;
  return /** @type {string} */ (stamps.reduce((oldest, value) => (Date.parse(String(value)) < Date.parse(String(oldest)) ? value : oldest)));
}

// Drops queued snapshots that must never be replayed: unstamped ones (queued by a build before
// stamps existed — their age and origin are unknown), ones older than PENDING_SAVE_MAX_AGE_MS, and
// ones built on data loaded before the server's last data reset (wipe or backup restore). Run at
// login / session restore, after the queue is hydrated and before it is applied or flushed.
/** @param {string | null | undefined} resetAt @returns {string[]} the discarded module keys */
function prunePendingSaveQueue(resetAt) {
  const pending = readPendingSaveQueue();
  const resetMs = resetAt ? Date.parse(resetAt) : NaN;
  const now = Date.now();
  const dropped = Object.keys(pending).filter((module) => {
    const meta = pendingSaveQueueMeta[module];
    if (!meta || !Number.isFinite(meta.queuedAt)) return true;
    if (now - meta.queuedAt > PENDING_SAVE_MAX_AGE_MS) return true;
    if (Number.isFinite(resetMs)) {
      const basedOnMs = meta.basedOn ? Date.parse(meta.basedOn) : NaN;
      if (!Number.isFinite(basedOnMs) || basedOnMs < resetMs) return true;
    }
    return false;
  });
  if (dropped.length) {
    console.warn(`Discarded stale unsent changes for: ${dropped.join(", ")}`);
    clearPendingSaveQueueKeys(dropped);
  }
  return dropped;
}

// Awaited once, at login and at session-restore (before applyPendingSaveQueueToLocal() needs
// it), to pull in whatever a previous — crashed or force-closed — tab session left queued.
// Every other call site reads pendingSaveQueueMemory synchronously and never calls this, since by
// the time a logged-in user can trigger a save, this has already resolved.
async function ensurePendingSaveQueueHydrated() {
  const key = pendingSaveQueueKey();
  if (pendingSaveQueueHydratedKey === key) return;
  pendingSaveQueueHydratedKey = key;
  /** @type {Record<string, unknown>} */
  let stored = {};
  /** @type {Record<string, PendingSaveMeta>} */
  let storedMeta = {};
  try {
    stored = await readPendingSaveQueueFromDb(key);
    storedMeta = /** @type {Record<string, PendingSaveMeta>} */ (await readPendingSaveQueueFromDb(pendingSaveMetaDbKey(key)));
  } catch (/** @type {any} */ error) {
    console.warn("Could not read pending save queue from IndexedDB:", error.message);
  }
  if (!Object.keys(stored).length) {
    // One-time migration for a queue left over in localStorage by a pre-IndexedDB build of this
    // code — otherwise it would be silently dropped the first time this ships.
    try {
      const legacy = JSON.parse(localStorage.getItem(key) || "null");
      if (legacy && typeof legacy === "object" && Object.keys(legacy).length) {
        stored = legacy;
        localStorage.removeItem(key);
      }
    } catch { /* ignore malformed legacy entry */ }
  }
  // Don't clobber anything a user already queued (via writePendingSaveQueue) while this was
  // in flight — merge on top of it rather than overwriting.
  const sameKey = pendingSaveQueueMemoryKey === key;
  pendingSaveQueueMemory = { ...stored, ...(sameKey ? pendingSaveQueueMemory : {}) };
  // Stored snapshots keep their stored stamps (a legacy one has none, and prunePendingSaveQueue
  // discards it); anything queued during hydration keeps its in-memory stamp.
  pendingSaveQueueMeta = { ...storedMeta, ...(sameKey ? pendingSaveQueueMeta : {}) };
  pendingSaveQueueMemoryKey = key;
  if (Object.keys(stored).length) writePendingSaveQueueToDb(key, pendingSaveQueueMemory, pendingSaveQueueMeta);
}

// A queued module snapshot only reflects state as of whenever it was queued. If a
// granular persistRecords() save for that same module succeeds afterward (e.g. an
// approval), the queued snapshot is now stale and — left in place — would later
// overwrite (and even re-push to the server) the newer data on the next reload.
// Drop it once the module has a confirmed newer save.
/** @param {string[]} keys */
function clearPendingSaveQueueKeys(keys) {
  const pending = readPendingSaveQueue();
  let changed = false;
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(pending, key)) { delete pending[key]; changed = true; }
  });
  if (changed) writePendingSaveQueue(pending);
}

function hasPendingSaveQueue() {
  return Object.keys(readPendingSaveQueue()).length > 0;
}

function applyPendingSaveQueueToLocal() {
  const pending = readPendingSaveQueue();
  if (!Object.keys(pending).length || !data) return;
  data = normalizeData({ ...emptyProductionData(), ...data, ...pending });
}

/** @param {string} status @param {string} text @param {string} [detail] */
function setGlobalSaveStatus(status, text, detail = "") {
  const indicator = typeof qs === "function" ? qs("#save-status-indicator") : null;
  const label = typeof qs === "function" ? qs("#save-status-text") : null;
  if (!indicator || !label) return;
  indicator.classList.remove("saving", "saved", "error");
  indicator.classList.add(status);
  label.textContent = text;
  if (typeof syncInventorySavedPill === "function") syncInventorySavedPill(status, text);
  // Surfaces the exact underlying error (e.g. the specific timeout/offline/network reason
  // classifyFetchFailure() worked out) as a hover tooltip, without needing a toast — flushPendingSaveQueue
  // deliberately avoids toasts since it runs silently in the background and a toast there can
  // land on top of whatever the user was actually doing.
  indicator.title = detail;
}

// A refresh/close while a save request is actually in flight has no warning today —
// hasPendingSaveQueue() only covers the debounced/queued/failed cases, not the
// window while persistRecords/saveAppState's own fetch is awaiting a response. The
// browser can cancel that request mid-flight with zero signal, genuinely losing the
// write. activeSaveCount tracks that exact window so both the beforeunload guard and
// a full-screen blocking overlay can cover it too.
let activeSaveCount = 0;
/** @type {any} */
let saveGuardWatchdog = null;
const SAVE_GUARD_TIMEOUT_MS = 15000;
function updateSaveGuardOverlay() {
  const dialog = typeof qs === "function" ? qs("#save-guard-dialog") : null;
  if (!dialog) return;
  const busy = activeSaveCount > 0;
  if (busy && !dialog.open) dialog.showModal();
  if (!busy && dialog.open) dialog.close();
}
/** @param {string} [text] */
function beginSaveOperation(text = "Saving…") {
  activeSaveCount += 1;
  const label = typeof qs === "function" ? qs("#save-guard-text") : null;
  if (label) label.textContent = text;
  updateSaveGuardOverlay();
  // Safety valve: fetch() has no built-in timeout, so a hung connection could
  // otherwise leave the blocking overlay (and beforeunload guard) stuck forever
  // with no way out. Never trap the page for longer than this regardless of why
  // the underlying request didn't settle — the change is either already queued
  // for retry or may still complete quietly in the background.
  if (!saveGuardWatchdog) {
    saveGuardWatchdog = setTimeout(() => {
      saveGuardWatchdog = null;
      if (activeSaveCount > 0) {
        activeSaveCount = 0;
        updateSaveGuardOverlay();
        setGlobalSaveStatus("error", "Save is taking longer than expected");
        if (typeof toast === "function") toast("Saving is taking longer than expected — you can keep working. We'll keep retrying in the background.");
      }
    }, SAVE_GUARD_TIMEOUT_MS);
  }
}
function endSaveOperation() {
  activeSaveCount = Math.max(0, activeSaveCount - 1);
  if (activeSaveCount === 0 && saveGuardWatchdog) {
    clearTimeout(saveGuardWatchdog);
    saveGuardWatchdog = null;
  }
  updateSaveGuardOverlay();
}
function isSaveInFlight() {
  return activeSaveCount > 0;
}

// Mirrors the server's canAccessKey(..., "edit"): a user with no edit rights on a key's module gets
// a 403 for the whole save, so the background auto-save (e.g. generated notifications at login)
// must never queue keys they can't write — otherwise "Pending save failed" shows on every login.
/** @param {string} key */
function canEditSaveKey(key) {
  if (["Superadmin", "CEO"].includes(currentUser?.role)) return true;
  const editable = editableModules();
  if (!editable.length) return false;
  const owners = Object.entries(frontendModuleRecordKeys).filter(([, keys]) => keys.includes(key)).map(([module]) => module);
  return owners.length ? owners.some((module) => editable.includes(module)) : true;
}

function inferredSaveKeys() {
  const activeSection = document.body.dataset.activeSection || qs(".section.active")?.id || "dashboard";
  const keys = [...(frontendModuleRecordKeys[activeSection] || [])];
  if (data?.notifications) keys.push("notifications");
  return keys;
}

/** @param {string[] | null} [keys] */
function saveData(keys = null) {
  // Deliberately NOT wrapped in beginSaveOperation()/the blocking overlay — this is
  // a debounced, best-effort background sync used for a huge variety of low-stakes
  // state (which masterlist tab is active, filters, etc.) as well as real edits, and
  // fires from many places that have nothing to do with the user actively waiting on
  // a save (e.g. a validation-error catch block, or just switching tabs). The
  // blocking "Saving..." overlay is reserved for persistRecords()'s explicit,
  // single-record actions (approve, create, confirm payment) that the user is
  // directly waiting on — this only updates the small status indicator.
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return;
  if (typeof syncGeneratedNotifications === "function") syncGeneratedNotifications();
  const payload = savePayloadForKeys((keys || inferredSaveKeys()).filter(canEditSaveKey));
  if (!Object.keys(payload).length) return;
  mergePendingSaveQueue(payload);
  clearTimeout(pendingServerSave);
  setGlobalSaveStatus("saving", "Saving...");
  pendingServerSave = setTimeout(() => {
    if (!navigator.onLine) {
      setGlobalSaveStatus("error", "Offline - pending save");
      return;
    }
    const queuedPayload = Object.fromEntries(Object.entries(readPendingSaveQueue()).map(([key, value]) => [key, Array.isArray(value) ? dedupeRecordsForSave(key, value) : value]));
    MedlaneAPI.saveAppState(queuedPayload, serverRevision, pendingSaveBasedOn(Object.keys(queuedPayload))).then((result) => {
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
          // A stale snapshot (built before a data reset) can never succeed — don't keep retrying it.
          if (error.message.includes("STALE_SNAPSHOT")) writePendingSaveQueue({});
          if (typeof renderAll === "function") renderAll();
          if (typeof toast === "function") toast(error.message.includes("STALE_SNAPSHOT") ? "The system data was reset since this page loaded. Reloaded the latest data — please redo your last change." : "Another user saved first. Reloaded latest server data.");
          setGlobalSaveStatus("saved", "Reloaded");
          return;
        }
      }
      setGlobalSaveStatus("error", "Save failed", error.message);
      if (typeof toast === "function") toast(`Server save failed: ${error.message}`);
    });
  }, 450);
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let discardedSaveReloadTimer;
// A queued change the server refuses for good (e.g. an invoice with an expired lot) is dropped
// instead of retried forever. Tell the user why, then reload server data once the queue is empty
// so the rejected record doesn't linger on screen looking saved.
/** @param {string} reason */
function notifyDiscardedQueuedSave(reason) {
  if (typeof toast === "function") toast(`Not saved — the server rejected an unsent change: ${reason}`);
  clearTimeout(discardedSaveReloadTimer);
  discardedSaveReloadTimer = setTimeout(async () => {
    if (Object.keys(readPendingSaveQueue() || {}).length) return;
    const latest = await MedlaneAPI.loadAppState().catch(() => null);
    if (!latest?.data || Object.keys(readPendingSaveQueue() || {}).length) return;
    serverRevision = Number(latest.revision || 0);
    data = normalizeData({ ...emptyProductionData(), ...latest.data });
    if (typeof renderAll === "function") renderAll();
  }, 500);
}

function flushPendingSaveQueue() {
  // This runs automatically on load/focus/reconnect, not from a user action — it
  // must never show the blocking "Saving your changes" overlay (that's reserved
  // for saves the user is actively waiting on) or it can look like the page is
  // stuck loading every time it's opened, especially if this request is slow or
  // hangs.
  if (!hasPendingSaveQueue() || !currentUser || !MedlaneAPI?.session()?.access_token || !navigator.onLine) return;
  clearTimeout(pendingServerSave);
  setGlobalSaveStatus("saving", "Saving pending changes...");
  const queuedPayload = Object.fromEntries(Object.entries(readPendingSaveQueue()).map(([key, value]) => [key, Array.isArray(value) ? dedupeRecordsForSave(key, value) : value]));
  MedlaneAPI.saveAppState(queuedPayload, serverRevision, pendingSaveBasedOn(Object.keys(queuedPayload))).then((result) => {
    if (result?.revision) serverRevision = Number(result.revision);
    writePendingSaveQueue({});
    setGlobalSaveStatus("saved", "Saved");
  }).catch(async (error) => {
    // A 409 here means the queued payload is stale — some other save landed on the
    // server after this one was queued — so blindly retrying it forever would never
    // succeed (same stale revision every time) and risks overwriting newer server
    // data once it finally does succeed. Resolve it the same way saveData() does:
    // drop the queue and adopt the server's current state. Unlike the silent generic
    // branch below, this one does lose local edits, so it's worth a toast.
    if (error.message.includes("APP_STATE_CONFLICT")) {
      const latest = await MedlaneAPI.loadAppState().catch(() => null);
      if (latest?.data) {
        serverRevision = Number(latest.revision || 0);
        data = normalizeData({ ...emptyProductionData(), ...latest.data });
        writePendingSaveQueue({});
        if (typeof renderAll === "function") renderAll();
        if (typeof toast === "function") toast("Another save landed first. Reloaded latest server data — please redo any changes made since.");
        setGlobalSaveStatus("saved", "Reloaded");
        return;
      }
    }
    // A 400/403/422 is a permanent rejection (permission, validation, circuit breaker) — retrying
    // the identical payload can never succeed, so the "Pending save failed" banner would stick
    // forever (and be re-queued from IndexedDB on every login). Retry each module on its own:
    // modules that save are cleared, modules the server flatly refuses are discarded, and only
    // transient failures stay queued.
    const isPermanentReject = (/** @type {any} */ e) => ([400, 403, 404, 409, 422].includes(e.status) && !/APP_STATE_CONFLICT/.test(e.message || "")) || /Save blocked|cannot approve|permission|^Only /.test(e.message || "");
    if (isPermanentReject(error) && Object.keys(queuedPayload).length > 1) {
      let transient = false;
      for (const [key, value] of Object.entries(queuedPayload)) {
        try {
          const result = await MedlaneAPI.saveAppState({ [key]: value }, serverRevision, pendingSaveBasedOn([key]));
          if (result?.revision) serverRevision = Number(result.revision);
          clearPendingSaveQueueKeys([key]);
        } catch (/** @type {any} */ innerError) {
          if (isPermanentReject(innerError)) {
            console.warn(`Discarding queued "${key}" — server rejected it permanently:`, innerError.message);
            clearPendingSaveQueueKeys([key]);
            notifyDiscardedQueuedSave(innerError.message);
          } else transient = true;
        }
      }
      if (!transient) { setGlobalSaveStatus("saved", "Saved"); return; }
    } else if (isPermanentReject(error)) {
      console.warn("Discarding queued save — server rejected it permanently:", error.message);
      writePendingSaveQueue({});
      notifyDiscardedQueuedSave(error.message);
      setGlobalSaveStatus("saved", "Saved");
      return;
    }
    // Silent by design: this is an automatic background retry the user never asked
    // for and has no way to know is even running. A toast() here can (and did)
    // land on top of — and hide — the actual result of whatever the user was just
    // doing, e.g. triggering a file download can shift window focus enough to fire
    // this via the focus/visibilitychange listeners, right as an unrelated toast is
    // showing. The status indicator still reflects the failure; it'll retry on the
    // next focus/online/reconnect, or on the periodic timer in events-bootstrap.js
    // (events-bootstrap.js:4-9) for a tab left sitting idle on a slow machine.
    // classifyFetchFailure() (api-client.js) already
    // tags timeout/offline/unreachable distinctly, so surface that instead of a flat
    // generic line — the status text stays short, the full reason is the tooltip.
    const reason = error.code === "TIMEOUT" ? "server took too long to respond"
      : error.code === "OFFLINE" ? "you're offline"
      : error.code === "NETWORK" ? "server unreachable"
      : "";
    setGlobalSaveStatus("error", reason ? `Pending save failed — ${reason}, will retry` : "Pending save failed — will retry", error.message);
    console.warn("Pending save queue flush failed, will retry:", error.message);
  });
}

/** @param {Record<string, any[] | undefined>} records @param {Record<string, any>} [recordKeys] */
async function persistRecords(records, recordKeys = {}) {
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return null;
  const filtered = Object.fromEntries(Object.entries(records || /** @type {Record<string, any>} */ ({})).filter(([, value]) => Array.isArray(value) && value.length).map(([key, value]) => [key, dedupeRecordsForSave(key, /** @type {any[]} */ (value), recordKeys?.[key])]));
  if (!Object.keys(filtered).length) return null;
  setGlobalSaveStatus("saving", "Saving...");
  beginSaveOperation();
  try {
    const result = await MedlaneAPI.saveRecords(filtered, recordKeys);
    if (result?.revision) serverRevision = Number(result.revision);
    clearPendingSaveQueueKeys(Object.keys(filtered));
    setGlobalSaveStatus("saved", "Saved");
    return result;
  } catch (/** @type {any} */ error) {
    // Built on data from before a data reset/restore: queueing it would only replay the stale
    // snapshot later. Adopt the server's current data instead and ask the user to redo the change.
    if (/STALE_SNAPSHOT/.test(error.message || "")) {
      const latest = await MedlaneAPI.loadAppState().catch(() => null);
      if (latest?.data) {
        serverRevision = Number(latest.revision || 0);
        data = normalizeData({ ...emptyProductionData(), ...latest.data });
        writePendingSaveQueue({});
        if (typeof renderAll === "function") renderAll();
      }
      setGlobalSaveStatus("error", "Not saved", error.message);
      if (typeof toast === "function") toast("The system data was reset since this page loaded. Reloaded the latest data — please redo this change.");
      return { ok: false, queued: false, error: error.message };
    }
    // Refused for good (validation/permission, e.g. an invoice with an expired lot): queueing it
    // would only retry the same rejected payload forever. Report it and let the caller undo.
    if ([400, 403, 404, 422].includes(Number(error.status)) && !/APP_STATE_CONFLICT/.test(error.message || "")) {
      setGlobalSaveStatus("error", "Not saved", error.message);
      if (typeof toast === "function") toast(`Not saved: ${error.message}`);
      return { ok: false, queued: false, error: error.message };
    }
    mergePendingSaveQueue(savePayloadForKeys(Object.keys(filtered)));
    setGlobalSaveStatus("error", "Save failed", error.message);
    if (typeof toast === "function") toast(`Server save failed; queued for retry: ${error.message}`);
    return { ok: false, queued: true, error: error.message };
  } finally {
    endSaveOperation();
  }
}
// Pull only the latest inventory rows from the server, leaving other in-memory state (drafts,
// open modals) untouched. Used before opening the stock-edit dialog so a quantity adjustment is
// applied on top of a current base. Returns false when the server could not be reached.
async function refreshInventoryFromServer() {
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return false;
  const fresh = await MedlaneAPI.loadAppState().catch(() => null);
  if (!fresh?.data) return false;
  data.inventory = normalizeData({ ...emptyProductionData(), ...fresh.data }).inventory;
  return true;
}
// Same idea as refreshInventoryFromServer(), for the item masterlist. A user building a PO/invoice
// can be stuck on an in-memory `data.items` snapshot taken before another user added a brand-new
// item — the live-update feed should normally catch this, but a build that fails with the "was
// not found in the Items masterlist" error from parseInvoiceLines() is exactly the symptom of
// that window not having closed yet. Pulling a fresh copy here self-heals it without asking the
// user to refresh or relog in.
async function refreshItemsFromServer() {
  if (!currentUser || !MedlaneAPI?.session()?.access_token) return false;
  const fresh = await MedlaneAPI.loadAppState().catch(() => null);
  if (!fresh?.data) return false;
  data.items = normalizeData({ ...emptyProductionData(), ...fresh.data }).items;
  return true;
}
// Wraps a synchronous build*() call (buildSale/buildPurchaseOrder/buildInventoryPurchaseOrder)
// that resolves item lines via parseInvoiceLines()/findItemByCodeOrName(). On the "was not found
// in the Items masterlist" failure (keep this regex in sync with the message parseInvoiceLines()
// throws), refetches the item masterlist once and retries before giving up — see
// refreshItemsFromServer() above for why that failure can be transient rather than a real typo.
/** @param {() => any} buildFn */
async function buildWithItemRefresh(buildFn) {
  try {
    return buildFn();
  } catch (/** @type {any} */ error) {
    if (!/was not found in the Items masterlist/.test(error.message || "") || !(await refreshItemsFromServer())) throw error;
    return buildFn();
  }
}
// Masterlist archiving: an archived record keeps `archived === true` and stays in storage (so
// historical documents and existing transactions still resolve it by code/name) but is hidden
// from the active masterlist tables and from every picker used to build NEW transactions.
// Identity keys for duplicate detection: case, extra/internal spaces and punctuation are ignored
// ("Acme  Corp." == "ACME CORP", "X-RAY" == "XRAY"), TINs compare by digits only.
/** @param {any} value */
function normalizeMasterName(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
// Codes are only case/space-insensitive: punctuation can distinguish real codes ("AB-01" vs "AB01").
/** @param {any} value */
function normalizeMasterCode(value) { return String(value ?? "").toLowerCase().replace(/\s+/g, ""); }
/** @param {any} value */
// An all-zero TIN is a "no TIN on file" placeholder (matches the server guard), so it never counts as a duplicate.
function normalizeMasterTin(value) { const digits = String(value ?? "").replace(/\D/g, ""); return /^0+$/.test(digits) ? "" : digits; }
// Client TINs that several client records may share on purpose: Universidad de Sta. Isabel (R5_94)
// and its USI-HSD unit (R5_95) are one taxpayer. Keep in sync with SHARED_CLIENT_TINS in src/worker.js.
const SHARED_CLIENT_TINS = new Set(["417226790001"]);
/** True when a (normalized) client TIN must be unique: 12 digits and not on the shared list. @param {string} tin */
function isUniqueClientTin(tin) { return tin.length === 12 && !SHARED_CLIENT_TINS.has(tin); }
/** @param {any} record */
function isArchived(record) { return Boolean(record && record.archived); }
/** @template T @param {T[] | null | undefined} list @returns {T[]} */
function activeRecords(list) { return (list || []).filter((record) => !isArchived(record)); }
function activeClients() { return activeRecords(data?.clients); }
function activeItems() { return activeRecords(data?.items); }
function activeSuppliers() { return activeRecords(data?.suppliers); }
/** @returns {Employee[]} */
function activeEmployees() { return activeRecords(data?.employees); }
function activeBanks() { return activeRecords(data?.banks); }

/** @param {any[]} items @param {string} prefix */
function nextId(items, prefix) {
  const next = items.reduce((max, item) => Math.max(max, Number(String(item.id || "").replace(`${prefix}-`, "")) || 0), 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
/** Loosely typed DOM element: known HTMLElement members stay checked, form-control members (value, checked, files…) are allowed. */
/** @typedef {HTMLElement & Record<string, any>} AnyEl */
/** @param {string} selector @returns {AnyEl} */
function qs(selector) { return /** @type {AnyEl} */ (document.querySelector(selector)); }
/** @param {string} selector @returns {AnyEl[]} */
function qsa(selector) { return /** @type {AnyEl[]} */ ([...document.querySelectorAll(selector)]); }
/** querySelector scoped to a root element, loosely typed like qs(). @param {ParentNode} root @param {string} selector @returns {AnyEl} */
function qsIn(root, selector) { return /** @type {AnyEl} */ (root.querySelector(selector)); }
/** @param {ParentNode | null | undefined} root @param {string} selector @returns {AnyEl[]} */
function qsaIn(root, selector) { return /** @type {AnyEl[]} */ ([...(root ? root.querySelectorAll(selector) : [])]); }
/** Nearest ancestor (or self) of an event target matching selector, or null. @param {EventTarget | null} target @param {string} selector @returns {AnyEl} */
function closestEl(target, selector) { return /** @type {AnyEl} */ (/** @type {Element} */ (target).closest(selector)); }
/** @param {any[]} values */
function includesSearch(values) {
  const term = qs("#global-search").value.trim().toLowerCase();
  return !term || values.some((value) => String(value ?? "").toLowerCase().includes(term));
}
/** @template {Record<string, any>} T @param {T[]} items @param {string} [key] @returns {T[]} */
function byBranch(items, key = "branch") { return data.branch === "all" ? items : items.filter((item) => item[key] === data.branch || item[key] === "Both" || item.area === data.branch || item.office === data.branch || item.dealer === data.branch); }
/** @param {any} date @param {any} days */
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + Number(days)); return d; }
/** @param {any} date */
function fmtDate(date) { return new Date(date).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
/** @param {any} date */
function daysUntil(date) { return Math.ceil((new Date(date).getTime() - Number(today)) / 86400000); }
/** @param {any} value */
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => /** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }

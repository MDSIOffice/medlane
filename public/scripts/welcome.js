// Welcome screen, shown after every sign-in (not on a page reload with an existing session).
// Tasks come from todayTasks() (the same rules as each page's Workflow assistant) and numbers from
// the shared kpi* functions (the same definitions as Analytics), so nothing here can disagree with
// the pages it links to. Everything is computed from data the server already limited to this
// person's role (filterRecordsForProfile in worker.js), and each section is also checked with
// canViewModule / canEditModule here. Quick actions click the app's own buttons, so their usual
// permission checks run.

/** The person's previous sign-in, from the login response. @type {{ at: string, device: string, browser: string } | null} */
let welcomePreviousSignIn = null;
/** @type {(() => void) | null} */
let welcomeOnDone = null;
/** Elements made inert while the Welcome screen is up. @type {Element[]} */
let welcomeInert = [];

const WELCOME_ICONS = /** @type {Record<string, string>} */ ({
  dash: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  sale: "M4 19V11M10 19V5M16 19v-6M3 21h18",
  cash: "M3 6h18v13H3zM3 10h18",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  po: "M3 4h2l2.4 11h11L21 7H6.2M9 20h.01M18 20h.01",
  count: "M9 3h6l1 2h3v16H5V5h3zM9 12l2 2 4-4",
  inv: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  cal: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
});
const WELCOME_TONES = /** @type {Record<string, string>} */ ({ red: "#C0392B", orange: "#E07A2F", amber: "#D9A21B", blue: "#2B6CB0", green: "#2F8F6B", slate: "#4A5565", accent: "#1F5F74" });

/** Which layout a role gets. @returns {"management" | "sales" | "warehouse" | "office"} */
function welcomeVariant() {
  const role = String(currentUser?.role || "");
  if (["Superadmin", "CEO"].includes(role)) return "management";
  if (role === "Sales") return "sales";
  if (role === "Logistics") return "warehouse";
  return "office";
}

// Where each layout's tasks come from (only modules the person can open are used).
const WELCOME_TASK_MODULES = {
  management: ["purchase-orders", "payables", "replenishments", "reconciliation", "invoicing", "collections", "inventory", "logs", "users"],
  sales: ["sales", "invoicing", "purchase-history"],
  warehouse: ["inventory", "purchase-orders"],
  office: ["invoicing", "collections", "payables", "replenishments", "receivables-tracker", "sales", "inventory", "purchase-orders"],
};

/** @param {string} module */
function welcomeModuleLabel(module) {
  return document.querySelector(`.nav-item[data-section="${CSS.escape(module === "purchase-orders" ? "inventory" : module)}"]`)?.getAttribute("data-title") || module;
}
/** ₱412,500 (no centavos). @param {number} value */
function welcomePeso(value) { return Math.abs(value) >= 1000000 ? pesoShort(value) : peso.format(value).replace(/\.00$/, ""); }

// ----- navigation ---------------------------------------------------------------------------------
/** Runs a Workflow assistant action exactly as its own button would. @param {string} section @param {UiAttrs} attrs */
function welcomeRun(section, attrs) {
  const goto = attrs["data-wa-goto"];
  if (goto) { const [module, tab, scope, sel] = String(goto).split("|"); return workflowGoto(module, tab, scope, sel); }
  const host = section === "purchase-orders" ? "inventory" : section;
  if (attrs["data-go-section"]) { showSection(String(attrs["data-go-section"])); return; }
  showSection(host);
  if (!Object.keys(attrs).length) return;
  // Fire the same attributes from inside the section, so its own click handlers act on them.
  const button = document.createElement("button");
  button.type = "button";
  button.hidden = true;
  for (const [name, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) button.setAttribute(name, value === true ? "" : String(value));
  (document.getElementById(host) || document.body).appendChild(button);
  button.click();
  button.remove();
}
/** Opens a section and clicks one of its own buttons (so its permission check runs). @param {string} section @param {string} selector */
function welcomeClickIn(section, selector) {
  showSection(section);
  /** @type {HTMLElement | null} */ (document.querySelector(`#${section} ${selector}`))?.click();
}

/** @typedef {{ key: string, label: string, icon: string, show: () => boolean, run: () => void }} WelcomeAction */
/** First approval waiting for this person, for the Approvals shortcut. */
function welcomeApprovalTask() {
  return todayTasks(["purchase-orders", "payables", "replenishments", "invoicing", "collections", "inventory"]).find((task) => /approv/i.test(task.text)) || null;
}
/** @type {Record<string, WelcomeAction>} */
const WELCOME_ACTIONS = {
  dashboard: { key: "dashboard", label: "Dashboard", icon: "dash", show: () => canViewModule("dashboard"), run: () => showSection("dashboard") },
  approvals: { key: "approvals", label: "Approvals", icon: "po", show: () => canViewModule("payables") || Boolean(welcomeApprovalTask()), run: () => { const task = welcomeApprovalTask(); if (task) welcomeRun(task.module, task.attrs); else workflowGoto("payables", "bills", "approval", ""); } },
  analytics: { key: "analytics", label: "Analytics", icon: "sale", show: () => canViewModule("analytics"), run: () => showSection("analytics") },
  recon: { key: "recon", label: "Recon", icon: "count", show: () => canViewModule("reconciliation"), run: () => showSection("reconciliation") },
  newClientPo: { key: "newClientPo", label: "New client PO", icon: "inv", show: () => canViewModule("purchase-orders") && canEditModule("purchase-orders"), run: () => welcomeClickIn("purchase-orders", "#client-po-new") },
  orders: { key: "orders", label: "Client orders", icon: "sale", show: () => canViewModule("sales"), run: () => workflowGoto("sales", "orders", "", "") },
  deliveries: { key: "deliveries", label: "Deliveries", icon: "truck", show: () => canViewModule("sales"), run: () => workflowGoto("sales", "deliveries", "", "") },
  checkStock: { key: "checkStock", label: "Check stock", icon: "box", show: () => canViewModule("inventory") && inventoryVisibleTabs().includes("stocks"), run: () => welcomeRun("inventory", { "data-inventory-workflow": "stocks" }) },
  receive: { key: "receive", label: "Receive stock", icon: "box", show: () => canViewModule("inventory") && inventoryVisibleTabs().includes("receiving") && canManagePoReceiving(), run: () => welcomeRun("inventory", { "data-inventory-workflow": "receiving" }) },
  transfers: { key: "transfers", label: "Transfers", icon: "truck", show: () => canViewModule("inventory") && inventoryVisibleTabs().includes("transfers"), run: () => welcomeRun("inventory", { "data-inventory-workflow": "transfers" }) },
  supplierPos: { key: "supplierPos", label: "Supplier POs", icon: "po", show: () => canViewModule("inventory") && inventoryVisibleTabs().includes("purchasing"), run: () => welcomeRun("inventory", { "data-inventory-workflow": "purchasing" }) },
  itemLookup: { key: "itemLookup", label: "Item lookup", icon: "search", show: () => canViewModule("inventory") && inventoryVisibleTabs().includes("stocks"), run: () => { welcomeRun("inventory", { "data-inventory-workflow": "stocks" }); /** @type {HTMLElement | null} */ (document.querySelector("#inventory input[type='search']"))?.focus(); } },
  newInvoice: { key: "newInvoice", label: "New invoice", icon: "inv", show: () => canViewModule("invoicing") && canEditModule("invoicing"), run: () => welcomeClickIn("invoicing", "[data-action='open-modal'][data-type='invoice']") },
  recordCollection: { key: "recordCollection", label: "Record collection", icon: "cash", show: () => canViewModule("collections") && canEditModule("collections"), run: () => welcomeClickIn("collections", "[data-action='open-modal'][data-type='paymentRequest']") },
  deposits: { key: "deposits", label: "Deposits", icon: "cash", show: () => canViewModule("collections"), run: () => workflowGoto("collections", "deposits", "", "") },
  bills: { key: "bills", label: "Bills", icon: "inv", show: () => canViewModule("payables"), run: () => workflowGoto("payables", "bills", "", "") },
  expenses: { key: "expenses", label: "Expenses", icon: "cash", show: () => canViewModule("replenishments"), run: () => showSection("replenishments") },
  reports: { key: "reports", label: "Reports", icon: "sale", show: () => canViewModule("reports"), run: () => showSection("reports") },
  support: { key: "support", label: "Support Tracker", icon: "count", show: () => canViewModule("product-issues"), run: () => showSection("product-issues") },
  calendar: { key: "calendar", label: "Calendar", icon: "cal", show: () => canViewModule("calendar"), run: () => showSection("calendar") },
};
const WELCOME_ACTION_SETS = {
  management: ["dashboard", "approvals", "analytics", "recon"],
  sales: ["newClientPo", "orders", "deliveries", "checkStock"],
  warehouse: ["receive", "transfers", "supplierPos", "itemLookup"],
  office: ["newInvoice", "recordCollection", "deposits", "bills"],
};
const WELCOME_ACTION_FALLBACK = ["dashboard", "expenses", "support", "checkStock", "reports", "calendar", "analytics"];

/** Four actions this person can use: their role's set first, topped up from the fallback list. */
function welcomeActions() {
  const keys = [...WELCOME_ACTION_SETS[welcomeVariant()], ...WELCOME_ACTION_FALLBACK];
  /** @type {WelcomeAction[]} */
  const out = [];
  for (const key of keys) {
    const action = WELCOME_ACTIONS[key];
    if (out.length < 4 && action && !out.includes(action) && action.show()) out.push(action);
  }
  return out;
}

// ----- at a glance ----------------------------------------------------------------------------------
/** @typedef {{ label: string, value: string, sub: string }} WelcomeStat */
/** @returns {WelcomeStat[]} */
function welcomeStats() {
  /** @type {Record<string, unknown>} */
  const memo = {};
  /** @template T @param {string} key @param {() => T} build @returns {T} */
  const lazy = (key, build) => /** @type {T} */ (memo[key] ??= build());
  const facts = () => lazy("facts", bizFacts);
  const summaries = () => lazy("summaries", () => clientSummaries(facts()));
  const periods = kpiPeriods();
  const month = shortMonthLabel(periods.todayKey.slice(0, 7));
  const lastMonth = shortMonthLabel(periods.prev.start.slice(0, 7));
  const change = (/** @type {number} */ now, /** @type {number} */ then) => { const pct = bizTrend(now, then); return pct === null ? "" : `${bizTrendText(pct, 1)} vs ${lastMonth}`; };
  const lots = () => lazy("lots", () => data.inventory.filter((row) => Number(row.qty) > 0).map((row) => ({ row, status: inventoryStatus(row) })));
  const canSales = canViewModule("analytics") || canViewModule("sales") || canViewModule("invoicing");
  const canAr = canViewModule("receivables-tracker") || canViewModule("collections");
  const stockSeen = canViewModule("inventory") && !isDemoOnlyRole();
  /** @type {Record<string, { show: boolean, build: () => WelcomeStat }>} */
  const pool = {
    revenue: { show: canSales, build: () => { const now = kpiRevenueIn(facts(), periods.monthStart, periods.todayKey); return { label: `Revenue · ${month}`, value: pesoShort(now), sub: change(now, kpiRevenueIn(facts(), periods.prev.start, periods.prev.end)) || "Net of VAT" }; } },
    collected: { show: canViewModule("collections"), build: () => { const now = kpiCollectedIn(facts(), periods.monthStart, periods.todayKey); return { label: `Collected · ${month}`, value: pesoShort(now), sub: change(now, kpiCollectedIn(facts(), periods.prev.start, periods.prev.end)) || "Month to date" }; } },
    owed: { show: canAr, build: () => { const ar = kpiReceivables(summaries()); return { label: "Clients owe us", value: pesoShort(ar.total), sub: ar.overdue > 0.005 ? `${pesoShort(ar.overdue)} overdue` : "Nothing overdue" }; } },
    arOverdue: { show: canAr, build: () => { const ar = kpiReceivables(summaries()); return { label: "Overdue receivables", value: pesoShort(ar.overdue), sub: ar.total > 0.005 ? `of ${pesoShort(ar.total)} clients owe` : "Nothing owed" }; } },
    weOwe: { show: canViewModule("payables"), build: () => { const open = kpiPayablesOpen(); return { label: "We owe", value: pesoShort(open.amount), sub: open.overdue > 0.005 ? `${pesoShort(open.overdue)} overdue` : "Nothing overdue" }; } },
    billsDue7: { show: canViewModule("payables"), build: () => { const due = kpiPayablesDue(7); return { label: "Bills due in 7 days", value: pesoShort(due.amount), sub: due.overdue > 0.005 ? `${pesoShort(due.overdue)} already overdue` : plural(due.count, "bill") }; } },
    toDeposit: { show: canViewModule("collections"), build: () => { const waiting = kpiToDeposit(); return { label: "To deposit", value: pesoShort(waiting.amount), sub: waiting.count ? plural(waiting.count, "receipt") : "Nothing waiting" }; } },
    expenses: { show: canViewModule("replenishments"), build: () => { const { spent, budget } = kpiExpensesMonth(); return { label: `Expenses · ${month}`, value: pesoShort(spent), sub: budget > 0 ? `${Math.round((spent / budget) * 100)}% of the ${pesoShort(budget)} budget` : "No budget set" }; } },
    openOrders: { show: canViewModule("sales"), build: () => { const orders = salesOpenOrders(); return { label: "Open client orders", value: welcomePeso(orders.reduce((sum, po) => sum + salesOrderTotal(po), 0)), sub: plural(orders.length, "order") }; } },
    pendingDelivery: { show: canViewModule("sales"), build: () => {
      const docs = salesScopedDocuments().filter((sale) => sale.status !== "Cancelled" && (sale.deliveryStatus || "Pending") === "Pending");
      const late = docs.filter((sale) => daysUntil(sale.date) <= -3).length;
      return { label: "Pending delivery", value: String(docs.length), sub: late ? `${late} issued 3+ days ago` : "None late" };
    } },
    itemsInStock: { show: stockSeen, build: () => {
      const codes = new Set(lots().filter((lot) => lot.status !== "Expired").map((lot) => lot.row.code));
      const low = lots().filter((lot) => ["Low Stock", "Critical"].includes(lot.status)).length;
      return { label: "Items in stock", value: String(codes.size), sub: low ? `${plural(low, "stock record")} below min` : "None below min" };
    } },
    transfersIn: { show: stockSeen && !isStockViewOnly(), build: () => { const n = (data.pendingTransfers || []).filter((transfer) => ["In Transit", "Incomplete"].includes(transfer.status)).length; return { label: "Transfers in", value: String(n), sub: n ? "In transit" : "Nothing on the way" }; } },
    expiring60: { show: stockSeen, build: () => { const n = lots().filter((lot) => lot.row.expiry && daysUntil(lot.row.expiry) >= 0 && daysUntil(lot.row.expiry) <= 60).length; return { label: "Expiring in 60 days", value: plural(n, "lot"), sub: n ? "Use these first" : "None" }; } },
    toReceive: { show: stockSeen && canManagePoReceiving(), build: () => { const n = receivingPurchaseOrders().filter((po) => ["For Receiving", "Partially Received"].includes(po.status)).length; return { label: "POs to receive", value: String(n), sub: n ? "Ready at receiving" : "Nothing to receive" }; } },
  };
  const sets = {
    management: ["revenue", "collected", "owed", "weOwe"],
    sales: ["revenue", "openOrders", "pendingDelivery", "expiring60"],
    warehouse: ["itemsInStock", "transfersIn", "expiring60", "toReceive"],
    office: ["collected", "toDeposit", "arOverdue", "billsDue7"],
  };
  const keys = [...new Set([...sets[welcomeVariant()], "revenue", "expenses", "collected", "itemsInStock", "expiring60", "openOrders"])].filter((key) => pool[key]?.show).slice(0, 4);
  /** @type {WelcomeStat[]} */
  const out = [];
  for (const key of keys) { try { out.push(pool[key].build()); } catch (error) { console.warn("Welcome stat failed", key, error); } }
  return out;
}

// ----- header -----------------------------------------------------------------------------------
function welcomeDateLine(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
}
/** Morning before 12:00, afternoon before 18:00, otherwise evening (Manila time). */
function welcomeGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(now));
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const raw = String(currentUser?.name || "").trim();
  const name = raw && !raw.includes("@") ? raw.split(/\s+/)[0] : String(currentUser?.email || raw || "").split("@")[0];
  return `Good ${part}, ${name}.`;
}
/** "yesterday 17:20 · Chrome on macOS". @param {{ at: string, device: string, browser: string } | null} previous */
function welcomeLastSignIn(previous) {
  if (!previous?.at) return "";
  const at = new Date(previous.at);
  if (Number.isNaN(at.getTime())) return "";
  const day = (/** @type {Date} */ d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });
  const todayKey = day(new Date());
  const yesterdayKey = day(new Date(Date.now() - 86400000));
  const when = day(at) === todayKey ? `today ${time}` : day(at) === yesterdayKey ? `yesterday ${time}` : `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Manila" })} ${time}`;
  const os = ({ Mac: "macOS", Windows: "Windows", iPhone: "iPhone", iPad: "iPad", Android: "Android", Linux: "Linux" })[String(previous.device || "").split(" ")[0]] || "";
  const browser = /unknown/i.test(previous.browser) ? "" : previous.browser;
  const device = browser && os ? `${browser} on ${os}` : browser || os;
  return `${when}${device ? ` · ${device}` : ""}`;
}

// ----- render -----------------------------------------------------------------------------------
/** @param {string} path */
function welcomeIcon(path, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`; }
const WELCOME_CHEVRON = '<svg class="wl-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
const WELCOME_LOGO = '<svg class="ml-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 19L10 6l3 5" stroke="#D9682B" stroke-linecap="round"/><path d="M7 19l7-11 7 11z" stroke="#1F5F74"/></svg>';

/** @type {(UiRec & { module: string })[]} */
let welcomeTaskList = [];
/** @type {WelcomeAction[]} */
let welcomeActionList = [];

function welcomeHtml() {
  const variant = welcomeVariant();
  const tasks = todayTasks(WELCOME_TASK_MODULES[variant]);
  welcomeTaskList = tasks.slice(0, 4);
  welcomeActionList = welcomeActions();
  const urgent = tasks.filter((task) => task.tone === "red").length;
  const title = ["sales", "warehouse"].includes(variant) ? "Your day" : "Needs you today";
  const last = welcomeLastSignIn(welcomePreviousSignIn);
  const role = String(currentUser?.role || "");
  const list = welcomeTaskList.length
    ? welcomeTaskList.map((task, index) => `<button type="button" class="wl-row" data-welcome-task="${index}">
        <span class="wl-dot" style="background:${WELCOME_TONES[task.tone || "amber"] || WELCOME_TONES.amber}" aria-hidden="true"></span>
        <span class="wl-row-text"><span class="wl-row-title">${escapeHtml(task.text)}</span><span class="wl-row-meta">${escapeHtml(welcomeModuleLabel(task.module))}${task.action ? ` · ${escapeHtml(task.action)}` : ""}</span></span>
        ${task.money ? `<span class="wl-row-amount">${escapeHtml(welcomePeso(task.money))}</span>` : ""}${WELCOME_CHEVRON}
      </button>`).join("")
    : `<div class="wl-empty"><span class="wl-empty-icon">${welcomeIcon("M5 12l5 5L20 7", 22)}</span><strong>You’re all caught up</strong><span>Nothing needs you right now.</span></div>`;
  const stats = welcomeStats();
  return `<div class="wl-shell" role="dialog" aria-modal="true" aria-labelledby="wl-greeting" aria-describedby="wl-date">
    <div class="wl-top wl wl-1"><div class="wl-brand"><span class="wl-brand-tile">${WELCOME_LOGO}</span><span>Medlane OS</span></div></div>
    <main class="wl-main">
      <header class="wl-head">
        <span class="wl-date wl wl-1" id="wl-date">${escapeHtml(welcomeDateLine())}</span>
        <h1 class="wl-greeting wl wl-2" id="wl-greeting">${escapeHtml(welcomeGreeting())}</h1>
        <div class="wl-meta wl wl-3"><span class="wl-role wl-role-${variant}">${escapeHtml(role)}</span><span>All branches</span>${last ? `<span class="wl-sep" aria-hidden="true"></span><span>Last signed in ${escapeHtml(last)}</span>` : ""}</div>
      </header>
      <div class="wl-grid">
        <section class="wl-card wl-tasks wl wl-4" aria-labelledby="wl-today">
          <div class="wl-card-head"><h2 id="wl-today">${title}</h2>${tasks.length ? `<span>${urgent} urgent · ${tasks.length} total</span>` : ""}</div>
          <div class="wl-list">${list}</div>
        </section>
        <div class="wl-side">
          ${welcomeActionList.length ? `<section class="wl-actions wl wl-4" aria-label="Quick actions">${welcomeActionList.map((action, index) => `<button type="button" class="wl-action" data-welcome-action="${index}"><span class="wl-action-icon">${welcomeIcon(WELCOME_ICONS[action.icon] || WELCOME_ICONS.dash)}</span><span class="wl-action-label">${escapeHtml(action.label)}<svg class="wl-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>`).join("")}</section>` : ""}
          ${stats.length ? `<section class="wl-card wl-stats wl wl-5" aria-label="At a glance">${stats.map((stat) => `<div class="wl-stat"><span class="wl-stat-label">${escapeHtml(stat.label)}</span><span class="wl-stat-value">${escapeHtml(stat.value)}</span>${stat.sub ? `<span class="wl-stat-sub">${escapeHtml(stat.sub)}</span>` : ""}</div>`).join("")}</section>` : ""}
        </div>
      </div>
      <footer class="wl-foot wl wl-5">
        <span class="wl-secure">${welcomeIcon("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4", 16)}${last ? "If the last sign-in above wasn’t you, change your password in User Settings." : "Signed in securely."}</span>
        <button type="button" class="wl-continue" data-welcome-continue>Continue to dashboard${welcomeIcon("M5 12h14M13 6l6 6-6 6", 16)}</button>
      </footer>
    </main>
  </div>`;
}

/** Shows the Welcome screen over the (already drawn) app. @param {() => void} [onDone] runs after it closes */
function showWelcomeScreen(onDone) {
  const screen = document.getElementById("welcome-screen");
  if (!screen || !currentUser) { onDone?.(); return; }
  welcomeOnDone = onDone || null;
  screen.innerHTML = welcomeHtml();
  screen.hidden = false;
  document.body.classList.add("welcome-open");
  // Keep keyboard and screen-reader focus inside it.
  welcomeInert = [...document.body.children].filter((el) => el !== screen && !["toast", "loading-overlay"].includes(el.id) && el.tagName !== "SCRIPT" && el.tagName !== "DIALOG" && !el.hasAttribute("inert"));
  welcomeInert.forEach((el) => el.setAttribute("inert", ""));
  // Focus "Continue" so Enter continues, without scrolling the greeting out of view on phones.
  /** @type {HTMLElement | null} */ (screen.querySelector("[data-welcome-continue]"))?.focus({ preventScroll: true });
  screen.scrollTop = 0;
  // Recon differences are fetched separately; redraw the task list once they arrive.
  if (canViewModule("reconciliation") && typeof loadRecon === "function" && !reconState.data) {
    loadRecon().then(() => { if (!screen.hidden) { const focused = document.activeElement?.getAttribute("data-welcome-continue") !== null; screen.innerHTML = welcomeHtml(); screen.querySelectorAll(".wl").forEach((el) => el.classList.remove("wl")); if (focused) /** @type {HTMLElement | null} */ (screen.querySelector("[data-welcome-continue]"))?.focus({ preventScroll: true }); } }).catch(() => null);
  }
}

/** Closes it, then goes where the person chose. @param {() => void} [go] */
function closeWelcomeScreen(go) {
  const screen = document.getElementById("welcome-screen");
  if (!screen || screen.hidden) return;
  screen.hidden = true;
  screen.innerHTML = "";
  document.body.classList.remove("welcome-open");
  welcomeInert.forEach((el) => el.removeAttribute("inert"));
  welcomeInert = [];
  if (go) go(); else showSection("dashboard");
  const done = welcomeOnDone;
  welcomeOnDone = null;
  done?.();
}

/** Click handling for the Welcome screen (wired in events-bootstrap.js). @param {Element} target */
function handleWelcomeClick(target) {
  const task = closestEl(target, "[data-welcome-task]");
  if (task) { const rec = welcomeTaskList[Number(task.dataset.welcomeTask)]; return closeWelcomeScreen(rec ? () => welcomeRun(rec.module, rec.attrs) : undefined); }
  const action = closestEl(target, "[data-welcome-action]");
  if (action) { const chosen = welcomeActionList[Number(action.dataset.welcomeAction)]; return closeWelcomeScreen(chosen ? () => chosen.run() : undefined); }
  if (closestEl(target, "[data-welcome-continue]")) return closeWelcomeScreen();
}
/** Enter (outside a button) or Escape continues to the dashboard. @param {KeyboardEvent} event */
function handleWelcomeKey(event) {
  if (document.getElementById("welcome-screen")?.hidden !== false) return;
  const onControl = event.target instanceof Element && Boolean(event.target.closest("button, a"));
  if ((event.key === "Enter" && !onControl) || event.key === "Escape") { event.preventDefault(); closeWelcomeScreen(); }
}

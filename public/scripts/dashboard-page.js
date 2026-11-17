// Dashboard: the operational home after sign-in. Two tabs: Today (KPIs, what needs attention, cash
// for the next 4 weeks, modules at a glance, stock running low, what's coming up, top clients) and
// All tasks. Every task comes from todayTasks() — the same rules as each page's Workflow assistant —
// so a task disappears by itself once its record changes. Every number uses the shared kpi*
// functions that Analytics uses. Everything is computed from data the server already limited to
// this person's role (filterRecordsForProfile), and each card also checks canViewModule.

const DASHBOARD_TAB_LABELS = /** @type {Record<string, string>} */ ({ today: "Today", tasks: "All tasks" });
const DASHBOARD_TABS = Object.keys(DASHBOARD_TAB_LABELS);
const dashboardSeed = moduleUrlSeed("dashboard", DASHBOARD_TABS);
let dashboardTab = dashboardSeed.tab;
/** @type {UiViewState} */
let dashboardView = dashboardSeed.view;
/** Tasks as drawn, so a click can run the right one. @type {DashboardTask[]} */
let dashboardTaskList = [];
/** Backup status for Superadmin/CEO, loaded once per visit. @type {{ loading: boolean, loadedAt: number }} */
const dashboardBackup = { loading: false, loadedAt: 0 };

// Every module whose rules feed the task list, in the order they're checked.
const DASHBOARD_TASK_MODULES = ["purchase-orders", "payables", "receivables-tracker", "reconciliation", "item-forecast", "invoicing", "collections", "replenishments", "inventory", "sales", "masterlists", "users", "logs", "purchase-history"];
const DASHBOARD_MODULE_LABELS = /** @type {Record<string, string>} */ ({
  "purchase-orders": "Purchase Orders", payables: "Payables", "receivables-tracker": "Receivables", reconciliation: "Recon", "item-forecast": "Item Forecast",
  invoicing: "Invoicing", collections: "Collections", replenishments: "Expenses", inventory: "Inventory", sales: "Sales", masterlists: "Masterlists",
  users: "Users", logs: "Audit Logs", "purchase-history": "Client History", analytics: "Analytics",
});
// Who usually acts on a task, and when it's due, by module|rule. Anything not listed is due today
// and belongs to whoever can open that module.
const DASHBOARD_TASK_META = /** @type {Record<string, { due?: string, owner?: string }>} */ ({
  "purchase-orders|pos-to-approve": { owner: "Superadmin/CEO" }, "purchase-orders|not-on-order": { due: "This week", owner: "Purchasing" },
  "purchase-orders|late-deliveries": { due: "Overdue", owner: "Purchasing" }, "purchase-orders|arrived-to-receive": { owner: "Warehouse" },
  "payables|overdue-bills": { due: "Overdue", owner: "Accounting" }, "payables|bills-to-approve": { owner: "Superadmin/CEO" }, "payables|due-this-week": { due: "Within 7 days", owner: "Superadmin/CEO" },
  "receivables-tracker|at-risk-clients": { due: "Overdue", owner: "Accounting" }, "receivables-tracker|due-for-statement": { due: "This week", owner: "Accounting" },
  "receivables-tracker|follow-ups-needed": { due: "This week", owner: "Accounting" }, "receivables-tracker|cheques-to-pick-up": { owner: "Accounting" },
  "reconciliation|recon-count-overdue": { due: "Overdue", owner: "Warehouse" }, "item-forecast|forecast-order-now": { owner: "Purchasing" },
  "item-forecast|forecast-order-soon": { due: "Within lead time", owner: "Purchasing" }, "item-forecast|forecast-min-low": { due: "This week", owner: "Admin" },
  "invoicing|overdue-invoices": { due: "Overdue", owner: "Accounting" }, "invoicing|credit-approvals": { owner: "Admin" }, "invoicing|due-this-week": { due: "Within 7 days", owner: "Accounting" },
  "collections|bounced-not-replaced": { due: "Overdue", owner: "Accounting" }, "collections|to-deposit": { owner: "Accounting" }, "collections|pdc-now-due": { owner: "Accounting" },
  "collections|collection-receipts-to-approve": { owner: "Superadmin/CEO" }, "replenishments|expenses-to-approve": { due: "This week", owner: "Superadmin/CEO" },
  "replenishments|over-budget": { due: "This month", owner: "Admin" }, "inventory|expired-on-hand": { owner: "Warehouse" }, "inventory|critical-stock": { owner: "Warehouse" },
  "inventory|receipts-to-approve": { owner: "Superadmin/CEO" }, "inventory|transfers-to-dispatch": { owner: "Warehouse" }, "inventory|transfers-in-transit": { owner: "Warehouse" },
  "inventory|low-stock": { due: "This week", owner: "Warehouse" }, "inventory|pos-to-receive": { owner: "Warehouse" }, "inventory|near-expiry-fefo": { due: "This week", owner: "Warehouse" },
  "sales|not-delivered": { due: "Overdue", owner: "Sales" }, "users|users-expired-invites": { owner: "Superadmin/CEO" }, "users|users-inactive": { due: "This week", owner: "Superadmin/CEO" },
});
/** Owner groups each role acts for ("Waiting for you"). */
const DASHBOARD_ROLE_OWNS = /** @type {Record<string, string[]>} */ ({
  Superadmin: ["Superadmin/CEO", "Purchasing"], CEO: ["Superadmin/CEO", "Purchasing"], Admin: ["Admin", "Accounting", "Purchasing"], Accounting: ["Accounting", "Purchasing"],
  Logistics: ["Warehouse", "Purchasing"], Sales: ["Sales"], HR: ["Admin"], Engineering: [], "Product Specialist": [],
});

/** @typedef {UiRec & { module: string, due: string, owner: string, key: string }} DashboardTask */
/** @returns {DashboardTask[]} */
function dashboardTasks() {
  return todayTasks(DASHBOARD_TASK_MODULES).map((rec, index) => {
    const meta = DASHBOARD_TASK_META[`${rec.module}|${rec.id}`] || {};
    return { ...rec, key: `t${index}`, due: meta.due || (rec.tone === "red" ? "Overdue" : "Today"), owner: meta.owner || DASHBOARD_MODULE_LABELS[rec.module] || "—" };
  });
}
/** @param {DashboardTask} task */
function dashboardTaskIsMine(task) { return (DASHBOARD_ROLE_OWNS[String(currentUser?.role || "")] || []).includes(task.owner); }
/** @param {DashboardTask} task */
function dashboardDueTone(task) { return /** @type {UiTone} */ (task.due === "Overdue" ? "red" : task.tone === "red" ? "red" : task.due === "Today" ? "amber" : "slate"); }

// ----- numbers ---------------------------------------------------------------------------------------
function dashboardCanSales() { return canViewModule("analytics") || canViewModule("invoicing") || canViewModule("sales"); }
function dashboardCanAr() { return canViewModule("receivables-tracker") || canViewModule("collections") || canViewModule("analytics"); }

/** The four headline numbers for this role (the reference set first, topped up with stock numbers). @param {BizFacts | null} facts @param {ClientSummary[] | null} summaries @returns {UiKpi[]} */
function dashboardKpis(facts, summaries) {
  const { todayKey, monthStart, prev } = kpiPeriods();
  const month = shortMonthLabel(todayKey.slice(0, 7));
  const lastMonth = new Date(`${prev.start}T00:00:00`).toLocaleDateString("en-GB", { month: "long" });
  const change = (/** @type {number} */ now, /** @type {number} */ then) => { const pct = bizTrend(now, then); return pct === null ? null : { text: bizTrendText(pct, 1), good: pct >= 0 }; };
  /** @type {UiKpi[]} */
  const out = [];
  if (facts && dashboardCanSales()) {
    const now = kpiRevenueIn(facts, monthStart, todayKey), then = kpiRevenueIn(facts, prev.start, prev.end);
    out.push({ label: `Revenue · ${month} to date`, value: pesoShort(now), tone: "accent", change: change(now, then), sub: `vs ${pesoShort(then)} at this point in ${lastMonth} · net of VAT` });
  }
  if (facts && (canViewModule("collections") || canViewModule("analytics"))) {
    const now = kpiCollectedIn(facts, monthStart, todayKey), then = kpiCollectedIn(facts, prev.start, prev.end);
    out.push({ label: `Collected · ${month} to date`, value: pesoShort(now), tone: "green", change: change(now, then), sub: `vs ${pesoShort(then)} at this point in ${lastMonth}` });
  }
  if (facts && summaries && dashboardCanAr()) {
    const ar = kpiReceivables(summaries);
    const { dso, avgTerms } = kpiDso(facts, ar.total);
    out.push({ label: "Clients owe us", value: pesoShort(ar.total), tone: "blue", change: ar.overdue > 0.005 ? { text: `${pesoShort(ar.overdue)} overdue`, good: false } : null, sub: dso === null ? "No invoices in the last 90 days" : `Days to collect: ${dso}${avgTerms !== null ? ` (terms avg ${avgTerms})` : ""}` });
  }
  if (canViewModule("payables")) {
    const due = kpiPayablesDue(30);
    out.push({ label: "We owe", value: pesoShort(due.amount), tone: "orange", change: due.overdue > 0.005 ? { text: `${pesoShort(due.overdue)} overdue`, good: false } : null, sub: "Due within 30 days" });
  }
  // Roles without the money modules get stock numbers instead.
  if (out.length < 4 && canViewModule("item-forecast")) {
    const model = forecastModel();
    const now = model.toOrder.filter((row) => row.m.status === "now");
    out.push({ label: "Items to order now", value: String(now.length), tone: "red", sub: now.length ? now.slice(0, 2).map((row) => row.name).join(", ") : "Nothing below its reorder point" });
  }
  if (out.length < 4 && canViewModule("inventory") && !isDemoOnlyRole()) {
    const expired = data.inventory.filter((row) => Number(row.qty) > 0 && inventoryStatus(row) === "Expired");
    out.push({ label: "Expired lots on hand", value: String(expired.length), tone: "red", sub: expired.length ? "Pull them for disposal" : "None" });
  }
  if (out.length < 4 && canManagePoReceiving()) {
    const n = receivingPurchaseOrders().filter((po) => ["For Receiving", "Partially Received"].includes(po.status)).length;
    out.push({ label: "POs to receive", value: String(n), tone: "blue", sub: n ? "Ready at receiving" : "Nothing to receive" });
  }
  if (out.length < 4 && canViewModule("inventory") && !isDemoOnlyRole() && !isStockViewOnly()) {
    const n = (data.pendingTransfers || []).filter((transfer) => ["In Transit", "Incomplete", "For Receiving"].includes(transfer.status)).length;
    out.push({ label: "Transfers in progress", value: String(n), tone: "slate", sub: n ? "Dispatch or receive them" : "Nothing in transit" });
  }
  return out.slice(0, 4);
}

/**
 * Cash in and out per week for the next 4 weeks. In = open invoices by due date plus post-dated
 * checks by their date. Out = bills not yet approved by due date (overdue ones this week),
 * recurring costs, and approved supplier POs that have no bill yet (by promised date + terms).
 */
function dashboardCash() {
  const base = cashForecast();
  const canIn = base.canSeeReceivables;
  const canOut = canViewModule("payables");
  const inflow = [...base.inflow];
  const outflow = canOut ? [...base.outflow] : base.weeks.map(() => 0);
  if (canIn && canViewModule("collections")) {
    data.payments.filter((payment) => !payment.voided && payment.collectionStatus === "Posted Date").forEach((payment) => {
      const at = fmtDateSafe(payment.postedDate || payment.chequeDate);
      const index = base.weeks.findIndex((week) => at >= week.start && at <= week.end);
      if (index >= 0) inflow[index] += Number(payment.amount || 0);
    });
  }
  let poOut = 0;
  if (canOut && supplierPurchasingVisible()) {
    const billed = JSON.stringify(data.payables || []);
    supplierPoFactsAll().filter((fact) => fact.open && !billed.includes(fact.po.id)).forEach((fact) => {
      const arrive = fact.promised || fmtDate(addDays(new Date(`${fmtDateSafe(fact.po.date) || fmtDate(today)}T00:00:00`), 14));
      const pay = fmtDate(addDays(new Date(`${arrive}T00:00:00`), Number(fact.po.terms || 0)));
      const index = pay < base.weeks[0].start ? 0 : base.weeks.findIndex((week) => pay >= week.start && pay <= week.end);
      if (index >= 0) { outflow[index] += fact.total; poOut += fact.total; }
    });
  }
  return { weeks: base.weeks, inflow, outflow, net: base.weeks.map((_, i) => inflow[i] - outflow[i]), canIn, canOut, poOut };
}

/** @param {ReturnType<typeof dashboardCash>} cash */
function dashboardCashHtml(cash) {
  const k = (/** @type {number} */ value) => (Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : Math.round(value / 1000).toLocaleString("en-PH"));
  const range = (/** @type {{ start: string, end: string }} */ week) => {
    const a = new Date(`${week.start}T00:00:00`), b = new Date(`${week.end}T00:00:00`);
    return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString("en-GB", { month: "short" })}` : `${a.getDate()} ${a.toLocaleDateString("en-GB", { month: "short" })}–${b.getDate()} ${b.toLocaleDateString("en-GB", { month: "short" })}`;
  };
  const rows = cash.weeks.map((week, i) => {
    const net = cash.net[i];
    return `<tr class="${cash.canIn && cash.canOut && net < -0.5 ? "neg" : ""}"><th scope="row">${escapeHtml(range(week))}</th>${cash.canIn ? `<td class="num">${escapeHtml(k(cash.inflow[i]))}</td>` : ""}${cash.canOut ? `<td class="num">${escapeHtml(k(cash.outflow[i]))}</td>` : ""}${cash.canIn && cash.canOut ? `<td class="num net"><span class="ui-num tone-${net < -0.5 ? "red" : "green"}">${net < -0.5 ? "−" : "+"}${escapeHtml(k(Math.abs(net)))}</span></td>` : ""}</tr>`;
  }).join("");
  const table = `<div class="ui-table-scroll"><table class="ui-mini-table"><caption class="sr-only">Expected cash in and out per week, in thousands of pesos</caption><thead><tr><th scope="col">Week</th>${cash.canIn ? `<th scope="col" class="num">In</th>` : ""}${cash.canOut ? `<th scope="col" class="num">Out</th>` : ""}${cash.canIn && cash.canOut ? `<th scope="col" class="num">Net</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>`;
  // A sentence from the numbers.
  let note = "";
  if (cash.canIn && cash.canOut) {
    const short = cash.weeks.map((week, i) => ({ week, net: cash.net[i] })).filter((entry) => entry.net < -0.5);
    const deposit = canViewModule("collections") ? kpiToDeposit().amount : 0;
    if (short.length) {
      const first = short[0];
      note = `${first.week.label === "This week" ? "This week" : `The week of ${range(first.week)}`} runs short by ${pesoShort(-first.net)}${short.length > 1 ? `, and ${plural(short.length - 1, "more week")} after it` : ""}.${deposit > 0.005 ? ` Depositing the ${pesoShort(deposit)} waiting to be deposited covers ${deposit >= -first.net ? "it" : "part of it"}.` : " Collect overdue invoices or move a bill date before then."}`;
    } else if (cash.outflow.some((value) => value > 0.005)) note = `Expected collections cover expected payments in each of the next 4 weeks${cash.poOut > 0.005 ? `, including ${pesoShort(cash.poOut)} for approved supplier POs` : ""}.`;
    else note = "No bills, recurring costs or supplier POs fall due in the next 4 weeks.";
  }
  return table + (note ? `<p class="ui-card-note">${escapeHtml(note)}</p>` : "");
}

/** One status line and one key number per module this role can open. */
function dashboardModulesHtml() {
  /** @type {{ module: string, label: string, status: string, key: string, attrs: UiAttrs }[]} */
  const rows = [];
  const go = (/** @type {string} */ section) => ({ "data-go-section": section });
  const goto = (/** @type {string} */ module, /** @type {string} */ tab) => ({ "data-wa-goto": `${module}|${tab}||` });
  const add = (/** @type {boolean} */ show, /** @type {string} */ module, /** @type {() => [string, string]} */ build, /** @type {UiAttrs} */ attrs = go(module)) => {
    if (!show) return;
    try { const [status, key] = build(); rows.push({ module, label: DASHBOARD_MODULE_LABELS[module] || module, status, key, attrs }); } catch (error) { console.warn("Module line failed", module, error); }
  };
  add(canViewModule("sales"), "sales", () => {
    const orders = salesOpenOrders();
    const pending = salesScopedDocuments().filter((sale) => sale.status !== "Cancelled" && (sale.deliveryStatus || "Pending") === "Pending").length;
    return [`${plural(orders.length, "open order")} · ${plural(pending, "document")} pending delivery`, `${pesoShort(orders.reduce((sum, po) => sum + salesOrderTotal(po), 0))} open orders`];
  });
  add(canViewModule("invoicing"), "invoicing", () => {
    const docs = byBranch(data.sales, "area");
    const overdue = docs.filter((sale) => invoicingStatus(sale) === "Overdue").length;
    const soon = docs.filter((sale) => ["SI", "TS"].includes(documentType(sale.type)) && sale.status !== "Cancelled" && salesBalance(sale) > 0.005 && daysUntil(salesDueDate(sale)) >= 0 && daysUntil(salesDueDate(sale)) <= 7).length;
    const month = fmtDate(today).slice(0, 7);
    const billed = docs.filter((sale) => sale.status !== "Cancelled" && documentType(sale.type) !== "DR" && fmtDateSafe(sale.date).startsWith(month)).reduce((sum, sale) => sum + Number(sale.net || 0), 0);
    return [`${plural(overdue, "invoice")} overdue · ${soon} due within 7 days`, `${pesoShort(billed)} invoiced (${shortMonthLabel(month)})`];
  });
  add(canViewModule("collections"), "collections", () => {
    const receipts = collectionReceipts();
    const deposit = kpiToDeposit(receipts);
    const bounced = receipts.filter((receipt) => receipt.state === "bounced");
    const pdc = receipts.filter((receipt) => receipt.state === "pdc").reduce((sum, receipt) => sum + receipt.total, 0);
    return [`${pesoShort(deposit.amount)} to deposit${bounced.length ? ` · ${pesoShort(bounced.reduce((sum, receipt) => sum + receipt.total, 0))} bounced` : ""}`, `${pesoShort(pdc)} post-dated checks`];
  });
  add(canViewModule("receivables-tracker"), "receivables-tracker", () => {
    const entries = receivablesByClient();
    const statements = entries.filter((entry) => entry.overdue > 0.005).length;
    const overdue = entries.reduce((sum, entry) => sum + entry.overdue, 0);
    return [`${plural(statements, "statement")} due · ${entries.filter((entry) => entry.risk === "risk").length} at risk`, `${pesoShort(overdue)} overdue`];
  });
  add(canViewModule("inventory") && !isDemoOnlyRole(), "inventory", () => {
    const transfers = (data.pendingTransfers || []).filter((transfer) => !["Received", "Cancelled"].includes(transfer.status)).length;
    const next = supplierPurchasingVisible() ? supplierPoFactsAll().filter((fact) => fact.open && fact.promised && fact.promised >= fmtDate(today)).sort((a, b) => a.promised.localeCompare(b.promised))[0] : null;
    const value = canSeeMargins() ? bizStockValue() : null;
    const items = new Set(data.inventory.filter((row) => Number(row.qty) > 0 && inventoryStatus(row) !== "Expired").map((row) => row.code)).size;
    return [`${next ? `Next arrival ${uiDate(next.promised)} · ` : ""}${plural(transfers, "transfer")} in progress`, value && value.costed ? `${pesoShort(value.value)} stock` : plural(items, "item") + " in stock"];
  });
  add(canViewModule("item-forecast"), "item-forecast", () => {
    const model = forecastModel();
    const now = model.toOrder.filter((row) => row.m.status === "now").length;
    return [`${plural(now, "item")} to order now · ${model.toOrder.length - now} soon`, model.costs ? `${pesoShort(model.toOrder.reduce((sum, row) => sum + row.value, 0))} suggested` : `${model.toOrder.length} to order`];
  });
  add(supplierPurchasingVisible(), "purchase-orders", () => {
    const facts = supplierPoFactsAll();
    const open = facts.filter((fact) => fact.open);
    const pending = facts.filter((fact) => fact.pending);
    return [`${open.length} open · ${pending.length} waiting for approval`, `${pesoShort(open.reduce((sum, fact) => sum + fact.total, 0))} open`];
  }, goto("purchase-orders", "pos"));
  add(canViewModule("payables"), "payables", () => {
    const open = payableFactsAll().filter((fact) => fact.balance > 0.005);
    const approval = open.filter((fact) => fact.state === "approval").length;
    return [`${plural(open.length, "bill")} to ${plural(new Set(open.map((fact) => fact.p.supplier)).size, "payee")} · ${approval} to approve`, `${pesoShort(open.reduce((sum, fact) => sum + fact.balance, 0))} owed`];
  });
  add(canViewModule("replenishments"), "replenishments", () => {
    const { spent, budget } = kpiExpensesMonth();
    const todayKey = fmtDate(today);
    const [y, m, d] = todayKey.split("-").map(Number);
    const gone = d / new Date(Date.UTC(y, m, 0)).getUTCDate();
    const waiting = byBranch(data.replenishments, "office").filter((r) => expenseState(r) === "approval").length;
    return [`${budget > 0 ? (spent / budget <= gone + 0.05 ? "On pace" : "Ahead of pace") : "No budget set"} · ${waiting} to approve`, budget > 0 ? `${pesoShort(spent)} of ${pesoShort(budget)}` : pesoShort(spent)];
  });
  add(canViewModule("reconciliation"), "reconciliation", () => {
    if (!reconState.data) return ["Loading the latest run…", "—"];
    const results = Object.values(reconState.data.latest || {});
    const passed = results.filter((result) => /** @type {any} */ (result)?.status === "pass").length;
    const open = reconOpenDiffs();
    return [`${passed} of ${results.length} checks passed`, plural(open.length, "difference")];
  });
  add(canViewModule("masterlists"), "masterlists", () => {
    const items = activeItems();
    const noCost = items.filter((item) => !(Number(item.cost) > 0) && !isEquipmentItem(item)).length;
    return [`${plural(noCost, "item")} without cost`, `${plural(items.length, "item")} · ${plural(activeClients().length, "client")}`];
  });
  add(canManageUsers(), "users", () => {
    const pending = usersInvites().filter((user) => usersState(user) === "pending").length;
    const expired = usersInvites().filter((user) => usersState(user) === "expired").length;
    return [`${plural(pending, "invite")} pending${expired ? ` · ${expired} expired` : ""}`, `${plural(usersAccounts().filter((user) => usersState(user) === "active").length, "active user")}`];
  });
  if (["Superadmin", "CEO"].includes(String(currentUser?.role || "")) && data.backupStatus) {
    const status = data.backupStatus;
    const age = Number(status.ageHours);
    rows.push({ module: "backup", label: "Backups", status: status.stale ? "Overdue — no backup in the last 7 days" : `Last backup ${Number.isFinite(age) ? `${age < 1 ? "under an hour" : plural(Math.round(age), "hour")} ago` : "recorded"}`, key: status.stale ? "Check now" : "Current", attrs: go("logs") });
  }
  if (!rows.length) return `<p class="ui-muted">No modules to show for this role.</p>`;
  return `<div class="ui-table-scroll"><table class="ui-mini-table" style="min-width:480px"><caption class="sr-only">Modules at a glance</caption><thead><tr><th scope="col">Module</th><th scope="col">Status</th><th scope="col" class="num">Key number</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row"><button class="ui-link" type="button"${uiAttrs(row.attrs)}>${escapeHtml(row.label)}</button></th><td>${escapeHtml(row.status)}</td><td class="num">${escapeHtml(row.key)}</td></tr>`).join("")}</tbody></table></div>`;
}

/** Deliveries, arrivals, bills and team events in the next 7 days, plus the next Recon run. */
function dashboardComingUp() {
  const todayKey = fmtDate(today);
  const horizon = fmtDate(addDays(new Date(`${todayKey}T00:00:00`), 7));
  const inWindow = (/** @type {string} */ day) => day >= todayKey && day <= horizon;
  /** @type {(UiInsight & { at: string, meta: string })[]} */
  const out = [];
  const short = (/** @type {string} */ day) => new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (supplierPurchasingVisible()) {
    supplierPoFactsAll().filter((fact) => fact.open && fact.promised && inWindow(fact.promised)).forEach((fact) => out.push({
      at: fact.promised, meta: short(fact.promised), tone: "blue", title: `${fact.po.supplier} delivery due`, text: `${fact.po.id} · ${plural((fact.po.lines || []).length, "line")} to receive at ${fact.po.receivingBranch || fact.po.branch || "the warehouse"}.`,
    }));
  }
  if (canViewModule("payables")) {
    payableFactsAll().filter((fact) => fact.balance > 0.005 && inWindow(fact.due)).forEach((fact) => out.push({
      at: fact.due, meta: short(fact.due), tone: fact.state === "approval" ? "amber" : "slate", title: `${fact.p.supplier} bill due · ${pesoShort(fact.balance)}`, text: `${fact.p.id}${fact.state === "approval" ? " · waiting for approval" : ""}.`,
    }));
    /** @type {RecurringCost[]} */ (data.recurringCosts || []).forEach((cost) => recurringOccurrences(cost, todayKey, horizon).forEach((at) => out.push({
      at, meta: short(at), tone: "slate", title: `${cost.name} · ${pesoShort(Number(cost.amount || 0))}`, text: `Recurring, ${String(cost.every || "Monthly").toLowerCase()}.`,
    })));
  }
  if (canViewModule("invoicing") || canViewModule("receivables-tracker")) {
    const due = byBranch(data.sales, "area").filter((sale) => ["SI", "TS"].includes(documentType(sale.type)) && sale.status !== "Cancelled" && salesBalance(sale) > 0.005 && inWindow(fmtDateSafe(salesDueDate(sale))));
    /** @type {Map<string, Sale[]>} */
    const byDay = new Map();
    due.forEach((sale) => { const day = fmtDateSafe(salesDueDate(sale)); byDay.set(day, [...(byDay.get(day) || []), sale]); });
    byDay.forEach((list, day) => out.push({ at: day, meta: short(day), tone: "blue", title: `${plural(list.length, "invoice")} fall due · ${pesoShort(list.reduce((sum, sale) => sum + salesBalance(sale), 0))}`, text: list.slice(0, 2).map((sale) => sale.client).join(", ") + (list.length > 2 ? ` and ${list.length - 2} more` : "") + "." }));
  }
  (data.calendarEvents || []).filter((event) => !event.removed && inWindow(event.date)).forEach((event) => out.push({
    at: `${event.date} ${event.time || ""}`, meta: `${short(event.date)}${event.time ? ` ${event.time}` : ""}`, tone: "accent", title: event.title, text: `Calendar · ${event.createdBy || "team"}.`,
  }));
  out.sort((a, b) => a.at.localeCompare(b.at));
  if (canViewModule("reconciliation")) out.push({ at: "~", meta: reconNextRun().replace(/^Today /, "").replace(/^Tomorrow /, "Tmrw "), tone: "slate", title: "Next Recon run", text: "Checks stock, billing, cash and master data." });
  return out;
}

/** @param {(UiInsight & { meta: string })[]} items @param {string} empty */
function dashboardTimeline(items, empty) {
  if (!items.length) return `<p class="ui-muted">${escapeHtml(empty)}</p>`;
  return `<ul class="ui-insights dash-timeline">${items.map((item) => `<li><span class="dash-meta">${escapeHtml(item.meta)}</span>${uiDot(item.tone || "slate")}<div class="grow"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div></li>`).join("")}</ul>`;
}

/** @param {DashboardTask[]} tasks */
function dashboardTaskListHtml(tasks) {
  if (!tasks.length) return `<div class="dash-clear">${uiDot("green")}<div><strong>You’re all caught up</strong><span>Nothing needs attention right now.</span></div></div>`;
  return `<ul class="ui-insights dash-tasks">${tasks.map((task) => `<li><span class="dash-meta">${escapeHtml(DASHBOARD_MODULE_LABELS[task.module] || task.module)}</span>${uiDot(task.tone || "amber")}<div class="grow"><strong>${escapeHtml(task.text)}</strong><span>${task.money ? `${escapeHtml(peso.format(task.money).replace(/\.00$/, ""))} · ` : ""}${escapeHtml(task.due)}</span></div>${task.action ? uiButton(task.action, { "data-dash-task": task.key }, { size: "xs" }) : ""}</li>`).join("")}</ul>`;
}

/** Top clients by revenue (net of VAT) this month. @param {BizFacts} facts */
function dashboardTopClients(facts) {
  const { todayKey, monthStart } = kpiPeriods();
  /** @type {Map<string, number>} */
  const byClient = new Map();
  facts.sales.forEach((sale) => { const day = fmtDateSafe(sale.date); if (day >= monthStart && day <= todayKey) byClient.set(sale.client, (byClient.get(sale.client) || 0) + saleTaxBreakdown(sale).amountNetVat); });
  return [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, display: pesoShort(value) }));
}

/** @param {BizFacts} facts */
function dashboardStockFacts(facts) {
  /** @type {[string, string][]} */
  const out = [];
  if (canSeeMargins() && canViewModule("inventory")) {
    const stock = bizStockValue();
    out.push(["Stock value", stock.costed ? pesoShort(stock.value) : "No costs on file"], ["Expired or expiring ≤ 60 days", stock.costed ? pesoShort(stock.atRisk) : "—"]);
  }
  if (canSeeMargins()) {
    const now = bizMargin(facts.monthCostedRev[11], facts.monthCost[11], facts.monthRev[11]);
    const last = bizMargin(facts.monthCostedRev[10], facts.monthCost[10], facts.monthRev[10]);
    out.push(["Gross margin · this month", `${bizMarginText(now)}${now !== null && last !== null ? ` (${now >= last ? "▲" : "▼"}${Math.abs(now - last).toFixed(1)} pts)` : ""}`]);
  }
  if (canViewModule("replenishments")) {
    const { spent, budget } = kpiExpensesMonth();
    out.push([`Opex · ${shortMonthLabel(fmtDate(today).slice(0, 7))}`, budget > 0 ? `${Math.round((spent / budget) * 100)}% of budget` : pesoShort(spent)]);
  }
  reconBranchCounts().forEach((entry) => out.push([entry.branch, entry.at ? (entry.overdue ? `Count due (${plural(/** @type {number} */ (entry.days), "day")})` : `Counted ${uiDate(entry.at)}`) : "Never counted"]));
  return out;
}

function dashboardTodayHtml() {
  const canFacts = dashboardCanSales() || dashboardCanAr() || canSeeMargins();
  const facts = canFacts ? bizFacts() : null;
  const summaries = facts && dashboardCanAr() ? clientSummaries(facts) : null;
  const tasks = dashboardTasks();
  dashboardTaskList = tasks;
  const urgent = tasks.filter((task) => task.tone === "red").length;

  /** @type {UiDashCard[][]} */
  const rows = [[], [], []];
  const attention = { span: /** @type {2} */ (2), title: "Needs attention today", sub: tasks.length ? `${urgent} urgent · sorted by money at stake. Each opens the page where it’s handled.` : "From every module’s rules", body: dashboardTaskListHtml(tasks.slice(0, 7)), link: tasks.length > 7 ? { label: `All ${tasks.length} tasks`, attrs: { "data-dashboard-tab": "tasks" } } : undefined };
  const cash = canViewModule("payables") || cashForecast().canSeeReceivables ? dashboardCash() : null;
  rows[0].push(attention);
  if (cash) rows[0].push({ span: 1, title: "Cash: next 4 weeks", sub: `${cash.canIn ? "Expected in (invoices due, post-dated checks)" : ""}${cash.canIn && cash.canOut ? " vs " : ""}${cash.canOut ? "out (bills, approved POs, recurring costs)" : ""}, ₱ thousands`, body: dashboardCashHtml(cash) });
  rows[1].push({ span: 2, title: "Modules at a glance", sub: "One line per module; open it for the details", body: dashboardModulesHtml() });
  if (canViewModule("item-forecast")) {
    const model = forecastModel();
    const low = model.rows.filter((row) => row.m.daysOfStock !== null && row.m.daily > 0).slice(0, 5);
    rows[1].push({
      span: 1, title: "Stock running low", sub: "Days of stock left vs supplier lead time (the line)",
      body: uiHBars({ items: low.map((row) => ({ label: row.name, value: Math.min(/** @type {number} */ (row.m.daysOfStock), 120), display: `${Math.round(/** @type {number} */ (row.m.daysOfStock))} days`, target: Math.min(row.lead.days, 120), sub: `lead ${row.lead.days} d · ${FORECAST_STATUS[row.m.status].label}`, tone: FORECAST_STATUS[row.m.status].tone })), caption: "Days of stock left", targetLabel: "Lead time" }),
      takeaway: low.some((row) => row.m.status === "now") ? "Red will run out before a new order arrives with safety stock." : undefined,
      link: { label: "Item Forecast", attrs: { "data-go-section": "item-forecast" } },
    });
  }
  rows[2].push({ span: 1, title: "Coming up", sub: "Next 7 days", body: dashboardTimeline(dashboardComingUp().slice(0, 6), "Nothing scheduled in the next 7 days.") });
  if (facts && dashboardCanSales()) rows[2].push({ span: 1, title: `Top clients · ${shortMonthLabel(fmtDate(today).slice(0, 7))} to date`, sub: "Revenue, net of VAT", body: uiHBars({ items: dashboardTopClients(facts), caption: "Top clients this month" }) });
  const stockFacts = facts ? dashboardStockFacts(facts) : [];
  if (stockFacts.length) rows[2].push({ span: 1, title: "Stock & margin", sub: "Month to date", body: `<dl class="dash-facts">${stockFacts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` });
  const kpis = dashboardKpis(facts, summaries);
  return (kpis.length ? uiKpiCards(kpis) : "") + uiDashboardGrid(rows);
}

/** @returns {UiView} */
function dashboardTasksView() {
  const tasks = dashboardTasks();
  dashboardTaskList = tasks;
  const mine = tasks.filter(dashboardTaskIsMine);
  const roleName = String(currentUser?.role || "");
  return {
    title: "All tasks", intro: "Every open action across the modules you can open, from each module’s own rules. A task drops off by itself once its record changes.",
    placeholder: "Task, module or owner", actions: [],
    stats: [
      { label: "Urgent", value: String(tasks.filter((task) => task.tone === "red").length), sub: "Overdue, or money not being collected", tone: "red", scope: "urgent" },
      { label: "Due this week", value: String(tasks.filter((task) => task.tone !== "red").length), sub: "Approvals, deposits, counts", tone: "amber", scope: "week" },
      { label: "Waiting for you", value: String(mine.length), sub: `Tasks a ${roleName} usually handles`, tone: "blue", scope: "mine" },
    ],
    cols: [{ key: "task", label: "Task", sortable: true }, { key: "module", label: "Module", sortable: true }, { key: "amount", label: "Amount", align: "right", sortable: true }, { key: "due", label: "Due", sortable: true }, { key: "owner", label: "Owner", sortable: true }, { key: "action", label: "" }],
    csvHeader: ["Task", "Module", "Amount", "Due", "Owner"], csvName: "dashboard-tasks.csv",
    rows: tasks.map((task, index) => ({
      id: task.key, branches: [], scopes: [task.tone === "red" ? "urgent" : "week", ...(dashboardTaskIsMine(task) ? ["mine"] : [])],
      search: [task.text, DASHBOARD_MODULE_LABELS[task.module], task.owner, task.due].join(" "),
      sortValues: { task: index, module: DASHBOARD_MODULE_LABELS[task.module] || task.module, amount: task.money || 0, due: ({ Overdue: 0, Today: 1 })[task.due] ?? 2, owner: task.owner },
      csv: [task.text, DASHBOARD_MODULE_LABELS[task.module] || task.module, task.money ? task.money.toFixed(2) : "", task.due, task.owner],
      cells: [
        `<div class="dash-task-cell">${uiDot(task.tone || "amber")}${uiCellDoc(task.text, uiViewSelect("dash", task.key), "", { plain: true })}</div>`,
        uiCellText(DASHBOARD_MODULE_LABELS[task.module] || task.module), task.money ? uiCellNum(peso.format(task.money).replace(/\.00$/, "")) : `<span class="ui-muted">—</span>`,
        uiPill(task.due, dashboardDueTone(task)), uiCellText(task.owner, "", { strong: true }), task.action ? uiButton(task.action, { "data-dash-task": task.key }, { size: "xs" }) : "",
      ],
      detail: () => ({
        eyebrow: DASHBOARD_MODULE_LABELS[task.module] || task.module, title: task.text, pill: { text: task.due, tone: dashboardDueTone(task) }, closeAttrs: { "data-dash-close": "" }, label: "Task details",
        fields: [{ label: "Amount", value: task.money ? peso.format(task.money) : "—" }, { label: "Owner", value: task.owner }, { label: "Module", value: DASHBOARD_MODULE_LABELS[task.module] || task.module }, { label: "Due", value: task.due }],
        note: { text: "This task comes from the module’s own rules and clears automatically once the record is handled there.", tone: "slate" },
        actions: task.action ? [uiButton(task.action, { "data-dash-task": task.key }, { primary: true })] : [],
      }),
    })),
    empty: ["You’re all caught up", "No open tasks in the modules you can open."], minWidth: 1000,
    defaultSort: { key: "task", dir: 1 }, chips: [{ key: "urgent", label: "Urgent", tone: "red" }, { key: "week", label: "This week", tone: "amber" }, { key: "mine", label: "Waiting for you", tone: "blue" }], defaultScope: "",
  };
}

// ----- render ------------------------------------------------------------------------------------
function dashboardQueryString() { return moduleViewQueryString("dashboard", dashboardTab, "today", dashboardView); }

function renderDashboard() {
  const panel = qs("#dashboard-tab-panel");
  if (!panel) return;
  if (!DASHBOARD_TABS.includes(dashboardTab)) dashboardTab = "today";
  // Recon results and backup status are fetched separately; redraw once they arrive.
  if (canViewModule("reconciliation") && typeof loadRecon === "function" && !reconState.data && !reconState.loading) {
    loadRecon().then(() => { if (document.body.dataset.activeSection === "dashboard") renderDashboard(); }).catch(() => null);
  }
  if (["Superadmin", "CEO"].includes(String(currentUser?.role || "")) && !dashboardBackup.loading && Date.now() - dashboardBackup.loadedAt > 5 * 60_000 && MedlaneAPI?.backupStatus) {
    dashboardBackup.loading = true;
    MedlaneAPI.backupStatus().then((status) => { data.backupStatus = status; }).catch(() => null).finally(() => {
      dashboardBackup.loading = false; dashboardBackup.loadedAt = Date.now();
      if (document.body.dataset.activeSection === "dashboard" && dashboardTab === "today") renderDashboard();
    });
  }
  const greeting = qs("#dashboard-greeting");
  if (greeting) greeting.textContent = welcomeGreeting().replace(/\.$/, "");
  const desc = qs("#dashboard-desc");
  if (desc) desc.textContent = `Everything that needs attention today across sales, stock, money in and money out. ${welcomeDateLine()} · all branches.`;
  const actions = qs("#dashboard-actions");
  if (actions) actions.innerHTML = canViewModule("purchase-orders") && canEditModule("purchase-orders") ? uiButton("New sales order", { "data-dashboard-new-order": "" }, { primary: true }) : "";
  const taskCount = dashboardTasks().length;
  qs("#dashboard-tabs").innerHTML = uiModuleTabs({ tabs: DASHBOARD_TABS.map((key) => ({ key, label: DASHBOARD_TAB_LABELS[key], count: key === "tasks" ? taskCount : undefined })), active: dashboardTab, attr: "data-dashboard-tab" });
  uiRender(panel, dashboardTab === "today" ? dashboardTodayHtml() : uiViewHtml(dashboardTasksView(), dashboardView, "dash"));
  syncModuleUrl("dashboard", dashboardQueryString());
}

/** Click handling for the page (wired in events-bootstrap.js). @param {Element} target */
function handleDashboardClick(target) {
  const tab = closestEl(target, "[data-dashboard-tab]");
  if (tab) {
    if (tab.dataset.dashboardTab !== dashboardTab) dashboardView = uiBlankViewState();
    dashboardTab = /** @type {string} */ (tab.dataset.dashboardTab);
    renderDashboard();
    return qs("#dashboard-tab-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  const run = closestEl(target, "[data-dash-task]");
  if (run) {
    const task = dashboardTaskList.find((entry) => entry.key === run.dataset.dashTask);
    return task ? welcomeRun(task.module, task.attrs) : undefined;
  }
  if (closestEl(target, "[data-dashboard-new-order]")) {
    if (!canEditModule("purchase-orders")) return toast("Editing is disabled for Purchase Orders in User Settings.");
    return openModal("purchaseOrder");
  }
  if (closestEl(target, "[data-dash-close]")) { dashboardView.sel = ""; return renderDashboard(); }
  if (dashboardTab === "tasks") uiViewClick(target, "dash", { state: () => dashboardView, view: dashboardTasksView, render: renderDashboard });
}

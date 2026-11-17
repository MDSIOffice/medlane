// @ts-check
// ===== User activity log (module redesign, 18 Nov 2026) =============================================
// Reads GET /api/activity: the append-only activity_log on the server. The server decides whose
// entries come back — Superadmin everyone, CEO everyone (view-only), everyone else only their own —
// and does the tab, search and paging. Opened from Users ("Activity log") and Account settings
// ("View my activity"); it isn't in the sidebar.

const ACT_TABS = ["all", "changes", "approvals", "signins", "exports", "flagged"];
const ACT_TAB_LABELS = /** @type {Record<string, string>} */ ({ all: "All activity", changes: "Changes", approvals: "Approvals", signins: "Sign-ins", exports: "Exports & access", flagged: "Flagged" });
const ACT_KIND_TONES = /** @type {Record<string, UiTone>} */ ({ signin: "blue", created: "green", edited: "accent", approved: "green", voided: "red", stock: "amber", exported: "orange", access: "orange", other: "slate" });
/** Audit "module" labels → the page that holds the record. */
const ACT_MODULE_SECTIONS = /** @type {Record<string, string>} */ ({
  sales: "sales", invoicing: "invoicing", invoices: "invoicing", collections: "collections", receivables: "receivables-tracker", "receivables tracker": "receivables-tracker",
  inventory: "inventory", stocks: "inventory", "purchase orders": "purchase-orders", "supplier pos": "purchase-orders", payables: "payables", expenses: "replenishments",
  replenishments: "replenishments", masterlists: "masterlists", clients: "masterlists", warranty: "warranty", "support tracker": "product-issues", "product issues": "product-issues",
  users: "users", calendar: "calendar", reports: "reports", recon: "reconciliation", reconciliation: "reconciliation", memos: "memos", "item forecast": "item-forecast",
});
const actSeed = (() => {
  let p = new URLSearchParams();
  try { const q = new URLSearchParams(location.search); if (q.get("section") === "activity-log") p = q; } catch { /* no URL state */ }
  return { tab: ACT_TABS.includes(p.get("tab") || "") ? String(p.get("tab")) : "all", q: p.get("q") || "", user: p.get("user") || "", page: Math.max(1, Number(p.get("page")) || 1), size: Number(p.get("size")) || 0 };
})();
/** @type {{ tab: string, q: string, user: string, page: number, size: number, sel: string, data: any, loading: boolean, error: string, key: string }} */
const actState = { tab: actSeed.tab, q: actSeed.q, user: actSeed.user, page: actSeed.page, size: actSeed.size, sel: "", data: null, loading: false, error: "", key: "" };

function actPageSize() { return [10, 25, 50].includes(actState.size) ? actState.size : uiDefaultPageSize(); }
function activityQueryString() {
  const p = new URLSearchParams({ section: "activity-log" });
  if (actState.tab !== "all") p.set("tab", actState.tab);
  if (actState.q) p.set("q", actState.q);
  if (actState.user) p.set("user", actState.user);
  if (actState.page > 1) p.set("page", String(actState.page));
  if (actState.size && actState.size !== uiDefaultPageSize()) p.set("size", String(actState.size));
  return p.toString();
}

/** @param {boolean} [force] */
async function loadActivity(force = false) {
  const key = [actState.tab, actState.q, actState.user, actState.page, actPageSize()].join("|");
  if (actState.loading || (!force && actState.key === key && (actState.data || actState.error))) return;
  actState.loading = true;
  actState.key = key;
  try {
    const page = await MedlaneAPI.activityPage({ tab: actState.tab, q: actState.q, user: actState.user, page: actState.page, size: actPageSize() });
    actState.data = page;
    actState.page = page.page;
    actState.error = "";
  } catch (/** @type {any} */ error) {
    actState.data = null;
    actState.error = error?.message || "Could not load the activity log.";
  } finally {
    actState.loading = false;
  }
  if (document.body.dataset.activeSection === "activity-log") renderActivityLog();
}

/** "Today 10:02" / "13 Nov · 10:02" (Manila). @param {string} iso */
function actWhen(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { text: "—", today: false };
  const day = (/** @type {Date} */ d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
  const today = day(at) === day(new Date());
  return { text: today ? time : `${at.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" })} · ${time}`, today };
}

/** The page that holds an entry's record, if this person can open it. @param {any} item */
function actRecordSection(item) {
  const section = ACT_MODULE_SECTIONS[String(item.module || "").trim().toLowerCase()];
  return section && canViewModule(section) && item.record ? section : "";
}

/** @param {any} item */
function actDetailHtml(item) {
  /** @type {{ field: string, from: string, to: string }[]} */
  const changes = item.changes || [];
  const when = actWhen(item.at);
  const section = actRecordSection(item);
  const scope = actState.data?.scope || {};
  return `<aside class="ui-card ui-detail" id="activity-detail" aria-label="Activity entry details">${uiDetailPanel({
    eyebrow: `${when.today ? "Today " : ""}${when.text}`,
    title: item.action || "Recorded action",
    pill: { text: item.kindLabel, tone: ACT_KIND_TONES[item.kind] || "slate" },
    closeAttrs: { "data-act-close": "" },
    label: "Activity entry details",
    fields: [
      { label: "User", value: item.user, sub: item.role },
      { label: "Module", value: item.module || "—" },
      { label: "Record", value: item.record || "—", wide: true, mono: true },
      { label: "Device", value: item.device || "—", sub: item.location || "" },
      { label: "IP address", value: item.ip || "—", mono: true },
    ],
    linesTitle: "Before → after",
    lines: changes.map((change) => ({ left: change.field, sub: `${change.from}  →  ${change.to}`, tone: /** @type {UiTone} */ ("slate") })),
    extra: changes.length ? "" : `<p class="ui-muted">No field changes recorded for this entry.</p>`,
    note: item.flag ? { text: `Flagged: ${item.flag}`, tone: "orange" } : undefined,
    actions: [
      section ? uiButton("Open record", { "data-act-open": item.id }, { primary: true }) : "",
      scope.all && item.user && item.user !== actState.user ? uiButton(`Filter by ${String(item.user).split(" ")[0]}`, { "data-act-user": item.user }) : "",
    ].filter(Boolean),
  })}</aside>`;
}

function actTableHtml() {
  const page = actState.data;
  if (!page) {
    if (actState.error) return `<div class="ui-card"><div class="ui-empty"><strong>Couldn’t load the activity log</strong><span>${escapeHtml(actState.error)}</span>${uiButton("Try again", { "data-act-retry": "" })}</div></div>`;
    return `<div class="ui-card"><div class="ui-empty"><strong>Loading activity…</strong></div></div>`;
  }
  const items = /** @type {any[]} */ (page.items);
  const selected = items.find((item) => item.id === actState.sel);
  if (!selected) actState.sel = "";
  const rows = items.map((item) => {
    const when = actWhen(item.at);
    return {
      id: item.id, selected: item.id === actState.sel,
      cells: [
        uiCellDoc(when.text, { "data-act-select": item.id }, when.today ? "Today" : "", { plain: true }),
        uiCellText(item.user, item.role, { strong: true }),
        uiPill(item.kindLabel, ACT_KIND_TONES[item.kind] || "slate") + (item.flag ? ` <span class="act-flag" title="${escapeHtml(item.flag)}">${uiPill("Flagged", "red")}</span>` : ""),
        uiCellText(item.action, item.module),
        `<span class="mono act-record">${escapeHtml(String(item.record || "—").slice(0, 80))}</span>`,
        uiCellText(item.device || "—", item.location || ""),
      ],
    };
  });
  const what = actState.tab === "all" ? "activity" : ACT_TAB_LABELS[actState.tab].toLowerCase();
  const table = uiDataTable({
    cols: [{ key: "when", label: "When" }, { key: "user", label: "User" }, { key: "kind", label: "Action" }, { key: "what", label: "What" }, { key: "record", label: "Record" }, { key: "device", label: "Device" }],
    rows, caption: "Activity entries", minWidth: 920,
    empty: { title: `No ${what} found`, text: actState.q || actState.user ? "Try another search, or clear the filters." : "Nothing has been recorded here yet.", clearAttrs: actState.q || actState.user ? { "data-act-clear": "" } : undefined },
    foot: { shown: items.length, total: page.total, page: page.page - 1, pageCount: page.pages, pageAttr: "data-act-page", size: page.size, sizeAttr: "data-act-size", note: "entries can't be edited or deleted" },
  });
  return `<div class="ui-body">${table}${selected ? actDetailHtml(selected) : ""}</div>`;
}

function renderActivityLog() {
  const host = qs("#activity-log");
  if (!host || !currentUser) return;
  loadActivity();
  const page = actState.data;
  const scope = page?.scope || { all: ["Superadmin", "CEO"].includes(currentUser.role), readOnly: currentUser.role !== "Superadmin" };
  qs("#act-desc").textContent = scope.all
    ? `Everyone’s sign-ins, changes, approvals and exports${scope.readOnly ? " — view only" : ""}. Entries are permanent: nobody can edit or delete them.`
    : "Your own sign-ins, changes, approvals and exports. Entries are permanent: nobody can edit or delete them.";
  qs("#act-actions").innerHTML = canViewModule("users") ? uiButton("Users", { "data-go-section": "users" }) : "";
  const stats = page?.stats;
  qs("#act-stats").innerHTML = uiSummaryCards([
    { label: "Actions today", value: stats ? stats.actionsToday : "—", tone: "accent" },
    { label: "Sign-ins today", value: stats ? stats.signInsToday : "—", tone: "blue" },
    { label: "Flagged · last 7 days", value: stats ? stats.flagged7d : "—", tone: stats?.flagged7d ? "red" : "green", action: { "data-act-tab": "flagged" }, active: actState.tab === "flagged" },
  ]);
  renderModuleAssistant("activity-log");
  qs("#act-tabs").innerHTML = uiModuleTabs({ tabs: ACT_TABS.map((key) => ({ key, label: ACT_TAB_LABELS[key], count: page ? page.counts?.[key] ?? 0 : undefined })), active: actState.tab, attr: "data-act-tab" });
  const userChip = actState.user ? `<span class="act-user-chip">Showing ${escapeHtml(actState.user)} ${uiButton("Clear", { "data-act-user": "" }, { size: "sm", ariaLabel: `Stop filtering by ${actState.user}` })}</span>` : "";
  const filterBar = uiFilterBar({ title: scope.all ? "Activity" : "Your activity", search: { id: "act-search", value: actState.q, placeholder: "User, action or record", label: "Search activity" }, extra: userChip });
  const focused = document.activeElement?.id === "act-search";
  uiRender(qs("#act-panel"), filterBar + actTableHtml());
  if (focused) { const input = /** @type {HTMLInputElement | null} */ (qs("#act-search")); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
  syncModuleUrl("activity-log", activityQueryString());
}

WORKFLOW_RULES["activity-log"] = [
  { id: "act-flagged", rule: () => {
    const n = actState.data?.stats?.flagged7d || 0;
    if (!n) return null;
    return { tone: /** @type {UiTone} */ ("red"), text: `${n} flagged entr${n === 1 ? "y" : "ies"} in the last 7 days — new devices, failed sign-ins, voids, unexplained stock changes or client exports.`, action: "Review flagged", attrs: { "data-act-tab": "flagged" } };
  } },
];

/** Opens the log for one person (Superadmin/CEO) or your own, on a tab. @param {string} user @param {string} [tab] */
function openActivityFor(user, tab = "all") {
  actState.tab = ACT_TABS.includes(tab) ? tab : "all";
  actState.user = ["Superadmin", "CEO"].includes(currentUser?.role) ? user : "";
  actState.q = "";
  actState.page = 1;
  actState.sel = "";
  showSection("activity-log");
}

/** @type {number | undefined} */
let actSearchTimer;
/** @param {Event} event */
function handleActivityInput(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (input.id !== "act-search") return;
  clearTimeout(actSearchTimer);
  actSearchTimer = window.setTimeout(() => { actState.q = input.value.trim(); actState.page = 1; actState.sel = ""; renderActivityLog(); }, 300);
}

/** @param {Event} event */
function handleActivityClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const reset = () => { actState.page = 1; actState.sel = ""; };
  const tab = closestEl(target, "[data-act-tab]");
  if (tab) { actState.tab = String(tab.dataset.actTab); reset(); renderActivityLog(); return; }
  const pageBtn = closestEl(target, "[data-act-page]");
  if (pageBtn && actState.data) {
    const next = uiPagerTarget(String(pageBtn.dataset.actPage), actState.data.page, actState.data.pages);
    if (next !== null && next !== actState.page) { actState.page = next; actState.sel = ""; renderActivityLog(); }
    return;
  }
  const sizeBtn = closestEl(target, "[data-act-size]");
  if (sizeBtn) { actState.size = uiPageSizeFrom(sizeBtn.dataset.actSize); reset(); renderActivityLog(); return; }
  const userBtn = closestEl(target, "[data-act-user]");
  if (userBtn) { actState.user = String(userBtn.dataset.actUser || ""); reset(); renderActivityLog(); return; }
  if (closestEl(target, "[data-act-clear]")) { actState.q = ""; actState.user = ""; reset(); renderActivityLog(); return; }
  if (closestEl(target, "[data-act-retry]")) { loadActivity(true); return; }
  if (closestEl(target, "[data-act-close]")) { actState.sel = ""; renderActivityLog(); return; }
  const open = closestEl(target, "[data-act-open]");
  if (open) {
    const item = actState.data?.items.find((/** @type {any} */ entry) => entry.id === open.dataset.actOpen);
    const section = item ? actRecordSection(item) : "";
    if (section) goToFocused(section, String(item.record));
    return;
  }
  const select = closestEl(target, "[data-act-select]");
  if (select) { const id = String(select.dataset.actSelect); actState.sel = actState.sel === id ? "" : id; renderActivityLog(); }
}

// @ts-check
// ===== Notifications (module redesign, 18 Nov 2026) =================================================
// Each person's own notifications, from GET /api/notifications (user_notifications on the server):
// what they may see is decided there (role, modules, Account settings → Notifications), and so is
// their read state, so marking something read here never marks it read for anyone else.
// Tabs: All · Unread · Approvals · Stock · Money · Service · Security. Grouped Today / Yesterday /
// Earlier this week / Older. Paged on the server. Kept for 90 days.

const NTF_TABS = ["all", "unread", "approvals", "stock", "money", "service", "security"];
const NTF_TAB_LABELS = /** @type {Record<string, string>} */ ({ all: "All", unread: "Unread", approvals: "Approvals", stock: "Stock", money: "Money", service: "Service", security: "Security" });
const NTF_CATEGORY = /** @type {Record<string, { label: string, tone: UiTone }>} */ ({
  approvals: { label: "Approval", tone: "orange" }, stock: { label: "Stock", tone: "amber" }, money: { label: "Money", tone: "green" },
  service: { label: "Service", tone: "blue" }, recon: { label: "Recon", tone: "accent" }, security: { label: "Security", tone: "red" }, general: { label: "General", tone: "slate" },
});
const ntfSeed = (() => {
  let p = new URLSearchParams();
  try { const q = new URLSearchParams(location.search); if (q.get("section") === "notifications") p = q; } catch { /* no URL state */ }
  return { tab: NTF_TABS.includes(p.get("tab") || "") ? String(p.get("tab")) : "all", page: Math.max(1, Number(p.get("page")) || 1) };
})();
/** @type {{ tab: string, page: number, size: number, data: NotificationPageResponse | null, loading: boolean, error: string, key: string, unread: number | null }} */
const ntfState = { tab: ntfSeed.tab, page: ntfSeed.page, size: 0, data: null, loading: false, error: "", key: "", unread: null };

function ntfPageSize() { return ntfState.size || uiDefaultPageSize(); }
function notificationsQueryString() {
  const p = new URLSearchParams({ section: "notifications" });
  if (ntfState.tab !== "all") p.set("tab", ntfState.tab);
  if (ntfState.page > 1) p.set("page", String(ntfState.page));
  return p.toString();
}

/** Fetches the page being looked at (again, with force). @param {boolean} [force] */
async function loadNotificationsPage(force = false) {
  const key = `${ntfState.tab}|${ntfState.page}|${ntfPageSize()}`;
  if (ntfState.loading || (!force && ntfState.key === key && (ntfState.data || ntfState.error))) return;
  ntfState.loading = true;
  ntfState.key = key;
  try {
    const page = await MedlaneAPI.notificationsPage({ tab: ntfState.tab, page: ntfState.page, size: ntfPageSize() });
    ntfState.data = page;
    ntfState.page = page.page;
    ntfState.error = "";
    updateBellCount(page.unread);
  } catch (/** @type {any} */ error) {
    ntfState.error = error?.message || "Could not load notifications.";
  } finally {
    ntfState.loading = false;
  }
  if (document.body.dataset.activeSection === "notifications") renderNotificationsPage();
}

// ---- Bell --------------------------------------------------------------------------------------
let ntfBellCheckedAt = 0;
/** Sets the bell from the server's unread count; the chime plays when it goes up. @param {number} unread */
function updateBellCount(unread) {
  const before = ntfState.unread;
  ntfState.unread = unread;
  setBellCount(unread);
  if (before !== null && unread > before && soundEffectsOn() && !document.hidden) {
    const audio = new Audio("/Notification Sound.mp3");
    audio.volume = 0.55;
    audio.play().catch(() => null);
  }
}
/** Asks the server for the unread count (at most once a minute unless forced). @param {{ force?: boolean }} [options] */
async function refreshBellCount({ force = false } = {}) {
  if (!currentUser || (!force && Date.now() - ntfBellCheckedAt < 60 * 1000)) return;
  ntfBellCheckedAt = Date.now();
  try {
    const { unread } = await MedlaneAPI.notificationsUnread();
    updateBellCount(unread);
    // Something new while the page is open: show it.
    if (document.body.dataset.activeSection === "notifications" && ntfState.data && unread !== ntfState.data.unread) loadNotificationsPage(true);
  } catch { /* the bell keeps its last count */ }
}

// ---- Page --------------------------------------------------------------------------------------
/** "10:02" today, "Yesterday 10:02", else "13 Nov · 10:02" (Manila). @param {NotificationItem} item */
function ntfWhen(item) {
  const at = new Date(item.createdAt);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
  if (item.group === "Today") return time;
  if (item.group === "Yesterday") return `Yesterday ${time}`;
  return `${at.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" })} · ${time}`;
}

/** @param {NotificationItem} item */
function ntfRowHtml(item) {
  const cat = NTF_CATEGORY[item.category] || NTF_CATEGORY.general;
  const canOpen = item.section && item.section !== "notifications" && canViewModule(item.section);
  return `<li class="ntf-row${item.read ? "" : " unread"}" data-ntf-id="${escapeHtml(item.id)}">
    <span class="ntf-unread-dot" aria-hidden="true"></span>
    <div class="ntf-main">
      <div class="ntf-head">${uiPill(cat.label, cat.tone)}${item.urgent ? uiPill("Urgent", "red") : ""}<strong class="ntf-title">${escapeHtml(item.title)}</strong><time class="ntf-time" datetime="${escapeHtml(item.createdAt)}">${escapeHtml(ntfWhen(item))}</time></div>
      <p class="ntf-msg">${escapeHtml(item.message)}</p>
    </div>
    <div class="ntf-actions">
      ${canOpen ? uiButton("Open", { "data-ntf-open": item.id }, { size: "sm" }) : ""}
      ${uiButton(item.read ? "Mark unread" : "Mark read", { "data-ntf-read": item.id, "data-ntf-read-to": item.read ? "unread" : "read" }, { size: "sm", ariaLabel: `${item.read ? "Mark unread" : "Mark read"}: ${item.title}` })}
    </div>
    ${item.read ? "" : `<span class="sr-only">Unread</span>`}
  </li>`;
}

function ntfListHtml() {
  const page = ntfState.data;
  if (!page) {
    if (ntfState.error) return `<div class="ui-card"><div class="ui-empty"><strong>Couldn’t load notifications</strong><span>${escapeHtml(ntfState.error)}</span>${uiButton("Try again", { "data-ntf-retry": "" })}</div></div>`;
    return `<div class="ui-card"><div class="ui-empty"><strong>Loading notifications…</strong></div></div>`;
  }
  if (!page.items.length) {
    const what = ntfState.tab === "all" ? "notifications" : ntfState.tab === "unread" ? "unread notifications" : `${NTF_TAB_LABELS[ntfState.tab].toLowerCase()} notifications`;
    return `<div class="ui-card"><div class="ui-empty"><strong>No ${escapeHtml(what)}</strong><span>You’re all caught up. Notifications are kept for 90 days.</span></div></div>`;
  }
  /** @type {Map<string, NotificationItem[]>} */
  const groups = new Map();
  page.items.forEach((item) => { if (!groups.has(item.group)) groups.set(item.group, []); groups.get(item.group)?.push(item); });
  const sections = [...groups.entries()].map(([group, items]) => `<section class="ntf-group" aria-label="${escapeHtml(group)}"><h3 class="ntf-group-title">${escapeHtml(group)}</h3><ul class="ntf-list">${items.map(ntfRowHtml).join("")}</ul></section>`).join("");
  const pager = uiPager({ total: page.total, page: page.page, size: page.size, attr: "data-ntf-page", sizeAttr: "data-ntf-size", note: "kept for 90 days" });
  return `<div class="ui-card ntf-card">${sections}<div class="ui-table-foot">${pager}</div></div>`;
}

function renderNotificationsPage() {
  const host = qs("#notifications");
  if (!host || !currentUser) return;
  loadNotificationsPage();
  const counts = ntfState.data?.counts || {};
  const tabUnread = counts[ntfState.tab]?.unread || 0;
  qs("#ntf-actions").innerHTML = [
    uiButton(ntfState.tab === "all" || ntfState.tab === "unread" ? "Mark all read" : `Mark all ${NTF_TAB_LABELS[ntfState.tab].toLowerCase()} read`, { "data-ntf-read-all": "" }, { disabled: !tabUnread }),
    uiButton("Notification settings", { "data-ntf-settings": "" }),
  ].join("");
  qs("#ntf-tabs").innerHTML = uiModuleTabs({
    tabs: NTF_TABS.map((key) => ({ key, label: NTF_TAB_LABELS[key], count: ntfState.data ? (key === "all" ? counts.all?.total || 0 : counts[key]?.unread || 0) : undefined })),
    active: ntfState.tab, attr: "data-ntf-tab",
  });
  renderModuleAssistant("notifications");
  uiRender(qs("#ntf-panel"), ntfListHtml());
  syncModuleUrl("notifications", notificationsQueryString());
}

/** The bell and Notifications page, from anywhere that used to redraw the old list. */
function renderNotifications() {
  if (ntfState.unread !== null) setBellCount(ntfState.unread);
  if (document.body.dataset.activeSection === "notifications") renderNotificationsPage();
}

WORKFLOW_RULES.notifications = [
  { id: "ntf-approvals", rule: () => {
    const n = ntfState.data?.counts?.approvals?.unread || 0;
    if (!n) return null;
    return { tone: /** @type {UiTone} */ ("orange"), text: `${n} approval${n === 1 ? "" : "s"} waiting for you.`, action: "Show approvals", attrs: { "data-ntf-tab": "approvals" } };
  } },
  { id: "ntf-security", rule: () => {
    const n = ntfState.data?.counts?.security?.unread || 0;
    if (!n) return null;
    return { tone: /** @type {UiTone} */ ("red"), text: `${n} unread security alert${n === 1 ? "" : "s"} — check it was you.`, action: "Show security", attrs: { "data-ntf-tab": "security" } };
  } },
];

// ---- Actions -----------------------------------------------------------------------------------
/** Marks some read (or unread) here at once, then on the server; puts them back if that fails. @param {string[]} ids @param {boolean} read */
async function ntfMark(ids, read) {
  const page = ntfState.data;
  if (!page || !ids.length) return;
  const items = page.items.filter((item) => ids.includes(item.id) && item.read !== read);
  if (!items.length) return;
  const apply = (/** @type {boolean} */ to) => {
    items.forEach((item) => { item.read = to; });
    const delta = (to ? -1 : 1) * items.length;
    page.unread = Math.max(0, page.unread + delta);
    Object.keys(page.counts).forEach((key) => {
      const hits = items.filter((item) => key === "all" || key === "unread" || item.category === key).length;
      page.counts[key].unread = Math.max(0, page.counts[key].unread + (to ? -hits : hits));
    });
    ntfState.unread = page.unread;
    setBellCount(page.unread);
    renderNotificationsPage();
  };
  apply(read);
  try { await MedlaneAPI.markNotificationsRead(items.map((item) => item.id), read); } catch (/** @type {any} */ error) { apply(!read); toast(error?.message || "Couldn’t update that notification."); }
}

async function ntfMarkAll() {
  const tab = ntfState.tab;
  try {
    const { changed } = await MedlaneAPI.markAllNotificationsRead(tab);
    toast(changed ? `${changed} notification${changed === 1 ? "" : "s"} marked as read.` : "No unread notifications.");
  } catch (/** @type {any} */ error) { toast(error?.message || "Couldn’t mark them as read."); }
  await loadNotificationsPage(true);
}

/** @param {Event} event */
function handleNotificationsClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const tab = closestEl(target, "[data-ntf-tab]");
  if (tab) { ntfState.tab = String(tab.dataset.ntfTab); ntfState.page = 1; renderNotificationsPage(); return; }
  const pageBtn = closestEl(target, "[data-ntf-page]");
  if (pageBtn && ntfState.data) {
    const next = uiPagerTarget(String(pageBtn.dataset.ntfPage), ntfState.data.page, ntfState.data.pages);
    if (next !== null && next !== ntfState.page) { ntfState.page = next; renderNotificationsPage(); }
    return;
  }
  const sizeBtn = closestEl(target, "[data-ntf-size]");
  if (sizeBtn) { ntfState.size = uiPageSizeFrom(sizeBtn.dataset.ntfSize); ntfState.page = 1; renderNotificationsPage(); return; }
  if (closestEl(target, "[data-ntf-retry]")) { loadNotificationsPage(true); return; }
  if (closestEl(target, "[data-ntf-read-all]")) { ntfMarkAll(); return; }
  if (closestEl(target, "[data-ntf-settings]")) { accountTab = "notifications"; renderUserSettings(); showSection("user-settings"); return; }
  const toggle = closestEl(target, "[data-ntf-read]");
  if (toggle) { ntfMark([String(toggle.dataset.ntfRead)], toggle.dataset.ntfReadTo === "read"); return; }
  const open = closestEl(target, "[data-ntf-open]") || (closestEl(target, "button, a") ? null : closestEl(target, ".ntf-row"));
  if (open) {
    const id = String(open.dataset.ntfOpen || open.dataset.ntfId);
    const item = ntfState.data?.items.find((entry) => entry.id === id);
    if (!item) return;
    ntfMark([id], true);
    if (item.section && item.section !== "notifications" && canViewModule(item.section)) goToFocused(item.section, item.record.split("|")[0] || "");
  }
}

// @ts-check
// ===== Support Tracker (module redesign, phase 5, 18 Nov 2026) =====================================
// Client service tickets for installed analyzers: what's broken, who's on it, and whether we're
// meeting our response times. Built on top of the existing service reports (data.productIssues):
// the Sales → Product Specialist → Engineering hand-off, printed reports, QC tables and attachments
// all still work; tickets add priority, type, an assigned engineer, replies, visits and outcomes.
// Response-time rules live in support-rules.js (shared with the server's breach notifications).

const SUPPORT_TAB_LABELS = /** @type {Record<string, string>} */ ({ overview: "Overview", open: "Open tickets", engineers: "Engineers", resolved: "Resolved" });
const supportSeed = moduleUrlSeed("product-issues", Object.keys(SUPPORT_TAB_LABELS));
let supportTab = supportSeed.tab;
/** @type {UiViewState} */
let supportView = supportSeed.view;
const SUPPORT_SLA = /** @type {Record<string, { label: string, tone: UiTone }>} */ ({
  breach: { label: "Breached", tone: "red" }, risk: { label: "At risk", tone: "amber" }, ok: { label: "On track", tone: "green" },
  untracked: { label: "Not tracked", tone: "slate" }, done: { label: "Closed", tone: "green" },
});
const SUPPORT_STATUS_TONES = /** @type {Record<string, UiTone>} */ ({ New: "blue", Assigned: "accent", "On-site visit set": "accent", "Waiting for parts": "amber", "Waiting for client": "slate", Resolved: "green" });
const SUPPORT_PRIORITY_TONES = /** @type {Record<string, UiTone>} */ ({ critical: "red", high: "orange", medium: "amber", low: "slate" });
const SUPPORT_TYPE_TONES = /** @type {Record<string, UiTone>} */ ({ Hardware: "red", "Reagent / QC": "amber", "Software / LIS": "slate", Training: "blue" });

function supportQueryString() { return moduleViewQueryString("product-issues", supportTab, "overview", supportView); }

// ----- engineers ---------------------------------------------------------------------------------
/** Engineering and Product Specialist (APS) users. @type {{ email: string, name: string, branch: string, role?: string }[] | null} */
let supportEngineersCache = null;
let supportEngineersLoading = false;
function loadSupportEngineers() {
  if (supportEngineersCache || supportEngineersLoading || !currentUser) return;
  supportEngineersLoading = true;
  MedlaneAPI.supportEngineers()
    .then((result) => { supportEngineersCache = result.engineers || []; })
    .catch(() => { supportEngineersCache = []; })
    .finally(() => {
      supportEngineersLoading = false;
      if (document.body.dataset.activeSection === "product-issues") renderProductIssues();
      if (document.body.dataset.activeSection === "warranty") renderWarranty();
    });
}
/** The saved support settings record (response targets, engineers' home branches). */
function supportSettings() { return /** @type {any} */ ((data.supportSettings || []).find((/** @type {any} */ r) => r.id === "support-settings") || { id: "support-settings" }); }
function supportTargets() { return SupportRules.targetsFrom(supportSettings().targets); }
/** "Ana Cruz (APS)" for a Product Specialist, else the name. @param {{ name: string, role?: string }} person */
function supportPersonName(person) { return person.role === "Product Specialist" ? `${person.name} (APS)` : person.name; }
/** Engineers only (not APS): who new tickets and PM visits are suggested for. @param {ReturnType<typeof supportEngineers>} people */
function supportFieldEngineers(people) { return people.filter((p) => p.role !== "Product Specialist"); }
/** Engineering and Product Specialist users, each with a home branch (set here, else their profile's), plus anyone tickets name. */
function supportEngineers() {
  const homes = /** @type {Record<string, string>} */ (supportSettings().engineerBranches || {});
  const list = (supportEngineersCache || []).map((e) => ({ ...e, branch: homes[e.email] || e.branch || "" }));
  for (const report of data.productIssues) {
    const email = String(report.engineerEmail || "").toLowerCase();
    if (email && !list.some((e) => e.email === email)) list.push({ email, name: String(report.engineer || email), branch: homes[email] || "" });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
function canManageSupport() { return ["Superadmin", "CEO", "Admin"].includes(String(currentUser?.role || "")) && canEditModule("product-issues"); }

// ----- facts -------------------------------------------------------------------------------------
/** @param {ProductIssue} report */
function supportFacts(report) { return SupportRules.ticketFacts(report, { targets: supportTargets() }); }
/** @param {ProductIssue} report */
function supportBranch(report) { return String(report.branch || SupportRules.clientBranch(report.companyName, { clients: data.clients, sales: data.sales })); }
/** "Las Piñas" for "Las Pinas". @param {string} branch */
function supportBranchLabel(branch) { return typeof inventoryBranchLabel === "function" ? inventoryBranchLabel(branch) : branch; }
/** "Today 16:40", "15 Nov 14:20" (Manila). @param {number | null | undefined} t */
function supportWhen(t) {
  if (t === null || t === undefined || !Number.isFinite(t)) return "—";
  const at = new Date(t);
  const day = (/** @type {Date} */ d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
  if (day(at) === day(new Date())) return `Today ${time}`;
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Manila" })} ${time}`;
}
/** @param {ProductIssue} report */
function supportUnit(report) { return [report.equipment, report.serialNo].filter(Boolean).join(" · ") || "Unit not given"; }
/** The unit's warranty, by serial. @param {ProductIssue} report */
function supportWarranty(report) {
  const key = SupportRules.serialKey(report.serialNo);
  const unit = key ? (data.warranties || []).find((w) => SupportRules.serialKey(w.serial) === key) : null;
  if (!unit) return { unit: null, covered: false, text: report.serialNo ? "Not in Warranty" : "—" };
  const days = daysUntil(unit.warrantyEnd);
  const covered = Number.isFinite(days) && days >= 0;
  return { unit, covered, text: covered ? `Under warranty · ends ${uiDate(unit.warrantyEnd)}` : `Out of warranty since ${uiDate(unit.warrantyEnd)}` };
}
/** Who it's with in the hand-off flow. @param {ProductIssue} report */
function supportWith(report) { return String(report.currentActor || report.originRole || "Sales"); }
/** Can the signed-in person work this ticket (reply, assign, visit, resolve)? @param {ProductIssue} report */
function supportCanAct(report) {
  if (!canEditModule("product-issues") || SupportRules.statusOf(report) === "Resolved") return false;
  const me = String(currentUser?.email || "").toLowerCase();
  return canActOnProductIssue(report) || (Boolean(me) && String(report.engineerEmail || "").toLowerCase() === me) || currentUser?.role === "Admin";
}
/** Timeline lines: the report's history, oldest first. @param {ProductIssue} report */
function supportTimeline(report) {
  return productIssueHistory(report).map((/** @type {any} */ event) => ({
    left: `${event.at ? supportWhen(Date.parse(event.at)) : event.date || ""} · ${event.status || "Update"}`,
    sub: [event.note, event.by].filter(Boolean).join(" — "),
    tone: /** @type {UiTone} */ (SUPPORT_STATUS_TONES[event.status] || (event.status === "Resolved" ? "green" : "slate")),
  }));
}

// ----- overview ------------------------------------------------------------------------------------
function supportOverviewHtml() {
  const now = Date.now();
  const reports = data.productIssues;
  const facts = reports.map((report) => ({ report, f: supportFacts(report) }));
  const open = facts.filter(({ f }) => f.open);
  const goto = (/** @type {string} */ tab, /** @type {string} */ scope = "", /** @type {string} */ sel = "") => ({ "data-wa-goto": `product-issues|${tab}|${scope}|${sel}` });
  const branches = new Map();
  open.forEach(({ report }) => { const b = supportBranchLabel(supportBranch(report)); branches.set(b, (branches.get(b) || 0) + 1); });
  const down = open.filter(({ f }) => f.priority === "critical");
  const response = SupportRules.responseStats(facts.map(({ f }) => f), now, 30);
  const firstFix = SupportRules.firstVisitFix(reports, now, 90);
  const newToday = open.filter(({ f }) => f.opened !== null && now - f.opened < SupportRules.DAY).length;
  /** @type {UiKpi[]} */
  const kpis = [
    { label: "Open tickets", value: String(open.length), tone: "blue", change: newToday ? { text: `${newToday} new today`, good: null } : null, sub: [...branches.entries()].map(([b, n]) => `${n} ${b}`).join(" · ") || "Nothing open" },
    { label: "Analyzers down", value: String(down.length), tone: down.length ? "red" : "green", change: down[0]?.f.opened ? { text: SupportRules.duration(now - Number(down[0].f.opened)), good: false } : null, sub: down[0] ? `${down[0].report.equipment || "Unit"} · ${down[0].report.companyName}` : "Critical tickets open" },
    { label: "Response time met", value: response.rate === null ? "—" : `${Math.round(response.rate * 100)}%`, tone: response.breachedNow ? "amber" : "green", change: response.breachedNow ? { text: `${response.breachedNow} breached now`, good: false } : null, sub: `Last 30 days${response.avgResponse !== null ? ` · avg first response ${SupportRules.duration(response.avgResponse)}` : ""}` },
    { label: "Fixed on first visit", value: firstFix.rate === null ? "—" : `${Math.round(firstFix.rate * 100)}%`, tone: "green", sub: `Last 90 days${firstFix.visited ? ` · ${plural(firstFix.visited, "visit ticket")}` : ""}` },
  ];
  const urgent = open.filter(({ f }) => f.sla === "breach" || f.sla === "risk" || (f.status === "Waiting for client" && f.clock === "client")).sort((a, b) => SupportRules.urgencyCompare(a.f, b.f));
  /** @type {UiInsight[]} */
  const needs = urgent.slice(0, 6).map(({ report, f }) => ({
    tone: SUPPORT_SLA[f.sla].tone,
    title: `${report.id} · ${report.companyName} · ${report.equipment || "unit"}`,
    text: `${SupportRules.PRIORITY_LABELS[f.priority]}. ${report.concerns ? `${String(report.concerns).slice(0, 90)}. ` : ""}${f.text}`,
    action: { label: f.status === "New" ? "Assign" : "Open", attrs: goto("open", "", String(report.id)) },
  }));
  /** @type {Record<string, number>} */
  const byType = {};
  open.forEach(({ f }) => { byType[f.type] = (byType[f.type] || 0) + 1; });
  const repeats = SupportRules.repeatUnits(reports, data.warranties || [], now, 90);
  const targetLines = SupportRules.targetLines(supportTargets());
  const training = byType.Training || 0;
  return uiKpiCards(kpis) + uiDashboardGrid([
    [
      { span: 2, title: "Needs action now", sub: "Breached or at-risk response times and tickets stuck with the client", body: uiInsightList(needs, "Every open ticket is on track."), link: urgent.length > 6 ? { label: `All ${urgent.length}`, attrs: goto("open") } : undefined },
      {
        span: 1, title: "Open by type", sub: "Current open tickets",
        body: open.length ? uiHBars({ items: SupportRules.TYPES.filter((t) => byType[t]).map((t) => ({ label: t, value: byType[t], display: String(byType[t]), tone: SUPPORT_TYPE_TONES[t] })), caption: "Open tickets by type" }) : `<p class="ui-muted">No open tickets.</p>`,
        takeaway: training >= 2 ? `${plural(training, "training request")} open: a short how-to guide per analyzer could cover them.` : undefined,
      },
    ],
    [
      {
        span: 2, title: "Repeat problems", sub: "Units with 2 or more tickets in 90 days",
        body: uiInsightList(repeats.slice(0, 5).map((unit) => ({
          tone: /** @type {UiTone} */ (unit.count >= 3 ? "red" : "amber"),
          title: `${unit.equipment} · ${unit.client} · ${plural(unit.count, "ticket")}`,
          text: `${unit.warrantyEnd ? (unit.covered ? `Warranty ends ${uiDate(unit.warrantyEnd)}. ` : `Warranty ended ${uiDate(unit.warrantyEnd)}. `) : ""}${unit.suggestion}. Tickets: ${unit.ids.join(", ")}.`,
          action: { label: "Show", attrs: { "data-support-unit": unit.serial } },
        })), "No unit has had more than one ticket in the last 90 days."),
      },
      {
        span: 1, title: "Response targets", sub: "By priority",
        body: `<dl class="sup-targets">${targetLines.map((line) => `<div><dt>${uiDot(SUPPORT_PRIORITY_TONES[line.priority])}${escapeHtml(line.label)}<small>${escapeHtml(line.hint)}</small></dt><dd>${escapeHtml(line.text)}</dd></div>`).join("")}</dl>`,
        link: canManageSupport() ? { label: "Change targets", attrs: { "data-support-targets": "" } } : undefined,
      },
    ],
  ]);
}

// ----- tabs ----------------------------------------------------------------------------------------
/** @param {string} tab @returns {UiView} */
function supportTabModel(tab) {
  const select = (/** @type {string} */ id) => uiViewSelect("support", id);
  const closeAttrs = { "data-support-close": "" };
  const newTicket = canRequestSupportReport() ? uiButton("New ticket", { "data-action": "open-modal", "data-type": "productIssue" }, { size: "sm", primary: true }) : "";
  const now = Date.now();

  if (tab === "engineers") {
    const engineers = supportEngineers();
    const weekStart = (() => { const d = new Date(`${fmtDate(today)}T00:00:00+08:00`); const dow = (new Date(d.getTime() + 8 * 3600e3).getUTCDay() + 6) % 7; return d.getTime() - dow * SupportRules.DAY; })();
    const rows = engineers.map(/** @returns {UiViewRow} */ (engineer) => {
      const mine = data.productIssues.filter((r) => String(r.engineerEmail || "").toLowerCase() === engineer.email);
      const facts = mine.map((r) => ({ r, f: supportFacts(r) }));
      const open = facts.filter(({ f }) => f.open).sort((a, b) => SupportRules.urgencyCompare(a.f, b.f));
      const visits = mine.filter((r) => { const t = Date.parse(String(r.visitAt || "")); return Number.isFinite(t) && t >= weekStart && t < weekStart + 7 * SupportRules.DAY; }).length;
      const response = SupportRules.responseStats(facts.map(({ f }) => f), now, 90);
      const firstFix = SupportRules.firstVisitFix(mine, now, 90);
      const breached = open.filter(({ f }) => f.sla === "breach").length;
      return {
        id: engineer.email, branches: [], scopes: [...(open.length ? ["busy"] : []), ...(breached ? ["breach"] : [])],
        search: [engineer.name, engineer.email, engineer.branch].join(" "),
        sortValues: { id: engineer.name, open: open.length, visits, response: response.avgResponse ?? Infinity, fix: firstFix.rate ?? -1 },
        csv: [engineer.name, engineer.branch, open.length, visits, response.avgResponse === null ? "" : SupportRules.duration(response.avgResponse), firstFix.rate === null ? "" : `${Math.round(firstFix.rate * 100)}%`],
        cells: [
          uiCellDoc(supportPersonName(engineer), select(engineer.email), supportBranchLabel(engineer.branch) || "No home branch", { plain: true }),
          breached ? `<span class="ui-num tone-red">${open.length}</span>` : uiCellNum(open.length), uiCellNum(visits),
          uiCellNum(response.avgResponse === null ? "—" : SupportRules.duration(response.avgResponse)), uiCellNum(firstFix.rate === null ? "—" : `${Math.round(firstFix.rate * 100)}%`),
        ],
        detail: () => ({
          eyebrow: supportBranchLabel(engineer.branch) || "No home branch", title: supportPersonName(engineer), pill: { text: `${open.length} open`, tone: breached ? "red" : "accent" }, closeAttrs, label: "Engineer workload",
          fields: [
            { label: "Avg first response", value: response.avgResponse === null ? "—" : SupportRules.duration(response.avgResponse), sub: "Last 90 days" },
            { label: "Fixed on first visit", value: firstFix.rate === null ? "—" : `${Math.round(firstFix.rate * 100)}%`, sub: "Last 90 days" },
            { label: "Visits this week", value: String(visits) },
            { label: "Email", value: engineer.email, mono: true },
          ],
          linesTitle: "Open tickets",
          lines: open.map(({ r, f }) => ({ left: `${r.id} · ${r.companyName}`, sub: String(r.concerns || r.equipment || ""), right: SupportRules.PRIORITY_LABELS[f.priority], tone: SUPPORT_SLA[f.sla].tone })),
          extra: open.length ? "" : `<p class="ui-muted">No open tickets.</p>`,
          actions: [
            open.length ? uiButton("Show their tickets", { "data-support-engineer-tickets": engineer.name }, { primary: true }) : "",
            canManageSupport() ? uiButton("Set home branch", { "data-support-home": engineer.email }) : "",
            canViewModule("calendar") ? uiButton("View calendar", { "data-go-section": "calendar" }) : "",
          ].filter(Boolean),
        }),
      };
    });
    const busiest = [...rows].sort((a, b) => Number(b.sortValues.open) - Number(a.sortValues.open)).slice(0, 4);
    return {
      title: "Engineers", intro: "Field engineers and their workload. New tickets go to the engineer for the client's branch with the fewest open tickets.", placeholder: "Engineer", minWidth: 760,
      actions: [canManageSupport() ? uiButton("Response targets", { "data-support-targets": "" }, { size: "sm" }) : ""].filter(Boolean),
      stats: busiest.map((row) => { const e = engineers.find((x) => x.email === row.id); return { label: `${e?.name || row.id}${e?.branch ? ` · ${supportBranchLabel(e.branch)}` : ""}`, value: `${row.sortValues.open} open`, sub: `${plural(Number(row.sortValues.visits), "visit")} this week`, tone: /** @type {UiTone} */ ("accent") }; }),
      cols: [{ key: "id", label: "Engineer", sortable: true }, { key: "open", label: "Open", align: "right", sortable: true }, { key: "visits", label: "Visits this week", align: "right", sortable: true }, { key: "response", label: "Avg response", align: "right", sortable: true }, { key: "fix", label: "First-visit fix", align: "right", sortable: true }],
      csvName: "support-engineers.csv", csvHeader: ["Engineer", "Home branch", "Open", "Visits this week", "Avg response (90 days)", "First-visit fix (90 days)"],
      rows,
      empty: supportEngineersCache === null ? ["Loading engineers…", ""] : ["No Engineering users yet", "Invite someone with the Engineering role from Users and they'll show here."],
      defaultSort: { key: "open", dir: -1 }, chips: [{ key: "busy", label: "With open tickets", tone: "accent" }, { key: "breach", label: "With breached tickets", tone: "red" }], defaultScope: "",
    };
  }

  const resolvedTab = tab === "resolved";
  const list = data.productIssues.filter((r) => (SupportRules.statusOf(r) === "Resolved") === resolvedTab);
  const comeBack = new Map(data.productIssues.filter((r) => r.reopenOf).map((r) => [String(r.reopenOf), String(r.id)]));
  const rows = list.map(/** @returns {UiViewRow} */ (report) => {
    const f = supportFacts(report);
    const warranty = supportWarranty(report);
    const branch = supportBranch(report);
    const engineer = String(report.engineer || "");
    const canAct = supportCanAct(report);
    const returned = comeBack.get(String(report.id));
    const outcome = returned ? `Came back as ${returned}` : String(report.outcome || (resolvedTab ? "Resolved" : ""));
    const scopes = resolvedTab
      ? [...(returned ? ["returned"] : []), ...(report.outcome === "Fixed on first visit" ? ["firstvisit"] : [])]
      : [f.sla, ...(engineer ? [] : ["unassigned"]), ...(f.priority === "critical" ? ["critical"] : []), ...(f.status === "Waiting for client" ? ["client"] : [])];
    const responseCell = !f.tracked ? uiPill("Not tracked", "slate") : uiPill(SUPPORT_SLA[f.sla].label, SUPPORT_SLA[f.sla].tone);
    const responseSub = f.responseTook !== null ? `Replied in ${SupportRules.duration(f.responseTook)}` : f.tracked ? "No reply yet" : "";
    return {
      id: String(report.id), branches: [], scopes,
      search: [report.id, report.companyName, report.equipment, report.serialNo, report.concerns, engineer, f.type, f.status, report.reopenOf].filter(Boolean).join(" "),
      sortValues: {
        id: String(report.id), client: String(report.companyName || ""), priority: SupportRules.PRIORITIES.indexOf(f.priority), status: SupportRules.STATUSES.indexOf(f.status),
        engineer, age: f.age ?? -1, urgency: [{ breach: 0, risk: 1, ok: 2, untracked: 3, done: 4 }[f.sla] ?? 5, SupportRules.PRIORITIES.indexOf(f.priority), f.opened ?? 0].map((n) => String(n).padStart(15, "0")).join("|"),
        type: f.type, closed: f.closedAt ?? 0, fix: f.timeToFix ?? Infinity,
      },
      csv: resolvedTab
        ? [String(report.id), String(report.companyName || ""), supportUnit(report), f.type, engineer, f.closedAt ? new Date(f.closedAt).toISOString() : String(report.resolvedAt || ""), f.timeToFix === null ? "" : SupportRules.duration(f.timeToFix), outcome]
        : [String(report.id), String(report.companyName || ""), supportUnit(report), String(report.concerns || ""), f.type, SupportRules.PRIORITY_LABELS[f.priority], f.status, engineer, f.opened ? new Date(f.opened).toISOString() : String(report.startDate || ""), f.age === null ? "" : SupportRules.duration(f.age), SUPPORT_SLA[f.sla].label],
      cells: resolvedTab
        ? [
          uiCellDoc(String(report.id), select(String(report.id)), String(report.concerns || "").slice(0, 70)),
          uiCellText(String(report.companyName || "—"), supportUnit(report), { strong: true }), escapeHtml(f.type), escapeHtml(engineer || "—"),
          escapeHtml(f.closedAt ? supportWhen(f.closedAt) : uiDate(String(report.resolvedAt || ""))), uiCellNum(f.timeToFix === null ? "—" : SupportRules.duration(f.timeToFix)),
          uiPill(outcome, returned ? "amber" : report.outcome === "Not fixed" ? "red" : "green"),
        ]
        : [
          uiCellDoc(String(report.id), select(String(report.id)), String(report.concerns || "").slice(0, 70)),
          uiCellText(String(report.companyName || "—"), supportUnit(report), { strong: true }),
          uiPill(SupportRules.PRIORITY_LABELS[f.priority], SUPPORT_PRIORITY_TONES[f.priority]), uiPill(f.status, SUPPORT_STATUS_TONES[f.status] || "slate"),
          engineer ? escapeHtml(engineer) : `<span class="ui-muted">—</span>`, uiCellNum(f.age === null ? "—" : SupportRules.duration(f.age)),
          `${responseCell}${responseSub ? `<div class="ui-sub">${escapeHtml(responseSub)}</div>` : ""}`,
        ],
      detail: () => {
        const actor = supportWith(report);
        const handOffs = !canAct || !canActOnProductIssue(report) ? []
          : actor === "Sales" ? [uiButton("Pass to Product Specialist", { "data-product-issue-status": `${report.id}:Pass to Product Specialist` }), uiButton("Pass to Engineering", { "data-product-issue-status": `${report.id}:Pass to Engineering` })]
            : actor === "Product Specialist" ? [uiButton("Pass to Engineering", { "data-product-issue-status": `${report.id}:Pass to Engineering` })]
              : [uiButton("Pass to Product Specialist", { "data-product-issue-status": `${report.id}:Pass to Product Specialist` })];
        const files = productIssueFiles(report).length;
        const claim = !resolvedTab && f.type === "Hardware" && warranty.covered && canViewModule("warranty");
        /** @type {{ text: string, tone: UiTone } | undefined} */
        const note = resolvedTab
          ? { text: returned ? `${report.outcome || "Resolved"}. The problem came back within 30 days as ${returned}.` : `${report.outcome || "Resolved"}${report.resolvedBy ? ` by the ${String(report.resolvedBy).toLowerCase()}` : ""}.`, tone: returned ? "amber" : "green" }
          : { text: f.text, tone: SUPPORT_SLA[f.sla].tone === "green" ? "slate" : SUPPORT_SLA[f.sla].tone };
        return {
          eyebrow: `${report.id} · ${supportBranchLabel(branch)}`, title: String(report.concerns || report.equipment || "Service ticket").slice(0, 140),
          pill: { text: f.status, tone: SUPPORT_STATUS_TONES[f.status] || "slate" }, closeAttrs, label: "Ticket details",
          fields: [
            { label: "Client", value: String(report.companyName || "—"), sub: String(report.contactPerson || "") },
            { label: "Unit", value: supportUnit(report), sub: warranty.text, wide: true },
            { label: "Priority", value: SupportRules.PRIORITY_LABELS[f.priority], sub: SupportRules.PRIORITY_HINTS[f.priority] },
            { label: "Type", value: f.type },
            { label: "Engineer / APS", value: engineer || "Not assigned", sub: `With ${actor}` },
            { label: "Opened", value: f.opened ? supportWhen(f.opened) : uiDate(String(report.startDate || "")), sub: f.age !== null && !resolvedTab ? `${SupportRules.duration(f.age)} ago` : "" },
            { label: "First response", value: f.responseTook !== null ? SupportRules.duration(f.responseTook) : f.tracked ? "No response yet" : "Not tracked", sub: f.responseOnTime === false ? "Late" : f.responseOnTime ? "On time" : f.tracked ? `Due ${supportWhen(f.respondBy)}` : "" },
            resolvedTab ? { label: "Time to fix", value: f.timeToFix === null ? "—" : SupportRules.duration(f.timeToFix), sub: f.closedAt ? `Closed ${supportWhen(f.closedAt)}` : "" } : { label: "Response target", value: SUPPORT_SLA[f.sla].label, sub: f.visitAt ? `Visit ${supportWhen(f.visitAt)}` : "" },
            ...(report.reopenOf ? [{ label: "Came back from", value: String(report.reopenOf), sub: "Same unit, within 30 days", mono: true }] : []),
          ],
          linesTitle: "Timeline",
          lines: supportTimeline(report),
          note,
          actions: [
            ...(canAct ? [
              uiButton(f.status === "New" ? "Assign Engineer / APS" : "Reassign", { "data-support-assign": report.id }, { primary: f.status === "New" }),
              uiButton("Log reply / update", { "data-support-update": report.id }, { primary: f.status !== "New" }),
              uiButton("Schedule visit", { "data-support-visit": report.id }),
              uiButton("Resolve", { "data-product-issue-status": `${report.id}:Resolved` }),
              ...handOffs,
            ] : []),
            ...(claim ? [uiButton("Open warranty claim", { "data-support-claim": report.id })] : []),
            uiButton("Print", { "data-product-issue-print": report.id }),
            uiButton(files ? `Files (${files})` : "Files & full report", { "data-product-issue-timeline": report.id }),
            ...(canCorrectSupportReport() ? [uiButton("Edit details", { "data-product-issue-edit": report.id })] : []),
          ],
        };
      },
    };
  });
  if (resolvedTab) {
    const monthStart = Date.parse(`${fmtDate(today).slice(0, 8)}01T00:00:00+08:00`);
    const thisMonth = list.map((r) => supportFacts(r)).filter((f) => f.closedAt !== null && f.closedAt >= monthStart);
    const fixed = thisMonth.filter((f) => f.timeToFix !== null);
    const returned = list.filter((r) => comeBack.has(String(r.id)));
    const firstFix = SupportRules.firstVisitFix(data.productIssues, now, 90);
    return {
      title: "Resolved", intro: "Closed tickets. A ticket that comes back within 30 days is linked to the original so repeat problems are visible.", placeholder: "Ticket, client, unit or serial", minWidth: 980,
      actions: [],
      stats: [
        { label: "Resolved this month", value: thisMonth.length, sub: fixed.length ? `Avg ${SupportRules.duration(fixed.reduce((s, f) => s + Number(f.timeToFix), 0) / fixed.length)} to fix` : "", tone: "green" },
        { label: "Came back within 30 days", value: returned.length, sub: returned.slice(0, 2).map((r) => `${r.id} → ${comeBack.get(String(r.id))}`).join(" · "), tone: "amber", scope: "returned" },
        { label: "Fixed on first visit", value: firstFix.rate === null ? "—" : `${Math.round(firstFix.rate * 100)}%`, sub: "Last 90 days", tone: "accent", scope: "firstvisit" },
      ],
      cols: [{ key: "id", label: "Ticket", sortable: true }, { key: "client", label: "Client & unit", sortable: true }, { key: "type", label: "Type", sortable: true }, { key: "engineer", label: "Engineer", sortable: true }, { key: "closed", label: "Closed", sortable: true }, { key: "fix", label: "Time to fix", align: "right", sortable: true }, { key: "outcome", label: "Outcome" }],
      csvName: "support-resolved.csv", csvHeader: ["Ticket", "Client", "Unit", "Type", "Engineer", "Closed", "Time to fix", "Outcome"],
      rows,
      empty: ["No resolved tickets yet", "Tickets show here once they're resolved."],
      defaultSort: { key: "closed", dir: -1 }, chips: [{ key: "returned", label: "Came back", tone: "amber" }, { key: "firstvisit", label: "Fixed on first visit", tone: "green" }], defaultScope: "",
    };
  }
  const facts = list.map((r) => supportFacts(r));
  return {
    title: "Open tickets", intro: "Most urgent first. The response clock starts when the ticket is logged and stops at the first reply or visit.", placeholder: "Ticket, client, unit or serial",
    actions: [newTicket].filter(Boolean), minWidth: 1060,
    stats: [
      { label: "Breached", value: facts.filter((f) => f.sla === "breach").length, sub: "A response target was missed", tone: "red", scope: "breach" },
      { label: "At risk", value: facts.filter((f) => f.sla === "risk").length, sub: "75% of a target used, or waiting on the client", tone: "amber", scope: "risk" },
      { label: "Unassigned", value: list.filter((r) => !r.engineer).length, sub: "No engineer yet", tone: "blue", scope: "unassigned" },
    ],
    cols: [{ key: "urgency", label: "Ticket", sortable: true }, { key: "client", label: "Client & unit", sortable: true }, { key: "priority", label: "Priority", sortable: true }, { key: "status", label: "Status", sortable: true }, { key: "engineer", label: "Engineer", sortable: true }, { key: "age", label: "Age", align: "right", sortable: true }, { key: "response", label: "Response" }],
    csvName: "support-open-tickets.csv", csvHeader: ["Ticket", "Client", "Unit", "Issue", "Type", "Priority", "Status", "Engineer", "Opened", "Age", "Response target"],
    rows,
    empty: ["No open tickets", "New service requests show here."],
    defaultSort: { key: "urgency", dir: 1 },
    chips: [{ key: "breach", label: "Breached", tone: "red" }, { key: "risk", label: "At risk", tone: "amber" }, { key: "unassigned", label: "Unassigned", tone: "blue" }, { key: "critical", label: "Analyzer down", tone: "red" }, { key: "client", label: "Waiting for client", tone: "slate" }],
    defaultScope: "",
  };
}

function renderProductIssues() {
  // Attachment counts need the file list; engineers come from the server.
  ensureUploadedFilesLoaded(() => { if (document.body.dataset.activeSection === "product-issues") renderProductIssues(); });
  loadSupportEngineers();
  if (!SUPPORT_TAB_LABELS[supportTab]) supportTab = "overview";
  const header = qs("#support-actions");
  if (header) header.innerHTML = canRequestSupportReport() ? uiButton("Instrumental report", { "data-action": "open-modal", "data-type": "instrumentalServiceReport" }) + uiButton("New ticket", { "data-action": "open-modal", "data-type": "productIssue" }, { primary: true }) : "";
  const open = data.productIssues.filter((r) => SupportRules.statusOf(r) !== "Resolved");
  /** @type {Record<string, number | undefined>} */
  const counts = { open: open.length, engineers: supportEngineers().length, resolved: data.productIssues.length - open.length };
  qs("#support-tabs").innerHTML = uiModuleTabs({ tabs: Object.keys(SUPPORT_TAB_LABELS).map((key) => ({ key, label: SUPPORT_TAB_LABELS[key], count: counts[key] })), active: supportTab, attr: "data-support-tab" });
  renderModuleAssistant("product-issues");
  uiRender(qs("#support-tab-panel"), supportTab === "overview" ? supportOverviewHtml() : uiViewHtml(supportTabModel(supportTab), supportView, "support"));
  syncModuleUrl("product-issues", supportQueryString());
}

WORKFLOW_RULES["product-issues"] = [
  { id: "support-breached", rule: () => {
    const breached = data.productIssues.map((r) => ({ r, f: supportFacts(r) })).filter(({ f }) => f.open && f.sla === "breach").sort((a, b) => SupportRules.urgencyCompare(a.f, b.f));
    if (!breached.length) return null;
    const first = breached[0];
    return { tone: "red", text: breached.length === 1 ? `${first.r.id} · ${first.r.companyName}: ${first.f.text}` : `${plural(breached.length, "ticket")} missed a response target. Oldest: ${first.r.id} · ${first.r.companyName}.`, action: first.f.status === "New" ? "Assign now" : "Open ticket", attrs: { "data-wa-goto": `product-issues|open|breach|${breached.length === 1 ? first.r.id : ""}` } };
  } },
  { id: "support-down", rule: () => {
    const down = data.productIssues.map((r) => ({ r, f: supportFacts(r) })).filter(({ f }) => f.open && f.priority === "critical" && f.sla !== "breach");
    if (!down.length) return null;
    const first = down[0];
    return { tone: "red", text: `${first.r.id} · ${first.r.companyName}: ${first.r.equipment || "analyzer"} down${first.f.opened ? ` for ${SupportRules.duration(Date.now() - first.f.opened)}` : ""}.${first.f.visitAt ? ` Visit set for ${supportWhen(first.f.visitAt)}.` : ""}`, action: "Open ticket", attrs: { "data-wa-goto": `product-issues|open||${first.r.id}` } };
  } },
  { id: "support-client-wait", rule: () => {
    const stuck = data.productIssues.map((r) => ({ r, f: supportFacts(r) })).filter(({ f }) => f.open && f.clock === "client");
    if (!stuck.length) return null;
    return { tone: "amber", text: `${stuck[0].r.id} · ${stuck[0].r.companyName}: ${stuck[0].f.text}${stuck.length > 1 ? ` (+${stuck.length - 1} more)` : ""}`, action: "Follow up", attrs: { "data-wa-goto": `product-issues|open|client|${stuck.length === 1 ? stuck[0].r.id : ""}` } };
  } },
  { id: "support-unassigned", rule: () => {
    const waiting = data.productIssues.filter((r) => SupportRules.statusOf(r) === "New" && !r.engineer);
    if (!waiting.length) return null;
    return { tone: "blue", text: `${plural(waiting.length, "new ticket")} ${waiting.length === 1 ? "has" : "have"} no engineer yet.`, action: "Assign", attrs: { "data-wa-goto": "product-issues|open|unassigned|" } };
  } },
];

// ----- ticket actions --------------------------------------------------------------------------------
/**
 * A small form dialog. Resolves with the form's values, or null when cancelled.
 * @param {{ kicker: string, title: string, body: string, confirm: string }} options @returns {Promise<Record<string, string> | null>}
 */
function supportDialog({ kicker, title, body, confirm }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal invite-confirm-modal sup-dialog";
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><div><p class="eyebrow">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">x</button></div>${body}<div class="modal-actions"><button class="ghost-button" value="cancel" formnovalidate>Cancel</button><button class="primary-button" value="confirm">${escapeHtml(confirm)}</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => {
      const form = /** @type {HTMLFormElement} */ (dialog.querySelector("form"));
      const values = /** @type {Record<string, string>} */ (Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)])));
      const ok = dialog.returnValue === "confirm";
      dialog.remove();
      resolve(ok ? values : null);
    });
    dialog.showModal();
  });
}
/** @param {string} name @param {string} label @param {{ value: string, label: string }[]} options @param {string} selected */
function supportSelectHtml(name, label, options, selected) {
  return `<div class="field"><label for="sup-${name}">${escapeHtml(label)}</label><select id="sup-${name}" name="${name}">${options.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select></div>`;
}
function supportNowStamp() { return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }); }

/**
 * Saves a change to a ticket with a timeline entry. @param {ProductIssue} report @param {Record<string, any>} change
 * @param {{ status: string, note: string, log: string }} entry @param {{ calendarEvents?: CalendarEvent[] }} [extra]
 */
async function supportSave(report, change, entry, extra = {}) {
  const by = currentUser?.name || "System User";
  const next = /** @type {ProductIssue} */ ({ ...report, ...change, history: [...productIssueHistory(report), { at: new Date().toISOString(), date: supportNowStamp(), status: entry.status, note: entry.note, by }] });
  if (change.ticketStatus && change.ticketStatus !== SupportRules.statusOf(report)) next.statusSince = new Date().toISOString();
  const saveResult = await persistRecords({ productIssues: [next], ...extra });
  if (!saveResult?.ok && !saveResult?.queued) return false;
  const index = data.productIssues.findIndex((r) => r.id === report.id);
  if (index >= 0) data.productIssues[index] = next;
  if (extra.calendarEvents) data.calendarEvents.push(...extra.calendarEvents);
  log(entry.log, "Support Tracker", `${report.id}: ${entry.note}`.slice(0, 200), { save: false });
  renderProductIssues();
  return true;
}
/** @param {string} id */
function supportReport(id) { return data.productIssues.find((r) => r.id === id) || null; }

/** Assign (or reassign) the engineer; defaults to the branch engineer with the fewest open tickets. @param {string} id */
async function supportAssign(id) {
  const report = supportReport(id);
  if (!report || !supportCanAct(report)) return toast("You can't change this ticket.");
  const engineers = supportEngineers();
  if (!engineers.length) return toast(supportEngineersCache === null ? "Still loading the engineers. Try again in a moment." : "There are no Engineering or Product Specialist users to assign. Invite one from Users first.");
  const branch = supportBranch(report);
  const suggested = SupportRules.defaultEngineer(supportFieldEngineers(engineers), branch, data.productIssues);
  const current = String(report.engineerEmail || suggested?.email || "");
  const load = (/** @type {string} */ email) => data.productIssues.filter((r) => SupportRules.statusOf(r) !== "Resolved" && String(r.engineerEmail || "").toLowerCase() === email).length;
  const values = await supportDialog({
    kicker: `${report.id} · ${report.companyName}`, title: report.engineer ? "Reassign Engineer / APS" : "Assign Engineer / APS", confirm: "Assign",
    body: supportSelectHtml("engineer", "Engineer / APS", engineers.map((e) => ({ value: e.email, label: `${supportPersonName(e)}${e.branch ? ` · ${supportBranchLabel(e.branch)}` : ""} · ${plural(load(e.email), "open ticket")}${suggested?.email === e.email ? " (suggested)" : ""}` })), current)
      + `<p class="field-help">The client is served from ${escapeHtml(supportBranchLabel(branch))}. Assigning passes the ticket to Engineering, or to the Product Specialist if you pick an APS.</p>`,
  });
  if (!values) return;
  const engineer = engineers.find((e) => e.email === values.engineer);
  if (!engineer || engineer.email === String(report.engineerEmail || "").toLowerCase()) return;
  const status = SupportRules.statusOf(report) === "New" ? "Assigned" : SupportRules.statusOf(report);
  await supportSave(report, { engineer: engineer.name, engineerEmail: engineer.email, ticketStatus: status, currentActor: engineer.role === "Product Specialist" ? "Product Specialist" : "Engineering", branch }, { status, note: `Assigned to ${engineer.name}`, log: "Assigned support ticket" });
}

/** Log a reply to the client or an update; the first reply stops the response clock. @param {string} id */
async function supportUpdate(id) {
  const report = supportReport(id);
  if (!report || !supportCanAct(report)) return toast("You can't change this ticket.");
  const status = SupportRules.statusOf(report);
  const firstReply = !report.firstResponseAt;
  const values = await supportDialog({
    kicker: `${report.id} · ${report.companyName}`, title: "Log a reply or update", confirm: "Save update",
    body: `<div class="field full"><label for="sup-note">What happened</label><textarea id="sup-note" name="note" required placeholder="e.g. Called the lab; asked them to re-run the calibration with the new lot."></textarea></div>`
      + supportSelectHtml("status", "Status", SupportRules.STATUSES.filter((s) => s !== "Resolved").map((s) => ({ value: s, label: s })), status === "New" && report.engineer ? "Assigned" : status)
      + supportSelectHtml("priority", "Priority", SupportRules.PRIORITIES.map((p) => ({ value: p, label: `${SupportRules.PRIORITY_LABELS[p]} — ${SupportRules.PRIORITY_HINTS[p].toLowerCase()}` })), SupportRules.priorityOf(report))
      + `<label class="ios-check-row"><input type="checkbox" name="reply" value="yes"${firstReply ? " checked" : ""} /><span></span><strong>This was a reply to the client${firstReply ? " (stops the response clock)" : ""}</strong></label>`,
  });
  if (!values) return;
  const note = String(values.note || "").trim();
  if (!note) return toast("Describe the update first.");
  /** @type {Record<string, any>} */
  const change = { ticketStatus: values.status, priority: values.priority };
  if (values.reply === "yes" && firstReply) change.firstResponseAt = new Date().toISOString();
  if (values.priority !== SupportRules.priorityOf(report)) change.priority = values.priority;
  const label = values.reply === "yes" ? "Reply" : values.status;
  await supportSave(report, change, { status: values.status, note: `${label === values.status ? "" : "Replied: "}${note}${values.priority !== SupportRules.priorityOf(report) ? ` (priority now ${SupportRules.PRIORITY_LABELS[/** @type {"critical"} */ (values.priority)]})` : ""}`, log: values.reply === "yes" ? "Replied on support ticket" : "Updated support ticket" });
}

/** Schedule an on-site visit; it goes on the shared Calendar. @param {string} id */
async function supportVisit(id) {
  const report = supportReport(id);
  if (!report || !supportCanAct(report)) return toast("You can't change this ticket.");
  const f = supportFacts(report);
  const deadline = f.onsiteBy ? `<p class="field-help">Critical: be on site by ${escapeHtml(supportWhen(f.onsiteBy))}${f.naga ? " (Naga, 48 h)" : ""}.</p>` : "";
  const values = await supportDialog({
    kicker: `${report.id} · ${report.companyName}`, title: "Schedule a visit", confirm: "Schedule visit",
    body: `<div class="field"><label for="sup-date">Date</label><input id="sup-date" name="date" type="date" required min="${fmtDate(today)}" value="${fmtDate(today)}" /></div><div class="field"><label for="sup-time">Time</label><input id="sup-time" name="time" type="time" required value="09:00" /></div>${deadline}<div class="field full"><label for="sup-visit-note">Plan (optional)</label><textarea id="sup-visit-note" name="note" placeholder="e.g. Bring the replacement probe from Zybio."></textarea></div><p class="field-help">The visit is added to the Calendar.</p>`,
  });
  if (!values) return;
  if (!values.date || !values.time) return toast("Pick a date and time.");
  if (values.date < fmtDate(today)) return toast("Visits can only be scheduled for today or later.");
  const visitAt = new Date(`${values.date}T${values.time}:00+08:00`).toISOString();
  /** @type {CalendarEvent} */
  const event = { id: `EVT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title: `Visit: ${report.companyName} · ${report.equipment || "unit"} (${report.id})`, date: values.date, time: values.time, createdBy: currentUser?.name || currentUser?.email || "User", createdByUser: currentUser?.email || "", createdByRole: currentUser?.role || "", createdAt: new Date().toISOString(),
    type: "service", source: "support-visit", sourceId: String(report.id), module: "product-issues", branch: supportBranch(report),
    ...(report.engineerEmail ? { assigneeEmail: String(report.engineerEmail).toLowerCase(), assigneeName: String(report.engineer || "") } : {}) };
  const note = `Visit set for ${supportWhen(Date.parse(visitAt))}${values.note?.trim() ? `: ${values.note.trim()}` : ""}`;
  await supportSave(report, { visitAt, ticketStatus: "On-site visit set", visitEventIds: [...(Array.isArray(report.visitEventIds) ? report.visitEventIds : []), event.id] }, { status: "On-site visit set", note, log: "Scheduled support visit" }, { calendarEvents: [event] });
}

/** Superadmin/CEO/Admin: change the response targets. */
async function supportEditTargets() {
  if (!canManageSupport()) return toast("Only Superadmin, CEO or Admin can change the response targets.");
  const t = supportTargets();
  const num = (/** @type {string} */ name, /** @type {number} */ value, /** @type {string} */ label, /** @type {string} */ unit) => `<div class="field"><label for="sup-${name}">${escapeHtml(label)}</label><div class="sup-num"><input id="sup-${name}" name="${name}" type="number" min="0" max="1000" step="0.5" value="${value}" /><span>${unit}</span></div></div>`;
  const values = await supportDialog({
    kicker: "Support Tracker", title: "Response targets", confirm: "Save targets",
    body: `<div class="sup-target-grid">${SupportRules.PRIORITIES.map((p) => `<fieldset><legend>${uiDot(SUPPORT_PRIORITY_TONES[p])}${escapeHtml(SupportRules.PRIORITY_LABELS[p])} <small>${escapeHtml(SupportRules.PRIORITY_HINTS[p])}</small></legend>${
      t[p].respondBusinessDays && !t[p].respondHours ? num(`${p}.respondBusinessDays`, t[p].respondBusinessDays, "Respond within", "business days") : num(`${p}.respondHours`, t[p].respondHours, "Respond within", "hours")
    }${p === "critical" ? num(`${p}.onsiteHours`, t[p].onsiteHours, "On site within", "hours") + num(`${p}.onsiteHoursNaga`, t[p].onsiteHoursNaga, "On site (Naga)", "hours") : num(`${p}.fixDays`, t[p].fixDays, "Fixed within", "days")}</fieldset>`).join("")}</div><p class="field-help">The clock starts when a ticket is logged. 75% of a target used counts as at risk.</p>`,
  });
  if (!values) return;
  /** @type {Record<string, Record<string, number>>} */
  const targets = JSON.parse(JSON.stringify(t));
  Object.entries(values).forEach(([key, value]) => { const [p, field] = key.split("."); if (targets[p] && field) targets[p][field] = Number(value); });
  const record = { ...supportSettings(), targets: SupportRules.targetsFrom(targets), updatedBy: currentUser?.name || "", updatedAt: new Date().toISOString() };
  const saveResult = await persistRecords({ supportSettings: [record] });
  if (!saveResult?.ok) return;
  data.supportSettings = [...(data.supportSettings || []).filter((/** @type {any} */ r) => r.id !== record.id), record];
  log("Changed support response targets", "Support Tracker", SupportRules.targetLines(record.targets).map((l) => `${l.label}: ${l.text}`).join("; "), { save: false });
  toast("Response targets saved.");
  renderProductIssues();
}

/** Superadmin/CEO/Admin: an engineer's home branch (decides who new tickets go to). @param {string} email */
async function supportEditHome(email) {
  if (!canManageSupport()) return;
  const engineer = supportEngineers().find((e) => e.email === email);
  if (!engineer) return;
  const values = await supportDialog({
    kicker: engineer.name, title: "Home branch", confirm: "Save",
    body: supportSelectHtml("branch", "Branch", [{ value: "", label: "No home branch" }, ...platformBranches().map((b) => ({ value: b, label: supportBranchLabel(b) }))], engineer.branch) + `<p class="field-help">New tickets for clients served from this branch go to ${escapeHtml(engineer.name)} (or the branch engineer with the fewest open tickets).</p>`,
  });
  if (!values) return;
  const settings = supportSettings();
  const record = { ...settings, engineerBranches: { ...(settings.engineerBranches || {}), [email]: values.branch || "" }, updatedBy: currentUser?.name || "", updatedAt: new Date().toISOString() };
  const saveResult = await persistRecords({ supportSettings: [record] });
  if (!saveResult?.ok) return;
  data.supportSettings = [...(data.supportSettings || []).filter((/** @type {any} */ r) => r.id !== record.id), record];
  log("Set engineer home branch", "Support Tracker", `${engineer.name}: ${values.branch || "none"}`, { save: false });
  renderProductIssues();
}

// ----- new ticket form ---------------------------------------------------------------------------------
/** Priority / type / engineer fields for the service report forms. */
function supportFormFields() {
  return [
    ["priority", "Priority", "select", () => SupportRules.PRIORITIES.map((p) => `${SupportRules.PRIORITY_LABELS[p]} — ${SupportRules.PRIORITY_HINTS[p].toLowerCase()}`)],
    ["issueType", "Ticket type", "select", () => SupportRules.TYPES],
    ["engineerPick", "Engineer / APS", "select", () => ["Not assigned yet", ...supportEngineers().map((e) => `${supportPersonName(e)}${e.branch ? ` · ${supportBranchLabel(e.branch)}` : ""}`)]],
  ];
}
/** Pre-selects the branch engineer once a client is chosen (and medium priority on open). */
function supportFormDefaults() {
  const priority = /** @type {HTMLSelectElement | null} */ (qs("#priority"));
  if (priority && !priority.dataset.touched) priority.selectedIndex = SupportRules.PRIORITIES.indexOf("medium");
  const pick = /** @type {HTMLSelectElement | null} */ (qs("#engineerPick"));
  if (!pick || pick.dataset.touched) return;
  const client = String(/** @type {HTMLInputElement | null} */ (qs("#companyName"))?.value || "");
  const engineers = supportEngineers();
  const suggested = client ? SupportRules.defaultEngineer(supportFieldEngineers(engineers), SupportRules.clientBranch(client, { clients: data.clients, sales: data.sales }), data.productIssues) : null;
  pick.selectedIndex = suggested ? engineers.findIndex((e) => e.email === suggested.email) + 1 : 0;
}
/** Turns the form's ticket fields into the record's. @param {Record<string, any>} values */
function supportTicketFromForm(values) {
  const priorityIndex = (/** @type {HTMLSelectElement | null} */ (qs("#priority")))?.selectedIndex ?? 2;
  const engineerIndex = (/** @type {HTMLSelectElement | null} */ (qs("#engineerPick")))?.selectedIndex ?? 0;
  const engineer = engineerIndex > 0 ? supportEngineers()[engineerIndex - 1] : null;
  delete values.engineerPick;
  values.priority = SupportRules.PRIORITIES[priorityIndex] || "medium";
  values.issueType = SupportRules.TYPES.includes(values.issueType) ? values.issueType : SupportRules.typeOf(values);
  values.branch = SupportRules.clientBranch(values.companyName, { clients: data.clients, sales: data.sales });
  values.openedAt = new Date().toISOString(); // the server replaces this with its own time
  values.ticketStatus = engineer ? "Assigned" : "New";
  values.statusSince = values.openedAt;
  if (engineer) { values.engineer = engineer.name; values.engineerEmail = engineer.email; }
  const reopen = SupportRules.reopenOf(values, data.productIssues, Date.now());
  if (reopen) values.reopenOf = reopen;
  return values;
}

/** @param {Event} event */
function handleSupportClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const el = (/** @type {string} */ name) => closestEl(target, `[${name}]`);
  let hit;
  if ((hit = el("data-support-tab"))) {
    const tab = String(hit.dataset.supportTab);
    if (tab !== supportTab) supportView = uiBlankViewState();
    supportTab = tab;
    renderProductIssues();
    return;
  }
  if ((hit = el("data-support-assign"))) return void supportAssign(String(hit.dataset.supportAssign));
  if ((hit = el("data-support-update"))) return void supportUpdate(String(hit.dataset.supportUpdate));
  if ((hit = el("data-support-visit"))) return void supportVisit(String(hit.dataset.supportVisit));
  if (el("data-support-targets")) return void supportEditTargets();
  if ((hit = el("data-support-home"))) return void supportEditHome(String(hit.dataset.supportHome));
  if ((hit = el("data-support-engineer-tickets"))) { supportTab = "open"; supportView = uiBlankViewState(); supportView.q = String(hit.dataset.supportEngineerTickets); renderProductIssues(); return; }
  if ((hit = el("data-support-unit"))) { supportTab = "open"; supportView = uiBlankViewState(); supportView.q = String(hit.dataset.supportUnit); if (!data.productIssues.some((r) => SupportRules.statusOf(r) !== "Resolved" && SupportRules.serialKey(r.serialNo) === SupportRules.serialKey(supportView.q))) supportTab = "resolved"; renderProductIssues(); return; }
  if ((hit = el("data-support-claim"))) {
    const report = supportReport(String(hit.dataset.supportClaim));
    if (!report) return;
    // Warranty editors open the claim straight away; others just see the unit.
    if (canEditModule("warranty")) { warrantyTab = "claims"; warrantyView = uiBlankViewState(); showSection("warranty"); void warrantyNewClaim({ ticketId: String(report.id) }); }
    else goToFocused("warranty", String(report.serialNo || ""));
    return;
  }
  if (supportTab !== "overview") uiViewClick(target, "support", { state: () => supportView, view: () => supportTabModel(supportTab), render: renderProductIssues });
}

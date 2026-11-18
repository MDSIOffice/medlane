// @ts-check
// ===== Warranty (module redesign, phase 6, 18 Nov 2026) ===========================================
// Every analyzer we've installed (data.warranties, one record per serial): who covers it, when its
// preventive maintenance (PM) is due, and the parts we claim back from the principal
// (data.warrantyClaims). Status, PM and claim rules live in warranty-rules.js (shared with the
// server's checks). Scheduling a PM puts it on the shared Calendar for the branch engineer;
// Support Tracker's "Open warranty claim" opens a claim here.

const WARRANTY_TAB_LABELS = /** @type {Record<string, string>} */ ({ overview: "Overview", units: "Installed units", pm: "Preventive maintenance", claims: "Claims" });
const warrantySeed = moduleUrlSeed("warranty", Object.keys(WARRANTY_TAB_LABELS));
let warrantyTab = warrantySeed.tab;
/** @type {UiViewState} */
let warrantyView = warrantySeed.view;
const WARRANTY_STATUS_TONES = /** @type {Record<string, UiTone>} */ ({ under: "green", expiring: "amber", contract: "blue", out: "slate" });
const WARRANTY_PM_TONES = /** @type {Record<string, UiTone>} */ ({ overdue: "red", due: "amber", scheduled: "green", none: "slate" });
const WARRANTY_CLAIM_TONES = /** @type {Record<string, UiTone>} */ ({ Open: "blue", "Part received": "accent", "Old part returned": "amber", Credited: "green" });
const WARRANTY_UNIT_TYPES = ["Hematology", "Chemistry", "Immunoassay", "Coagulation", "Urinalysis", "Other"];
/** The older free-text status other pages (Reports, digests) still read. */
const WARRANTY_LEGACY_STATUS = /** @type {Record<string, string>} */ ({ under: "Active", expiring: "Expiring Soon", contract: "Service Contract", out: "Expired" });
const WARRANTY_CONTRACT_LABELS = /** @type {Record<string, string>} */ ({ none: "No contract", quoted: "Quoted", active: "Active" });

function warrantyQueryString() { return moduleViewQueryString("warranty", warrantyTab, "overview", warrantyView); }
function warrantyToday() { return fmtDate(today); }
/** The saved settings record (PM interval per model). */
function warrantySettings() { return /** @type {any} */ ((data.warrantySettings || []).find((/** @type {any} */ r) => r.id === "warranty-settings") || { id: "warranty-settings" }); }
function canEditWarranty() { return canEditModule("warranty"); }
function canManageWarranty() { return ["Superadmin", "CEO", "Admin"].includes(String(currentUser?.role || "")) && canEditWarranty(); }

// ----- units ---------------------------------------------------------------------------------------
/** A stable id for a unit: its serial, else client|equipment for older records. @param {Warranty} unit */
function warrantyUnitId(unit) { return String(unit.serial || `${unit.client || ""}|${unit.equipment || ""}`); }
/** @param {string} id */
function warrantyUnit(id) {
  const key = SupportRules.serialKey(id);
  return data.warranties.find((u) => warrantyUnitId(u) === id || (key && SupportRules.serialKey(u.serial) === key)) || null;
}
/** @param {Warranty} unit */
function warrantyModel(unit) { return WarrantyRules.modelOf(unit) || "Unknown model"; }
/** @param {Warranty} unit */
function warrantyBranch(unit) { return String(unit.branch || SupportRules.clientBranch(String(unit.client || ""), { clients: data.clients, sales: data.sales })); }
/** Everything the page shows about a unit. @param {Warranty} unit */
function warrantyFacts(unit) {
  const day = warrantyToday();
  const status = WarrantyRules.unitStatus(unit, day);
  const pm = WarrantyRules.pm(unit, day, warrantySettings());
  const key = SupportRules.serialKey(unit.serial);
  const tickets = key ? data.productIssues.filter((r) => SupportRules.serialKey(r.serialNo) === key) : [];
  const claims = key ? (data.warrantyClaims || []).filter((c) => SupportRules.serialKey(c.serial) === key) : [];
  const openTickets = tickets.filter((r) => SupportRules.statusOf(r) !== "Resolved");
  const hold = Boolean(unit.client && clientCreditState(String(unit.client)).exceeded);
  return { status, pm, tickets, claims, openTickets, hold, branch: warrantyBranch(unit), model: warrantyModel(unit) };
}
/** "Ends 10 Feb 2028" / "Ended 21 Jan 2026" / "No end date". @param {Warranty} unit @param {ReturnType<typeof WarrantyRules.unitStatus>} status */
function warrantyEndText(unit, status) {
  if (status.daysLeft === null) return "No end date";
  if (status.daysLeft < 0) return `Ended ${uiDate(String(unit.warrantyEnd))}`;
  return status.daysLeft <= WarrantyRules.EXPIRING_DAYS ? `${plural(status.daysLeft, "day")} left · ${uiDate(String(unit.warrantyEnd))}` : `Ends ${uiDate(String(unit.warrantyEnd))}`;
}
/** @param {Warranty} unit */
function warrantyContractText(unit) {
  const state = String(unit.contractStatus || "none");
  if (state === "none" || !WARRANTY_CONTRACT_LABELS[state]) return "No contract";
  return `${WARRANTY_CONTRACT_LABELS[state]}${unit.contractEnd ? ` · ${state === "active" ? "ends" : "would run to"} ${uiDate(String(unit.contractEnd))}` : ""}`;
}
/** @param {ReturnType<typeof WarrantyRules.pm>} pm */
function warrantyPmText(pm) {
  if (!pm.next) return "No install or PM date";
  if (pm.status === "overdue") return `${plural(-Number(pm.days), "day")} overdue · was due ${uiDate(pm.next)}`;
  if (pm.days === 0) return `Due today`;
  return `${pm.status === "due" ? "Due in " : "In "}${plural(Number(pm.days), "day")} · ${uiDate(pm.next)}`;
}
/** The note shown on a unit: credit hold, or what to offer once it's out of warranty. @param {ReturnType<typeof warrantyFacts>} f */
function warrantyNote(f) {
  if (f.hold) {
    return f.status.covered || f.status.status === "contract"
      ? { text: "This client is over its credit limit. Warranty service continues as normal.", tone: /** @type {UiTone} */ ("amber") }
      : { text: "This client is over its credit limit and the unit isn't covered: out-of-warranty work needs prepayment.", tone: /** @type {UiTone} */ ("red") };
  }
  if (f.status.status === "out") return { text: "Out of warranty with no service contract: repairs and PM visits are billed. Offer a service contract.", tone: /** @type {UiTone} */ ("slate") };
  if (f.status.status === "expiring") return { text: `Warranty ends in ${plural(Number(f.status.daysLeft), "day")}. Quote a service contract before it lapses.`, tone: /** @type {UiTone} */ ("amber") };
  return undefined;
}
/** Tickets and claims on this unit in the last 90 days, newest first. @param {ReturnType<typeof warrantyFacts>} f @returns {UiLine[]} */
function warrantyHistoryLines(f) {
  const since = Date.now() - 90 * SupportRules.DAY;
  const lines = [
    ...f.tickets.map((r) => ({ at: SupportRules.loggedAt(r) ?? 0, line: { left: `${r.id} · ${SupportRules.statusOf(r)}`, sub: String(r.concerns || r.typeOfSupport || "Service ticket"), right: uiDate(new Date(SupportRules.loggedAt(r) ?? 0).toISOString().slice(0, 10)), tone: /** @type {UiTone} */ (SupportRules.statusOf(r) === "Resolved" ? "green" : "blue") } })),
    ...f.claims.map((c) => ({ at: Date.parse(String(c.openedAt || "")) || 0, line: { left: `${c.id} · ${WarrantyRules.claimStatus(c)}`, sub: `${c.part || "Part"} · ${peso.format(Number(c.partCost) || 0)}`, right: c.openedAt ? uiDate(String(c.openedAt).slice(0, 10)) : "", tone: WARRANTY_CLAIM_TONES[WarrantyRules.claimStatus(c)] } })),
  ];
  return lines.filter((l) => l.at >= since).sort((a, b) => b.at - a.at).map((l) => l.line);
}
/** The detail panel for a unit (Installed units and Preventive maintenance tabs). @param {Warranty} unit @returns {UiDetail} */
function warrantyUnitDetail(unit) {
  const f = warrantyFacts(unit);
  const id = warrantyUnitId(unit);
  const edit = canEditWarranty();
  const contractActive = unit.contractStatus === "active" && f.status.contract;
  return {
    eyebrow: `${unit.serial || "No serial"} · ${supportBranchLabel(f.branch)}`, title: `${f.model}${unit.unitType ? ` · ${unit.unitType}` : ""}`,
    pill: { text: f.status.label, tone: WARRANTY_STATUS_TONES[f.status.status] }, closeAttrs: { "data-warranty-close": "" }, label: "Unit details",
    fields: [
      { label: "Client", value: String(unit.client || "—"), sub: supportBranchLabel(f.branch) },
      { label: "Installed", value: unit.installDate ? uiDate(String(unit.installDate)) : "—" },
      { label: "Warranty", value: f.status.label, sub: warrantyEndText(unit, f.status) },
      { label: "Service contract", value: warrantyContractText(unit) },
      { label: "Last PM", value: f.pm.last ? uiDate(f.pm.last) : "None recorded", sub: `Every ${plural(f.pm.months, "month")}` },
      { label: "Next PM", value: f.pm.next ? uiDate(f.pm.next) : "—", sub: f.pm.booked ? `Booked ${uiDate(f.pm.booked)}${unit.pmEngineer ? ` · ${unit.pmEngineer}` : ""}` : f.pm.label },
      { label: "Open tickets", value: String(f.openTickets.length), sub: f.openTickets.map((r) => r.id).join(", ") },
      { label: "Claims to recover", value: peso.format(WarrantyRules.toRecover(f.claims)), sub: plural(f.claims.length, "claim") },
    ],
    linesTitle: "Service history · last 90 days",
    lines: warrantyHistoryLines(f),
    extra: warrantyHistoryLines(f).length ? "" : `<p class="ui-muted">No tickets or claims in the last 90 days.</p>`,
    note: warrantyNote(f),
    actions: [
      canRequestSupportReport() ? uiButton("Open ticket", { "data-warranty-ticket": id }, { primary: f.status.covered || f.status.status === "contract" }) : "",
      edit ? uiButton("Schedule PM", { "data-warranty-schedule": id }, { primary: f.pm.status === "overdue" || f.pm.status === "due" }) : "",
      edit ? uiButton("Record PM done", { "data-warranty-pm-done": id }) : "",
      edit && !contractActive ? uiButton(unit.contractStatus === "quoted" ? "Update contract quote" : "Offer service contract", { "data-warranty-contract": id }, { primary: f.status.status === "out" || f.status.status === "expiring" }) : "",
      edit && contractActive ? uiButton("Update contract", { "data-warranty-contract": id }) : "",
      edit && f.status.covered ? uiButton("New claim", { "data-warranty-new-claim": id }) : "",
      edit ? uiButton("Edit unit", { "data-warranty-edit": id }) : "",
    ].filter(Boolean),
  };
}

// ----- overview --------------------------------------------------------------------------------------
function warrantyOverviewHtml() {
  const units = data.warranties;
  const facts = units.map((unit) => ({ unit, f: warrantyFacts(unit) }));
  const goto = (/** @type {string} */ tab, /** @type {string} */ scope = "", /** @type {string} */ sel = "") => ({ "data-wa-goto": `warranty|${tab}|${scope}|${sel}` });
  const branches = new Map();
  facts.forEach(({ f }) => { const b = supportBranchLabel(f.branch); branches.set(b, (branches.get(b) || 0) + 1); });
  const covered = facts.filter(({ f }) => f.status.covered);
  const expiring = facts.filter(({ f }) => f.status.status === "expiring").sort((a, b) => Number(a.f.status.daysLeft) - Number(b.f.status.daysLeft));
  const overdue = facts.filter(({ f }) => f.pm.status === "overdue").sort((a, b) => Number(a.f.pm.days) - Number(b.f.pm.days));
  const due = facts.filter(({ f }) => f.pm.status === "due");
  const claims = (data.warrantyClaims || []).filter((c) => !c.cancelled);
  const recover = WarrantyRules.toRecover(claims);
  const openClaims = claims.filter((c) => WarrantyRules.claimStatus(c) !== "Credited");
  /** @type {UiKpi[]} */
  const kpis = [
    { label: "Units installed", value: String(units.length), tone: "blue", sub: [...branches.entries()].map(([b, n]) => `${n} ${b}`).join(" · ") || "None yet" },
    { label: "Under warranty", value: String(covered.length), tone: "green", change: expiring.length ? { text: `${expiring.length} end within 60 days`, good: false } : null, sub: `${facts.filter(({ f }) => f.status.status === "contract").length} more on a service contract` },
    { label: "PM due or overdue", value: String(overdue.length + due.length), tone: overdue.length ? "red" : due.length ? "amber" : "green", change: overdue.length ? { text: `${overdue.length} overdue`, good: false } : null, sub: `Due = within ${WarrantyRules.PM_DUE_DAYS} days` },
    { label: "Claims to recover", value: peso.format(recover), tone: recover ? "amber" : "green", sub: openClaims.length ? `${plural(openClaims.length, "open claim")} with the principal` : "Nothing outstanding" },
  ];
  const repeats = SupportRules.repeatUnits(data.productIssues, units, Date.now(), 90);
  /** @type {UiInsight[]} */
  const act = [
    ...expiring.map(({ unit, f }) => ({
      tone: /** @type {UiTone} */ (Number(f.status.daysLeft) <= 30 ? "red" : "amber"),
      title: `Warranty ending · ${f.model} · ${unit.client}`,
      text: `${warrantyEndText(unit, f.status)}. ${unit.contractStatus === "quoted" ? "A contract was quoted; follow up." : "Quote a service contract before it lapses."}`,
      action: { label: unit.contractStatus === "quoted" ? "Open" : "Quote", attrs: goto("units", "", warrantyUnitId(unit)) },
    })),
    ...repeats.map((r) => ({
      tone: /** @type {UiTone} */ (r.count >= 3 ? "red" : "amber"),
      title: `Repeat issues · ${r.equipment} · ${r.client}`,
      text: `${plural(r.count, "ticket")} in 90 days (${r.ids.join(", ")}). ${r.suggestion}.`,
      action: { label: "Open", attrs: goto("units", "", String(warrantyUnit(r.serial) ? warrantyUnitId(/** @type {Warranty} */ (warrantyUnit(r.serial))) : r.serial)) },
    })),
    ...overdue.map(({ unit, f }) => ({
      tone: /** @type {UiTone} */ ("red"),
      title: `PM overdue · ${f.model} · ${unit.client}`,
      text: `${warrantyPmText(f.pm)}.${f.pm.booked ? ` Booked for ${uiDate(f.pm.booked)}.` : ""}${f.status.covered ? " Skipped PMs can void the warranty." : ""}`,
      action: { label: f.pm.booked ? "Open" : "Schedule", attrs: goto("pm", "", warrantyUnitId(unit)) },
    })),
  ];
  const buckets = WarrantyRules.endingBuckets(units, warrantyToday());
  const perModel = WarrantyRules.issuesPerModel(units, data.productIssues, warrantyToday());
  const worst = perModel[0];
  const settings = warrantySettings();
  const custom = Object.entries(/** @type {Record<string, number>} */ (settings.pmMonths || {})).filter(([, n]) => Number(n) >= 1);
  const policy = [
    { label: "Expiring soon", hint: "", text: `Warranty ends within ${WarrantyRules.EXPIRING_DAYS} days`, tone: /** @type {UiTone} */ ("amber") },
    { label: "Preventive maintenance", hint: "", text: `Every ${plural(WarrantyRules.pmMonths({}, settings), "month")}${custom.length ? `; ${custom.map(([m, n]) => `${m} ${n}`).join(", ")}` : ""}. Due = within ${WarrantyRules.PM_DUE_DAYS} days`, tone: /** @type {UiTone} */ ("blue") },
    { label: "Credit hold", hint: "", text: "Doesn't stop warranty service. Out-of-warranty work on a held account needs prepayment", tone: /** @type {UiTone} */ ("red") },
    { label: "Claims", hint: "", text: "Open → part received → old part returned → credited by the principal", tone: /** @type {UiTone} */ ("green") },
  ];
  return uiKpiCards(kpis) + uiDashboardGrid([
    [
      { span: 2, title: "Act before it costs us", sub: "Warranties ending, units with repeat issues and overdue PMs", body: uiInsightList(act.slice(0, 6), "No warranty ending soon, no repeat issues and no overdue PM."), link: act.length > 6 ? { label: `All ${act.length}`, attrs: goto("units") } : undefined },
      { span: 1, title: "Warranty ending", sub: "Units by time left", body: units.length ? uiHBars({ items: buckets.map((b) => ({ label: b.label, value: b.count, display: String(b.count), tone: /** @type {UiTone} */ (b.key === "ended" ? "slate" : b.key === "30" ? "red" : b.key === "60" ? "amber" : "green") })), caption: "Units by time left on warranty" }) : `<p class="ui-muted">No units yet.</p>` },
    ],
    [
      {
        span: 2, title: "Issues per model", sub: "Support tickets per installed unit, last 12 months",
        body: perModel.length ? uiHBars({ items: perModel.slice(0, 8).map((m) => ({ label: m.model, value: m.rate, display: `${m.rate.toFixed(1)} / unit`, sub: `${plural(m.tickets, "ticket")} · ${plural(m.units, "unit")}`, tone: /** @type {UiTone} */ (m.rate >= 2 ? "red" : m.rate >= 1 ? "amber" : "green") })), caption: "Tickets per unit by model" }) : `<p class="ui-muted">No units yet.</p>`,
        takeaway: worst && worst.rate >= 1.5 ? `${worst.model} averages ${worst.rate.toFixed(1)} tickets per unit: raise it with the principal.` : undefined,
      },
      {
        span: 1, title: "Policy", sub: "How this page decides",
        body: `<dl class="sup-targets">${policy.map((p) => `<div><dt>${uiDot(p.tone)}${escapeHtml(p.label)}</dt><dd>${escapeHtml(p.text)}</dd></div>`).join("")}</dl>`,
        link: canManageWarranty() ? { label: "PM intervals", attrs: { "data-warranty-intervals": "" } } : undefined,
      },
    ],
  ]);
}

// ----- tabs ----------------------------------------------------------------------------------------------
/** @param {string} tab @returns {UiView} */
function warrantyTabModel(tab) {
  const select = (/** @type {string} */ id) => uiViewSelect("warranty", id);
  const addUnit = canEditWarranty() ? uiButton("Add unit", { "data-warranty-add": "" }, { size: "sm", primary: true }) : "";

  if (tab === "claims") {
    const claims = data.warrantyClaims || [];
    const yearStart = `${warrantyToday().slice(0, 4)}-01-01`;
    const rows = claims.map(/** @returns {UiViewRow} */ (claim) => {
      const status = WarrantyRules.claimStatus(claim);
      const next = WarrantyRules.nextClaimStatus(claim);
      const unit = warrantyUnit(String(claim.serial || ""));
      const opened = String(claim.openedAt || "").slice(0, 10);
      const edit = canEditWarranty() && !claim.cancelled;
      return {
        id: String(claim.id), branches: [], scopes: claim.cancelled ? ["cancelled"] : [status === "Credited" ? "credited" : "open", `s-${WarrantyRules.CLAIM_STATUSES.indexOf(status)}`],
        search: [claim.id, claim.serial, claim.client, claim.model, claim.part, claim.issue, claim.rma, claim.ticketId].filter(Boolean).join(" "),
        sortValues: { id: String(claim.id), unit: String(claim.client || ""), cost: Number(claim.partCost) || 0, status: WarrantyRules.CLAIM_STATUSES.indexOf(status), opened },
        csv: [String(claim.id), String(claim.client || ""), String(claim.model || ""), String(claim.serial || ""), String(claim.ticketId || ""), String(claim.issue || ""), String(claim.part || ""), Number(claim.partCost) || 0, String(claim.rma || ""), claim.cancelled ? "Cancelled" : status, opened],
        cells: [
          uiCellDoc(String(claim.id), select(String(claim.id)), String(claim.part || "")),
          uiCellText(String(claim.client || "—"), [claim.model, claim.serial].filter(Boolean).join(" · "), { strong: true }),
          claim.ticketId ? `<span class="ui-mono">${escapeHtml(String(claim.ticketId))}</span>` : `<span class="ui-muted">—</span>`,
          uiCellNum(peso.format(Number(claim.partCost) || 0)),
          claim.rma ? escapeHtml(String(claim.rma)) : `<span class="ui-muted">Not yet</span>`,
          claim.cancelled ? uiPill("Cancelled", "slate") : uiPill(status, WARRANTY_CLAIM_TONES[status]),
          escapeHtml(opened ? uiDate(opened) : "—"),
        ],
        detail: () => ({
          eyebrow: `${claim.id}${claim.ticketId ? ` · from ${claim.ticketId}` : ""}`, title: `${claim.part || "Part"} · ${claim.model || "unit"}`,
          pill: claim.cancelled ? { text: "Cancelled", tone: "slate" } : { text: status, tone: WARRANTY_CLAIM_TONES[status] }, closeAttrs: { "data-warranty-close": "" }, label: "Claim details",
          fields: [
            { label: "Client", value: String(claim.client || "—") },
            { label: "Unit", value: [claim.model, claim.serial].filter(Boolean).join(" · ") || "—", sub: unit ? warrantyFacts(unit).status.label : "Not in Installed units" },
            { label: "Part cost", value: peso.format(Number(claim.partCost) || 0) },
            { label: "Principal RMA / reference", value: String(claim.rma || "Not yet"), mono: Boolean(claim.rma) },
            { label: "Issue", value: String(claim.issue || "—"), wide: true },
          ],
          top: uiSteps(WarrantyRules.CLAIM_STATUSES.map((s, i) => ({ label: s, state: claim.cancelled ? "todo" : i < WarrantyRules.CLAIM_STATUSES.indexOf(status) ? "done" : i === WarrantyRules.CLAIM_STATUSES.indexOf(status) ? (s === "Credited" ? "done" : "current") : "todo" }))),
          linesTitle: "History",
          lines: (claim.history || []).map((h) => ({ left: `${h.date || ""} · ${h.status}`, sub: [h.note, h.by].filter(Boolean).join(" — "), tone: WARRANTY_CLAIM_TONES[h.status] || "slate" })),
          actions: [
            edit && next ? uiButton(`Mark ${next.toLowerCase()}`, { "data-warranty-claim-next": claim.id }, { primary: true }) : "",
            edit && status !== "Credited" ? uiButton("Edit claim", { "data-warranty-claim-edit": claim.id }) : "",
            unit ? uiButton("Open unit", { "data-wa-goto": `warranty|units||${warrantyUnitId(unit)}` }) : "",
            claim.ticketId && canViewModule("product-issues") ? uiButton(`Open ${claim.ticketId}`, { "data-wa-goto": `product-issues|${data.productIssues.some((r) => r.id === claim.ticketId && SupportRules.statusOf(r) === "Resolved") ? "resolved" : "open"}||${claim.ticketId}` }) : "",
            edit && status !== "Credited" ? uiButton("Cancel claim", { "data-warranty-claim-cancel": claim.id }, { danger: true }) : "",
          ].filter(Boolean),
        }),
      };
    });
    const live = claims.filter((c) => !c.cancelled);
    const credited = live.filter((c) => WarrantyRules.claimStatus(c) === "Credited" && String(c.creditedAt || c.openedAt || "").slice(0, 10) >= yearStart);
    const waitingCredit = live.filter((c) => WarrantyRules.claimStatus(c) === "Old part returned");
    return {
      title: "Claims", intro: "Parts we replaced under warranty and are claiming back from the principal. A claim moves from open to part received, old part returned and credited.", placeholder: "Claim, client, serial, part or RMA",
      actions: [canEditWarranty() ? uiButton("New claim", { "data-warranty-new-claim": "" }, { size: "sm", primary: true }) : ""].filter(Boolean), minWidth: 1000,
      stats: [
        { label: "Still to recover", value: peso.format(WarrantyRules.toRecover(live)), sub: plural(live.filter((c) => WarrantyRules.claimStatus(c) !== "Credited").length, "open claim"), tone: "amber", scope: "open" },
        { label: "Waiting for credit", value: waitingCredit.length, sub: waitingCredit.length ? `${peso.format(WarrantyRules.toRecover(waitingCredit))}: old part already returned` : "Old part returned, not yet credited", tone: "blue", scope: "s-2" },
        { label: "Credited this year", value: peso.format(credited.reduce((s, c) => s + (Number(c.partCost) || 0), 0)), sub: plural(credited.length, "claim"), tone: "green", scope: "credited" },
      ],
      cols: [{ key: "id", label: "Claim", sortable: true }, { key: "unit", label: "Client & unit", sortable: true }, { key: "ticket", label: "Ticket" }, { key: "cost", label: "Part cost", align: "right", sortable: true }, { key: "rma", label: "Principal RMA" }, { key: "status", label: "Status", sortable: true }, { key: "opened", label: "Opened", sortable: true }],
      csvName: "warranty-claims.csv", csvHeader: ["Claim", "Client", "Model", "Serial", "Ticket", "Issue", "Part", "Part cost", "Principal RMA", "Status", "Opened"],
      rows,
      empty: ["No claims yet", "Open one from a unit under warranty, or from a hardware ticket in Support Tracker."],
      defaultSort: { key: "opened", dir: -1 },
      chips: [{ key: "open", label: "To recover", tone: "amber" }, ...WarrantyRules.CLAIM_STATUSES.map((s, i) => ({ key: `s-${i}`, label: s, tone: WARRANTY_CLAIM_TONES[s] })), { key: "cancelled", label: "Cancelled", tone: /** @type {UiTone} */ ("slate"), onlyWhenActive: true }],
      defaultScope: "",
    };
  }

  const pmTab = tab === "pm";
  const rows = data.warranties.map(/** @returns {UiViewRow} */ (unit) => {
    const f = warrantyFacts(unit);
    const id = warrantyUnitId(unit);
    const statusCell = `${uiPill(f.status.label, WARRANTY_STATUS_TONES[f.status.status])}<div class="ui-sub">${escapeHtml(warrantyEndText(unit, f.status))}</div>`;
    const pmCell = `${uiPill(f.pm.label, WARRANTY_PM_TONES[f.pm.status])}<div class="ui-sub">${escapeHtml(f.pm.next ? uiDate(f.pm.next) : "—")}</div>`;
    return {
      id, branches: [], scopes: pmTab ? [f.pm.status, ...(f.pm.booked ? ["booked"] : [])] : [f.status.status, ...(f.pm.status === "overdue" ? ["pmoverdue"] : []), ...(f.tickets.filter((r) => (SupportRules.loggedAt(r) ?? 0) >= Date.now() - 90 * SupportRules.DAY).length >= 2 ? ["repeat"] : []), ...(f.hold ? ["hold"] : [])],
      search: [unit.serial, unit.client, f.model, unit.unitType, f.branch, supportBranchLabel(f.branch)].filter(Boolean).join(" "),
      sortValues: {
        id: f.model, client: String(unit.client || ""), installed: String(unit.installDate || ""), end: f.status.daysLeft ?? -1e9,
        next: f.pm.next || "9999", last: f.pm.last || "", every: f.pm.months,
      },
      csv: pmTab
        ? [f.model, String(unit.serial || ""), String(unit.client || ""), supportBranchLabel(f.branch), f.pm.months, f.pm.last, f.pm.next, f.pm.label, f.pm.booked, String(unit.pmEngineer || "")]
        : [f.model, String(unit.unitType || ""), String(unit.serial || ""), String(unit.client || ""), supportBranchLabel(f.branch), String(unit.installDate || ""), String(unit.warrantyEnd || ""), f.status.label, warrantyContractText(unit), f.pm.last, f.pm.next],
      cells: pmTab
        ? [
          uiCellDoc(f.model, select(id), String(unit.serial || "No serial")),
          uiCellText(String(unit.client || "—"), supportBranchLabel(f.branch), { strong: true }),
          uiCellNum(`${f.pm.months} mo`),
          escapeHtml(f.pm.last ? uiDate(f.pm.last) : "—"),
          `${uiPill(f.pm.label, WARRANTY_PM_TONES[f.pm.status])}<div class="ui-sub">${escapeHtml(warrantyPmText(f.pm))}</div>`,
          f.pm.booked ? uiCellText(uiDate(f.pm.booked), String(unit.pmEngineer || "")) : `<span class="ui-muted">Not booked</span>`,
        ]
        : [
          uiCellDoc(f.model, select(id), [unit.unitType, unit.serial || "No serial"].filter(Boolean).join(" · ")),
          uiCellText(String(unit.client || "—"), supportBranchLabel(f.branch), { strong: true }),
          escapeHtml(unit.installDate ? uiDate(String(unit.installDate)) : "—"),
          statusCell,
          escapeHtml(warrantyContractText(unit)),
          pmCell,
        ],
      detail: () => warrantyUnitDetail(unit),
    };
  });
  if (pmTab) {
    const all = data.warranties.map((u) => warrantyFacts(u));
    return {
      title: "Preventive maintenance", intro: `Next PM = last PM (or the install date) + the model's interval. Due means within ${WarrantyRules.PM_DUE_DAYS} days. Scheduling a PM puts it on the Calendar for the branch engineer.`, placeholder: "Model, serial, client or branch",
      actions: [canManageWarranty() ? uiButton("PM intervals", { "data-warranty-intervals": "" }, { size: "sm" }) : ""].filter(Boolean), minWidth: 960,
      stats: [
        { label: "Overdue", value: all.filter((f) => f.pm.status === "overdue").length, sub: "Past the due date", tone: "red", scope: "overdue" },
        { label: "Due", value: all.filter((f) => f.pm.status === "due").length, sub: `Within ${WarrantyRules.PM_DUE_DAYS} days`, tone: "amber", scope: "due" },
        { label: "Booked", value: all.filter((f) => f.pm.booked).length, sub: "On the Calendar", tone: "green", scope: "booked" },
      ],
      cols: [{ key: "id", label: "Unit", sortable: true }, { key: "client", label: "Client & branch", sortable: true }, { key: "every", label: "Every", align: "right", sortable: true }, { key: "last", label: "Last PM", sortable: true }, { key: "next", label: "Next PM", sortable: true }, { key: "booked", label: "Booked" }],
      csvName: "warranty-pm.csv", csvHeader: ["Model", "Serial", "Client", "Branch", "Every (months)", "Last PM", "Next PM", "PM status", "Booked for", "Engineer"],
      rows,
      empty: ["No units yet", "Add installed units to plan their preventive maintenance."],
      defaultSort: { key: "next", dir: 1 },
      chips: [{ key: "overdue", label: "Overdue", tone: "red" }, { key: "due", label: "Due", tone: "amber" }, { key: "scheduled", label: "Scheduled", tone: "green" }, { key: "booked", label: "Booked", tone: "accent" }, { key: "none", label: "No PM date", tone: "slate", onlyWhenActive: true }],
      defaultScope: "",
    };
  }
  const all = data.warranties.map((u) => warrantyFacts(u));
  return {
    title: "Installed units", intro: "One row per analyzer. Status comes from the warranty end date and any active service contract.", placeholder: "Model, serial, client or branch",
    actions: [addUnit].filter(Boolean), minWidth: 1000,
    stats: [
      { label: "Under warranty", value: all.filter((f) => f.status.status === "under").length, sub: "More than 60 days left", tone: "green", scope: "under" },
      { label: "Expiring soon", value: all.filter((f) => f.status.status === "expiring").length, sub: "Within 60 days: quote a contract", tone: "amber", scope: "expiring" },
      { label: "Out of warranty", value: all.filter((f) => f.status.status === "out").length, sub: `${all.filter((f) => f.status.status === "contract").length} more on a service contract`, tone: "slate", scope: "out" },
    ],
    cols: [{ key: "id", label: "Unit", sortable: true }, { key: "client", label: "Client & branch", sortable: true }, { key: "installed", label: "Installed", sortable: true }, { key: "end", label: "Warranty", sortable: true }, { key: "contract", label: "Service contract" }, { key: "next", label: "Next PM", sortable: true }],
    csvName: "warranty-units.csv", csvHeader: ["Model", "Type", "Serial", "Client", "Branch", "Installed", "Warranty end", "Status", "Service contract", "Last PM", "Next PM"],
    rows,
    empty: ["No installed units yet", "Add a unit when an analyzer is installed at a client."],
    defaultSort: { key: "end", dir: 1 },
    chips: [
      { key: "under", label: "Under warranty", tone: "green" }, { key: "expiring", label: "Expiring soon", tone: "amber" }, { key: "contract", label: "Service contract", tone: "blue" },
      { key: "out", label: "Out of warranty", tone: "slate" }, { key: "pmoverdue", label: "PM overdue", tone: "red" }, { key: "repeat", label: "Repeat issues", tone: "orange" }, { key: "hold", label: "Credit hold", tone: "red", onlyWhenActive: true },
    ],
    defaultScope: "",
  };
}

function renderWarranty() {
  loadSupportEngineers();
  if (!WARRANTY_TAB_LABELS[warrantyTab]) warrantyTab = "overview";
  const header = qs("#warranty-actions");
  if (header) header.innerHTML = canEditWarranty() ? uiButton("New claim", { "data-warranty-new-claim": "" }) + uiButton("Add unit", { "data-warranty-add": "" }, { primary: true }) : "";
  const live = (data.warrantyClaims || []).filter((c) => !c.cancelled);
  /** @type {Record<string, number | undefined>} */
  const counts = {
    units: data.warranties.length,
    pm: data.warranties.filter((u) => ["overdue", "due"].includes(WarrantyRules.pm(u, warrantyToday(), warrantySettings()).status)).length || undefined,
    claims: live.filter((c) => WarrantyRules.claimStatus(c) !== "Credited").length || undefined,
  };
  qs("#warranty-tabs").innerHTML = uiModuleTabs({ tabs: Object.keys(WARRANTY_TAB_LABELS).map((key) => ({ key, label: WARRANTY_TAB_LABELS[key], count: counts[key] })), active: warrantyTab, attr: "data-warranty-tab" });
  renderModuleAssistant("warranty");
  uiRender(qs("#warranty-tab-panel"), warrantyTab === "overview" ? warrantyOverviewHtml() : uiViewHtml(warrantyTabModel(warrantyTab), warrantyView, "warranty"));
  syncModuleUrl("warranty", warrantyQueryString());
}

/** goToFocused("warranty", serial or claim id): select it on the right tab. @param {string} query */
function warrantyFocusRecord(query) {
  const unit = warrantyUnit(query);
  const claim = (data.warrantyClaims || []).find((c) => String(c.id).toLowerCase() === query.toLowerCase());
  if (!unit && !claim) return;
  warrantyTab = unit ? "units" : "claims";
  warrantyView = uiBlankViewState();
  warrantyView.sel = unit ? warrantyUnitId(unit) : String(claim?.id);
}

WORKFLOW_RULES.warranty = [
  { id: "warranty-pm-overdue", rule: () => {
    const overdue = data.warranties.map((u) => ({ u, p: WarrantyRules.pm(u, warrantyToday(), warrantySettings()) })).filter(({ p }) => p.status === "overdue" && !p.booked).sort((a, b) => Number(a.p.days) - Number(b.p.days));
    if (!overdue.length) return null;
    const first = overdue[0];
    return { tone: "red", text: `${overdue.length === 1 ? `PM overdue on ${warrantyModel(first.u)} at ${first.u.client}` : `${plural(overdue.length, "unit")} overdue for PM, oldest ${warrantyModel(first.u)} at ${first.u.client}`}: ${warrantyPmText(first.p)}.`, action: "Schedule", attrs: { "data-wa-goto": `warranty|pm|overdue|${overdue.length === 1 ? warrantyUnitId(first.u) : ""}` } };
  } },
  { id: "warranty-ending", rule: () => {
    const ending = data.warranties.map((u) => ({ u, s: WarrantyRules.unitStatus(u, warrantyToday()) })).filter(({ u, s }) => s.status === "expiring" && Number(s.daysLeft) <= 30 && u.contractStatus !== "quoted" && u.contractStatus !== "active");
    if (!ending.length) return null;
    return { tone: "amber", text: `${ending.length === 1 ? `${warrantyModel(ending[0].u)} at ${ending[0].u.client}: warranty ends in ${plural(Number(ending[0].s.daysLeft), "day")}` : `${plural(ending.length, "warranty", "warranties")} end within 30 days`} and no service contract has been quoted.`, action: "Quote", attrs: { "data-wa-goto": `warranty|units|expiring|${ending.length === 1 ? warrantyUnitId(ending[0].u) : ""}` } };
  } },
  { id: "warranty-claims-stale", rule: () => {
    const cutoff = Date.now() - 30 * SupportRules.DAY;
    const stale = (data.warrantyClaims || []).filter((c) => !c.cancelled && WarrantyRules.claimStatus(c) !== "Credited" && (Date.parse(String(c.openedAt || "")) || Infinity) < cutoff);
    if (!stale.length) return null;
    return { tone: "amber", text: `${plural(stale.length, "claim")} open for more than 30 days (${peso.format(WarrantyRules.toRecover(stale))}). Chase the principal for the credit.`, action: "Show", attrs: { "data-wa-goto": `warranty|claims|open|${stale.length === 1 ? stale[0].id : ""}` } };
  } },
];

// ----- saving ----------------------------------------------------------------------------------------------
function warrantyNowStamp() { return supportNowStamp(); }
/** @param {Warranty} unit */
function warrantyWithLegacyStatus(unit) {
  const s = WarrantyRules.unitStatus(unit, warrantyToday());
  return { ...unit, equipment: unit.model || unit.equipment || "", status: WARRANTY_LEGACY_STATUS[s.status] };
}
/**
 * Saves a unit (new or changed) with a history entry, plus any calendar events.
 * @param {Warranty | null} before @param {Warranty} next @param {{ status: string, note: string, log: string }} entry @param {{ calendarEvents?: CalendarEvent[] }} [extra]
 */
async function warrantySaveUnit(before, next, entry, extra = {}) {
  const by = currentUser?.name || "System User";
  const record = warrantyWithLegacyStatus({ ...next, history: [...(before?.history || next.history || []), { at: new Date().toISOString(), date: warrantyNowStamp(), status: entry.status, note: entry.note, by }] });
  const saveResult = await persistRecords({ warranties: [record], ...extra });
  if (!saveResult?.ok && !saveResult?.queued) return false;
  const index = before ? data.warranties.indexOf(before) : -1;
  if (index >= 0) data.warranties[index] = record; else data.warranties.push(record);
  if (extra.calendarEvents) data.calendarEvents.push(...extra.calendarEvents);
  log(entry.log, "Warranty", `${record.serial || record.model}: ${entry.note}`.slice(0, 200), { save: false });
  renderWarranty();
  return true;
}
/** @param {WarrantyClaim | null} before @param {WarrantyClaim} next @param {{ status: string, note: string, log: string }} entry */
async function warrantySaveClaim(before, next, entry) {
  const by = currentUser?.name || "System User";
  const record = { ...next, history: [...(before?.history || []), { at: new Date().toISOString(), date: warrantyNowStamp(), status: entry.status, note: entry.note, by }] };
  const saveResult = await persistRecords({ warrantyClaims: [record] });
  if (!saveResult?.ok && !saveResult?.queued) return false;
  const index = before ? data.warrantyClaims.indexOf(before) : -1;
  if (index >= 0) data.warrantyClaims[index] = record; else data.warrantyClaims.push(record);
  log(entry.log, "Warranty", `${record.id}: ${entry.note}`.slice(0, 200), { save: false });
  renderWarranty();
  return true;
}

// ----- dialogs ---------------------------------------------------------------------------------------------
/** @param {string} name @param {string} label @param {string} value @param {{ type?: string, required?: boolean, placeholder?: string, readonly?: boolean, full?: boolean, extra?: string }} [o] */
function warrantyInput(name, label, value, o = {}) {
  return `<div class="field${o.full ? " full" : ""}"><label for="sup-${name}">${escapeHtml(label)}</label><input id="sup-${name}" name="${name}" type="${o.type || "text"}" value="${escapeHtml(value || "")}"${o.required ? " required" : ""}${o.readonly ? " readonly" : ""}${o.placeholder ? ` placeholder="${escapeHtml(o.placeholder)}"` : ""}${o.extra || ""} /></div>`;
}
/** @param {string} html */
function warrantyGrid(html) { return `<div class="wty-form">${html}</div>`; }

/** Add a unit, or edit one. @param {Warranty | null} unit */
async function warrantyEditUnit(unit) {
  if (!canEditWarranty()) return toast("Editing is disabled for Warranty in User Settings.");
  const clients = activeClients().map((c) => c.name);
  if (unit?.client && !clients.includes(String(unit.client))) clients.unshift(String(unit.client));
  const branch = unit ? warrantyBranch(unit) : "";
  const values = await supportDialog({
    kicker: "Warranty", title: unit ? `Edit ${warrantyModel(unit)} · ${unit.serial || "no serial"}` : "Add an installed unit", confirm: unit ? "Save unit" : "Add unit",
    body: warrantyGrid(
      supportSelectHtml("client", "Client", clients.map((c) => ({ value: c, label: c })), String(unit?.client || clients[0] || ""))
      + warrantyInput("model", "Model", String(unit?.model || unit?.equipment || ""), { required: true, placeholder: "e.g. Zybio Z5" })
      + supportSelectHtml("unitType", "Type", [{ value: "", label: "Not set" }, ...WARRANTY_UNIT_TYPES.map((t) => ({ value: t, label: t }))], String(unit?.unitType || ""))
      + warrantyInput("serial", "Serial no.", String(unit?.serial || ""), { required: !unit, readonly: Boolean(unit?.serial) })
      + supportSelectHtml("branch", "Served from", [{ value: "", label: "Client's branch" }, ...platformBranches().map((b) => ({ value: b, label: supportBranchLabel(b) }))], String(unit?.branch || ""))
      + warrantyInput("installDate", "Install date", String(unit?.installDate || ""), { type: "date", required: true })
      + warrantyInput("warrantyEnd", "Warranty end", String(unit?.warrantyEnd || ""), { type: "date", required: true })
      + warrantyInput("lastPm", "Last PM", String(unit?.lastPm || ""), { type: "date", extra: ` max="${warrantyToday()}"` })
      + supportSelectHtml("contractStatus", "Service contract", Object.entries(WARRANTY_CONTRACT_LABELS).map(([value, label]) => ({ value, label })), String(unit?.contractStatus || "none"))
      + warrantyInput("contractEnd", "Contract end", String(unit?.contractEnd || ""), { type: "date" })
      + `<div class="field full"><label for="sup-service">Notes</label><textarea id="sup-service" name="service" placeholder="Location in the lab, accessories, LIS link…">${escapeHtml(String(unit?.service || ""))}</textarea></div>`,
    ) + (unit ? "" : `<p class="field-help">${branch ? "" : "Leave “Served from” on the client's branch unless another office services this unit."}</p>`),
  });
  if (!values) return;
  const serial = String(values.serial || unit?.serial || "").trim();
  if (!values.model.trim() || !values.installDate || !values.warrantyEnd) return toast("Model, install date and warranty end are required.");
  if (!unit && !serial) return toast("Enter the serial number.");
  if (!unit && warrantyUnit(serial)) return toast(`A unit with serial ${serial} is already listed.`);
  if (values.warrantyEnd < values.installDate) return toast("The warranty can't end before the install date.");
  if (values.lastPm && values.lastPm > warrantyToday()) return toast("The last PM can't be in the future.");
  /** @type {Warranty} */
  const next = { ...(unit || {}), client: values.client, model: values.model.trim(), unitType: values.unitType, serial, branch: values.branch, installDate: values.installDate, warrantyEnd: values.warrantyEnd, lastPm: values.lastPm, contractStatus: values.contractStatus, contractEnd: values.contractEnd, service: values.service };
  await warrantySaveUnit(unit, next, unit ? { status: "Edited", note: "Unit details updated", log: "Edited installed unit" } : { status: "Installed", note: `Installed at ${values.client}`, log: "Added installed unit" });
}

/** Book a PM visit on the Calendar for the branch engineer. @param {Warranty} unit */
async function warrantySchedulePm(unit) {
  if (!canEditWarranty()) return;
  const engineers = supportFieldEngineers(supportEngineers());
  const f = warrantyFacts(unit);
  const suggested = SupportRules.defaultEngineer(engineers, f.branch, data.productIssues);
  const day = warrantyToday();
  const date = f.pm.next && f.pm.next > day ? f.pm.next : day;
  const values = await supportDialog({
    kicker: `${f.model} · ${unit.client}`, title: "Schedule preventive maintenance", confirm: "Schedule PM",
    body: warrantyGrid(
      warrantyInput("date", "Date", date, { type: "date", required: true, extra: ` min="${day}"` })
      + warrantyInput("time", "Time", "09:00", { type: "time", required: true })
      + supportSelectHtml("engineer", "Engineer", [{ value: "", label: engineers.length ? "Not assigned" : supportEngineersCache === null ? "Loading engineers…" : "No Engineering users" }, ...engineers.map((e) => ({ value: e.email, label: `${e.name}${e.branch ? ` · ${supportBranchLabel(e.branch)}` : ""}${suggested?.email === e.email ? " (suggested)" : ""}` }))], String(suggested?.email || "")),
    ) + `<p class="field-help">${escapeHtml(warrantyPmText(f.pm))}. The visit goes on the Calendar${suggested ? ` for ${escapeHtml(suggested.name)}, the ${escapeHtml(supportBranchLabel(f.branch))} engineer` : ""}.</p>`,
  });
  if (!values) return;
  if (!values.date || !values.time) return toast("Pick a date and time.");
  if (values.date < day) return toast("A PM can only be scheduled for today or later.");
  const engineer = engineers.find((e) => e.email === values.engineer) || null;
  /** @type {CalendarEvent} */
  const event = {
    id: `EVT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: `PM: ${unit.client} · ${f.model} (${unit.serial || "no serial"})${engineer ? ` · ${engineer.name}` : ""}`,
    date: values.date, time: values.time, createdBy: currentUser?.name || "", createdByUser: String(currentUser?.email || "").toLowerCase(), createdAt: new Date().toISOString(),
    type: "service", source: "warranty-pm", sourceId: warrantyUnitId(unit), module: "warranty", branch: f.branch,
    ...(engineer ? { assigneeEmail: engineer.email, assigneeName: engineer.name } : {}),
  };
  const next = { ...unit, pmScheduledFor: values.date, pmEngineer: engineer?.name || "", pmEventIds: [...(Array.isArray(unit.pmEventIds) ? unit.pmEventIds : []), event.id] };
  await warrantySaveUnit(unit, next, { status: "PM scheduled", note: `PM booked for ${uiDate(values.date)} ${values.time}${engineer ? ` with ${engineer.name}` : ""}`, log: "Scheduled PM" }, { calendarEvents: [event] });
}

/** Log a PM as done: next PM counts from this date. @param {Warranty} unit */
async function warrantyRecordPm(unit) {
  if (!canEditWarranty()) return;
  const f = warrantyFacts(unit);
  const day = warrantyToday();
  const values = await supportDialog({
    kicker: `${f.model} · ${unit.client}`, title: "Record a PM done", confirm: "Save PM",
    body: warrantyGrid(warrantyInput("date", "Done on", f.pm.booked && f.pm.booked <= day ? f.pm.booked : day, { type: "date", required: true, extra: ` max="${day}"` }))
      + `<div class="field full"><label for="sup-note">Notes</label><textarea id="sup-note" name="note" placeholder="Parts replaced, readings, follow-ups…"></textarea></div>`,
  });
  if (!values) return;
  if (!values.date || values.date > day) return toast("The PM date can't be in the future.");
  const next = { ...unit, lastPm: values.date, pmScheduledFor: unit.pmScheduledFor && unit.pmScheduledFor > values.date ? unit.pmScheduledFor : "", pmEngineer: unit.pmScheduledFor && unit.pmScheduledFor > values.date ? unit.pmEngineer : "" };
  const nextPm = WarrantyRules.pm(next, day, warrantySettings()).next;
  await warrantySaveUnit(unit, next, { status: "PM done", note: `PM done ${uiDate(values.date)}${values.note?.trim() ? `: ${values.note.trim()}` : ""}. Next PM ${uiDate(nextPm)}`, log: "Recorded PM" });
}

/** Offer / quote / activate a service contract. @param {Warranty} unit */
async function warrantyContract(unit) {
  if (!canEditWarranty()) return;
  const f = warrantyFacts(unit);
  const end = unit.contractEnd || WarrantyRules.addMonths(f.status.daysLeft !== null && f.status.daysLeft >= 0 ? String(unit.warrantyEnd) : warrantyToday(), 12);
  const values = await supportDialog({
    kicker: `${f.model} · ${unit.client}`, title: "Service contract", confirm: "Save contract",
    body: warrantyGrid(
      supportSelectHtml("contractStatus", "Status", [{ value: "quoted", label: "Quoted to the client" }, { value: "active", label: "Active (signed)" }, { value: "none", label: "No contract" }], unit.contractStatus === "active" ? "active" : "quoted")
      + warrantyInput("contractEnd", "Runs until", end, { type: "date" }),
    ) + `<div class="field full"><label for="sup-note">Notes</label><textarea id="sup-note" name="note" placeholder="e.g. Quoted ₱48,000 / year incl. 4 PMs"></textarea></div>`
      + `<p class="field-help">${escapeHtml(f.status.label)} · ${escapeHtml(warrantyEndText(unit, f.status))}. An active contract covers the unit once its warranty ends.</p>`,
  });
  if (!values) return;
  if (values.contractStatus === "active" && !values.contractEnd) return toast("Enter when the contract ends.");
  const label = WARRANTY_CONTRACT_LABELS[values.contractStatus] || "No contract";
  await warrantySaveUnit(unit, { ...unit, contractStatus: values.contractStatus, contractEnd: values.contractStatus === "none" ? "" : values.contractEnd }, { status: `Contract: ${label}`, note: `${label}${values.contractEnd && values.contractStatus !== "none" ? ` until ${uiDate(values.contractEnd)}` : ""}${values.note?.trim() ? `. ${values.note.trim()}` : ""}`, log: "Updated service contract" });
}

/**
 * Open a claim for a part replaced under warranty (from a unit, a hardware ticket, or blank).
 * @param {{ serial?: string, ticketId?: string }} [from]
 */
async function warrantyNewClaim(from = {}) {
  if (!canEditWarranty()) return toast("Editing is disabled for Warranty in User Settings.");
  const ticket = from.ticketId ? data.productIssues.find((r) => r.id === from.ticketId) || null : null;
  const serial = from.serial || String(ticket?.serialNo || "");
  const preset = serial ? warrantyUnit(serial) : null;
  const units = data.warranties.filter((u) => u.serial && (WarrantyRules.unitStatus(u, warrantyToday()).covered || u === preset));
  if (!units.length) return toast("No unit is under warranty to claim for.");
  const values = await supportDialog({
    kicker: ticket ? `From ${ticket.id} · ${ticket.companyName}` : "Warranty", title: "New warranty claim", confirm: "Open claim",
    body: warrantyGrid(
      supportSelectHtml("serial", "Unit", units.map((u) => ({ value: String(u.serial), label: `${warrantyModel(u)} · ${u.serial} · ${u.client}` })), String(preset?.serial || units[0].serial))
      + warrantyInput("part", "Part", "", { required: true, placeholder: "e.g. Sample probe assembly" })
      + warrantyInput("partCost", "Part cost (₱)", "", { type: "number", required: true, extra: ` min="0" step="0.01"` })
      + warrantyInput("rma", "Principal RMA / reference", "", { placeholder: "If you have one already" }),
    ) + `<div class="field full"><label for="sup-issue">Issue</label><textarea id="sup-issue" name="issue" required>${escapeHtml(String(ticket?.concerns || ""))}</textarea></div>`
      + (preset && !WarrantyRules.unitStatus(preset, warrantyToday()).covered ? `<p class="field-help">This unit is out of warranty: the principal may refuse the claim.</p>` : ""),
  });
  if (!values) return;
  const unit = warrantyUnit(values.serial);
  const cost = Number(values.partCost);
  if (!unit) return toast("Pick a unit.");
  if (!values.part.trim() || !Number.isFinite(cost) || cost < 0) return toast("Enter the part and its cost.");
  /** @type {WarrantyClaim} */
  const claim = {
    id: WarrantyRules.nextClaimId(data.warrantyClaims || [], warrantyToday()), serial: String(unit.serial), client: String(unit.client || ""), model: warrantyModel(unit),
    ...(ticket ? { ticketId: String(ticket.id) } : {}), issue: values.issue.trim(), part: values.part.trim(), partCost: Math.round(cost * 100) / 100, rma: values.rma.trim(), status: "Open", openedAt: new Date().toISOString(),
  };
  if (await warrantySaveClaim(null, claim, { status: "Open", note: `Claim opened for ${claim.part}${ticket ? ` (${ticket.id})` : ""}`, log: "Opened warranty claim" })) {
    warrantyTab = "claims";
    warrantyView = uiBlankViewState();
    warrantyView.sel = claim.id;
    renderWarranty();
    toast(`${claim.id} opened.`);
  }
}

/** Move a claim to its next step. @param {WarrantyClaim} claim */
async function warrantyAdvanceClaim(claim) {
  const next = WarrantyRules.nextClaimStatus(claim);
  if (!next || !canEditWarranty() || claim.cancelled) return;
  const values = await supportDialog({
    kicker: `${claim.id} · ${claim.client}`, title: `Mark ${next.toLowerCase()}`, confirm: `Mark ${next.toLowerCase()}`,
    body: warrantyGrid(warrantyInput("rma", "Principal RMA / reference", String(claim.rma || ""), { required: next === "Credited", placeholder: "RMA or credit memo no." }))
      + `<div class="field full"><label for="sup-note">Notes</label><textarea id="sup-note" name="note" placeholder="${next === "Credited" ? "Credit memo amount, date…" : next === "Old part returned" ? "Courier and tracking no." : "Received at which branch…"}"></textarea></div>`,
  });
  if (!values) return;
  if (next === "Credited" && !values.rma.trim()) return toast("Enter the principal's reference for the credit.");
  await warrantySaveClaim(claim, { ...claim, status: next, rma: values.rma.trim(), ...(next === "Credited" ? { creditedAt: new Date().toISOString() } : {}) }, { status: next, note: values.note?.trim() || next, log: `Warranty claim: ${next.toLowerCase()}` });
}

/** Correct a claim's part, cost, RMA or issue (until credited). @param {WarrantyClaim} claim */
async function warrantyEditClaim(claim) {
  if (!canEditWarranty() || WarrantyRules.claimStatus(claim) === "Credited") return;
  const values = await supportDialog({
    kicker: claim.id, title: "Edit claim", confirm: "Save claim",
    body: warrantyGrid(
      warrantyInput("part", "Part", String(claim.part || ""), { required: true })
      + warrantyInput("partCost", "Part cost (₱)", String(claim.partCost ?? ""), { type: "number", required: true, extra: ` min="0" step="0.01"` })
      + warrantyInput("rma", "Principal RMA / reference", String(claim.rma || "")),
    ) + `<div class="field full"><label for="sup-issue">Issue</label><textarea id="sup-issue" name="issue">${escapeHtml(String(claim.issue || ""))}</textarea></div>`,
  });
  if (!values) return;
  const cost = Number(values.partCost);
  if (!values.part.trim() || !Number.isFinite(cost) || cost < 0) return toast("Enter the part and its cost.");
  await warrantySaveClaim(claim, { ...claim, part: values.part.trim(), partCost: Math.round(cost * 100) / 100, rma: values.rma.trim(), issue: values.issue.trim() }, { status: WarrantyRules.claimStatus(claim), note: "Claim details corrected", log: "Edited warranty claim" });
}

/** @param {WarrantyClaim} claim */
async function warrantyCancelClaim(claim) {
  if (!canEditWarranty() || WarrantyRules.claimStatus(claim) === "Credited") return;
  const values = await supportDialog({
    kicker: claim.id, title: "Cancel this claim?", confirm: "Cancel claim",
    body: `<div class="field full"><label for="sup-note">Why</label><textarea id="sup-note" name="note" required placeholder="e.g. Principal refused: damage not covered"></textarea></div><p class="field-help">${escapeHtml(peso.format(Number(claim.partCost) || 0))} will no longer count as still to recover.</p>`,
  });
  if (!values) return;
  if (!values.note?.trim()) return toast("Say why the claim is cancelled.");
  await warrantySaveClaim(claim, { ...claim, cancelled: true }, { status: "Cancelled", note: values.note.trim(), log: "Cancelled warranty claim" });
}

/** Superadmin/CEO/Admin: PM interval per model. */
async function warrantyEditIntervals() {
  if (!canManageWarranty()) return toast("Only Superadmin, CEO or Admin can change PM intervals.");
  const settings = warrantySettings();
  const models = [...new Set(data.warranties.map((u) => WarrantyRules.modelOf(u)).filter(Boolean))].sort();
  const own = /** @type {Record<string, number>} */ (settings.pmMonths || {});
  const field = (/** @type {string} */ name, /** @type {string} */ label, /** @type {any} */ value, /** @type {string} */ placeholder) => `<div class="field"><label>${escapeHtml(label)}</label><div class="sup-num"><input name="${escapeHtml(name)}" type="number" min="1" max="60" step="1" value="${escapeHtml(value === undefined || value === null ? "" : String(value))}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)} PM interval in months" /><span>months</span></div></div>`;
  const values = await supportDialog({
    kicker: "Warranty", title: "PM intervals", confirm: "Save intervals",
    body: warrantyGrid(field("__default", "Every model (default)", WarrantyRules.pmMonths({}, settings), String(WarrantyRules.DEFAULT_PM_MONTHS)) + models.map((m) => field(`m:${m}`, m, own[m], "Default")).join(""))
      + `<p class="field-help">Leave a model blank to use the default. Next PM = last PM + interval.</p>`,
  });
  if (!values) return;
  /** @type {Record<string, number>} */
  const pmMonths = {};
  Object.entries(values).forEach(([key, value]) => { const n = Math.round(Number(value)); if (key.startsWith("m:") && value !== "" && n >= 1 && n <= 60) pmMonths[key.slice(2)] = n; });
  const fallback = Math.round(Number(values.__default));
  const record = { ...settings, pmMonths, defaultPmMonths: fallback >= 1 && fallback <= 60 ? fallback : WarrantyRules.DEFAULT_PM_MONTHS, updatedBy: currentUser?.name || "", updatedAt: new Date().toISOString() };
  const saveResult = await persistRecords({ warrantySettings: [record] });
  if (!saveResult?.ok && !saveResult?.queued) return;
  data.warrantySettings = [...(data.warrantySettings || []).filter((/** @type {any} */ r) => r.id !== record.id), record];
  log("Changed PM intervals", "Warranty", `Default ${record.defaultPmMonths} months${Object.keys(pmMonths).length ? `; ${Object.entries(pmMonths).map(([m, n]) => `${m} ${n}`).join(", ")}` : ""}`, { save: false });
  toast("PM intervals saved.");
  renderWarranty();
}

/** Opens a new Support ticket filled in for this unit. @param {Warranty} unit */
function warrantyOpenTicket(unit) {
  if (!canRequestSupportReport()) return toast("You can't open service tickets.");
  openModal("productIssue");
  const set = (/** @type {string} */ name, /** @type {string} */ value) => { const el = /** @type {HTMLInputElement | null} */ (qs(`#modal-fields [name="${name}"]`)); if (el && value) el.value = value; };
  set("companyName", String(unit.client || ""));
  set("equipment", warrantyModel(unit));
  set("serialNo", String(unit.serial || ""));
  qs("#companyName")?.dispatchEvent(new Event("change", { bubbles: true }));
  if (WarrantyRules.unitStatus(unit, warrantyToday()).covered) { const type = /** @type {HTMLSelectElement | null} */ (qs("#issueType")); if (type) type.value = "Hardware"; }
}

/** @param {Event} event */
function handleWarrantyClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const el = (/** @type {string} */ name) => closestEl(target, `[${name}]`);
  const unitFrom = (/** @type {string} */ id) => warrantyUnit(id);
  const claimFrom = (/** @type {string} */ id) => (data.warrantyClaims || []).find((c) => c.id === id) || null;
  let hit;
  if ((hit = el("data-warranty-tab"))) {
    const tab = String(hit.dataset.warrantyTab);
    if (tab !== warrantyTab) warrantyView = uiBlankViewState();
    warrantyTab = tab;
    renderWarranty();
    return;
  }
  if (el("data-warranty-add")) return void warrantyEditUnit(null);
  if ((hit = el("data-warranty-edit"))) { const u = unitFrom(String(hit.dataset.warrantyEdit)); if (u) void warrantyEditUnit(u); return; }
  if ((hit = el("data-warranty-schedule"))) { const u = unitFrom(String(hit.dataset.warrantySchedule)); if (u) void warrantySchedulePm(u); return; }
  if ((hit = el("data-warranty-pm-done"))) { const u = unitFrom(String(hit.dataset.warrantyPmDone)); if (u) void warrantyRecordPm(u); return; }
  if ((hit = el("data-warranty-contract"))) { const u = unitFrom(String(hit.dataset.warrantyContract)); if (u) void warrantyContract(u); return; }
  if ((hit = el("data-warranty-ticket"))) { const u = unitFrom(String(hit.dataset.warrantyTicket)); if (u) warrantyOpenTicket(u); return; }
  if ((hit = el("data-warranty-new-claim"))) { const id = String(hit.dataset.warrantyNewClaim || ""); return void warrantyNewClaim(id ? { serial: String(unitFrom(id)?.serial || "") } : {}); }
  if ((hit = el("data-warranty-claim-next"))) { const c = claimFrom(String(hit.dataset.warrantyClaimNext)); if (c) void warrantyAdvanceClaim(c); return; }
  if ((hit = el("data-warranty-claim-edit"))) { const c = claimFrom(String(hit.dataset.warrantyClaimEdit)); if (c) void warrantyEditClaim(c); return; }
  if ((hit = el("data-warranty-claim-cancel"))) { const c = claimFrom(String(hit.dataset.warrantyClaimCancel)); if (c) void warrantyCancelClaim(c); return; }
  if (el("data-warranty-intervals")) return void warrantyEditIntervals();
  if (warrantyTab !== "overview") uiViewClick(target, "warranty", { state: () => warrantyView, view: () => warrantyTabModel(warrantyTab), render: renderWarranty });
}

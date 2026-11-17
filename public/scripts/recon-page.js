// Recon page: automatic checks that compare numbers which should agree across modules.
// The checks run on the server (src/recon.js via /api/recon), twice a day and on demand; this page
// only shows the results and sends the user's decisions (fix, undo, explain, assign) and inputs
// (stock counts, bank statements, cash counts, invoice series). Superadmin and CEO can open it;
// only Superadmin can apply a fix. Every fix is previewed first and written to the Audit Log.

const RECON_TAB_LABELS = /** @type {Record<string, string>} */ ({ overview: "Overview", checks: "Checks", diffs: "Differences to fix", count: "Stock count", history: "Fix history" });
const RECON_TABS = Object.keys(RECON_TAB_LABELS);
const reconSeed = moduleUrlSeed("reconciliation", RECON_TABS);
let reconTab = reconSeed.tab;
/** @type {UiViewState} */
let reconView = reconSeed.view;
/** @type {{ data: any, loading: boolean, error: string, running: string, loadedAt: number }} */
const reconState = { data: null, loading: false, error: "", running: "", loadedAt: 0 };
const RECON_STATUS = /** @type {Record<string, { label: string, tone: UiTone }>} */ ({ pass: { label: "Passed", tone: "green" }, diff: { label: "Difference", tone: "red" }, cant: { label: "Can’t run", tone: "slate" } });
const RECON_DIFF_STATUS = /** @type {Record<string, { label: string, tone: UiTone }>} */ ({ open: { label: "Open", tone: "red" }, fixed: { label: "Fixed", tone: "green" }, explained: { label: "Explained", tone: "blue" }, resolved: { label: "Resolved", tone: "slate" } });
/** Checks whose missing input is entered from this page. */
const RECON_INPUT_ACTIONS = /** @type {Record<string, { label: string, attr: string }>} */ ({
  k3: { label: "Start a count", attr: "data-recon-count-new" },
  k11: { label: "Set invoice series", attr: "data-recon-series" },
  k16: { label: "Upload bank statement", attr: "data-recon-statement" },
  k17: { label: "Enter today’s cash count", attr: "data-recon-cash" },
});

function reconQueryString() { return moduleViewQueryString("reconciliation", reconTab, "overview", reconView); }
function reconCanFix() { return Boolean(reconState.data?.canFix); }
/** @param {number} value */
function reconPeso(value) { return Math.abs(value) >= 100000 ? pesoShort(value) : peso.format(value).replace(/\.00$/, ""); }
/** "16 Nov · 06:00" in Manila. @param {string} iso */
function reconWhen(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" })} · ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })}`;
}
/** @param {number} ms */
function reconDuration(ms) { const s = Math.max(0, Math.round(Number(ms || 0) / 1000)); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; }
/** @param {string} id */
function reconCheck(id) { return (reconState.data?.checks || []).find((/** @type {any} */ check) => check.id === id) || { id, name: id, area: "", rule: "" }; }
/** @param {string} id */
function reconResult(id) { return reconState.data?.latest?.[id] || null; }
/** @returns {any[]} */
function reconDiffs() { return reconState.data?.differences || []; }
function reconOpenDiffs() { return reconDiffs().filter((diff) => diff.status === "open").sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)); }
/** @param {string} trigger */
function reconTriggerLabel(trigger) { return trigger === "scheduled" ? "Scheduled" : trigger === "check" ? "One check, on demand" : "On demand"; }
/** Next scheduled run (06:00 / 18:00 Manila). */
function reconNextRun() {
  const hour = Number(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Manila" }));
  return hour < 6 ? "Today 06:00" : hour < 18 ? "Today 18:00" : "Tomorrow 06:00";
}

async function loadRecon(force = false) {
  if (reconState.loading || (!force && reconState.data && Date.now() - reconState.loadedAt < 60_000)) return;
  reconState.loading = true;
  try {
    reconState.data = await MedlaneAPI.reconLoad();
    reconState.error = "";
    reconState.loadedAt = Date.now();
  } catch (error) {
    reconState.error = error instanceof Error ? error.message : String(error);
  } finally {
    reconState.loading = false;
  }
  if (document.body.dataset.activeSection === "reconciliation") renderReconciliation();
}

/** @param {string} [check] */
async function runReconChecks(check) {
  if (reconState.running) return;
  reconState.running = check || "all";
  renderReconciliation();
  try {
    const result = await MedlaneAPI.reconRun(check);
    reconState.data = result;
    reconState.loadedAt = Date.now();
    const open = reconOpenDiffs().filter((diff) => !check || diff.check === check).length;
    toast(check ? `${reconCheck(check).name}: ${RECON_STATUS[reconResult(check)?.status || "cant"].label.toLowerCase()}${open ? ` · ${plural(open, "difference")}` : ""}.` : `All checks ran in ${reconDuration(result.run?.durationMs)} · ${plural(open, "open difference")}.`);
  } catch (error) {
    toast(`Recon couldn’t run: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    reconState.running = "";
    renderReconciliation();
  }
}

// ----- overview -----------------------------------------------------------------------------
function reconOverviewHtml() {
  const s = reconState.data;
  const checks = /** @type {any[]} */ (s.checks);
  const status = (/** @type {any} */ check) => reconResult(check.id)?.status || "cant";
  const passed = checks.filter((check) => status(check) === "pass");
  const withDiff = checks.filter((check) => status(check) === "diff");
  const cantRun = checks.filter((check) => status(check) === "cant");
  const open = reconOpenDiffs();
  const atStake = open.reduce((sum, diff) => sum + Number(diff.amount || 0), 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const fixedWeek = reconDiffs().filter((diff) => (diff.status === "fixed" && String(diff.fixedAt || "") >= weekAgo) || (diff.status === "explained" && String(diff.explainedAt || "") >= weekAgo));
  const lastRun = s.runs?.[0];
  const goto = (/** @type {string} */ tab, /** @type {string} */ scope = "", /** @type {string} */ sel = "") => ({ "data-wa-goto": `reconciliation|${tab}|${scope}|${sel}` });

  /** @type {UiKpi[]} */
  const kpis = [
    { label: "Checks passed", value: `${passed.length} of ${checks.length}`, tone: "green", change: { text: withDiff.length ? `${plural(withDiff.length, "check")} with differences` : "All clear", good: !withDiff.length }, sub: lastRun ? `Last run ${reconWhen(lastRun.startedAt)} · next ${reconNextRun()}` : "Not run yet" },
    { label: "Differences to fix", value: String(open.length), tone: open.length ? "red" : "green", change: { text: atStake ? `${reconPeso(atStake)} at stake` : "₱0 at stake", good: !open.length }, sub: "Ranked by money at stake" },
    { label: "Can’t run yet", value: String(cantRun.length), tone: "slate", sub: cantRun.length ? `Needs ${cantRun.slice(0, 2).map((check) => check.name.toLowerCase()).join(", ")}${cantRun.length > 2 ? "…" : ""}` : "Every check has its data" },
    { label: "Fixed in the last 7 days", value: String(fixedWeek.length), tone: "blue", sub: "Every fix is in the Audit Log" },
  ];

  /** @type {UiInsight[]} */
  const first = open.slice(0, 6).map((diff) => ({
    tone: Number(diff.amount) >= 30000 ? "red" : Number(diff.amount) ? "amber" : "slate",
    title: `${diff.title}${Number(diff.amount) ? ` · ${reconPeso(Number(diff.amount))}` : ""}`,
    text: `${diff.ref}. ${diff.impact || ""}`,
    action: { label: diff.fix?.kind === "apply" && reconCanFix() ? "Fix" : "Review", attrs: diff.fix?.kind === "apply" && reconCanFix() ? { "data-recon-fix": diff.id } : goto("diffs", "open", diff.id) },
  }));

  const areaTable = uiDataTable({
    cols: [{ key: "area", label: "Area" }, { key: "pass", label: "Pass", align: "right" }, { key: "diff", label: "Diff", align: "right" }, { key: "cant", label: "Can’t", align: "right" }],
    rows: (/** @type {string[]} */ (s.areas)).map((area) => {
      const list = checks.filter((check) => check.area === area);
      const n = (/** @type {string} */ st) => list.filter((check) => status(check) === st).length;
      return { id: area, cells: [`<strong>${escapeHtml(area)}</strong>`, `<span class="ui-num t-green-text">${n("pass")}</span>`, `<span class="ui-num${n("diff") ? " t-red-text" : ""}">${n("diff")}</span>`, uiCellNum(String(n("cant")))] };
    }),
    caption: "Checks by area", minWidth: 0, compact: true, empty: { title: "No checks", text: "" }, foot: { shown: s.areas.length, total: s.areas.length, page: 1, pageCount: 1, pageAttr: "data-recon-area-page", hidden: true },
  });

  /** @type {UiInsight[]} */
  const cantList = cantRun.map((check) => {
    const input = RECON_INPUT_ACTIONS[check.id];
    return { tone: "slate", title: check.name, text: reconResult(check.id)?.reason || "Not run yet.", action: input && reconResult(check.id) ? { label: input.label, attrs: { [input.attr]: "" } } : undefined };
  });
  const facts = lastRun ? [
    ["Started", reconWhen(lastRun.startedAt)], ["Took", reconDuration(lastRun.durationMs)], ["Records checked", Number(lastRun.recordsChecked || 0).toLocaleString("en-PH")],
    ["Next run", reconNextRun()], ["Run by", lastRun.trigger === "scheduled" ? "Scheduled" : String(lastRun.by || "—")], ["Schedule", "06:00 and 18:00 daily"],
  ] : [["Status", "Not run yet"], ["Schedule", "06:00 and 18:00 daily"]];
  const factsHtml = `<dl class="ui-dl recon-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
  const perArea = (/** @type {string[]} */ (s.areas)).map((area) => {
    const count = open.filter((diff) => reconCheck(diff.check).area === area).length;
    return { label: area, value: count, display: String(count), tone: /** @type {UiTone} */ (count ? "red" : "green") };
  });

  return uiKpiCards(kpis) + uiDashboardGrid([
    [
      { span: 2, title: "Fix these first", sub: "Open differences, biggest money first. Fix shows exactly what will change before anything is saved.", body: uiInsightList(first, lastRun ? "Nothing left to fix. All differences are fixed or explained." : "Run the checks to see differences."), link: open.length > 6 ? { label: `All ${open.length} differences`, attrs: goto("diffs", "open") } : undefined },
      { span: 1, title: "Checks by area", sub: "Passed · differences · can’t run", body: areaTable, link: { label: "All checks", attrs: goto("checks") } },
    ],
    [
      { span: 1, title: "Can’t run yet", sub: "These checks need data the system doesn’t have", body: uiInsightList(cantList, "Every check has the data it needs.") },
      { span: 1, title: "Last run", sub: "Checks run automatically twice a day, or on demand", body: factsHtml },
      { span: 1, title: "Records with a difference", sub: "Per area, open only", body: uiHBars({ items: perArea, caption: "Open differences by area" }) },
    ],
  ]);
}

// ----- tabs -----------------------------------------------------------------------------------
/** The detail panel for one difference. @param {any} diff @returns {UiDetail} */
function reconDiffDetail(diff) {
  const check = reconCheck(diff.check);
  const st = RECON_DIFF_STATUS[diff.status] || RECON_DIFF_STATUS.open;
  const canFix = reconCanFix();
  const fix = diff.fix || null;
  /** @type {UiLine[]} */
  let lines = [];
  let linesTitle = "";
  if (diff.status === "open" && fix?.kind === "apply") { linesTitle = "What the fix will change"; lines = (fix.preview || []).map((/** @type {string[]} */ [left, right]) => ({ left, right, tone: /** @type {UiTone} */ ("amber") })); }
  else if (diff.status === "fixed") { linesTitle = `Changed on ${reconWhen(diff.fixedAt)} by ${diff.fixedBy || "—"}`; lines = (diff.appliedChanges || []).map((/** @type {any} */ change) => ({ left: change.field, right: `${change.from} → ${change.to}`, tone: /** @type {UiTone} */ ("green") })); }
  else if (diff.status === "explained") { linesTitle = `Explained on ${reconWhen(diff.explainedAt)} by ${diff.explainedBy || "—"}`; lines = [{ left: "Note", sub: String(diff.note || ""), tone: "blue" }]; }
  /** @type {string[]} */
  const actions = [];
  if (diff.status === "open") {
    if (fix?.kind === "apply" && canFix) actions.push(uiButton(fix.label, { "data-recon-fix": diff.id }, { primary: true }));
    if (fix?.kind === "open") actions.push(uiButton(fix.label, { "data-recon-open": diff.id }, { primary: true }));
    if (canFix) actions.push(uiButton("Mark as explained", { "data-recon-explain": diff.id }));
    actions.push(uiButton(diff.assignedTo ? "Reassign…" : "Assign to…", { "data-recon-assign": diff.id }));
  } else if (diff.status === "fixed") {
    if (canFix && Array.isArray(diff.undo)) actions.push(uiButton("Undo", { "data-recon-undo": diff.id }));
    actions.push(uiButton("View in Audit Log", { "data-wa-goto": "logs|||" }));
  } else if (diff.status === "explained" && canFix) {
    actions.push(uiButton("Withdraw explanation", { "data-recon-reopen": diff.id }));
  }
  const history = (diff.history || []).slice(0, 6).map((/** @type {any} */ entry) => `<li>${uiDot(/Fixed/.test(entry.action) ? "green" : /explained/i.test(entry.action) ? "blue" : /undone|changed|again/i.test(entry.action) ? "amber" : "slate")}<div class="grow"><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(`${reconWhen(entry.at)} · ${entry.by || "—"}${entry.note ? ` · ${entry.note}` : ""}`)}</small></div></li>`).join("");
  const impact = String(diff.impact || "");
  return {
    eyebrow: `${String(diff.check).toUpperCase()} · ${check.name}`, title: diff.title, pill: { text: st.label, tone: st.tone }, closeAttrs: { "data-recon-close": "" }, label: "Difference details",
    fields: [
      { label: "Record", value: String(diff.ref || diff.key), mono: true, wide: true },
      { label: "At stake", value: Number(diff.amount) ? reconPeso(Number(diff.amount)) : "—" },
      { label: "First found", value: reconWhen(diff.firstSeen), sub: diff.lastSeen && diff.lastSeen !== diff.firstSeen ? `Last seen ${reconWhen(diff.lastSeen)}` : "" },
      { label: "Expected", value: String(diff.expected || "—") },
      { label: "Found", value: String(diff.found || "—") },
      ...(diff.assignedTo ? [{ label: "Assigned to", value: String(diff.assignedTo.name), sub: `by ${diff.assignedBy || "—"} · ${reconWhen(diff.assignedAt)}` }] : []),
    ],
    linesTitle, lines,
    note: diff.status === "open"
      ? { text: `${impact}${fix?.kind === "apply" ? " The fix is written to the Audit Log with before and after values, and can be undone." : fix?.kind === "open" ? ` This is corrected in ${check.area === "Stock" ? "Inventory" : "its own module"}, so the normal checks and approvals apply.` : ""}`, tone: Number(diff.amount) >= 30000 ? "red" : "amber" }
      : { text: diff.status === "explained" ? "Marked as correct. No data was changed. It reopens if its values change." : diff.status === "resolved" ? "No longer found on the last run." : impact, tone: diff.status === "explained" ? "blue" : "green" },
    actions,
    extra: history ? `<div class="ui-lines"><h4>History</h4><ul>${history}</ul></div>` : "",
  };
}

/** @param {string} tab @returns {UiView} */
function reconTabModel(tab) {
  const s = reconState.data;
  const select = (/** @type {string} */ id) => uiViewSelect("recon", id);
  const runAll = uiButton(reconState.running === "all" ? "Running…" : "Run all checks", { "data-recon-run": "" }, { size: "sm", primary: true, disabled: Boolean(reconState.running) });

  if (tab === "checks") {
    const checks = /** @type {any[]} */ (s.checks);
    const open = reconOpenDiffs();
    const rows = checks.map(/** @returns {UiViewRow} */ (check) => {
      const result = reconResult(check.id);
      const st = result?.status || "cant";
      const mine = reconDiffs().filter((diff) => diff.check === check.id && diff.status !== "resolved");
      const openMine = mine.filter((diff) => diff.status === "open");
      const amount = openMine.reduce((sum, diff) => sum + Number(diff.amount || 0), 0);
      const resultText = !result ? "Not run yet" : st === "cant" ? "Not run" : st === "pass" ? (result.scope || "All match") : `${openMine.length} of ${result.scope || "records"} differ`;
      const input = RECON_INPUT_ACTIONS[check.id];
      const running = reconState.running === check.id;
      return {
        id: check.id, branches: [], scopes: [st, check.area], search: [check.id, check.name, check.area, check.rule].join(" "),
        sortValues: { id: check.id.slice(1).padStart(3, "0"), area: check.area, open: openMine.length, amount, status: st },
        csv: [check.id, check.name, check.area, RECON_STATUS[st].label, resultText, openMine.length, amount.toFixed(2)],
        cells: [
          uiCellDoc(check.name, select(check.id), check.id.toUpperCase(), { plain: true }),
          escapeHtml(check.area),
          uiCellText(resultText, st === "cant" ? (result?.reason ? "Missing data" : "") : result?.note || "", { strong: st === "diff" }),
          uiCellNum(openMine.length ? String(openMine.length) : "0"),
          uiCellNum(amount ? reconPeso(amount) : "—"),
          uiPill(RECON_STATUS[st].label, RECON_STATUS[st].tone),
          uiButton(running ? "Running…" : st === "diff" ? "Review" : "Re-run", st === "diff" ? select(check.id) : { "data-recon-run": check.id }, { size: "xs", disabled: Boolean(reconState.running) }),
        ],
        detail: () => ({
          eyebrow: `${check.id.toUpperCase()} · ${check.area}`, title: check.name, pill: { text: RECON_STATUS[st].label, tone: RECON_STATUS[st].tone }, closeAttrs: { "data-recon-close": "" }, label: "Check details",
          fields: [
            { label: "Rule", value: check.rule, wide: true },
            { label: "Scope", value: result?.scope || "—" },
            { label: "Last run", value: result ? reconWhen(result.runAt) : "Not run yet" },
            { label: "Open differences", value: String(openMine.length) },
            { label: "At stake", value: amount ? reconPeso(amount) : "—" },
          ],
          linesTitle: mine.length ? "Records behind this check" : "",
          lines: mine.slice(0, 12).map((diff) => ({ left: String(diff.ref || diff.key), sub: `${diff.title} · ${(RECON_DIFF_STATUS[diff.status] || RECON_DIFF_STATUS.open).label}`, right: Number(diff.amount) ? reconPeso(Number(diff.amount)) : "", tone: (RECON_DIFF_STATUS[diff.status] || RECON_DIFF_STATUS.open).tone })),
          note: st === "cant" ? { text: result?.reason || "This check hasn’t run yet.", tone: "slate" } : st === "pass" ? { text: `Everything matched on the last run.${result?.note ? ` ${result.note}` : ""}`, tone: "green" } : { text: `Open the Differences tab to fix each record.${result?.note ? ` ${result.note}` : ""}`, tone: "red" },
          actions: [
            uiButton(running ? "Running…" : "Re-run this check", { "data-recon-run": check.id }, { primary: st !== "diff", disabled: Boolean(reconState.running) }),
            ...(openMine.length ? [uiButton("Show its differences", { "data-wa-goto": `reconciliation|diffs|${check.id}|` }, { primary: true })] : []),
            ...(input ? [uiButton(input.label, { [input.attr]: "" })] : []),
          ],
        }),
      };
    });
    const nPass = checks.filter((check) => reconResult(check.id)?.status === "pass").length;
    const nDiff = checks.filter((check) => reconResult(check.id)?.status === "diff").length;
    return {
      title: "Checks", intro: "Every rule the system tests, what it compares, and the result of the last run. Select a check to see the records behind it.", placeholder: "Check name or area", actions: [runAll], minWidth: 980,
      stats: [
        { label: "Passed", value: nPass, sub: "Numbers agree", tone: "green", scope: "pass" },
        { label: "Differences", value: nDiff, sub: `${plural(open.length, "record")} to fix`, tone: "red", scope: "diff" },
        { label: "Can’t run", value: checks.length - nPass - nDiff, sub: "Missing data", tone: "slate", scope: "cant" },
      ],
      cols: [{ key: "id", label: "Check", sortable: true }, { key: "area", label: "Area", sortable: true }, { key: "result", label: "Result" }, { key: "open", label: "Open", align: "right", sortable: true }, { key: "amount", label: "At stake", align: "right", sortable: true }, { key: "status", label: "Status", sortable: true }, { key: "act", label: "", align: "right" }],
      csvName: "recon-checks.csv", csvHeader: ["Check", "Name", "Area", "Status", "Result", "Open", "At stake"],
      rows, empty: ["No checks", "The check list comes from the server."], defaultSort: { key: "id", dir: 1 },
      chips: [{ key: "diff", label: "Differences", tone: "red" }, { key: "pass", label: "Passed", tone: "green" }, { key: "cant", label: "Can’t run", tone: "slate" }], defaultScope: "",
    };
  }

  if (tab === "diffs") {
    const list = reconDiffs().filter((diff) => diff.status !== "resolved");
    const open = list.filter((diff) => diff.status === "open");
    const atStake = open.reduce((sum, diff) => sum + Number(diff.amount || 0), 0);
    const largest = [...open].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
    const order = (/** @type {any} */ diff) => (diff.status === "open" ? 0 : 1);
    const rows = list.sort((a, b) => order(a) - order(b) || Number(b.amount || 0) - Number(a.amount || 0)).map(/** @returns {UiViewRow} */ (diff) => {
      const check = reconCheck(diff.check);
      const st = RECON_DIFF_STATUS[diff.status] || RECON_DIFF_STATUS.open;
      const canApply = diff.status === "open" && diff.fix?.kind === "apply" && reconCanFix();
      return {
        id: diff.id, branches: [], scopes: [diff.status, diff.check, ...(diff.assignedTo ? ["assigned"] : [])],
        search: [diff.title, diff.ref, diff.key, check.name, check.area, diff.expected, diff.found, diff.assignedTo?.name].filter(Boolean).join(" "),
        sortValues: { title: diff.title, amount: Number(diff.amount || 0), status: order(diff), found: String(diff.firstSeen || "") },
        csv: [diff.check, check.name, diff.title, diff.ref, diff.expected, diff.found, Number(diff.amount || 0).toFixed(2), st.label, diff.assignedTo?.name || ""],
        cells: [
          uiCellDoc(diff.title, select(diff.id), `${check.area} · ${check.name}`, { plain: true }),
          uiCellText(String(diff.ref || diff.key), "", { mono: true }),
          escapeHtml(String(diff.expected || "—")),
          uiCellText(String(diff.found || "—"), "", { strong: diff.status === "open" }),
          uiCellNum(Number(diff.amount) ? reconPeso(Number(diff.amount)) : "—"),
          `${uiPill(st.label, st.tone)}${diff.assignedTo && diff.status === "open" ? `<small class="ui-sub">${escapeHtml(diff.assignedTo.name)}</small>` : diff.status !== "open" ? `<small class="ui-sub">${escapeHtml(reconWhen(diff.fixedAt || diff.explainedAt))}</small>` : ""}`,
          diff.status === "open" ? uiButton(canApply ? "Fix" : "Review", canApply ? { "data-recon-fix": diff.id } : select(diff.id), { size: "xs" }) : "",
        ],
        detail: () => reconDiffDetail(diff),
      };
    });
    return {
      title: "Differences to fix", intro: "Every record where the numbers don’t agree. Select one to see what’s expected, what was found, and exactly what the fix will change before you apply it.", placeholder: "Record, item or document", actions: [uiButton("Export", { "data-recon-export": "" }, { size: "sm" })], minWidth: 1100,
      stats: [
        { label: "Open", value: open.length, sub: atStake ? `${reconPeso(atStake)} at stake` : "Nothing at stake", tone: "red", scope: "open" },
        { label: "Fixed or explained", value: list.length - open.length, sub: "Still listed until the next run", tone: "green", scope: "fixed" },
        { label: "Largest", value: largest ? reconPeso(Number(largest.amount || 0)) : "—", sub: largest ? largest.title : "", tone: "amber" },
      ],
      cols: [{ key: "title", label: "Difference", sortable: true }, { key: "ref", label: "Record" }, { key: "expected", label: "Expected" }, { key: "found", label: "Found" }, { key: "amount", label: "At stake", align: "right", sortable: true }, { key: "status", label: "Status", sortable: true }, { key: "act", label: "", align: "right" }],
      csvName: "recon-differences.csv", csvHeader: ["Check", "Check name", "Difference", "Record", "Expected", "Found", "At stake", "Status", "Assigned to"],
      rows, empty: ["No differences", s.runs?.length ? "Every check that ran found the numbers in agreement." : "Run the checks to see differences."],
      defaultSort: { key: "status", dir: 1 },
      chips: [{ key: "open", label: "Open", tone: "red" }, { key: "assigned", label: "Assigned", tone: "amber" }, { key: "fixed", label: "Fixed", tone: "green" }, { key: "explained", label: "Explained", tone: "blue" }], defaultScope: "open",
    };
  }

  if (tab === "count") {
    const counts = /** @type {any[]} */ (s.stockCounts || []);
    const posted = counts.filter((count) => count.status === "Posted");
    /** @type {Map<string, any>} */
    const latest = new Map();
    for (const count of posted) if (!latest.has(count.branch) || String(count.at) > String(latest.get(count.branch).at)) latest.set(count.branch, count);
    const drafts = counts.filter((count) => count.status === "Draft");
    const costOf = (/** @type {string} */ code) => Number(data.items.find((item) => item.code === code)?.cost || 0);
    /** @type {UiViewRow[]} */
    const rows = [];
    for (const count of latest.values()) {
      (count.lines || []).forEach((/** @type {any} */ line, /** @type {number} */ index) => {
        const variance = Number(line.counted) - Number(line.system);
        const value = Math.abs(variance) * costOf(line.code);
        const pill = !variance ? { label: "Match", tone: /** @type {UiTone} */ ("green") } : line.adjusted ? { label: "Adjusted", tone: /** @type {UiTone} */ ("blue") } : { label: "Variance", tone: /** @type {UiTone} */ ("red") };
        const diffId = `k3:${count.id}:${index}`;
        rows.push({
          id: `${count.id}:${index}`, branches: [], scopes: [variance && !line.adjusted ? "variance" : "match", count.branch],
          search: [line.item, line.code, line.lot, count.branch].join(" "),
          sortValues: { item: String(line.item || line.code), branch: count.branch, variance, value },
          csv: [count.branch, line.code, line.item, line.lot, line.system, line.counted, variance, value.toFixed(2), pill.label, String(count.at).slice(0, 10)],
          cells: [uiCellDoc(String(line.item || line.code), select(`${count.id}:${index}`), line.lot ? `Lot ${line.lot}` : "", { plain: true }), escapeHtml(count.branch), uiCellNum(String(line.system)), uiCellNum(String(line.counted)), uiCellNum(variance > 0 ? `+${variance}` : String(variance)), uiCellNum(variance ? `${variance < 0 ? "−" : "+"}${reconPeso(value)}` : "—"), uiPill(pill.label, pill.tone)],
          detail: () => ({
            eyebrow: `${count.branch} · counted ${reconWhen(count.at)}`, title: String(line.item || line.code), pill: { text: pill.label, tone: pill.tone }, closeAttrs: { "data-recon-close": "" }, label: "Count line",
            fields: [{ label: "Lot / serial", value: String(line.lot || "—"), mono: true }, { label: "System at count", value: String(line.system) }, { label: "Counted", value: String(line.counted) }, { label: "Counted by", value: String(count.by || "—") }],
            note: !variance ? { text: "Counted quantity matched the system.", tone: "green" } : line.adjusted ? { text: "The adjustment was posted from Differences to fix.", tone: "blue" } : { text: "Listed under Differences to fix. Post the adjustment there so the reason is recorded.", tone: "red" },
            actions: variance && !line.adjusted ? [uiButton("Open difference", { "data-wa-goto": `reconciliation|diffs||${diffId}` }, { primary: true })] : [],
          }),
        });
      });
    }
    const branches = platformBranches().map((branch) => String(branch));
    for (const branch of branches) {
      if (latest.has(branch)) continue;
      rows.push({
        id: `due:${branch}`, branches: [], scopes: ["due", branch], search: branch, sortValues: { item: "", branch, variance: 0, value: 0 }, csv: [branch, "", "All items", "", "", "", "", "", "Count due", ""],
        cells: [uiCellDoc("All items", select(`due:${branch}`), "Never counted in Recon", { plain: true }), escapeHtml(branch), "—", "—", "—", "—", uiPill("Count due", "amber")],
        detail: () => ({ eyebrow: branch, title: "Count due", pill: { text: "No count yet", tone: "amber" }, closeAttrs: { "data-recon-close": "" }, label: "Count due", fields: [{ label: "Lots on hand", value: String(data.inventory.filter((row) => row.branch === branch && Number(row.qty) > 0).length) }], note: { text: "Count this branch so check K3 can compare it with the system.", tone: "amber" }, actions: [uiButton(`Start ${branch} count`, { "data-recon-count-new": branch }, { primary: true })] }),
      });
    }
    for (const draft of drafts) rows.push({
      id: `draft:${draft.id}`, branches: [], scopes: ["draft", draft.branch], search: `${draft.branch} draft`, sortValues: { item: "", branch: draft.branch, variance: 0, value: 0 }, csv: [draft.branch, "", "Draft count", "", "", "", "", "", "Draft", String(draft.at).slice(0, 10)],
      cells: [uiCellDoc("Draft count", select(`draft:${draft.id}`), `${plural((draft.lines || []).length, "line")} entered`, { plain: true }), escapeHtml(draft.branch), "—", "—", "—", "—", uiPill("Draft", "slate")],
      detail: () => ({ eyebrow: `${draft.branch} · started ${reconWhen(draft.at)}`, title: "Draft count", pill: { text: "Draft", tone: "slate" }, closeAttrs: { "data-recon-close": "" }, label: "Draft count", fields: [{ label: "Started by", value: String(draft.by || "—") }, { label: "Lines entered", value: String((draft.lines || []).length) }], note: { text: "Nothing is compared until the count is posted.", tone: "slate" }, actions: [uiButton("Continue count", { "data-recon-count-edit": draft.id }, { primary: true })] }),
    });
    const stats = [...latest.values()].map((count) => {
      const variances = (count.lines || []).filter((/** @type {any} */ line) => Number(line.counted) !== Number(line.system));
      const value = variances.reduce((/** @type {number} */ sum, /** @type {any} */ line) => sum + (Number(line.counted) - Number(line.system)) * costOf(line.code), 0);
      const days = Math.floor((Date.now() - new Date(count.at).getTime()) / 86400000);
      return { label: `${count.branch} · counted ${reconWhen(count.at).split(" · ")[0]}`, value: plural(variances.length, "variance"), sub: `${plural((count.lines || []).length, "line")} counted · ${value ? `${value < 0 ? "−" : "+"}${reconPeso(Math.abs(value))} at cost` : "no value difference"}${days > 30 ? ` · ${days} days ago` : ""}`, tone: /** @type {UiTone} */ (variances.length ? "amber" : "green"), scope: count.branch };
    });
    branches.filter((branch) => !latest.has(branch)).forEach((branch) => stats.push({ label: `${branch} · last counted`, value: "Never", sub: "Count due", tone: "red", scope: branch }));
    return {
      title: "Stock count", intro: "Physical counts against the system quantity when the count was posted. Variances become differences to fix; nothing changes until someone posts the adjustment.", placeholder: "Item, lot or branch",
      actions: [uiButton("Start a count", { "data-recon-count-new": "" }, { size: "sm", primary: true })], minWidth: 980,
      stats: stats.slice(0, 4),
      cols: [{ key: "item", label: "Item", sortable: true }, { key: "branch", label: "Branch", sortable: true }, { key: "system", label: "System", align: "right" }, { key: "counted", label: "Counted", align: "right" }, { key: "variance", label: "Variance", align: "right", sortable: true }, { key: "value", label: "Value", align: "right", sortable: true }, { key: "status", label: "Status" }],
      csvName: "stock-count.csv", csvHeader: ["Branch", "Code", "Item", "Lot", "System", "Counted", "Variance", "Value at cost", "Status", "Counted on"],
      rows, empty: ["No counts yet", "Start a count to compare what’s on the shelf with the system."], defaultSort: { key: "variance", dir: 1 },
      chips: [{ key: "variance", label: "Variance", tone: "red" }, { key: "match", label: "Match", tone: "green" }, { key: "due", label: "Count due", tone: "amber" }, { key: "draft", label: "Draft", tone: "slate" }], defaultScope: "",
    };
  }

  // Fix history: every fix, undo and explanation recorded on a difference.
  const entries = reconDiffs().flatMap((diff) => (diff.history || []).filter((/** @type {any} */ entry) => /^Fixed|Fix undone|Marked as explained|Explanation withdrawn/.test(String(entry.action))).map((/** @type {any} */ entry) => ({ diff, entry })));
  entries.sort((a, b) => String(b.entry.at).localeCompare(String(a.entry.at)));
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const typeOf = (/** @type {string} */ action) => (/^Fixed/.test(action) ? { label: "Fixed", tone: /** @type {UiTone} */ ("green") } : /undone/.test(action) ? { label: "Undone", tone: /** @type {UiTone} */ ("amber") } : /withdrawn/.test(action) ? { label: "Reopened", tone: /** @type {UiTone} */ ("slate") } : { label: "Explained", tone: /** @type {UiTone} */ ("blue") });
  const rows = entries.map(/** @returns {UiViewRow} */ ({ diff, entry }, index) => {
    const type = typeOf(String(entry.action));
    return {
      id: `${diff.id}@${entry.at}#${index}`, branches: [], scopes: [type.label.toLowerCase()],
      search: [entry.by, entry.action, diff.title, diff.ref, entry.note].filter(Boolean).join(" "),
      sortValues: { when: String(entry.at), by: String(entry.by || "") },
      csv: [String(entry.at), String(entry.by || ""), String(entry.action), diff.title, diff.ref, type.label, String(entry.note || "")],
      cells: [uiCellDoc(reconWhen(entry.at), select(`${diff.id}@${entry.at}#${index}`)), uiCellText(String(entry.by || "—"), "", { strong: true }), uiCellText(String(entry.action).replace(/^Fixed: /, ""), entry.note ? String(entry.note) : ""), uiCellText(String(diff.ref || diff.key), diff.title, { mono: true }), uiPill(type.label, type.tone)],
      detail: () => reconDiffDetail(diff),
    };
  });
  return {
    title: "Fix history", intro: "Every correction made from Recon, with who made it and what changed. The same entries are in the Audit Log.", placeholder: "Record or user",
    actions: [uiButton("Open Audit Log", { "data-wa-goto": "logs|||" }, { size: "sm" })], minWidth: 900,
    stats: [
      { label: "Fixes in the last 30 days", value: entries.filter(({ entry }) => /^Fixed/.test(entry.action) && String(entry.at) >= monthAgo).length, sub: "Applied from Recon", tone: "blue", scope: "fixed" },
      { label: "Explained, not changed", value: reconDiffs().filter((diff) => diff.status === "explained").length, sub: "Marked as correct with a note", tone: "slate", scope: "explained" },
    ],
    cols: [{ key: "when", label: "When", sortable: true }, { key: "by", label: "By", sortable: true }, { key: "fix", label: "Fix" }, { key: "record", label: "Record" }, { key: "type", label: "Type" }],
    csvName: "recon-fix-history.csv", csvHeader: ["When", "By", "Action", "Difference", "Record", "Type", "Note"],
    rows, empty: ["No fixes yet", "Fixes and explanations made in Recon are listed here."], defaultSort: { key: "when", dir: -1 },
    chips: [{ key: "fixed", label: "Fixed", tone: "green" }, { key: "explained", label: "Explained", tone: "blue" }, { key: "undone", label: "Undone", tone: "amber" }], defaultScope: "",
  };
}

function renderReconciliation() {
  const header = qs("#recon-actions");
  const panel = qs("#recon-tab-panel");
  if (!panel) return;
  if (!["Superadmin", "CEO"].includes(String(currentUser?.role))) {
    if (header) header.innerHTML = "";
    qs("#recon-tabs").innerHTML = "";
    uiRender(panel, `<div class="ui-card ui-empty"><strong>Recon is for Superadmin and CEO</strong><span>Ask a Superadmin if a difference needs your attention; they can assign it to you.</span></div>`);
    return;
  }
  if (!RECON_TAB_LABELS[reconTab]) reconTab = "overview";
  if (!reconState.data) {
    if (!reconState.loading) loadRecon();
    qs("#recon-tabs").innerHTML = uiModuleTabs({ tabs: RECON_TABS.map((key) => ({ key, label: RECON_TAB_LABELS[key] })), active: reconTab, attr: "data-recon-tab" });
    uiRender(panel, reconState.error ? `<div class="ui-card ui-empty"><strong>Recon couldn’t load</strong><span>${escapeHtml(reconState.error)}</span>${uiButton("Try again", { "data-recon-reload": "" }, { size: "sm" })}</div>` : `<div class="ui-card ui-empty"><strong>Loading Recon…</strong><span>Reading the latest check results.</span></div>`);
    return;
  }
  loadRecon(); // refreshes in the background when older than a minute
  if (header) header.innerHTML = uiButton("Export report", { "data-recon-export": "" }) + uiButton(reconState.running === "all" ? "Running all checks…" : "Run all checks", { "data-recon-run": "" }, { primary: true, disabled: Boolean(reconState.running) });
  const open = reconOpenDiffs().length;
  const fixes = reconDiffs().reduce((sum, diff) => sum + (diff.history || []).filter((/** @type {any} */ entry) => /^Fixed|Fix undone|Marked as explained|Explanation withdrawn/.test(String(entry.action))).length, 0);
  const counts = /** @type {Record<string, number | undefined>} */ ({ checks: reconState.data.checks.length, diffs: open, count: (reconState.data.stockCounts || []).filter((/** @type {any} */ count) => count.status === "Posted").length, history: fixes });
  qs("#recon-tabs").innerHTML = uiModuleTabs({ tabs: RECON_TABS.map((key) => ({ key, label: RECON_TAB_LABELS[key], count: counts[key] })), active: reconTab, attr: "data-recon-tab" });
  renderModuleAssistant("reconciliation");
  uiRender(panel, reconTab === "overview" ? reconOverviewHtml() : uiViewHtml(reconTabModel(reconTab), reconView, "recon"));
  syncModuleUrl("reconciliation", reconQueryString());
}

// Assistant: the three biggest open differences.
WORKFLOW_RULES.reconciliation = [0, 1, 2].map((index) => ({ id: `recon-${index}`, rule: () => {
  const diff = reconState.data ? reconOpenDiffs()[index] : null;
  if (!diff) return null;
  return { tone: /** @type {UiTone} */ (Number(diff.amount) >= 30000 ? "red" : "amber"), money: Number(diff.amount || 0), text: `${diff.title} — ${diff.ref}${Number(diff.amount) ? ` (${reconPeso(Number(diff.amount))})` : ""}`, action: diff.fix?.kind === "apply" && reconCanFix() ? "Fix" : "Review", attrs: diff.fix?.kind === "apply" && reconCanFix() ? { "data-recon-fix": diff.id } : { "data-wa-goto": `reconciliation|diffs|open|${diff.id}` } };
} }));

// ----- dialogs --------------------------------------------------------------------------------
/**
 * A small form dialog (wrapped in a <form> so modal padding applies). Resolves with the form's
 * values on submit, or null when closed.
 * @param {{ eyebrow: string, title: string, sub?: string, body: string, submit: string, danger?: boolean, wide?: boolean, drawer?: boolean }} options
 * @returns {Promise<Record<string, string> | null>}
 */
function reconDialog({ eyebrow, title, sub = "", body, submit, danger = false, wide = false, drawer = false }) {
  qs("#recon-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = `modal recon-modal${wide ? " recon-modal-wide" : ""}${drawer ? " recon-modal-drawer" : ""}`;
  dialog.id = "recon-dialog";
  dialog.innerHTML = `<form method="dialog" id="recon-dialog-form">
    <div class="modal-header"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</div><button class="icon-button" type="button" data-recon-dialog-close aria-label="Close">x</button></div>
    ${body}
    <div class="modal-actions"><button class="ghost-button" type="button" data-recon-dialog-close>Cancel</button><button class="${danger ? "danger-button" : "primary-button"}" type="submit">${escapeHtml(submit)}</button></div>
  </form>`;
  document.body.appendChild(dialog);
  return new Promise((resolve) => {
    let result = /** @type {Record<string, string> | null} */ (null);
    const form = /** @type {HTMLFormElement} */ (qsIn(dialog, "#recon-dialog-form"));
    qsaIn(dialog, "[data-recon-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      result = /** @type {Record<string, string>} */ (Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)])));
      dialog.close();
    });
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
    guardDialogEscape(dialog);
    dialog.showModal();
    /** @type {HTMLElement | null} */ (dialog.querySelector("input:not([type=hidden]), textarea, select"))?.focus();
  });
}
/** Replaces one difference in the loaded data. @param {any} next */
function reconPutDiff(next) {
  if (!reconState.data || !next) return;
  reconState.data.differences = reconDiffs().map((diff) => (diff.id === next.id ? next : diff));
}
/** @param {unknown} error */
function reconErrorText(error) { return error instanceof Error ? error.message : String(error); }

/** Preview → apply. @param {string} id */
async function reconFixDifference(id) {
  const diff = reconDiffs().find((entry) => entry.id === id);
  if (!diff || diff.fix?.kind !== "apply") return;
  if (!reconCanFix()) return toast("Only Superadmin can apply Recon fixes.");
  const preview = (diff.fix.preview || []).map((/** @type {string[]} */ [left, right]) => `<li>${uiDot("amber")}<div class="grow"><strong>${escapeHtml(left)}</strong></div><b>${escapeHtml(right)}</b></li>`).join("");
  const values = await reconDialog({
    eyebrow: `${String(diff.check).toUpperCase()} · ${reconCheck(diff.check).name}`, title: diff.fix.label, sub: String(diff.ref || ""),
    body: `<div class="recon-preview"><h4>What will change</h4><ul>${preview}</ul></div>
      <div class="field"><label for="recon-fix-note">Reason${diff.fix.needsNote ? " (required)" : " (optional)"}</label><textarea id="recon-fix-note" name="note" rows="2" maxlength="500" ${diff.fix.needsNote ? "required" : ""} placeholder="Saved with the fix in the Audit Log"></textarea></div>
      <p class="recon-dialog-note">Applied in one save, written to the Audit Log with before and after values, and can be undone from Fix history.</p>`,
    submit: "Apply fix",
  });
  if (!values) return;
  try {
    const result = await MedlaneAPI.reconAction(id, "fix", { note: values.note || "" });
    reconPutDiff(result.difference);
    toast("Fix applied and logged. Re-running the check…");
    await MedlaneAPI.reconRun(diff.check).then((fresh) => { reconState.data = fresh; reconState.loadedAt = Date.now(); }).catch(() => null);
  } catch (error) {
    toast(`Fix not applied: ${reconErrorText(error)}`);
    loadRecon(true);
  }
  renderReconciliation();
}
/** @param {string} id */
async function reconUndoDifference(id) {
  const diff = reconDiffs().find((entry) => entry.id === id);
  if (!diff) return;
  const changes = (diff.appliedChanges || []).map((/** @type {any} */ change) => `<li>${uiDot("amber")}<div class="grow"><strong>${escapeHtml(change.field)}</strong></div><b>${escapeHtml(`${change.to} → ${change.from}`)}</b></li>`).join("");
  const values = await reconDialog({ eyebrow: "Undo fix", title: diff.title, sub: String(diff.ref || ""), body: `<div class="recon-preview"><h4>What will change back</h4><ul>${changes}</ul></div><p class="recon-dialog-note">The undo is also written to the Audit Log. It is refused if the record has changed since the fix.</p>`, submit: "Undo fix", danger: true });
  if (!values) return;
  try {
    const result = await MedlaneAPI.reconAction(id, "undo", {});
    reconPutDiff(result.difference);
    toast("Fix undone and logged.");
  } catch (error) { toast(`Not undone: ${reconErrorText(error)}`); loadRecon(true); }
  renderReconciliation();
}
/** @param {string} id */
async function reconExplainDifference(id) {
  const diff = reconDiffs().find((entry) => entry.id === id);
  if (!diff) return;
  const values = await reconDialog({ eyebrow: "Mark as explained", title: diff.title, sub: String(diff.ref || ""), body: `<div class="field"><label for="recon-explain-note">Why is this correct?</label><textarea id="recon-explain-note" name="note" rows="3" maxlength="500" required placeholder="e.g. Agreed discount for this client, approved by the CEO"></textarea></div><p class="recon-dialog-note">No data changes. It stays hidden until its values change, then it reopens.</p>`, submit: "Mark as explained" });
  if (!values) return;
  try { reconPutDiff((await MedlaneAPI.reconAction(id, "explain", { note: values.note })).difference); toast("Marked as explained."); }
  catch (error) { toast(`Not saved: ${reconErrorText(error)}`); }
  renderReconciliation();
}
/** @param {string} id */
async function reconReopenDifference(id) {
  try { reconPutDiff((await MedlaneAPI.reconAction(id, "reopen", {})).difference); toast("Explanation withdrawn. The difference is open again."); }
  catch (error) { toast(`Not saved: ${reconErrorText(error)}`); }
  renderReconciliation();
}
/** @param {string} id */
async function reconAssignDifference(id) {
  const diff = reconDiffs().find((entry) => entry.id === id);
  if (!diff) return;
  /** @type {{ name: string, email: string, role: string }[]} */
  let people = [];
  try { people = ((await MedlaneAPI.listUsers())?.users || []).filter((/** @type {any} */ user) => user.email && !user.disabled).map((/** @type {any} */ user) => ({ name: String(user.name || user.email), email: String(user.email), role: String(user.role || "") })); }
  catch { people = []; }
  if (!people.length) return toast("Couldn’t load the user list.");
  const options = people.sort((a, b) => a.name.localeCompare(b.name)).map((person) => `<option value="${escapeHtml(person.email)}"${diff.assignedTo?.email === person.email ? " selected" : ""}>${escapeHtml(`${person.name} · ${person.role}`)}</option>`).join("");
  const values = await reconDialog({ eyebrow: "Assign", title: diff.title, sub: String(diff.ref || ""), body: `<div class="field"><label for="recon-assign-to">Who should look into it?</label><select id="recon-assign-to" name="email" required>${options}</select></div><div class="field"><label for="recon-assign-note">Note (optional)</label><textarea id="recon-assign-note" name="note" rows="2" maxlength="500"></textarea></div><p class="recon-dialog-note">They get a notification. Nothing in the record changes.</p>`, submit: "Assign" });
  if (!values) return;
  const person = people.find((entry) => entry.email === values.email);
  if (!person) return;
  try { reconPutDiff((await MedlaneAPI.reconAction(id, "assign", { assignee: { name: person.name, email: person.email }, note: values.note || "" })).difference); toast(`Assigned to ${person.name}.`); }
  catch (error) { toast(`Not assigned: ${reconErrorText(error)}`); }
  renderReconciliation();
}
/** Fixes that create documents or need a module's own checks open that module. @param {string} id */
function reconOpenDifference(id) {
  const goto = reconDiffs().find((entry) => entry.id === id)?.fix?.goto;
  if (!goto) return;
  if (["invoicing", "collections", "payables", "purchase-orders", "masterlists", "inventory"].includes(goto.section)) {
    if (goto.section === "purchase-orders") { showSection("purchase-orders"); return; }
    if (goto.section === "inventory") { showSection("inventory"); return; }
    workflowGoto(goto.section, goto.tab || "", "", goto.sel || "");
  }
}

// ----- inputs ---------------------------------------------------------------------------------
async function reconCashCount() {
  const branches = ["All", ...platformBranches().map(String)];
  const values = await reconDialog({
    eyebrow: "Check K17", title: "Today’s cash count", sub: "Cash on hand that hasn’t been deposited yet",
    body: `<div class="field"><label for="recon-cash-branch">Branch</label><select id="recon-cash-branch" name="branch">${branches.map((branch) => `<option>${escapeHtml(branch)}</option>`).join("")}</select></div>
      <div class="field"><label for="recon-cash-amount">Cash counted (₱)</label><input id="recon-cash-amount" name="amount" type="number" min="0" step="0.01" required inputmode="decimal" /></div>
      <div class="field"><label for="recon-cash-note">Note (optional)</label><input id="recon-cash-note" name="note" maxlength="300" /></div>`,
    submit: "Save count",
  });
  if (!values) return;
  try { await MedlaneAPI.reconInput("cash-counts", { branch: values.branch, amount: Number(values.amount), note: values.note }); toast("Cash count saved. Running K17…"); await runReconChecks("k17"); }
  catch (error) { toast(`Not saved: ${reconErrorText(error)}`); }
}
async function reconInvoiceSeries() {
  const current = /** @type {any[]} */ (reconState.data?.settings?.invoiceSeries || []);
  const blank = { id: "", prefix: "", start: "", end: "", width: "", branch: "" };
  const list = [...current, blank];
  const row = (/** @type {any} */ entry, /** @type {number} */ index) => `<div class="recon-series-row">
    <input type="hidden" name="id-${index}" value="${escapeHtml(entry.id || "")}" />
    <div class="field"><label for="rs-prefix-${index}">Prefix</label><input id="rs-prefix-${index}" name="prefix-${index}" value="${escapeHtml(entry.prefix || "")}" maxlength="12" placeholder="SI-" /></div>
    <div class="field"><label for="rs-start-${index}">First no.</label><input id="rs-start-${index}" name="start-${index}" type="number" min="1" value="${escapeHtml(entry.start || "")}" /></div>
    <div class="field"><label for="rs-end-${index}">Last no.</label><input id="rs-end-${index}" name="end-${index}" type="number" min="0" value="${escapeHtml(entry.end || "")}" placeholder="Open" /></div>
    <div class="field"><label for="rs-width-${index}">Digits</label><input id="rs-width-${index}" name="width-${index}" type="number" min="0" max="10" value="${escapeHtml(entry.width || "")}" placeholder="—" /></div>
    <div class="field"><label for="rs-branch-${index}">Branch</label><input id="rs-branch-${index}" name="branch-${index}" value="${escapeHtml(entry.branch || "")}" maxlength="60" /></div>
  </div>`;
  const values = await reconDialog({
    eyebrow: "Check K11", title: "Invoice number series", sub: "Each booklet or series of invoice numbers, so gaps can be found", wide: true,
    body: `${list.map(row).join("")}<p class="recon-dialog-note">Leave “Last no.” empty to check up to the highest number issued. Leave a row’s first number empty to remove it. Numbers already recorded as voided are kept.</p>`,
    submit: "Save series",
  });
  if (!values) return;
  const series = list.map((_, index) => ({ id: values[`id-${index}`], prefix: values[`prefix-${index}`], start: Number(values[`start-${index}`]), end: Number(values[`end-${index}`]) || 0, width: Number(values[`width-${index}`]) || 0, branch: values[`branch-${index}`] })).filter((entry) => entry.start > 0);
  try { await MedlaneAPI.reconInput("settings", { invoiceSeries: series }); toast("Invoice series saved. Running K11…"); await runReconChecks("k11"); }
  catch (error) { toast(`Not saved: ${reconErrorText(error)}`); }
}
/** Reads a bank CSV: finds the date, description and credit (or amount) columns. @param {string} text */
function reconParseStatement(text) {
  const rows = text.split(/\r?\n/).map((line) => {
    /** @type {string[]} */
    const cells = []; let cell = ""; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
      else if (ch === "," && !quoted) { cells.push(cell); cell = ""; }
      else cell += ch;
    }
    cells.push(cell);
    return cells.map((value) => value.trim());
  }).filter((cells) => cells.some(Boolean));
  const headerAt = rows.findIndex((cells) => cells.some((value) => /date/i.test(value)) && cells.some((value) => /credit|deposit|amount/i.test(value)));
  if (headerAt < 0) return { lines: [], error: "Couldn’t find a header row with a Date column and a Credit, Deposit or Amount column." };
  const head = rows[headerAt].map((value) => value.toLowerCase());
  const col = (/** @type {RegExp} */ pattern) => head.findIndex((value) => pattern.test(value));
  const dateCol = col(/date/);
  const creditCol = col(/credit|deposit/);
  const amountCol = creditCol >= 0 ? creditCol : col(/amount/);
  const descCol = col(/desc|particular|detail|remark|narration|reference/);
  const toDay = (/** @type {string} */ value) => {
    const v = value.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v);
    if (m) { const year = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "";
  };
  const lines = rows.slice(headerAt + 1).map((cells) => ({ date: toDay(cells[dateCol] || ""), description: descCol >= 0 ? cells[descCol] || "" : "", amount: Number(String(cells[amountCol] || "").replace(/[₱,\s]/g, "").replace(/^\((.*)\)$/, "-$1")) })).filter((line) => line.date && Number.isFinite(line.amount) && line.amount !== 0);
  return { lines, error: lines.length ? "" : "No dated amounts were found under the header row." };
}
async function reconBankStatement() {
  reconLastStatementFile = null;
  const values = await reconDialog({
    eyebrow: "Check K16", title: "Upload a bank statement", sub: "CSV export from the bank: a Date column and a Credit, Deposit or Amount column",
    body: `<div class="field"><label for="recon-bank-name">Bank and account</label><input id="recon-bank-name" name="bank" maxlength="80" placeholder="e.g. BDO current account" required /></div>
      <div class="field"><label for="recon-bank-file">Statement file (.csv)</label><input id="recon-bank-file" name="file" type="file" accept=".csv,text/csv" required /></div>
      <p class="recon-dialog-note">Only dated amounts are kept. Deposits are matched by amount within 3 days of the deposit date.</p>`,
    submit: "Upload",
  });
  if (!values) return;
  // The dialog is gone once it closes, so the file was captured when it was picked.
  const file = reconStatementFile();
  if (!file) return toast("Pick the statement file.");
  const { lines, error } = reconParseStatement(await file.text());
  if (error) return toast(error);
  try { await MedlaneAPI.reconInput("bank-statements", { bank: values.bank, file: file.name, lines }); toast(`${plural(lines.length, "line")} read. Running K16…`); await runReconChecks("k16"); }
  catch (err) { toast(`Not uploaded: ${reconErrorText(err)}`); }
}
/** The dialog is removed on close, so its file input is captured when picked. @type {File | null} */
let reconLastStatementFile = null;
function reconStatementFile() { return reconLastStatementFile; }
document.addEventListener("change", (event) => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (input?.id === "recon-bank-file") reconLastStatementFile = input.files?.[0] || null;
});

/** Count sheet for a branch: every lot on hand there, counted quantity entered per line. @param {string} [branch] @param {any} [draft] */
async function reconStockCount(branch = "", draft = null) {
  const branches = platformBranches().map(String);
  let chosen = branch || draft?.branch || "";
  if (!chosen) {
    const pick = await reconDialog({ eyebrow: "Stock count", title: "Start a count", body: `<div class="field"><label for="recon-count-branch">Branch to count</label><select id="recon-count-branch" name="branch" required>${branches.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}</select></div><p class="recon-dialog-note">You’ll get a sheet of every lot on hand at that branch. Enter what you count; you can save it as a draft and finish later.</p>`, submit: "Open count sheet" });
    if (!pick) return;
    chosen = pick.branch;
  }
  const lots = data.inventory.filter((row) => row.branch === chosen && (Number(row.qty) > 0 || draft?.lines?.some((/** @type {any} */ line) => line.key === inventoryRecordKey(row))));
  if (!lots.length) return toast(`No stock on hand at ${chosen}.`);
  const entered = new Map((draft?.lines || []).map((/** @type {any} */ line) => [line.key, line.counted]));
  const sorted = [...lots].sort((a, b) => String(a.item).localeCompare(String(b.item)) || String(a.lot || a.serial || "").localeCompare(String(b.lot || b.serial || "")));
  const body = `<div class="recon-count-sheet"><table class="ui-table compact"><thead><tr><th scope="col">Item</th><th scope="col">Lot / serial</th><th scope="col" class="num">System</th><th scope="col" class="num">Counted</th></tr></thead><tbody>${sorted.map((row, index) => `<tr><td>${escapeHtml(row.item)}<small class="ui-sub mono">${escapeHtml(row.code || "")}</small></td><td class="mono">${escapeHtml(row.lot || row.serial || "—")}</td><td class="num">${escapeHtml(String(row.qty))}</td><td class="num"><input type="hidden" name="key-${index}" value="${escapeHtml(inventoryRecordKey(row))}" /><input class="recon-count-input" name="counted-${index}" type="number" min="0" step="any" inputmode="decimal" aria-label="Counted ${escapeHtml(row.item)} ${escapeHtml(row.lot || row.serial || "")}" value="${escapeHtml(entered.has(inventoryRecordKey(row)) ? String(entered.get(inventoryRecordKey(row))) : "")}" /></td></tr>`).join("")}</tbody></table></div>
    <div class="field"><label for="recon-count-status">When saving</label><select id="recon-count-status" name="status"><option value="Draft">Save as draft (nothing is compared yet)</option><option value="Posted">Post the count (compared with the system now)</option></select></div>
    <p class="recon-dialog-note">Only lines with a number are saved. Posting records the system quantity at that moment; variances appear under Differences to fix and nothing changes until an adjustment is posted there.</p>`;
  const values = await reconDialog({ eyebrow: `Stock count · ${chosen}`, title: `Count sheet · ${plural(sorted.length, "lot")}`, body, submit: "Save count", wide: true });
  if (!values) return;
  const lines = sorted.map((row, index) => ({ key: values[`key-${index}`], code: row.code, item: row.item, lot: row.lot || row.serial || "", counted: values[`counted-${index}`], system: Number(row.qty || 0) })).filter((line) => line.counted !== "" && line.counted !== undefined).map((line) => ({ ...line, counted: Number(line.counted) }));
  if (!lines.length) return toast("Enter at least one counted quantity.");
  try {
    await MedlaneAPI.reconInput("stock-counts", { id: draft?.id || undefined, branch: chosen, status: values.status, lines });
    if (values.status === "Posted") { toast(`Count posted. Running K3…`); await runReconChecks("k3"); }
    else { toast("Draft saved."); await loadRecon(true); }
  } catch (error) { toast(`Not saved: ${reconErrorText(error)}`); }
}
/** Same key the Worker uses for a stock row. @param {any} row */
function inventoryRecordKey(row) {
  return [row?.code || row?.item || "stock", row?.branch || "branch", row?.lot || row?.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
}

function reconExportReport() {
  if (!reconState.data) return;
  const view = reconTabModel("diffs");
  const rows = view.rows.filter((row) => row.scopes.includes("open"));
  downloadCsv(`recon-differences-${fmtDate(today)}.csv`, [view.csvHeader, ...rows.map((row) => row.csv)]);
  log("Exported Recon report", "Recon", `${plural(rows.length, "open difference")}`, { save: false });
}

/** Click handling for the Recon section (wired in events-bootstrap.js). @param {Element} target */
function handleReconClick(target) {
  const tab = closestEl(target, "[data-recon-tab]");
  if (tab) {
    if (tab.dataset.reconTab !== reconTab) reconView = uiBlankViewState();
    reconTab = /** @type {string} */ (tab.dataset.reconTab);
    return renderReconciliation();
  }
  const attr = (/** @type {string} */ name) => closestEl(target, `[${name}]`)?.getAttribute(name);
  /** @type {string | null | undefined} */
  let value;
  if ((value = attr("data-recon-run")) !== null && value !== undefined) return runReconChecks(value || undefined);
  if ((value = attr("data-recon-fix"))) return reconFixDifference(value);
  if ((value = attr("data-recon-undo"))) return reconUndoDifference(value);
  if ((value = attr("data-recon-explain"))) return reconExplainDifference(value);
  if ((value = attr("data-recon-reopen"))) return reconReopenDifference(value);
  if ((value = attr("data-recon-assign"))) return reconAssignDifference(value);
  if ((value = attr("data-recon-open"))) return reconOpenDifference(value);
  if (attr("data-recon-cash") !== null && attr("data-recon-cash") !== undefined) return reconCashCount();
  if (attr("data-recon-series") !== null && attr("data-recon-series") !== undefined) return reconInvoiceSeries();
  if (attr("data-recon-statement") !== null && attr("data-recon-statement") !== undefined) return reconBankStatement();
  if ((value = attr("data-recon-count-new")) !== null && value !== undefined) return reconStockCount(value);
  if ((value = attr("data-recon-count-edit"))) return reconStockCount("", (reconState.data?.stockCounts || []).find((/** @type {any} */ count) => count.id === value));
  if (attr("data-recon-export") !== null && attr("data-recon-export") !== undefined) return reconExportReport();
  if (attr("data-recon-reload") !== null && attr("data-recon-reload") !== undefined) { reconState.error = ""; return loadRecon(true); }
  if (reconTab !== "overview" && reconState.data) uiViewClick(target, "recon", { state: () => reconView, view: () => reconTabModel(reconTab), render: renderReconciliation });
}

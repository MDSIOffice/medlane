// Shared building blocks for the redesigned module pages (Inventory, Sales, Invoicing,
// Collections, Receivables). Like the rest of the app these are string templates: each helper
// returns HTML and the page wires clicks through delegated `data-*` attributes. Styling lives in
// src/styles.css under `.ui-scope` (put that class on a module's <section> to opt in).
//
//   uiPageHeader   title + one-line description, secondary buttons + exactly one primary
//   uiModuleTabs   underline tab row with count badges (active tab kept in the URL by the page)
//   uiSummaryCards auto-fit stat cards; a card with `action` becomes a filter button
//   uiFilterBar    section title + segmented control + search + extra buttons (Export)
//   uiStatusChips  pill filter buttons with dot + count; the active one is filled
//   uiDataTable    sortable headers, doc/amount cells, selected row, empty state, pager footer
//   uiDetailPanel  right-hand record panel: eyebrow/title/pill, fields, lines, note, actions
//   uiPill / uiDot status tones (green, blue, amber, orange, red, slate, accent)

/** @typedef {"green" | "blue" | "amber" | "orange" | "red" | "slate" | "accent"} UiTone */
/** @typedef {Record<string, string | number | boolean | null | undefined>} UiAttrs */
/** @typedef {{ label: string, value: string | number, sub?: string, tone?: UiTone, action?: UiAttrs, active?: boolean }} UiCard */
/** @typedef {{ key: string, label: string, count?: number }} UiTab */
/** @typedef {{ key: string, label: string, count: number, tone?: UiTone | "all" }} UiChip */
/** @typedef {{ value: string, label: string }} UiOption */
/** @typedef {{ key: string, label: string, align?: "left" | "right", sortable?: boolean, className?: string }} UiCol */
/** @typedef {{ id: string, cells: string[], selected?: boolean, focus?: string, focusText?: string }} UiRow */
/** @typedef {{ label: string, value: string, mono?: boolean, wide?: boolean, sub?: string }} UiField */
/** @typedef {{ left: string, sub?: string, right?: string, tone?: UiTone }} UiLine */
/**
 * @typedef {{
 *   eyebrow: string, title: string, pill?: { text: string, tone: UiTone }, closeAttrs: UiAttrs, label: string,
 *   fields: UiField[], linesTitle?: string, lines?: UiLine[], total?: { label: string, value: string },
 *   note?: { text: string, tone: UiTone }, actions: string[], extra?: string, top?: string
 * }} UiDetail
 */

const UI_TONES = /** @type {(string | undefined)[]} */ (["green", "blue", "amber", "orange", "red", "slate", "accent"]);

/** @param {string | undefined} tone @returns {UiTone} */
function uiTone(tone) { return /** @type {UiTone} */ (UI_TONES.includes(tone) ? tone : "slate"); }

/** Builds ` data-a="b"` style attributes; null/undefined/false are skipped, true is a bare flag. @param {UiAttrs | undefined} attrs */
function uiAttrs(attrs) {
  if (!attrs) return "";
  return Object.entries(attrs).map(([name, value]) => {
    if (value === null || value === undefined || value === false) return "";
    return value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }).join("");
}

/** @param {UiTone | "all" | undefined} tone */
function uiDot(tone) { return `<span class="ui-dot t-${tone === "all" ? "all" : uiTone(tone)}" aria-hidden="true"></span>`; }

/** @param {string} text @param {UiTone | undefined} tone */
function uiPill(text, tone) { return `<span class="ui-pill t-${uiTone(tone)}">${uiDot(tone)}${escapeHtml(text)}</span>`; }

/**
 * @param {string} label
 * @param {UiAttrs} [attrs]
 * @param {{ primary?: boolean, danger?: boolean, size?: "" | "sm" | "xs", disabled?: boolean, ariaLabel?: string }} [options]
 */
function uiButton(label, attrs, { primary = false, danger = false, size = "", disabled = false, ariaLabel = "" } = {}) {
  const cls = ["ui-btn", primary ? "primary" : "", danger ? "danger" : "", size].filter(Boolean).join(" ");
  return `<button class="${cls}" type="button"${uiAttrs(attrs)}${disabled ? " disabled" : ""}${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${escapeHtml(label)}</button>`;
}

/** @param {{ title: string, description: string, secondary?: string, primary?: string, extra?: string }} options */
function uiPageHeader({ title, description, secondary = "", primary = "", extra = "" }) {
  return `<div class="ui-page-header"><div class="ui-title"><div class="ui-title-row"><h1 class="ui-h1">${escapeHtml(title)}</h1>${extra}</div><p class="ui-desc">${escapeHtml(description)}</p></div><div class="ui-actions">${secondary}${primary}</div></div>`;
}

/** @param {{ tabs: UiTab[], active: string, attr: string }} options */
function uiModuleTabs({ tabs, active, attr }) {
  return tabs.map((tab) => {
    const on = tab.key === active;
    const count = tab.count === undefined ? "" : `<span class="ui-count${tab.count > 0 ? " has" : ""}">${tab.count}</span>`;
    return `<button class="ui-tab" type="button" role="tab" ${attr}="${escapeHtml(tab.key)}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${escapeHtml(tab.label)}${count}</button>`;
  }).join("");
}

/** @param {UiCard[]} cards */
function uiSummaryCards(cards) {
  return cards.map((card) => {
    const inner = `<span class="ui-stat-label">${uiDot(card.tone || "accent")}${escapeHtml(card.label)}</span><span class="ui-stat-value">${escapeHtml(String(card.value))}</span>${card.sub ? `<span class="ui-stat-sub">${escapeHtml(card.sub)}</span>` : ""}`;
    return card.action
      ? `<button class="ui-card ui-stat is-action" type="button"${uiAttrs(card.action)} aria-pressed="${Boolean(card.active)}">${inner}</button>`
      : `<div class="ui-card ui-stat">${inner}</div>`;
  }).join("");
}

/**
 * @param {{
 *   title: string,
 *   segment?: { label: string, attr: string, options: UiOption[], active: string },
 *   search?: { id: string, value: string, placeholder: string, label: string },
 *   extra?: string
 * }} options
 */
function uiFilterBar({ title, segment, search, extra = "" }) {
  const seg = segment && segment.options.length > 1
    ? `<div class="ui-seg" role="group" aria-label="${escapeHtml(segment.label)}">${segment.options.map((option) => `<button type="button" ${segment.attr}="${escapeHtml(option.value)}" aria-pressed="${option.value === segment.active}">${escapeHtml(option.label)}</button>`).join("")}</div>`
    : "";
  const searchHtml = search
    ? `<label class="ui-search"><span class="sr-only">${escapeHtml(search.label)}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5"/></svg><input id="${escapeHtml(search.id)}" type="search" autocomplete="off" placeholder="${escapeHtml(search.placeholder)}" value="${escapeHtml(search.value)}" /></label>`
    : "";
  return `<div class="ui-filterbar"><h3 class="ui-h2">${escapeHtml(title)}</h3><div class="ui-toolbar">${seg}${searchHtml}${extra}</div></div>`;
}

/** @param {{ chips: UiChip[], active: string, attr: string, label: string }} options */
function uiStatusChips({ chips, active, attr, label }) {
  return `<div class="ui-chips" role="group" aria-label="${escapeHtml(label)}">${chips.map((chip) => `<button class="ui-chip" type="button" ${attr}="${escapeHtml(chip.key)}" aria-pressed="${chip.key === active}">${uiDot(chip.tone || "all")}${escapeHtml(chip.label)} <span class="n">${chip.count}</span></button>`).join("")}</div>`;
}

// ----- table cells -----
/** A monospace document number that selects its row. @param {string} text @param {UiAttrs} selectAttrs @param {string} [sub] @param {{ plain?: boolean }} [options] */
function uiCellDoc(text, selectAttrs, sub = "", { plain = false } = {}) {
  return `<button class="ui-doc${plain ? " plain" : ""}" type="button"${uiAttrs(selectAttrs)}>${escapeHtml(text)}</button>${sub ? `<div class="ui-sub">${escapeHtml(sub)}</div>` : ""}`;
}
/** @param {string} text @param {string} [sub] @param {{ strong?: boolean, mono?: boolean, subTone?: UiTone }} [options] */
function uiCellText(text, sub = "", { strong = false, mono = false, subTone } = {}) {
  const cls = [strong ? "ui-strong" : "", mono ? "mono" : ""].filter(Boolean).join(" ");
  return `<div${cls ? ` class="${cls}"` : ""}>${escapeHtml(text)}</div>${sub ? `<div class="ui-sub${subTone ? ` tone-${subTone}` : ""}">${escapeHtml(sub)}</div>` : ""}`;
}
/** @param {string | number} value */
function uiCellNum(value) { return `<span class="ui-num">${escapeHtml(String(value))}</span>`; }

/**
 * @param {{
 *   cols: UiCol[], rows: UiRow[], caption: string, minWidth?: number, compact?: boolean,
 *   sort?: { key: string, dir: number }, sortAttr?: string,
 *   empty: { title: string, text: string, clearAttrs?: UiAttrs },
 *   foot: { shown: number, total: number, page: number, pageCount: number, pageAttr: string, note?: string },
 *   after?: string, totals?: string[]
 * }} options
 */
function uiDataTable({ cols, rows, caption, minWidth = 900, compact = false, sort, sortAttr = "", empty, foot, after = "", totals }) {
  const head = cols.map((col) => {
    const right = col.align === "right";
    const cls = [right ? "num" : "", col.className || ""].filter(Boolean).join(" ");
    if (!col.sortable || !sortAttr || !col.label) return `<th scope="col"${cls ? ` class="${cls}"` : ""}>${col.label ? escapeHtml(col.label) : `<span class="sr-only">Actions</span>`}</th>`;
    const active = sort?.key === col.key;
    const ariaSort = active ? (sort?.dir === 1 ? "ascending" : "descending") : "none";
    return `<th scope="col"${cls ? ` class="${cls}"` : ""} aria-sort="${ariaSort}"><button type="button" ${sortAttr}="${escapeHtml(col.key)}">${escapeHtml(col.label)}${active ? (sort?.dir === 1 ? " ↑" : " ↓") : ""}</button></th>`;
  }).join("");
  const body = rows.map((row) => `<tr class="${row.selected ? "sel" : ""}" data-focus-record="${escapeHtml(row.focus ?? row.id)}"${row.focusText ? ` data-focus-text="${escapeHtml(row.focusText)}"` : ""}>${row.cells.map((cell, index) => {
    const col = cols[index];
    const cls = [col?.align === "right" ? "num" : "", col?.className || ""].filter(Boolean).join(" ");
    return `<td${cls ? ` class="${cls}"` : ""}>${cell}</td>`;
  }).join("")}</tr>`).join("");
  const totalsRow = totals?.length ? `<tfoot><tr>${totals.map((cell, index) => `<td${cols[index]?.align === "right" ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr></tfoot>` : "";
  const tableHtml = rows.length
    ? `<div class="ui-table-scroll"><table class="ui-table${compact ? " compact" : ""}" style="min-width:${Number(minWidth) || 0}px"><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${totalsRow}</table></div>`
    : `<div class="ui-empty"><strong>${escapeHtml(empty.title)}</strong><span>${escapeHtml(empty.text)}</span>${empty.clearAttrs ? uiButton("Clear filters", empty.clearAttrs, { size: "sm" }) : ""}</div>`;
  const pageText = foot.pageCount > 1 ? ` · page ${foot.page + 1} of ${foot.pageCount}` : "";
  const footHtml = `<div class="ui-foot"><span>Showing ${foot.shown} of ${foot.total}${pageText}${foot.note ? ` · ${escapeHtml(foot.note)}` : ""}</span><div class="ui-pager">${uiButton("Previous", { [foot.pageAttr]: "prev" }, { size: "xs", disabled: foot.page <= 0 })}${uiButton("Next", { [foot.pageAttr]: "next" }, { size: "xs", disabled: foot.page >= foot.pageCount - 1 })}</div></div>`;
  return `<div class="ui-card ui-table-card">${tableHtml}${footHtml}${after}</div>`;
}

const UI_CLOSE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

/** A titled list of detail lines with an optional total row (used inside detail panels). @param {string} title @param {UiLine[]} lines @param {{ label: string, value: string }} [total] @param {string} [emptyText] */
function uiLines(title, lines, total, emptyText = "") {
  if (!lines.length && !emptyText) return "";
  const list = lines.length
    ? `<ul>${lines.map((line) => `<li>${uiDot(line.tone || "slate")}<div class="grow"><strong>${escapeHtml(line.left)}</strong>${line.sub ? `<small>${escapeHtml(line.sub)}</small>` : ""}</div>${line.right ? `<b class="ui-num">${escapeHtml(line.right)}</b>` : ""}</li>`).join("")}</ul>`
    : `<p class="ui-muted">${escapeHtml(emptyText)}</p>`;
  return `<div class="ui-lines"><h4>${escapeHtml(title)}</h4>${list}${total ? `<div class="ui-lines-total"><span>${escapeHtml(total.label)}</span><b class="ui-num">${escapeHtml(total.value)}</b></div>` : ""}</div>`;
}

/** Received → Deposited → Cleared/Bounced style progress for a detail panel. @param {{ label: string, state: "done" | "current" | "todo" | "bad" }[]} steps */
function uiSteps(steps) {
  return `<ol class="ui-steps">${steps.map((step) => `<li class="is-${step.state}"><span class="bar" aria-hidden="true"></span><span class="label">${escapeHtml(step.label)}</span></li>`).join("")}</ol>`;
}

/** Inner HTML for an `<aside class="ui-card ui-detail">`. @param {UiDetail} detail */
function uiDetailPanel(detail) {
  const fields = detail.fields.map((field) => `<div${field.wide ? ` class="wide"` : ""}><dt>${escapeHtml(field.label)}</dt><dd${field.mono ? ` class="mono break"` : ""}>${escapeHtml(field.value || "—")}${field.sub ? `<small>${escapeHtml(field.sub)}</small>` : ""}</dd></div>`).join("");
  const lines = detail.lines?.length ? uiLines(detail.linesTitle || "Items", detail.lines, detail.total) : "";
  const note = detail.note?.text ? `<p class="ui-note t-${uiTone(detail.note.tone)}">${escapeHtml(detail.note.text)}</p>` : "";
  const actions = detail.actions.length ? `<div class="ui-detail-actions">${detail.actions.join("")}</div>` : "";
  return `<div class="ui-detail-head"><div><span class="ui-eyebrow mono">${escapeHtml(detail.eyebrow)}</span><h3>${escapeHtml(detail.title)}</h3>${detail.pill ? uiPill(detail.pill.text, detail.pill.tone) : ""}</div><button class="ui-icon-btn" type="button"${uiAttrs(detail.closeAttrs)} aria-label="Close details" title="Close">${UI_CLOSE_ICON}</button></div>
    ${detail.top || ""}<dl class="ui-dl">${fields}</dl>${lines}${detail.extra || ""}${note}${actions}`;
}

/**
 * Re-styles an existing action cell (buttons built by the older table code, which carry the
 * data-* attributes the app's delegated handlers already understand) for the new layout. Returns
 * each button as a `ui-btn` (the first one primary unless it is destructive) and any waiting
 * notes (`<small>` text) separately, so a page can show "Awaiting approval" instead of a button.
 * @param {string} html
 * @param {{ size?: "" | "sm" | "xs", primaryFirst?: boolean }} [options]
 * @returns {{ buttons: string[], notes: string[] }}
 */
function uiAdoptActions(html, { size = "", primaryFirst = true } = {}) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  const buttons = Array.from(template.content.querySelectorAll("button")).map((button, index) => {
    const danger = button.classList.contains("danger-button");
    button.className = ["ui-btn", danger ? "danger" : "", index === 0 && primaryFirst && !danger ? "primary" : "", size].filter(Boolean).join(" ");
    button.type = "button";
    return button.outerHTML;
  });
  const notes = Array.from(template.content.querySelectorAll("small")).map((el) => String(el.textContent || "").trim()).filter(Boolean);
  if (!buttons.length && !notes.length) {
    const text = String(template.content.textContent || "").trim();
    if (text) notes.push(text);
  }
  return { buttons, notes };
}

/** Replaces `host` contents, keeping keyboard focus and caret in a re-rendered search box. @param {Element | null} host @param {string} html */
function uiRender(host, html) {
  if (!host) return;
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement instanceof HTMLInputElement && host.contains(document.activeElement) ? document.activeElement : null);
  const focusId = active?.id || "";
  const caret = active ? [active.selectionStart, active.selectionEnd] : null;
  host.innerHTML = html;
  if (!focusId) return;
  const again = /** @type {HTMLInputElement | null} */ (host.querySelector(`#${CSS.escape(focusId)}`));
  if (!again) return;
  again.focus();
  if (caret && caret[0] !== null) { try { again.setSelectionRange(caret[0], caret[1]); } catch { /* not a text input */ } }
}

/** Sorts rows by `values[key]`; blanks always sort last. @template {{ sortValues: Record<string, string | number | null> }} T @param {T[]} rows @param {{ key: string, dir: number }} sort @returns {T[]} */
function uiSortRows(rows, sort) {
  return rows.slice().sort((a, b) => {
    const x = a.sortValues[sort.key] ?? null;
    const y = b.sortValues[sort.key] ?? null;
    if (x === y) return 0;
    if (x === null || x === "") return 1;
    if (y === null || y === "") return -1;
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    return result * sort.dir;
  });
}

/** "12 Nov 2026" from an ISO-ish date string; anything else is returned unchanged. @param {string | undefined} value */
function uiDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return String(value || "") || "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

// ----- Tab view: one module tab = summary cards + filter bar + chips + table + detail panel -----
// A page describes a tab as a UiView (built from its real records) and keeps a UiViewState; the
// helpers below draw it, filter/sort/page it, mirror it to the URL and handle its clicks. Every
// control carries `data-<prefix>-…` so several views can live on one page.
/**
 * @typedef {{
 *   id: string, cells: string[], search: string, branches: string[], scopes: string[],
 *   sortValues: Record<string, string | number | null>, csv: (string | number)[], detail: () => UiDetail
 * }} UiViewRow
 */
/** @typedef {{ key: string, label: string, tone?: UiTone, onlyWhenActive?: boolean }} UiViewChip */
/**
 * @typedef {{
 *   title: string, intro: string, placeholder: string, actions: string[], stats: (UiCard & { scope?: string })[],
 *   cols: UiCol[], csvHeader: string[], csvName: string, rows: UiViewRow[], empty: [string, string], minWidth: number,
 *   defaultSort: { key: string, dir: number }, chips: UiViewChip[], defaultScope: string,
 *   branchOptions?: UiOption[] | null, toolbarExtra?: string, before?: string, after?: (lastPage: boolean) => string,
 *   extraFilter?: (row: UiViewRow) => boolean, filtersOn?: boolean, totals?: (rows: UiViewRow[]) => string[]
 * }} UiView
 */
/** @typedef {{ q: string, sel: string, sort: { key: string, dir: number } | null, page: number, branch: string, scope: string, touched?: boolean }} UiViewState */

/** @returns {UiViewState} */
function uiBlankViewState() { return { q: "", sel: "", sort: null, page: 0, branch: "all", scope: "" }; }

/** Reads a view state from URL params (q, sel, sort, dir, page, branch, status). @param {URLSearchParams} params @returns {UiViewState} */
function uiViewStateFromQuery(params) {
  const sort = params.get("sort");
  return {
    q: params.get("q") || "",
    sel: params.get("sel") || "",
    sort: sort ? { key: sort, dir: params.get("dir") === "asc" ? 1 : -1 } : null,
    page: Math.max(0, (Number(params.get("page")) || 1) - 1),
    branch: params.get("branch") || "all",
    scope: params.get("status") || "",
  };
}
/** @param {URLSearchParams} params @param {UiViewState} state */
function uiViewStateToQuery(params, state) {
  if (state.branch !== "all") params.set("branch", state.branch);
  if (state.scope) params.set("status", state.scope);
  if (state.q) params.set("q", state.q);
  if (state.sort) { params.set("sort", state.sort.key); params.set("dir", state.sort.dir === 1 ? "asc" : "desc"); }
  if (state.page > 0) params.set("page", String(state.page + 1));
  if (state.sel) params.set("sel", state.sel);
}

/** The view's rows after branch / chip / search filters, sorted. @param {UiView} view @param {UiViewState} state */
function uiViewRows(view, state) {
  const scope = state.scope || view.defaultScope;
  const needle = state.q.trim().toLowerCase();
  const filtered = view.rows
    .filter((row) => state.branch === "all" || row.branches.includes(state.branch))
    .filter((row) => !scope || scope === "all" || row.scopes.includes(scope))
    .filter((row) => !view.extraFilter || view.extraFilter(row))
    .filter((row) => !needle || row.search.toLowerCase().includes(needle));
  return uiSortRows(filtered, state.sort || view.defaultSort);
}

/** @param {UiView} view @param {UiViewState} state @param {string} prefix @param {number} [pageSize] */
function uiViewHtml(view, state, prefix, pageSize = 25) {
  const attr = (/** @type {string} */ name) => `data-${prefix}-${name}`;
  const scope = state.scope || view.defaultScope;
  const branchRows = view.rows.filter((row) => state.branch === "all" || row.branches.includes(state.branch));
  const sorted = uiViewRows(view, state);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  state.page = Math.min(Math.max(state.page, 0), pageCount - 1);
  if (state.sel && !state.touched) { // keep a deep-linked / just-selected record on screen
    const at = sorted.findIndex((row) => row.id === state.sel);
    if (at >= 0) state.page = Math.floor(at / pageSize);
  }
  state.touched = false;
  const pageRows = sorted.slice(state.page * pageSize, (state.page + 1) * pageSize);
  const selected = view.rows.find((row) => row.id === state.sel);
  if (state.sel && !selected) state.sel = "";
  const detail = selected ? selected.detail() : null;
  const allChip = { key: view.defaultScope ? "all" : "", label: "All", count: branchRows.length, tone: /** @type {"all"} */ ("all") };
  /** @type {UiChip[]} */
  const chips = view.chips.length ? [
    ...(view.defaultScope ? [] : [allChip]),
    ...view.chips.map((chip) => ({ key: chip.key, label: chip.label, count: branchRows.filter((row) => row.scopes.includes(chip.key)).length, tone: chip.tone, hide: chip.onlyWhenActive && chip.key !== scope }))
      .filter((chip) => !chip.hide && (chip.count > 0 || chip.key === scope || chip.key === view.defaultScope))
      .map(({ key, label, count, tone }) => ({ key, label, count, tone })),
    ...(view.defaultScope ? [allChip] : []),
  ] : [];
  const filtersOn = Boolean(view.filtersOn || state.q || state.branch !== "all" || (state.scope && state.scope !== view.defaultScope));
  const stats = view.stats.map((card) => card.scope === undefined ? card : { ...card, action: { [attr("scope")]: card.scope }, active: scope === card.scope });
  const hasBranches = view.branchOptions && view.rows.some((row) => row.branches.some(Boolean));
  const hasExport = view.actions.some((action) => action.includes(attr("export")));
  return `${view.intro ? `<div class="ui-tab-intro"><div><h2 class="ui-h2">${escapeHtml(view.title)}</h2><p class="ui-desc">${escapeHtml(view.intro)}</p></div>${view.actions.length ? `<div class="ui-actions">${view.actions.join("")}</div>` : ""}</div>` : ""}`
    + (view.before || "")
    + (stats.length ? `<div class="ui-cards">${uiSummaryCards(stats)}</div>` : "")
    + uiFilterBar({
      title: view.title,
      segment: hasBranches && view.branchOptions ? { label: "Branch", attr: attr("branch"), options: view.branchOptions, active: state.branch } : undefined,
      search: { id: `${prefix}-search`, value: state.q, placeholder: view.placeholder, label: `Search ${view.title.toLowerCase()}` },
      extra: (view.toolbarExtra || "") + (hasExport ? "" : uiButton("Export", { [attr("export")]: "" }, { size: "sm" })),
    })
    + (chips.length ? uiStatusChips({ chips, active: scope, attr: attr("scope"), label: "Filter by status" }) : "")
    + `<div class="ui-body">${uiDataTable({
      cols: view.cols,
      rows: pageRows.map((row) => ({ id: row.id, cells: row.cells, selected: row.id === state.sel, focusText: row.search })),
      caption: view.title, minWidth: view.minWidth,
      sort: state.sort || view.defaultSort, sortAttr: attr("sort"),
      empty: filtersOn && view.rows.length ? { title: "Nothing matches these filters", text: "Try another branch or status, or clear the search.", clearAttrs: { [attr("clear")]: "" } } : { title: view.empty[0], text: view.empty[1] },
      foot: { shown: pageRows.length, total: sorted.length, page: state.page, pageCount, pageAttr: attr("page") },
      after: view.after ? view.after(state.page >= pageCount - 1) : "",
      totals: view.totals && sorted.length ? view.totals(sorted) : undefined,
    })}${detail ? `<aside class="ui-card ui-detail" id="${prefix}-detail" aria-label="${escapeHtml(detail.label)}">${uiDetailPanel(detail)}</aside>` : ""}</div>`;
}

/** Cell that selects its row, for a tab view. @param {string} prefix @param {string} id @returns {UiAttrs} */
function uiViewSelect(prefix, id) { return { [`data-${prefix}-select`]: id }; }

/**
 * Handles a click on a tab view's own controls. Returns true when it was one of them.
 * `extraReset` runs when filters are cleared (for page-specific filters such as a type toggle).
 * @param {Element} target @param {string} prefix
 * @param {{ state: () => UiViewState, view: () => UiView, render: () => void, extraReset?: () => void }} hooks
 */
function uiViewClick(target, prefix, { state, view, render, extraReset }) {
  const find = (/** @type {string} */ name) => /** @type {HTMLElement | null} */ (target.closest(`[data-${prefix}-${name}]`));
  const value = (/** @type {HTMLElement} */ el, /** @type {string} */ name) => el.getAttribute(`data-${prefix}-${name}`) || "";
  const s = state();
  const change = (/** @type {() => void} */ mutate, { resetPage = true, closeDetail = false } = {}) => { mutate(); if (resetPage) s.page = 0; if (closeDetail) s.sel = ""; render(); return true; };
  let el;
  if ((el = find("select"))) {
    const id = value(el, "select");
    change(() => { s.sel = s.sel === id ? "" : id; s.touched = true; }, { resetPage: false });
    document.getElementById(`${prefix}-detail`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return true;
  }
  if (find("close")) return change(() => {}, { resetPage: false, closeDetail: true });
  if ((el = find("branch"))) { const branch = value(el, "branch"); return change(() => { s.branch = branch; }); }
  if ((el = find("scope"))) { const scope = value(el, "scope"); return change(() => { s.scope = scope; }); }
  if ((el = find("sort"))) {
    const key = value(el, "sort");
    const current = s.sort || view().defaultSort;
    return change(() => { s.sort = { key, dir: current.key === key ? -current.dir : 1 }; });
  }
  if ((el = find("page"))) { const next = value(el, "page") === "next"; return change(() => { s.page += next ? 1 : -1; s.touched = true; }, { resetPage: false }); }
  if (find("clear")) return change(() => { s.q = ""; s.branch = "all"; s.scope = ""; extraReset?.(); }, { closeDetail: true });
  if (find("export")) { uiExportView(view(), s); return true; }
  return false;
}

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const uiViewSearchTimers = {};
/** Debounced search for a tab view; call from an `input` listener. Returns true when handled. @param {Element} input @param {string} prefix @param {() => UiViewState} state @param {() => void} render */
function uiViewSearch(input, prefix, state, render) {
  if (!(input instanceof HTMLInputElement) || input.id !== `${prefix}-search`) return false;
  clearTimeout(uiViewSearchTimers[prefix]);
  const value = input.value;
  uiViewSearchTimers[prefix] = setTimeout(() => { const s = state(); s.q = value; s.page = 0; render(); }, 150);
  return true;
}

/** CSV of a view's filtered rows. @param {UiView} view @param {UiViewState} state */
function uiExportView(view, state) {
  const rows = uiViewRows(view, state);
  if (!rows.length) return toast("Nothing in the current view to export.");
  downloadCsv(view.csvName, [view.csvHeader, ...rows.map((row) => row.csv.map((cell) => String(cell ?? "")))]);
  log(`Exported ${view.title} (CSV)`, view.csvName.split("-")[0].replace(/^./, (c) => c.toUpperCase()), `${rows.length} records`, { save: false });
}

// ----- Management / dashboard building blocks ----------------------------------------------------
//   uiWorkflowAssistant one-row recommendations strip (collapsed by default, "Show all" expands)
//   uiKpiCards          KPI cards: dotted label, 28px value, change pill (good/bad/neutral), sub-line
//   uiDashboardGrid     rows of 1- or 2-unit cards that wrap; each may end with a Takeaway + → link
//   uiBarChart          vertical bars (1 or 2 series), 3 gridlines, partial last period, optional Net row
//   uiHBars             horizontal bar list with an optional black target/budget marker
//   uiStackBar          one segmented bar with a legend
//   uiInsightList       dot + bold title + text + optional action, for "Needs your decision" lists

/**
 * A recommendation for the Workflow assistant. `attrs` are data-* attributes the app's delegated
 * click handlers understand (usually `data-workflow-action`).
 * @typedef {{ text: string, action: string, attrs: UiAttrs, tone?: UiTone, money?: number }} UiRec
 */

const UI_WA_ICON_WARN = "M12 9v4M12 16.5v.01M12 3l9.5 17h-19z";
const UI_WA_ICON_OK = "M5 12l5 5L20 7";

/** @param {{ key: string, recs: UiRec[], open: boolean }} options */
function uiWorkflowAssistant({ key, recs, open }) {
  const n = recs.length;
  const expanded = open && n > 0;
  const summary = n ? `${recs[0].text}${n > 1 ? `  ·  +${n - 1} more` : ""}` : "All clear — no urgent tasks for this module.";
  const icon = `<span class="ui-wa-icon${n ? " warn" : " ok"}" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${n ? UI_WA_ICON_WARN : UI_WA_ICON_OK}"/></svg></span>`;
  const toggle = n
    ? `<button class="ui-wa-toggle" type="button" data-wa-toggle="${escapeHtml(key)}" aria-expanded="${expanded}" aria-controls="ui-wa-list-${escapeHtml(key)}">${expanded ? "Hide" : "Show all"}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${expanded ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}"/></svg></button>`
    : "";
  const list = expanded
    ? `<div class="ui-wa-list" id="ui-wa-list-${escapeHtml(key)}">${recs.map((rec) => `<div class="ui-wa-rec">${uiDot(rec.tone || "amber")}<span class="ui-wa-text">${escapeHtml(rec.text)}</span>${rec.action ? uiButton(rec.action, rec.attrs, { size: "xs" }) : ""}</div>`).join("")}</div>`
    : "";
  return `<section class="ui-wa" aria-label="Workflow assistant"><div class="ui-wa-row">${icon}<span class="ui-wa-label">Workflow assistant</span><span class="ui-wa-summary" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span><span class="ui-wa-count${n ? " warn" : " ok"}">${n} recommendation${n === 1 ? "" : "s"}</span>${toggle}</div>${list}</section>`;
}

/** @typedef {{ text: string, good?: boolean | null }} UiChange good: true = green, false = red, null/undefined = grey */
/** @typedef {{ label: string, value: string, tone?: UiTone, change?: UiChange | null, sub?: string, title?: string }} UiKpi */

/** @param {UiKpi[]} kpis */
function uiKpiCards(kpis) {
  return `<div class="ui-kpis">${kpis.map((kpi) => {
    const change = kpi.change?.text ? `<span class="ui-change ${kpi.change.good === true ? "good" : kpi.change.good === false ? "bad" : "neutral"}">${escapeHtml(kpi.change.text)}</span>` : "";
    return `<div class="ui-card ui-kpi"${kpi.title ? ` title="${escapeHtml(kpi.title)}"` : ""}><span class="ui-stat-label">${uiDot(kpi.tone || "accent")}${escapeHtml(kpi.label)}</span><span class="ui-kpi-value-row"><span class="ui-kpi-value ui-num">${escapeHtml(kpi.value)}</span>${change}</span>${kpi.sub ? `<span class="ui-stat-sub">${escapeHtml(kpi.sub)}</span>` : ""}</div>`;
  }).join("")}</div>`;
}

/** @typedef {{ span?: 1 | 2, title: string, sub?: string, body: string, takeaway?: string, link?: { label: string, attrs: UiAttrs } }} UiDashCard */

/** @param {UiDashCard[][]} rows */
function uiDashboardGrid(rows) {
  return `<div class="ui-dash">${rows.filter((row) => row.length).map((row) => `<div class="ui-dash-row">${row.map((card) => {
    const foot = card.takeaway || card.link
      ? `<div class="ui-dash-foot">${card.takeaway ? `<p><strong>Takeaway:</strong> ${escapeHtml(card.takeaway)}</p>` : ""}${card.link ? `<button class="ui-link" type="button"${uiAttrs(card.link.attrs)}>${escapeHtml(card.link.label)} →</button>` : ""}</div>`
      : "";
    return `<article class="ui-card ui-dash-card span-${card.span === 2 ? 2 : 1}"><header><h3>${escapeHtml(card.title)}</h3>${card.sub ? `<p>${escapeHtml(card.sub)}</p>` : ""}</header><div class="ui-dash-body">${card.body}</div>${foot}</article>`;
  }).join("")}</div>`).join("")}</div>`;
}

const UI_SERIES_ONE = "#1F5F74";
const UI_SERIES_TWO = ["#2a78d6", "#eb6834"];

/**
 * @param {{
 *   labels: string[], series: { name: string, values: number[] }[], format: (value: number) => string,
 *   partialLast?: boolean, net?: number[], caption: string, height?: number
 * }} options
 */
function uiBarChart({ labels, series, format, partialLast = false, net, caption, height = 180 }) {
  const values = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const max = Math.max(0, ...values);
  if (!labels.length || max <= 0) return `<p class="ui-muted">No data for this period yet.</p>`;
  const step = uiNiceStep(max / 3);
  const top = step * 3;
  const colors = series.length === 1 ? [UI_SERIES_ONE] : UI_SERIES_TWO;
  const last = labels.length - 1;
  const groups = labels.map((label, index) => {
    const partial = partialLast && index === last;
    const bars = series.map((s, si) => {
      const value = Number(s.values[index] || 0);
      const pct = top ? Math.max(0, (value / top) * 100) : 0;
      return `<span class="ui-bar${partial ? " partial" : ""}" style="height:${pct.toFixed(2)}%;background:${colors[si] || colors[0]}" title="${escapeHtml(`${s.name} · ${label}${partial ? " (in progress)" : ""}: ${format(value)}`)}"></span>`;
    }).join("");
    return `<div class="ui-bar-group"><div class="ui-bar-stack">${bars}</div><span class="ui-bar-label">${escapeHtml(label)}${partial ? "*" : ""}</span></div>`;
  }).join("");
  const grid = [3, 2, 1].map((i) => `<span class="ui-grid-line" style="bottom:${(i / 3) * 100}%"><em>${escapeHtml(format(step * i))}</em></span>`).join("");
  const legend = series.length > 1 ? `<div class="ui-legend">${series.map((s, i) => `<span><i style="background:${colors[i]}"></i>${escapeHtml(s.name)}</span>`).join("")}</div>` : "";
  const netRow = net ? `<div class="ui-net-row"><span class="ui-net-head">Net</span>${net.map((value) => `<span class="ui-num ${value < 0 ? "neg" : ""}">${escapeHtml(format(value))}</span>`).join("")}</div>` : "";
  const note = partialLast ? `<p class="ui-chart-note">* In progress</p>` : "";
  const table = `<table class="sr-only"><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col">Period</th>${series.map((s) => `<th scope="col">${escapeHtml(s.name)}</th>`).join("")}${net ? `<th scope="col">Net</th>` : ""}</tr></thead><tbody>${labels.map((label, i) => `<tr><th scope="row">${escapeHtml(label)}${partialLast && i === last ? " (in progress)" : ""}</th>${series.map((s) => `<td>${escapeHtml(format(Number(s.values[i] || 0)))}</td>`).join("")}${net ? `<td>${escapeHtml(format(net[i] || 0))}</td>` : ""}</tr>`).join("")}</tbody></table>`;
  return `<figure class="ui-chart">${legend}<div class="ui-bars" style="height:${height}px" aria-hidden="true">${grid}${groups}</div>${netRow}${note}${table}</figure>`;
}

/** Rounds a gridline step up to 1, 2, 2.5 or 5 × a power of ten. @param {number} raw */
function uiNiceStep(raw) {
  if (!(raw > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * pow;
}

/** @typedef {{ label: string, value: number, display: string, target?: number, sub?: string, tone?: UiTone }} UiHBar */

/** @param {{ items: UiHBar[], caption: string, targetLabel?: string }} options */
function uiHBars({ items, caption, targetLabel = "Target" }) {
  if (!items.length) return `<p class="ui-muted">Nothing to show yet.</p>`;
  const max = Math.max(...items.map((item) => Math.max(item.value, item.target || 0)), 0) || 1;
  const rows = items.map((item) => {
    const marker = item.target ? `<span class="ui-hbar-target" style="left:${((item.target / max) * 100).toFixed(2)}%" title="${escapeHtml(`${targetLabel}: ${item.target}`)}"></span>` : "";
    const color = item.tone ? `var(--ui-${uiTone(item.tone)})` : UI_SERIES_ONE;
    return `<li><div class="ui-hbar-head"><span class="ui-hbar-label">${escapeHtml(item.label)}</span><b class="ui-num">${escapeHtml(item.display)}</b></div><div class="ui-hbar-track" title="${escapeHtml(`${item.label}: ${item.display}`)}"><span style="width:${((Math.max(0, item.value) / max) * 100).toFixed(2)}%;background:${color}"></span>${marker}</div>${item.sub ? `<small>${escapeHtml(item.sub)}</small>` : ""}</li>`;
  }).join("");
  const legend = items.some((item) => item.target) ? `<div class="ui-legend"><span><i class="marker"></i>${escapeHtml(targetLabel)}</span></div>` : "";
  return `<figure class="ui-chart"><ul class="ui-hbars" aria-label="${escapeHtml(caption)}">${rows}</ul>${legend}</figure>`;
}

/** @param {{ segments: { label: string, value: number, display: string, tone: UiTone }[], caption: string }} options */
function uiStackBar({ segments, caption }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (!total) return `<p class="ui-muted">Nothing to show yet.</p>`;
  const bar = segments.filter((s) => s.value > 0).map((s) => `<span style="width:${((s.value / total) * 100).toFixed(2)}%;background:var(--ui-${uiTone(s.tone)})" title="${escapeHtml(`${s.label}: ${s.display}`)}"></span>`).join("");
  return `<figure class="ui-chart"><div class="ui-stack" role="img" aria-label="${escapeHtml(`${caption}: ${segments.map((s) => `${s.label} ${s.display}`).join(", ")}`)}">${bar}</div><ul class="ui-stack-legend">${segments.map((s) => `<li>${uiDot(s.tone)}<span>${escapeHtml(s.label)}</span><b class="ui-num">${escapeHtml(s.display)}</b></li>`).join("")}</ul></figure>`;
}

/** @typedef {{ title: string, text: string, tone?: UiTone, action?: { label: string, attrs: UiAttrs }, money?: number }} UiInsight */

/** Items are shown in the order given; decision lists should be pre-sorted by money at stake. @param {UiInsight[]} items @param {string} [emptyText] */
function uiInsightList(items, emptyText = "Nothing needs your attention here.") {
  if (!items.length) return `<p class="ui-muted">${escapeHtml(emptyText)}</p>`;
  return `<ul class="ui-insights">${items.map((item) => `<li>${uiDot(item.tone || "amber")}<div class="grow"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>${item.action ? uiButton(item.action.label, item.action.attrs, { size: "xs" }) : ""}</li>`).join("")}</ul>`;
}

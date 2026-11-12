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
 *   note?: { text: string, tone: UiTone }, actions: string[], extra?: string
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
 *   after?: string
 * }} options
 */
function uiDataTable({ cols, rows, caption, minWidth = 900, compact = false, sort, sortAttr = "", empty, foot, after = "" }) {
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
  const tableHtml = rows.length
    ? `<div class="ui-table-scroll"><table class="ui-table${compact ? " compact" : ""}" style="min-width:${Number(minWidth) || 0}px"><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    : `<div class="ui-empty"><strong>${escapeHtml(empty.title)}</strong><span>${escapeHtml(empty.text)}</span>${empty.clearAttrs ? uiButton("Clear filters", empty.clearAttrs, { size: "sm" }) : ""}</div>`;
  const pageText = foot.pageCount > 1 ? ` · page ${foot.page + 1} of ${foot.pageCount}` : "";
  const footHtml = `<div class="ui-foot"><span>Showing ${foot.shown} of ${foot.total}${pageText}${foot.note ? ` · ${escapeHtml(foot.note)}` : ""}</span><div class="ui-pager">${uiButton("Previous", { [foot.pageAttr]: "prev" }, { size: "xs", disabled: foot.page <= 0 })}${uiButton("Next", { [foot.pageAttr]: "next" }, { size: "xs", disabled: foot.page >= foot.pageCount - 1 })}</div></div>`;
  return `<div class="ui-card ui-table-card">${tableHtml}${footHtml}${after}</div>`;
}

const UI_CLOSE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

/** Inner HTML for an `<aside class="ui-card ui-detail">`. @param {UiDetail} detail */
function uiDetailPanel(detail) {
  const fields = detail.fields.map((field) => `<div${field.wide ? ` class="wide"` : ""}><dt>${escapeHtml(field.label)}</dt><dd${field.mono ? ` class="mono break"` : ""}>${escapeHtml(field.value || "—")}${field.sub ? `<small>${escapeHtml(field.sub)}</small>` : ""}</dd></div>`).join("");
  const lines = detail.lines?.length
    ? `<div class="ui-lines"><h4>${escapeHtml(detail.linesTitle || "Items")}</h4><ul>${detail.lines.map((line) => `<li>${uiDot(line.tone || "slate")}<div class="grow"><strong>${escapeHtml(line.left)}</strong>${line.sub ? `<small>${escapeHtml(line.sub)}</small>` : ""}</div>${line.right ? `<b class="ui-num">${escapeHtml(line.right)}</b>` : ""}</li>`).join("")}</ul>${detail.total ? `<div class="ui-lines-total"><span>${escapeHtml(detail.total.label)}</span><b class="ui-num">${escapeHtml(detail.total.value)}</b></div>` : ""}</div>`
    : "";
  const note = detail.note?.text ? `<p class="ui-note t-${uiTone(detail.note.tone)}">${escapeHtml(detail.note.text)}</p>` : "";
  const actions = detail.actions.length ? `<div class="ui-detail-actions">${detail.actions.join("")}</div>` : "";
  return `<div class="ui-detail-head"><div><span class="ui-eyebrow mono">${escapeHtml(detail.eyebrow)}</span><h3>${escapeHtml(detail.title)}</h3>${detail.pill ? uiPill(detail.pill.text, detail.pill.tone) : ""}</div><button class="ui-icon-btn" type="button"${uiAttrs(detail.closeAttrs)} aria-label="Close details" title="Close">${UI_CLOSE_ICON}</button></div>
    <dl class="ui-dl">${fields}</dl>${lines}${detail.extra || ""}${note}${actions}`;
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

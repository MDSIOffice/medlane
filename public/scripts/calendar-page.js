// @ts-check
// ===== Calendar (module redesign, phase 7, 18 Nov 2026) ===========================================
// The team's shared schedule: only events people add (data.calendarEvents), including the ones an
// action adds for them (a Support Tracker visit, a Warranty PM booking). Month grid (Monday first,
// 6 weeks) with the selected day's events, and a Next 2 weeks agenda. Each event has a type and
// colour; tied to a module or branch, it only reaches people who can open it (the server filters,
// CalendarRules.visibleTo). "Subscribe (iCal)" gives each person a private read-only feed.

const CALENDAR_TAB_LABELS = /** @type {Record<string, string>} */ ({ month: "Month", agenda: "Next 2 weeks" });
const calendarSeed = moduleUrlSeed("calendar", Object.keys(CALENDAR_TAB_LABELS));
let calendarTab = calendarSeed.tab;
/** The month on screen ("YYYY-MM") and the selected day ("YYYY-MM-DD"). */
let calendarMonth = /^\d{4}-\d{2}$/.test(calendarSeed.params.get("month") || "") ? String(calendarSeed.params.get("month")) : fmtDate(today).slice(0, 7);
let calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(calendarSeed.params.get("day") || "") ? String(calendarSeed.params.get("day")) : fmtDate(today);
/** Event types switched off with the chips (per viewer, remembered in this browser). @type {Set<string>} */
const calendarHidden = (() => { try { return new Set(JSON.parse(localStorage.getItem("medlane.calendar.hidden") || "[]")); } catch { return new Set(); } })();
const CALENDAR_SOURCE_LABELS = /** @type {Record<string, string>} */ ({ "product-issues": "Support Tracker", warranty: "Warranty", sales: "Sales", inventory: "Inventory", collections: "Collections", payables: "Payables" });

/** Everyone signed in may add events (the server always grants the Calendar, view and edit). */
function calendarCanAdd() { return Boolean(currentUser); }
function calendarQueryString() {
  const p = new URLSearchParams({ section: "calendar" });
  if (calendarTab !== "month") p.set("tab", calendarTab);
  if (calendarMonth !== fmtDate(today).slice(0, 7)) p.set("month", calendarMonth);
  if (calendarDay !== fmtDate(today)) p.set("day", calendarDay);
  return p.toString();
}
/** Events this person may see (the server already filters; this keeps role preview honest). */
function calendarVisibleEvents() {
  const viewer = { role: String(currentUser?.role || ""), email: String(currentUser?.email || ""), modules: effectiveModules(), branch: String(currentUser?.branch || "all") };
  return (data.calendarEvents || []).filter((e) => CalendarRules.visibleTo(e, viewer));
}
/** Visible events minus the types switched off. */
function calendarShownEvents() { return calendarVisibleEvents().filter((e) => !calendarHidden.has(CalendarRules.typeOf(e))); }
/** @param {string} date */
function calendarDayLabel(date, { weekday = "long" } = {}) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-GB", { weekday: /** @type {any} */ (weekday), day: "numeric", month: "long", timeZone: "Asia/Manila" });
}
/** "Today", "Tomorrow" or "Fri 20 Nov". @param {string} date */
function calendarRelativeDay(date) {
  const t = fmtDate(today);
  if (date === t) return "Today";
  if (date === CalendarRules.addDays(t, 1)) return "Tomorrow";
  return calendarDayLabel(date, { weekday: "short" });
}
/** "Today", "Tomorrow", else the weekday ("Friday"). @param {string} date */
function calendarAgendaHeading(date) {
  const rel = calendarRelativeDay(date);
  return rel === "Today" || rel === "Tomorrow" ? rel : new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Manila" });
}
/** @param {string} color */
function calendarBar(color) { return `<span class="cal-bar" style="background:${escapeHtml(color)}" aria-hidden="true"></span>`; }

/** Where an event came from, as a link (Support ticket / Warranty unit). @param {CalendarEvent} event */
function calendarSourceLink(event) {
  const module = CalendarRules.moduleOf(event);
  const id = String(/** @type {any} */ (event).sourceId || "");
  if (!module || !id || !canViewModule(module)) return "";
  let goto = "";
  if (module === "product-issues") goto = `product-issues|${data.productIssues.some((r) => r.id === id && SupportRules.statusOf(r) === "Resolved") ? "resolved" : "open"}||${id}`;
  else if (module === "warranty") goto = `warranty|pm||${id}`;
  if (!goto) return "";
  return `<button type="button" class="ui-link" data-wa-goto="${escapeHtml(goto)}">Open in ${escapeHtml(CALENDAR_SOURCE_LABELS[module] || module)} →</button>`;
}
/** One event, in the day panel or the agenda. @param {CalendarEvent} event */
function calendarEventHtml(event) {
  const type = CalendarRules.typeInfo(CalendarRules.typeOf(event));
  const e = /** @type {any} */ (event);
  const when = e.allDay || !event.time ? "All day" : calendarTimeLabel(event.time);
  const detail = [e.note, e.assigneeName ? `For ${e.assigneeName}` : "", e.branch ? supportBranchLabel(String(e.branch)) : "", event.createdBy ? `Owner: ${event.createdBy}` : ""].filter(Boolean).map((s) => escapeHtml(String(s))).join(" · ");
  const remove = canChangeCalendarEvent(event) ? `<button type="button" class="ui-link cal-remove" data-cal-remove="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button>` : "";
  return `<li class="cal-event">${calendarBar(type.color)}<div class="cal-event-time">${escapeHtml(when)}</div><div class="cal-event-body">
    <div class="cal-event-head"><span class="cal-type" style="--cal-color:${type.color}">${escapeHtml(type.label)}</span><strong>${escapeHtml(event.title)}</strong></div>
    ${detail ? `<p>${detail}</p>` : ""}<div class="cal-event-links">${calendarSourceLink(event)}${remove}</div></div></li>`;
}

// ----- month ---------------------------------------------------------------------------------------
function calendarMonthHtml() {
  const [year, month] = calendarMonth.split("-").map(Number);
  const grid = CalendarRules.monthGrid(year, month);
  const visible = calendarVisibleEvents();
  const shown = visible.filter((e) => !calendarHidden.has(CalendarRules.typeOf(e)));
  const perDay = CalendarRules.byDate(shown, grid.map((d) => d.date));
  const t = fmtDate(today);
  const inMonth = visible.filter((e) => String(e.date).startsWith(calendarMonth));
  const title = new Date(`${calendarMonth}-01T00:00:00+08:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Manila" });
  const chips = CalendarRules.TYPES.map((type) => {
    const n = inMonth.filter((e) => CalendarRules.typeOf(e) === type.key).length;
    const on = !calendarHidden.has(type.key);
    return `<button type="button" class="cal-chip${on ? " is-on" : ""}" data-cal-type="${type.key}" aria-pressed="${on}" style="--cal-color:${type.color}"><span class="cal-chip-dot" aria-hidden="true"></span>${escapeHtml(type.label)}<span class="cal-chip-count">${n}</span></button>`;
  }).join("");
  const cells = grid.map((d) => {
    const list = perDay[d.date] || [];
    const chipsHtml = list.slice(0, 3).map((e) => { const type = CalendarRules.typeInfo(CalendarRules.typeOf(e)); return `<span class="cal-cell-event" style="--cal-color:${type.color}" title="${escapeHtml(`${e.allDay || !e.time ? "All day" : calendarTimeLabel(e.time)} · ${e.title}`)}">${escapeHtml(e.title)}</span>`; }).join("");
    const more = list.length > 3 ? `<span class="cal-more">+${list.length - 3} more</span>` : "";
    const cls = ["cal-cell", d.inMonth ? "" : "is-outside", d.weekend ? "is-weekend" : "", d.date === t ? "is-today" : "", d.date === calendarDay ? "is-selected" : "", d.date < t ? "is-past" : ""].filter(Boolean).join(" ");
    const label = `${calendarDayLabel(d.date)}${list.length ? `, ${plural(list.length, "event")}` : ""}`;
    return `<button type="button" class="${cls}" data-cal-day="${d.date}" aria-label="${escapeHtml(label)}" aria-pressed="${d.date === calendarDay}"><span class="cal-num">${d.day}</span>${chipsHtml}${more}</button>`;
  }).join("");
  const dayEvents = CalendarRules.sorted(shown.filter((e) => e.date === calendarDay));
  const hiddenThatDay = visible.filter((e) => e.date === calendarDay).length - dayEvents.length;
  return `<div class="cal-toolbar">
      <div class="cal-nav"><button type="button" class="ui-btn sm" data-cal-nav="-1" aria-label="Previous month">‹</button><h2 class="cal-title">${escapeHtml(title)}</h2><button type="button" class="ui-btn sm" data-cal-nav="1" aria-label="Next month">›</button><button type="button" class="ui-btn sm" data-cal-today="">Today</button></div>
      <div class="cal-chips" role="group" aria-label="Show event types">${chips}</div>
    </div>
    <div class="cal-layout">
      <div class="ui-card cal-month"><div class="cal-weekdays" aria-hidden="true">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span>${d}</span>`).join("")}</div><div class="cal-grid">${cells}</div></div>
      <aside class="ui-card cal-day" aria-label="Events on the selected day">
        <header><p class="cal-day-kicker">${escapeHtml(calendarRelativeDay(calendarDay))}</p><h3>${escapeHtml(calendarDayLabel(calendarDay))}</h3></header>
        ${dayEvents.length ? `<ul class="cal-events">${dayEvents.map(calendarEventHtml).join("")}</ul>` : `<p class="ui-muted">Nothing scheduled${hiddenThatDay ? ` (${plural(hiddenThatDay, "event")} hidden by the filters)` : ""}.</p>`}
        ${calendarDay >= fmtDate(today) && calendarCanAdd() ? uiButton("Add event on this day", { "data-cal-add": calendarDay }, { size: "sm" }) : ""}
      </aside>
    </div>`;
}

// ----- next 2 weeks ----------------------------------------------------------------------------------
function calendarAgendaHtml() {
  const from = fmtDate(today);
  const days = CalendarRules.agenda(calendarShownEvents(), from, 14);
  const total = days.reduce((n, d) => n + d.events.length, 0);
  const until = CalendarRules.addDays(from, 13);
  return `<div class="cal-toolbar"><div><h2 class="cal-title">Next 2 weeks</h2><p class="ui-muted">${escapeHtml(`${calendarDayLabel(from, { weekday: "short" })} – ${calendarDayLabel(until, { weekday: "short" })}`)} · ${plural(total, "event")}</p></div>
      <div class="cal-chips" role="group" aria-label="Show event types">${CalendarRules.TYPES.map((type) => { const on = !calendarHidden.has(type.key); return `<button type="button" class="cal-chip${on ? " is-on" : ""}" data-cal-type="${type.key}" aria-pressed="${on}" style="--cal-color:${type.color}"><span class="cal-chip-dot" aria-hidden="true"></span>${escapeHtml(type.label)}</button>`; }).join("")}</div></div>
    ${days.length ? `<div class="cal-agenda">${days.map((d) => `<section class="ui-card cal-agenda-day"><header><strong>${escapeHtml(calendarAgendaHeading(d.date))}</strong><span>${escapeHtml(new Date(`${d.date}T00:00:00+08:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Manila" }))}</span></header><ul class="cal-events">${d.events.map(calendarEventHtml).join("")}</ul></section>`).join("")}</div>`
      : `<div class="ui-card cal-empty"><strong>Nothing in the next 2 weeks</strong><p class="ui-muted">Add an event, or switch the filters back on.</p></div>`}`;
}

function renderCalendarPage() {
  if (!CALENDAR_TAB_LABELS[calendarTab]) calendarTab = "month";
  const header = qs("#calendar-actions");
  if (header) header.innerHTML = uiButton("Subscribe (iCal)", { "data-cal-subscribe": "" }) + (calendarCanAdd() ? uiButton("Add event", { "data-cal-add": "" }, { primary: true }) : "");
  const upcoming = CalendarRules.agenda(calendarShownEvents(), fmtDate(today), 14).reduce((n, d) => n + d.events.length, 0);
  qs("#calendar-tabs").innerHTML = uiModuleTabs({ tabs: Object.keys(CALENDAR_TAB_LABELS).map((key) => ({ key, label: CALENDAR_TAB_LABELS[key], count: key === "agenda" ? upcoming || undefined : undefined })), active: calendarTab, attr: "data-cal-tab" });
  renderModuleAssistant("calendar");
  uiRender(qs("#calendar-tab-panel"), calendarTab === "agenda" ? calendarAgendaHtml() : calendarMonthHtml());
  syncModuleUrl("calendar", calendarQueryString());
}

WORKFLOW_RULES.calendar = [
  { id: "calendar-conflicts", rule: () => {
    const from = fmtDate(today);
    const clashes = CalendarRules.conflicts(calendarVisibleEvents(), from, CalendarRules.addDays(from, 13));
    if (!clashes.length) return null;
    const c = clashes[0];
    const what = c.reason === "person" ? `${c.who} is booked for “${c.a.title}” at ${calendarTimeLabel(c.a.time)} and “${c.b.title}” at ${calendarTimeLabel(c.b.time)}` : `Two service visits at ${supportBranchLabel(c.who)} at ${calendarTimeLabel(c.a.time)}: “${c.a.title}” and “${c.b.title}”`;
    return { tone: "amber", text: `${calendarRelativeDay(c.date)}: ${what}.${clashes.length > 1 ? ` (+${clashes.length - 1} more clash${clashes.length > 2 ? "es" : ""})` : ""}`, action: "Show day", attrs: { "data-cal-goto": c.date } };
  } },
  { id: "calendar-today", rule: () => {
    const todays = calendarVisibleEvents().filter((e) => e.date === fmtDate(today));
    if (!todays.length) return null;
    return { tone: "blue", text: `${plural(todays.length, "event")} today: ${CalendarRules.sorted(todays).slice(0, 3).map((e) => `${e.allDay || !e.time ? "" : `${calendarTimeLabel(e.time)} `}${e.title}`).join(" · ")}${todays.length > 3 ? " …" : ""}`, action: "Show", attrs: { "data-cal-goto": fmtDate(today) } };
  } },
];

// ----- adding and removing ------------------------------------------------------------------------------
/** @param {string} [date] */
async function calendarAddEvent(date = "") {
  if (!calendarCanAdd()) return toast("Editing is disabled for the Calendar in User Settings.");
  const day = date && date >= fmtDate(today) ? date : fmtDate(today);
  const values = await supportDialog({
    kicker: "Calendar", title: "Add an event", confirm: "Add event",
    body: `<div class="wty-form">
      <div class="field full"><label for="sup-title">Event</label><input id="sup-title" name="title" required maxlength="140" placeholder="e.g. Stock count, client visit, team meeting" /></div>
      <div class="field"><label for="sup-date">Date</label><input id="sup-date" name="date" type="date" required min="${fmtDate(today)}" value="${day}" /></div>
      <div class="field"><label for="sup-time">Time</label><input id="sup-time" name="time" type="time" value="09:00" /></div>
      ${supportSelectHtml("type", "Type", CalendarRules.TYPES.map((t) => ({ value: t.key, label: t.label })), "internal")}
      <div class="field"><label for="sup-owner">Owner</label><input id="sup-owner" value="${escapeHtml(String(currentUser?.name || currentUser?.email || "You"))}" readonly aria-describedby="sup-owner-help" /></div>
      ${supportSelectHtml("branch", "Branch", [{ value: "", label: "Everyone (all branches)" }, ...platformBranches().map((b) => ({ value: b, label: supportBranchLabel(b) }))], "")}
      <label class="ios-check-row cal-allday"><input type="checkbox" name="allDay" value="yes" /><span></span><strong>All day</strong></label>
      <div class="field full"><label for="sup-note">Note</label><textarea id="sup-note" name="note" maxlength="2000" placeholder="Where, what to bring, who else is going…"></textarea></div>
    </div><p class="field-help" id="sup-owner-help">You'll be the owner: only you (or Superadmin/CEO) can remove it. A branch event is only shown to people at that branch. Money and delivery types are only shown to people with those modules.</p>`,
  });
  if (!values) return;
  const title = String(values.title || "").trim();
  const allDay = values.allDay === "yes";
  if (!title || !values.date || (!allDay && !values.time)) return toast("Add a name, a date and a time (or tick All day).");
  if (values.date < fmtDate(today)) return toast("Events can only be added for today or a future date.");
  /** @type {CalendarEvent & Record<string, any>} */
  const entry = {
    id: `EVT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, date: values.date, time: allDay ? "" : values.time,
    createdBy: currentUser?.name || currentUser?.email || "User", createdByUser: String(currentUser?.email || "").toLowerCase(), createdByRole: currentUser?.role || "", createdAt: new Date().toISOString(),
    type: CalendarRules.TYPE_KEYS.includes(values.type) ? values.type : "internal", ...(allDay ? { allDay: true } : {}), ...(values.branch ? { branch: values.branch } : {}),
    ...(String(values.note || "").trim() ? { note: String(values.note).trim() } : {}),
  };
  data.calendarEvents.push(entry);
  const saveResult = await persistRecords({ calendarEvents: [entry] });
  if (!saveResult?.ok && !saveResult?.queued) { data.calendarEvents = data.calendarEvents.filter((e) => e !== entry); return; }
  log("Added calendar event", "Calendar", `${entry.date} ${entry.time || "all day"} · ${title}`, { save: false });
  calendarMonth = entry.date.slice(0, 7);
  calendarDay = entry.date;
  calendarHidden.delete(String(entry.type));
  renderCalendarPage();
  toast("Event added.");
}
/** @param {string} id */
async function calendarRemoveEvent(id) {
  const entry = (data.calendarEvents || []).find((e) => e.id === id);
  if (!entry || entry.removed) return;
  if (!canChangeCalendarEvent(entry)) return toast("Only the person who added this event can remove it.");
  const ok = await confirmDetailsModal({ eyebrow: "Calendar", title: `Remove "${entry.title}"?`, fields: [["Date", entry.date], ["Time", /** @type {any} */ (entry).allDay || !entry.time ? "All day" : calendarTimeLabel(entry.time)], ["Owner", entry.createdBy || "-"]], confirmLabel: "Remove event", danger: true });
  if (!ok) return;
  entry.removed = true;
  entry.removedBy = currentUser?.name || currentUser?.email || "User";
  const saveResult = await persistRecords({ calendarEvents: [entry] });
  if (!saveResult?.ok && !saveResult?.queued) { entry.removed = false; delete entry.removedBy; return; }
  log("Removed calendar event", "Calendar", `${entry.date} ${entry.time || "all day"} · ${entry.title}`, { save: false });
  renderCalendarPage();
  toast("Event removed.");
}

// ----- iCal ---------------------------------------------------------------------------------------------------
async function calendarSubscribe() {
  /** @type {{ enabled: boolean, url: string, createdAt?: string } | null} */
  let feed = null;
  try { feed = await MedlaneAPI.calendarFeed(); } catch (/** @type {any} */ error) { return toast(error.message || "Couldn't load your calendar link."); }
  const dialog = document.createElement("dialog");
  dialog.className = "modal invite-confirm-modal sup-dialog cal-subscribe";
  // Redraw only the form: toast() parks the shared #toast element inside the open dialog.
  dialog.innerHTML = `<form method="dialog"></form>`;
  const form = /** @type {HTMLFormElement} */ (qsIn(dialog, "form"));
  const draw = () => {
    const on = Boolean(feed?.enabled && feed.url);
    form.innerHTML = `<div class="modal-header"><div><p class="eyebrow">Calendar</p><h2>Subscribe in your calendar app</h2></div><button class="icon-button" value="cancel" aria-label="Close">x</button></div>
      <p>Add the Medlane calendar to Google Calendar, Outlook or Apple Calendar. It's read-only, shows exactly what you see here, and updates about every hour.</p>
      ${on ? `<div class="field full"><label for="cal-feed-url">Your private link</label><div class="cal-feed-row"><input id="cal-feed-url" readonly value="${escapeHtml(String(feed?.url))}" /><button type="button" class="primary-button" data-cal-copy="">Copy</button></div></div>
        <p class="field-help">Anyone with this link can see your calendar, so don't share it. In Google Calendar: Other calendars → + → From URL.${feed?.createdAt ? ` Made ${escapeHtml(uiDate(String(feed.createdAt).slice(0, 10)))}.` : ""}</p>`
        : `<p class="field-help">You don't have a link yet.</p>`}
      <div class="modal-actions">${on ? `<button type="button" class="ghost-button" data-cal-feed-off="">Turn off</button><button type="button" class="ghost-button" data-cal-feed-new="">New link</button>` : `<button type="button" class="primary-button" data-cal-feed-new="">Create my link</button>`}<button class="ghost-button" value="cancel">Done</button></div>`;
  };
  draw();
  dialog.addEventListener("click", async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (closestEl(target, "[data-cal-copy]")) {
      const input = /** @type {HTMLInputElement} */ (qsIn(dialog, "#cal-feed-url"));
      try { await navigator.clipboard.writeText(input.value); toast("Link copied."); } catch { input.select(); toast("Select the link and copy it."); }
      return;
    }
    const fresh = closestEl(target, "[data-cal-feed-new]");
    const off = closestEl(target, "[data-cal-feed-off]");
    if (!fresh && !off) return;
    try {
      feed = fresh ? await MedlaneAPI.calendarFeedNew() : await MedlaneAPI.calendarFeedOff();
      draw();
      log(fresh ? "Created calendar link" : "Turned off calendar link", "Calendar", fresh ? "New private iCal link; any older link stopped working" : "Private iCal link turned off", { save: false });
      toast(fresh ? "New link ready. Any older link no longer works." : "Calendar link turned off.");
    } catch (/** @type {any} */ error) { toast(error.message || "Couldn't change your calendar link."); }
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

/** @param {Event} event */
function handleCalendarClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const el = (/** @type {string} */ name) => closestEl(target, `[${name}]`);
  let hit;
  if ((hit = el("data-cal-tab"))) { calendarTab = String(hit.dataset.calTab); renderCalendarPage(); return; }
  if ((hit = el("data-cal-day"))) {
    calendarDay = String(hit.dataset.calDay);
    if (calendarDay.slice(0, 7) !== calendarMonth) calendarMonth = calendarDay.slice(0, 7);
    renderCalendarPage();
    return;
  }
  if ((hit = el("data-cal-nav"))) {
    const [y, m] = calendarMonth.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + Number(hit.dataset.calNav), 1));
    calendarMonth = next.toISOString().slice(0, 7);
    calendarDay = calendarMonth === fmtDate(today).slice(0, 7) ? fmtDate(today) : `${calendarMonth}-01`;
    renderCalendarPage();
    return;
  }
  if (el("data-cal-today")) { calendarMonth = fmtDate(today).slice(0, 7); calendarDay = fmtDate(today); renderCalendarPage(); return; }
  if ((hit = el("data-cal-goto"))) { calendarTab = "month"; calendarDay = String(hit.dataset.calGoto); calendarMonth = calendarDay.slice(0, 7); renderCalendarPage(); return; }
  if ((hit = el("data-cal-type"))) {
    const key = String(hit.dataset.calType);
    if (calendarHidden.has(key)) calendarHidden.delete(key); else calendarHidden.add(key);
    try { localStorage.setItem("medlane.calendar.hidden", JSON.stringify([...calendarHidden])); } catch { /* per-browser convenience only */ }
    renderCalendarPage();
    return;
  }
  if ((hit = el("data-cal-add"))) return void calendarAddEvent(String(hit.dataset.calAdd || ""));
  if ((hit = el("data-cal-remove"))) return void calendarRemoveEvent(String(hit.dataset.calRemove));
  if (el("data-cal-subscribe")) return void calendarSubscribe();
}

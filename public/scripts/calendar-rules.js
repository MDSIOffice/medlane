// @ts-check
// Calendar rules: event types and colours, who may see an event, the month grid, the 2-week
// agenda, conflicts and the iCal (.ics) export. Pure functions over plain inputs (no DOM, no app
// state), shared by the page (calendar-page.js), the Worker (src/worker.js imports this file for
// its side effect: server-side visibility and the .ics feed) and the tests. Exposed as the global
// `CalendarRules`. Dates are "YYYY-MM-DD" and times "HH:MM", both Manila.
//
// The Calendar only shows events people add (data.calendarEvents). Some are added by an action
// elsewhere: a Support Tracker visit or a Warranty PM booking. Those carry `source` and `module`,
// so they're typed "Service & installs" and only shown to people who can open that module.

const CalendarRules = (() => {
  const TYPES = [
    { key: "deliveries", label: "Deliveries", color: "#2B6CB0" },
    { key: "arrivals", label: "Stock arrivals", color: "#1F5F74" },
    { key: "service", label: "Service & installs", color: "#7C5CC4" },
    { key: "moneyin", label: "Money in", color: "#2F8F6B" },
    { key: "moneyout", label: "Money out", color: "#E07A2F" },
    { key: "internal", label: "Internal", color: "#4A5565" },
  ];
  const TYPE_KEYS = TYPES.map((t) => t.key);
  /** The module an event type belongs to: people without that module don't see the event. */
  const TYPE_MODULES = /** @type {Record<string, string>} */ ({ deliveries: "sales", arrivals: "inventory", moneyin: "collections", moneyout: "payables" });
  const SOURCE_MODULES = /** @type {Record<string, string>} */ ({ "support-visit": "product-issues", "warranty-pm": "warranty" });
  const MANAGEMENT = ["Superadmin", "CEO"];
  const CONFLICT_MINUTES = 90;

  /** @param {any} event @returns {string} */
  function typeOf(event) {
    if (TYPE_KEYS.includes(event?.type)) return String(event.type);
    if (SOURCE_MODULES[String(event?.source || "")] || /^(Visit|PM):/.test(String(event?.title || ""))) return "service";
    return "internal";
  }
  /** @param {string} key */
  function typeInfo(key) { return TYPES.find((t) => t.key === key) || TYPES[TYPES.length - 1]; }
  /** The module an event comes from or belongs to ("" = everyone with the Calendar). @param {any} event */
  function moduleOf(event) { return String(event?.module || SOURCE_MODULES[String(event?.source || "")] || TYPE_MODULES[String(event?.type || "")] || ""); }
  /** "Las Piñas" / "las pinas" / "LAS PINAS" → "laspinas". @param {any} value */
  function branchKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  /**
   * May this person see the event? Management sees everything and everyone sees their own; for
   * the rest, a module event needs that module, and a branch event needs that branch (or "all").
   * @param {any} event @param {{ role?: string, email?: string, modules?: string[], branch?: string }} viewer
   */
  function visibleTo(event, viewer) {
    if (!event || event.removed) return false;
    if (MANAGEMENT.includes(String(viewer?.role || ""))) return true;
    const me = String(viewer?.email || "").trim().toLowerCase();
    if (me && [event.createdByUser, event.assigneeEmail].some((e) => String(e || "").trim().toLowerCase() === me)) return true;
    const module = moduleOf(event);
    if (module && !(viewer?.modules || []).includes(module)) return false;
    const mine = branchKey(viewer?.branch);
    if (event.branch && mine && mine !== "all" && branchKey(event.branch) !== mine) return false;
    return true;
  }

  /** @param {string} date @param {number} days */
  function addDays(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  /** Monday = 0 … Sunday = 6. @param {string} date */
  function weekday(date) { return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; }
  /**
   * 6 weeks, Monday first, covering the month.
   * @param {number} year @param {number} month 1–12
   * @returns {{ date: string, day: number, inMonth: boolean, weekend: boolean }[]}
   */
  function monthGrid(year, month) {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const start = addDays(first, -weekday(first));
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, day: Number(date.slice(8)), inMonth: date.slice(0, 7) === first.slice(0, 7), weekend: weekday(date) >= 5 };
    });
  }
  /** Sort key: date, then all-day first, then time. @param {any} event */
  function sortKey(event) { return `${event.date || ""}|${event.allDay || !event.time ? "00" : "01"}${event.time || ""}|${event.title || ""}`; }
  /** @param {any[]} events */
  function sorted(events) { return [...events].sort((a, b) => sortKey(a).localeCompare(sortKey(b))); }
  /** Events per date for the given dates. @param {any[]} events @param {string[]} dates */
  function byDate(events, dates) {
    const wanted = new Set(dates);
    /** @type {Record<string, any[]>} */
    const out = {};
    sorted(events).forEach((e) => { if (wanted.has(e.date)) (out[e.date] ||= []).push(e); });
    return out;
  }
  /** The next `days` days from `from` (inclusive), grouped by date, empty days left out. @param {any[]} events @param {string} from @param {number} [days] */
  function agenda(events, from, days = 14) {
    const to = addDays(from, days - 1);
    /** @type {{ date: string, events: any[] }[]} */
    const out = [];
    sorted(events.filter((e) => !e.removed && e.date >= from && e.date <= to)).forEach((e) => {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.events.push(e); else out.push({ date: e.date, events: [e] });
    });
    return out;
  }
  /** @param {string} time */
  function minutes(time) { const m = /^(\d{2}):(\d{2})$/.exec(String(time || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  /**
   * Clashes: the same person booked twice within 90 minutes on the same day, or two service visits
   * at the same branch at the same time. Each pair once, by date.
   * @param {any[]} events @param {string} from @param {string} [to]
   */
  function conflicts(events, from, to = "9999-12-31") {
    const live = sorted(events.filter((e) => !e.removed && e.date >= from && e.date <= to && minutes(e.time) !== null && !e.allDay));
    /** @type {{ a: any, b: any, date: string, reason: "person" | "branch", who: string }[]} */
    const out = [];
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length && live[j].date === live[i].date; j += 1) {
        const a = live[i]; const b = live[j];
        const gap = Math.abs(Number(minutes(b.time)) - Number(minutes(a.time)));
        const person = String(a.assigneeEmail || "").toLowerCase();
        if (person && person === String(b.assigneeEmail || "").toLowerCase() && gap < CONFLICT_MINUTES) out.push({ a, b, date: a.date, reason: "person", who: String(a.assigneeName || person) });
        else if (gap === 0 && a.branch && branchKey(a.branch) === branchKey(b.branch) && typeOf(a) === "service" && typeOf(b) === "service") out.push({ a, b, date: a.date, reason: "branch", who: String(a.branch) });
      }
    }
    return out;
  }

  // ----- iCal ------------------------------------------------------------------------------------
  /** RFC 5545 text escaping. @param {any} value */
  function icsText(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  /** Folds a content line to 75 octets. @param {string} line */
  function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let current = "";
    let size = 0;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (size + n > (parts.length ? 74 : 75)) { parts.push(current); current = ""; size = 0; }
      current += ch; size += n;
    }
    parts.push(current);
    return parts.join("\r\n ");
  }
  /** Manila date + time → UTC "YYYYMMDDTHHMMSSZ". @param {string} date @param {string} time */
  function utcStamp(date, time) { return new Date(`${date}T${time}:00+08:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  /**
   * A read-only calendar feed. Timed events last an hour; all-day events take the whole day.
   * @param {any[]} events @param {{ name?: string, now?: Date, url?: string }} [options]
   */
  function toIcs(events, options = {}) {
    const stamp = (options.now || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Medlane//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(options.name || "Medlane")}`, "X-WR-TIMEZONE:Asia/Manila", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
    for (const e of sorted(events.filter((x) => !x.removed && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || ""))))) {
      const allDay = e.allDay || minutes(e.time) === null;
      const type = typeInfo(typeOf(e));
      lines.push("BEGIN:VEVENT", `UID:${icsText(e.id)}@medlane`, `DTSTAMP:${stamp}`);
      if (allDay) lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, "")}`);
      else {
        const start = utcStamp(e.date, e.time);
        lines.push(`DTSTART:${start}`, `DTEND:${new Date(Date.parse(`${e.date}T${e.time}:00+08:00`) + 3600e3).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
      }
      lines.push(`SUMMARY:${icsText(e.title)}`, `CATEGORIES:${icsText(type.label)}`);
      const description = [e.note, e.assigneeName ? `For ${e.assigneeName}` : "", e.createdBy ? `Owner: ${e.createdBy}` : ""].filter(Boolean).join("\n");
      if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
      if (e.branch) lines.push(`LOCATION:${icsText(e.branch)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return `${lines.map(fold).join("\r\n")}\r\n`;
  }

  return { TYPES, TYPE_KEYS, TYPE_MODULES, SOURCE_MODULES, CONFLICT_MINUTES, typeOf, typeInfo, moduleOf, branchKey, visibleTo, addDays, weekday, monthGrid, sorted, byDate, agenda, minutes, conflicts, icsText, fold, toIcs };
})();
/** @type {any} */ (globalThis).CalendarRules = CalendarRules;

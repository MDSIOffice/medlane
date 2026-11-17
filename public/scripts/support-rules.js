// @ts-check
// Support Tracker rules: priorities, response-time targets and whether a ticket is On track, At
// risk or Breached. Pure functions over plain inputs (no DOM, no app state), shared by the page
// (support-page.js), the Worker's breach notifications (src/notifications.js imports this file for
// its side effect) and the tests. Exposed as the global `SupportRules`.
//
// Response-time targets (configurable in Support Tracker → Engineers → Response targets):
//   Critical (analyzer down)  respond 1 h, on site 24 h (48 h for Naga clients)
//   High                      respond 4 h, fixed within 2 days
//   Medium                    respond 8 h, fixed within 5 days
//   Low                       respond 1 business day, fixed within 10 days
// The response clock starts when the ticket is logged (openedAt, stamped by the server) and stops
// at the first reply to the client or the first visit. A ticket is Breached once a running target
// has passed, At risk once 75% of it is used (or it has waited on the client for more than 5
// days), otherwise On track. Tickets logged before these fields existed are "Not tracked".

const SupportRules = (() => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const MANILA_OFFSET = 8 * HOUR;
  const RISK_SHARE = 0.75;
  const CLIENT_WAIT_DAYS = 5;

  /** @typedef {"critical" | "high" | "medium" | "low"} Priority */
  /** @typedef {{ respondHours: number, respondBusinessDays: number, onsiteHours: number, onsiteHoursNaga: number, fixDays: number }} Target */
  /** @typedef {Record<Priority, Target>} Targets */
  /** @typedef {"ok" | "risk" | "breach" | "done" | "untracked"} Sla */

  const PRIORITIES = /** @type {Priority[]} */ (["critical", "high", "medium", "low"]);
  const PRIORITY_LABELS = /** @type {Record<Priority, string>} */ ({ critical: "Critical", high: "High", medium: "Medium", low: "Low" });
  const PRIORITY_HINTS = /** @type {Record<Priority, string>} */ ({ critical: "Analyzer down", high: "Results affected", medium: "Workaround exists", low: "Question or request" });
  const TYPES = ["Hardware", "Reagent / QC", "Software / LIS", "Training"];
  const STATUSES = ["New", "Assigned", "On-site visit set", "Waiting for parts", "Waiting for client", "Resolved"];
  const OUTCOMES = ["Fixed on first visit", "Fixed remotely", "Needed more visits", "Billed repair", "Unit replaced", "Not fixed"];
  /** @type {Targets} */
  const DEFAULT_TARGETS = Object.freeze({
    critical: { respondHours: 1, respondBusinessDays: 0, onsiteHours: 24, onsiteHoursNaga: 48, fixDays: 0 },
    high: { respondHours: 4, respondBusinessDays: 0, onsiteHours: 0, onsiteHoursNaga: 0, fixDays: 2 },
    medium: { respondHours: 8, respondBusinessDays: 0, onsiteHours: 0, onsiteHoursNaga: 0, fixDays: 5 },
    low: { respondHours: 0, respondBusinessDays: 1, onsiteHours: 0, onsiteHoursNaga: 0, fixDays: 10 },
  });

  /** Saved targets with defaults filled in and nonsense replaced. @param {any} [raw] @returns {Targets} */
  function targetsFrom(raw) {
    const num = (/** @type {any} */ value, /** @type {number} */ fallback) => { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : fallback; };
    return /** @type {Targets} */ (Object.fromEntries(PRIORITIES.map((p) => {
      const base = DEFAULT_TARGETS[p];
      const saved = raw && typeof raw === "object" ? raw[p] || {} : {};
      const target = /** @type {Target} */ (Object.fromEntries(Object.keys(base).map((key) => [key, num(saved[key], /** @type {any} */ (base)[key])])));
      // Every priority needs some response target.
      if (!target.respondHours && !target.respondBusinessDays) target.respondHours = base.respondHours || 8;
      return [p, target];
    })));
  }

  /** @param {any} value @returns {number | null} */
  function ms(value) {
    if (!value) return null;
    const t = typeof value === "number" ? value : Date.parse(String(value));
    return Number.isFinite(t) ? t : null;
  }
  /** Day of the week in Manila (0 = Sunday). @param {number} t */
  function manilaWeekday(t) { return new Date(t + MANILA_OFFSET).getUTCDay(); }
  /** n business days (Mon–Fri, Manila) after t, at the same time of day. @param {number} t @param {number} n */
  function addBusinessDays(t, n) {
    let out = t;
    let left = Math.max(0, Math.round(n));
    while (left > 0) {
      out += DAY;
      const day = manilaWeekday(out);
      if (day !== 0 && day !== 6) left -= 1;
    }
    return out;
  }
  /** "45 m", "2 h 10 m", "2 d 9 h". @param {number | null | undefined} span */
  function duration(span) {
    if (span === null || span === undefined || !Number.isFinite(span)) return "—";
    const m = Math.max(0, Math.round(span / MIN));
    if (m < 60) return `${m} m`;
    if (m < 24 * 60) { const h = Math.floor(m / 60); const r = m % 60; return r ? `${h} h ${r} m` : `${h} h`; }
    const d = Math.floor(m / (24 * 60)); const h = Math.floor((m % (24 * 60)) / 60);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  /** "1 h", "1 business day". @param {Target} target */
  function respondLabel(target) {
    return target.respondHours ? `${target.respondHours} h` : `${target.respondBusinessDays} business day${target.respondBusinessDays === 1 ? "" : "s"}`;
  }
  /** One line per priority for the Response targets card. @param {Targets} targets */
  function targetLines(targets) {
    return PRIORITIES.map((p) => {
      const t = targets[p];
      const extra = t.onsiteHours ? `on site ${t.onsiteHours} h${t.onsiteHoursNaga && t.onsiteHoursNaga !== t.onsiteHours ? ` (Naga ${t.onsiteHoursNaga} h)` : ""}` : t.fixDays ? `fix in ${t.fixDays} day${t.fixDays === 1 ? "" : "s"}` : "";
      return { priority: p, label: PRIORITY_LABELS[p], hint: PRIORITY_HINTS[p], text: [`respond ${respondLabel(t)}`, extra].filter(Boolean).join(" · ") };
    });
  }

  /** @param {any} report @returns {Priority} */
  function priorityOf(report) { return PRIORITIES.includes(report?.priority) ? report.priority : "medium"; }
  /** The ticket type; older reports are mapped from their "Type of support". @param {any} report */
  function typeOf(report) {
    if (TYPES.includes(report?.issueType)) return String(report.issueType);
    const old = String(report?.typeOfSupport || "");
    if (/training/i.test(old)) return "Training";
    if (/application/i.test(old)) return "Reagent / QC";
    if (/software|lis\b/i.test(old)) return "Software / LIS";
    return "Hardware";
  }
  /** The ticket status; older reports are mapped from the hand-off status. @param {any} report */
  function statusOf(report) {
    if (report?.status === "Resolved") return "Resolved";
    if (STATUSES.includes(report?.ticketStatus)) return String(report.ticketStatus);
    if (report?.engineer || ["In Progress", "Pass to Engineering"].includes(report?.status)) return "Assigned";
    return "New";
  }
  /** @param {any} branch */
  function isNaga(branch) { return /naga/i.test(String(branch || "")); }
  /** Normalised serial for matching tickets to units. @param {any} serial */
  function serialKey(serial) { return String(serial || "").trim().toUpperCase().replace(/\s+/g, ""); }

  /**
   * Everything the page shows about one ticket's clocks.
   * @param {any} report @param {{ now?: number, targets?: Targets }} [options]
   */
  function ticketFacts(report, { now = Date.now(), targets = targetsFrom() } = {}) {
    const priority = priorityOf(report);
    const target = targets[priority];
    const status = statusOf(report);
    const resolved = status === "Resolved";
    const opened = ms(report?.openedAt);
    const visitAt = ms(report?.visitAt);
    const visited = visitAt !== null && visitAt <= now ? visitAt : null;
    const replied = ms(report?.firstResponseAt);
    const responseAt = [replied, visited].filter((t) => t !== null).sort((a, b) => Number(a) - Number(b))[0] ?? null;
    const closedAt = ms(report?.closedAt) ?? (resolved ? ms(report?.resolvedAt ? `${report.resolvedAt}T17:00:00+08:00` : null) : null);
    const base = { priority, type: typeOf(report), status, resolved, open: !resolved, opened, responseAt, visitAt, closedAt, naga: isNaga(report?.branch) };
    if (opened === null) {
      return { ...base, tracked: false, sla: /** @type {Sla} */ (resolved ? "done" : "untracked"), clock: "", text: "Logged before response targets were tracked.", respondBy: null, onsiteBy: null, fixBy: null, responseTook: null, responseOnTime: null, timeToFix: null, age: null, usedShare: 0 };
    }
    const respondBy = target.respondHours ? opened + target.respondHours * HOUR : addBusinessDays(opened, target.respondBusinessDays);
    const onsiteHours = base.naga && target.onsiteHoursNaga ? target.onsiteHoursNaga : target.onsiteHours;
    const onsiteBy = onsiteHours ? opened + onsiteHours * HOUR : null;
    const fixBy = target.fixDays ? opened + target.fixDays * DAY : null;
    const responseTook = responseAt !== null ? responseAt - opened : null;
    const responseOnTime = responseAt !== null ? responseAt <= respondBy : now > respondBy ? false : null;
    const timeToFix = closedAt !== null ? Math.max(0, closedAt - opened) : null;
    const facts = { ...base, tracked: true, respondBy, onsiteBy, fixBy, responseTook, responseOnTime, timeToFix, age: (closedAt ?? now) - opened };
    if (resolved) return { ...facts, sla: /** @type {Sla} */ ("done"), clock: "", text: responseOnTime === false ? "Closed. The first response was late." : "Closed.", usedShare: 0 };

    // The clocks still running: no response yet; critical with no visit yet; not fixed yet.
    /** @type {{ clock: string, deadline: number, label: string }[]} */
    const running = [];
    if (responseAt === null) running.push({ clock: "response", deadline: respondBy, label: `respond within ${respondLabel(target)}` });
    if (onsiteBy !== null && visited === null) running.push({ clock: "onsite", deadline: onsiteBy, label: `be on site within ${onsiteHours} h` });
    if (fixBy !== null) running.push({ clock: "fix", deadline: fixBy, label: `fix within ${target.fixDays} day${target.fixDays === 1 ? "" : "s"}` });
    let worst = { sla: /** @type {Sla} */ ("ok"), clock: "", text: "", usedShare: 0, deadline: Infinity };
    for (const run of running) {
      const share = /** @type {number} */ ((now - opened) / Math.max(1, run.deadline - opened));
      const sla = now > run.deadline ? "breach" : share >= RISK_SHARE ? "risk" : "ok";
      const rank = { ok: 0, risk: 1, breach: 2 };
      if (rank[sla] > rank[/** @type {"ok" | "risk" | "breach"} */ (worst.sla)] || (rank[sla] === rank[/** @type {"ok" | "risk" | "breach"} */ (worst.sla)] && run.deadline < worst.deadline)) {
        const text = sla === "breach"
          ? `${PRIORITY_LABELS[priority]} priority: needed to ${run.label}. ${duration(now - run.deadline)} past the deadline.`
          : sla === "risk"
            ? `${Math.round(share * 100)}% of the time to ${run.label} is used. ${duration(run.deadline - now)} left.`
            : `${PRIORITY_LABELS[priority]} priority: ${run.label}. ${duration(run.deadline - now)} left.`;
        worst = { sla: /** @type {Sla} */ (sla), clock: run.clock, text, usedShare: share, deadline: run.deadline };
      }
    }
    // Stuck waiting on the client.
    const since = ms(report?.statusSince);
    if (worst.sla === "ok" && status === "Waiting for client" && since !== null && now - since > CLIENT_WAIT_DAYS * DAY) {
      worst = { sla: "risk", clock: "client", text: `Waiting for the client for ${duration(now - since)}. Follow up.`, usedShare: worst.usedShare, deadline: worst.deadline };
    }
    if (worst.sla === "ok" && !running.length) worst.text = "All targets met so far.";
    return { ...facts, sla: worst.sla, clock: worst.clock, text: worst.text, usedShare: worst.usedShare };
  }

  /** Sort order for "needs action": breached, then at risk, then the rest; nearest deadline first. @param {any} a @param {any} b */
  function urgencyCompare(a, b) {
    const rank = (/** @type {any} */ f) => ({ breach: 0, risk: 1, ok: 2, untracked: 3, done: 4 })[/** @type {Sla} */ (f.sla)] ?? 5;
    const pri = (/** @type {any} */ f) => PRIORITIES.indexOf(f.priority);
    return rank(a) - rank(b) || pri(a) - pri(b) || Number(a.opened ?? Infinity) - Number(b.opened ?? Infinity);
  }

  /**
   * Share of first responses on time among tickets logged in the last `days` whose response is
   * decided (answered, or unanswered past the deadline). @param {any[]} facts @param {number} now @param {number} [days]
   */
  function responseStats(facts, now, days = 30) {
    const since = now - days * DAY;
    const decided = facts.filter((f) => f.tracked && f.opened >= since && f.responseOnTime !== null);
    const onTime = decided.filter((f) => f.responseOnTime).length;
    const answered = decided.filter((f) => f.responseTook !== null);
    return {
      decided: decided.length, onTime, rate: decided.length ? onTime / decided.length : null,
      avgResponse: answered.length ? answered.reduce((s, f) => s + f.responseTook, 0) / answered.length : null,
      breachedNow: facts.filter((f) => f.open && f.sla === "breach").length,
    };
  }

  /** First-visit fix rate over tickets closed in the last `days` that needed a visit. @param {any[]} reports @param {number} now @param {number} [days] */
  function firstVisitFix(reports, now, days = 90) {
    const since = now - days * DAY;
    const visited = reports.filter((r) => statusOf(r) === "Resolved" && (ms(r.closedAt) ?? ms(r.resolvedAt ? `${r.resolvedAt}T17:00:00+08:00` : null) ?? 0) >= since && ["Fixed on first visit", "Needed more visits"].includes(r.outcome));
    const first = visited.filter((r) => r.outcome === "Fixed on first visit").length;
    return { visited: visited.length, first, rate: visited.length ? first / visited.length : null };
  }

  /** When a ticket was logged: openedAt, else its start date. @param {any} report */
  function loggedAt(report) { return ms(report?.openedAt) ?? ms(report?.startDate ? `${report.startDate}T09:00:00+08:00` : null); }

  /**
   * Units with 2 or more tickets in the last `days`, with a suggestion from their warranty.
   * @param {any[]} reports @param {any[]} warranties @param {number} now @param {number} [days]
   */
  function repeatUnits(reports, warranties, now, days = 90) {
    const since = now - days * DAY;
    /** @type {Map<string, any[]>} */
    const bySerial = new Map();
    for (const r of reports) {
      const key = serialKey(r.serialNo);
      const at = loggedAt(r);
      if (!key || key === "N/A" || at === null || at < since) continue;
      bySerial.set(key, [...(bySerial.get(key) || []), r]);
    }
    return [...bySerial.entries()].filter(([, list]) => list.length >= 2).map(([key, list]) => {
      const unit = (warranties || []).find((w) => serialKey(w.serial) === key);
      const left = unit?.warrantyEnd ? Math.floor(((ms(`${unit.warrantyEnd}T23:59:59+08:00`) ?? 0) - now) / DAY) : null;
      const covered = left !== null && left >= 0;
      const suggestion = !unit ? "Add this unit to Warranty so its coverage is known"
        : covered && left <= 60 ? "Ask the supplier for a replacement before the warranty ends"
          : covered ? "Raise a warranty claim if it fails again"
            : "Offer a service contract";
      const sorted = [...list].sort((a, b) => Number(loggedAt(b)) - Number(loggedAt(a)));
      return { serial: String(sorted[0].serialNo || key), equipment: String(sorted[0].equipment || unit?.equipment || "Unit"), client: String(sorted[0].companyName || unit?.client || ""), count: list.length, ids: sorted.map((r) => String(r.id)), warrantyEnd: unit?.warrantyEnd || "", covered, daysLeft: left, suggestion };
    }).sort((a, b) => b.count - a.count || a.serial.localeCompare(b.serial));
  }

  /** The original ticket a new one on the same unit reopens (resolved within the last 30 days). @param {any} report @param {any[]} reports @param {number} now */
  function reopenOf(report, reports, now) {
    const key = serialKey(report?.serialNo);
    if (!key || key === "N/A") return "";
    const since = now - 30 * DAY;
    const prior = reports.filter((r) => r.id !== report.id && serialKey(r.serialNo) === key && statusOf(r) === "Resolved")
      .map((r) => ({ r, closed: ms(r.closedAt) ?? ms(r.resolvedAt ? `${r.resolvedAt}T17:00:00+08:00` : null) }))
      .filter((x) => x.closed !== null && x.closed >= since && x.closed <= now)
      .sort((a, b) => Number(b.closed) - Number(a.closed));
    return prior[0] ? String(prior[0].r.id) : "";
  }

  /**
   * The engineer a new ticket goes to: the one whose branch matches the client's, with the fewest
   * open tickets; anyone with the fewest open tickets when none matches.
   * @param {{ email: string, name: string, branch?: string }[]} engineers @param {string} branch @param {any[]} reports
   */
  function defaultEngineer(engineers, branch, reports) {
    if (!engineers.length) return null;
    const load = (/** @type {string} */ email) => reports.filter((r) => statusOf(r) !== "Resolved" && String(r.engineerEmail || "").toLowerCase() === email.toLowerCase()).length;
    const norm = (/** @type {any} */ b) => String(b || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
    const matching = engineers.filter((e) => norm(e.branch) && norm(e.branch) === norm(branch));
    const pool = matching.length ? matching : engineers;
    return [...pool].sort((a, b) => load(a.email) - load(b.email) || a.name.localeCompare(b.name))[0];
  }

  /**
   * The branch that serves a client: its own branch if set, else the branch of its latest invoice,
   * else Naga for Bicol (Region V) clients, else Las Pinas.
   * @param {string} client @param {{ clients?: any[], sales?: any[] }} data
   */
  function clientBranch(client, { clients = [], sales = [] } = {}) {
    const name = String(client || "").trim().toLowerCase();
    const record = clients.find((c) => String(c.name || "").trim().toLowerCase() === name);
    if (record?.branch && record.branch !== "all") return String(record.branch);
    const latest = sales.filter((s) => String(s.client || "").trim().toLowerCase() === name && s.branch && s.branch !== "all").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    if (latest) return String(latest.branch);
    if (/region v\b|bicol|naga|camarines|albay|sorsogon|catanduanes|masbate/i.test(`${record?.area || ""} ${record?.address || ""}`)) return "Naga";
    return "Las Pinas";
  }

  return {
    HOUR, DAY, PRIORITIES, PRIORITY_LABELS, PRIORITY_HINTS, TYPES, STATUSES, OUTCOMES, DEFAULT_TARGETS, RISK_SHARE, CLIENT_WAIT_DAYS,
    targetsFrom, addBusinessDays, duration, respondLabel, targetLines, priorityOf, typeOf, statusOf, isNaga, serialKey,
    ticketFacts, urgencyCompare, responseStats, firstVisitFix, loggedAt, repeatUnits, reopenOf, defaultEngineer, clientBranch,
  };
})();
/** @type {any} */ (globalThis).SupportRules = SupportRules;

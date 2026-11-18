// Support Tracker response-time rules (public/scripts/support-rules.js, a plain browser script that
// also sets globalThis.SupportRules, which is how the Worker and these tests use it).
import test from "node:test";
import assert from "node:assert/strict";
import "../public/scripts/support-rules.js";

const S = /** @type {any} */ (globalThis).SupportRules;
const H = 3600e3;
const OPEN = Date.parse("2026-11-18T08:00:00+08:00"); // a Wednesday, 8 AM Manila
const ticket = (/** @type {any} */ extra = {}) => ({ id: "TSR-1", openedAt: new Date(OPEN).toISOString(), priority: "high", ticketStatus: "Assigned", branch: "Las Pinas", ...extra });
const at = (/** @type {number} */ hours) => OPEN + hours * H;

test("on track, at risk at 75% of the response target, breached after it", () => {
  // High: respond within 4 h.
  assert.equal(S.ticketFacts(ticket(), { now: at(1) }).sla, "ok");
  assert.equal(S.ticketFacts(ticket(), { now: at(2.9) }).sla, "ok");
  const risk = S.ticketFacts(ticket(), { now: at(3) });
  assert.equal(risk.sla, "risk");
  assert.equal(risk.clock, "response");
  assert.match(risk.text, /75% of the time to respond within 4 h is used\. 1 h left\./);
  const breach = S.ticketFacts(ticket(), { now: at(7) });
  assert.equal(breach.sla, "breach");
  assert.match(breach.text, /needed to respond within 4 h\. 3 h past the deadline/);
  assert.equal(breach.responseOnTime, false);
});

test("the response clock stops at the first reply or the first visit", () => {
  const replied = ticket({ firstResponseAt: new Date(at(0.75)).toISOString() });
  const f = S.ticketFacts(replied, { now: at(20) });
  assert.equal(f.responseTook, 0.75 * H);
  assert.equal(f.responseOnTime, true);
  assert.equal(f.sla, "ok", "only the 2-day fix clock is running (20 h of 48 h)");
  // A visit that has happened counts as the response; one still in the future doesn't.
  const visitLater = ticket({ visitAt: new Date(at(30)).toISOString() });
  assert.equal(S.ticketFacts(visitLater, { now: at(5) }).sla, "breach");
  const visited = ticket({ visitAt: new Date(at(2)).toISOString() });
  assert.equal(S.ticketFacts(visited, { now: at(5) }).responseOnTime, true);
  // Answered late: the response target is missed, but it's no longer what's running.
  const late = S.ticketFacts(ticket({ firstResponseAt: new Date(at(6)).toISOString() }), { now: at(10) });
  assert.deepEqual([late.responseOnTime, late.sla], [false, "ok"]);
});

test("the fix target breaches after its days run out", () => {
  const answered = ticket({ firstResponseAt: new Date(at(1)).toISOString() });
  assert.equal(S.ticketFacts(answered, { now: at(36) }).sla, "risk"); // 36 h of 48 h = 75%
  const f = S.ticketFacts(answered, { now: at(49) });
  assert.deepEqual([f.sla, f.clock], ["breach", "fix"]);
});

test("critical: 1 h response and on site within 24 h, 48 h for Naga clients", () => {
  const down = ticket({ priority: "critical", firstResponseAt: new Date(at(0.5)).toISOString() });
  assert.equal(S.ticketFacts(down, { now: at(17) }).sla, "ok");
  assert.equal(S.ticketFacts(down, { now: at(18) }).sla, "risk");
  assert.deepEqual([S.ticketFacts(down, { now: at(25) }).sla, S.ticketFacts(down, { now: at(25) }).clock], ["breach", "onsite"]);
  const naga = { ...down, branch: "Naga" };
  assert.equal(S.ticketFacts(naga, { now: at(25) }).sla, "ok");
  assert.equal(S.ticketFacts(naga, { now: at(49) }).sla, "breach");
  // Once the visit happened, nothing is running (critical has no fix-days target).
  const fixedVisit = { ...down, visitAt: new Date(at(20)).toISOString() };
  assert.equal(S.ticketFacts(fixedVisit, { now: at(60) }).sla, "ok");
  assert.equal(S.ticketFacts(ticket({ priority: "critical" }), { now: at(1.5) }).sla, "breach", "no response after 1 h");
});

test("low priority responds within 1 business day: Friday evening rolls to Monday", () => {
  const friday = Date.parse("2026-11-20T18:00:00+08:00");
  const f = S.ticketFacts({ ...ticket({ priority: "low" }), openedAt: new Date(friday).toISOString() }, { now: Date.parse("2026-11-22T12:00:00+08:00") });
  assert.equal(new Date(f.respondBy).toISOString(), "2026-11-23T10:00:00.000Z", "Monday 6 PM Manila");
  assert.equal(f.sla, "ok", "a weekend in between doesn't breach it");
  assert.equal(S.addBusinessDays(Date.parse("2026-11-18T09:00:00+08:00"), 1), Date.parse("2026-11-19T09:00:00+08:00"));
});

test("waiting on the client for more than 5 days puts a ticket at risk", () => {
  const waiting = ticket({ priority: "low", firstResponseAt: new Date(at(1)).toISOString(), ticketStatus: "Waiting for client", statusSince: new Date(at(2)).toISOString() });
  assert.equal(S.ticketFacts(waiting, { now: at(2 + 24 * 4) }).sla, "ok");
  const stuck = S.ticketFacts(waiting, { now: at(2 + 24 * 5 + 1) });
  assert.deepEqual([stuck.sla, stuck.clock], ["risk", "client"]);
  assert.match(stuck.text, /Waiting for the client for 5 d/);
});

test("resolved tickets stop every clock; older reports aren't tracked", () => {
  const closed = S.ticketFacts(ticket({ ticketStatus: "Resolved", status: "Resolved", firstResponseAt: new Date(at(1)).toISOString(), closedAt: new Date(at(30)).toISOString() }), { now: at(200) });
  assert.deepEqual([closed.sla, closed.timeToFix], ["done", 30 * H]);
  const legacy = S.ticketFacts({ id: "TSR-OLD", status: "Open", startDate: "2026-01-02" }, { now: at(1) });
  assert.deepEqual([legacy.tracked, legacy.sla, legacy.status], [false, "untracked", "New"]);
  assert.equal(S.statusOf({ status: "Pass to Engineering" }), "Assigned");
  assert.equal(S.typeOf({ typeOfSupport: "Training Support" }), "Training");
});

test("targets are configurable, with defaults for anything missing or invalid", () => {
  const t = S.targetsFrom({ high: { respondHours: 2 }, medium: { respondHours: -5, fixDays: "x" }, low: { respondHours: 0, respondBusinessDays: 0 } });
  assert.equal(t.high.respondHours, 2);
  assert.deepEqual([t.medium.respondHours, t.medium.fixDays], [8, 5]);
  assert.ok(t.low.respondHours > 0, "every priority keeps a response target");
  assert.equal(S.ticketFacts(ticket(), { now: at(2.5), targets: t }).sla, "breach");
  assert.deepEqual(S.targetLines(S.targetsFrom()).map((l) => l.text), ["respond 1 h · on site 24 h (Naga 48 h)", "respond 4 h · fix in 2 days", "respond 8 h · fix in 5 days", "respond 1 business day · fix in 10 days"]);
});

test("response rate, first-visit fix rate and repeat problems", () => {
  const now = at(48);
  const facts = [
    ticket({ id: "a", firstResponseAt: new Date(at(1)).toISOString() }),
    ticket({ id: "b", firstResponseAt: new Date(at(5)).toISOString() }),
    ticket({ id: "c" }), // unanswered, past 4 h
    ticket({ id: "d", openedAt: new Date(now - 0.5 * H).toISOString() }), // not decided yet
  ].map((r) => S.ticketFacts(r, { now }));
  const stats = S.responseStats(facts, now);
  assert.deepEqual([stats.decided, stats.onTime, stats.breachedNow], [3, 1, 1]);
  assert.equal(stats.avgResponse, 3 * H);
  const fix = S.firstVisitFix([
    { status: "Resolved", closedAt: new Date(at(10)).toISOString(), outcome: "Fixed on first visit" },
    { status: "Resolved", closedAt: new Date(at(10)).toISOString(), outcome: "Needed more visits" },
    { status: "Resolved", closedAt: new Date(at(10)).toISOString(), outcome: "Fixed remotely" },
  ], now);
  assert.deepEqual([fix.visited, fix.first, fix.rate], [2, 1, 0.5]);
  const units = S.repeatUnits([
    { id: "T1", serialNo: "z5-001", equipment: "Zybio Z5", companyName: "Lab C", openedAt: new Date(at(-24 * 30)).toISOString() },
    { id: "T2", serialNo: "Z5-001", equipment: "Zybio Z5", companyName: "Lab C", openedAt: new Date(at(-24)).toISOString() },
    { id: "T3", serialNo: "EXU-9", companyName: "Lab D", startDate: "2026-11-01" },
    { id: "T4", serialNo: "EXU-9", companyName: "Lab D", startDate: "2025-01-01" },
  ], [{ serial: "Z5-001", warrantyEnd: "2026-12-30" }], now);
  assert.deepEqual(units.map((u) => [u.serial, u.count, u.suggestion]), [["Z5-001", 2, "Ask the supplier for a replacement before the warranty ends"]]);
});

test("a new ticket defaults to the branch engineer with the fewest open tickets; repeats within 30 days link back", () => {
  const engineers = [{ email: "e1@x.ph", name: "Engineer 1", branch: "Las Piñas" }, { email: "e2@x.ph", name: "Engineer 2", branch: "Naga" }, { email: "e3@x.ph", name: "Engineer 3", branch: "Naga" }];
  const reports = [{ status: "Open", engineerEmail: "e2@x.ph" }];
  assert.equal(S.defaultEngineer(engineers, "Naga", reports).name, "Engineer 3");
  assert.equal(S.defaultEngineer(engineers, "Las Pinas", reports).name, "Engineer 1", "Las Piñas matches Las Pinas");
  assert.equal(S.defaultEngineer(engineers, "Cebu", reports).name, "Engineer 1", "no match: least loaded");
  assert.equal(S.defaultEngineer([], "Naga", reports), null);
  assert.equal(S.clientBranch("Bicol Lab", { clients: [{ name: "Bicol Lab", area: "Region V" }] }), "Naga");
  assert.equal(S.clientBranch("X", { clients: [{ name: "X", area: "Region V" }], sales: [{ client: "X", branch: "Las Pinas", date: "2026-10-01" }] }), "Las Pinas");
  const prior = [{ id: "TSR-9", serialNo: "Z5-001", status: "Resolved", closedAt: new Date(at(-24 * 12)).toISOString() }, { id: "TSR-8", serialNo: "Z5-001", status: "Resolved", closedAt: new Date(at(-24 * 40)).toISOString() }];
  assert.equal(S.reopenOf({ id: "new", serialNo: "z5-001" }, prior, at(0)), "TSR-9");
  assert.equal(S.reopenOf({ id: "new", serialNo: "OTHER" }, prior, at(0)), "");
  // Placeholder serials ("-", "N/A" …) are not a unit: two "-" tickets are not the same problem coming back.
  const dash = [{ id: "TSR-2026-0641", serialNo: "-", status: "Resolved", closedAt: new Date(at(-24)).toISOString() }];
  for (const serial of ["-", " - ", "N/A", "n/a", "none", "0", "000", "TBA", "--", "x", ""]) {
    assert.equal(S.serialKey(serial), "", JSON.stringify(serial));
    assert.equal(S.reopenOf({ id: "TSR-2026-0640", serialNo: serial }, [{ ...dash[0], serialNo: serial }], at(0)), "", JSON.stringify(serial));
  }
  assert.equal(S.serialKey(" z5 2107 01617 "), "Z5210701617");
  assert.equal(S.serialKey("838920930409"), "838920930409");
});

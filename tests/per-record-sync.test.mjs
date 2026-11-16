// Runs the real public/scripts/state.js in a sandbox: per-record saves for shared lists
// (notifications, calendar, collection follow-ups) and live-sync merging while edits are unsent.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = ["config-data.js", "state.js"].map((file) => readFileSync(new URL(`../public/scripts/${file}`, import.meta.url), "utf8")).join("\n;\n");
const el = () => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : el()), apply: () => el() });

function setup({ failSaves = 0 } = {}) {
  const sent = [];
  const stateSaves = [];
  let failures = failSaves;
  const api = {
    session: () => ({ access_token: "t" }),
    dataLoadedAt: () => "2026-11-16T00:00:00Z",
    saveRecords: async (records) => {
      sent.push(JSON.parse(JSON.stringify(records)));
      if (failures > 0) { failures -= 1; throw Object.assign(new Error("Failed to fetch"), { status: 0 }); }
      return { ok: true };
    },
    saveAppState: async (payload) => { stateSaves.push(payload); return { ok: true }; },
  };
  const sandbox = { console, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, URL, structuredClone, navigator: { onLine: true }, location: { search: "", hostname: "x", protocol: "https:" }, document: el(), window: el(), localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MedlaneAPI: api, toast() {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx);
  vm.runInContext(`currentUser = { role: "Superadmin", email: "a@x" }; data = normalizeData({ ...emptyProductionData() }); beginSaveOperation = () => {}; endSaveOperation = () => {};`, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { run, sent, stateSaves };
}
const notice = (id, createdAt, extra = {}) => ({ id, createdAt, type: "PO", message: id, status: "Unread", ...extra });

describe("per-record shared lists", () => {
  test("a notice someone else adds is not lost while this tab has its own unsent notice", async () => {
    const { run, sent } = setup();
    run(`data.notifications.unshift(${JSON.stringify(notice("NTF-mine", "2026-11-16T02:00:00Z"))}); markRecordsDirty("notifications", [data.notifications[0]]);`);
    // Another user's notice arrives while mine is still unsent: it is a different record, so it merges now.
    run(`mergeLiveChanges([{ module: "notifications", key: "NTF-theirs", data: ${JSON.stringify(notice("NTF-theirs", "2026-11-16T02:00:01Z"))} }])`);
    assert.equal(run(`data.notifications.map((n) => n.id).join()`), "NTF-theirs,NTF-mine");
    await run(`flushDirtyRecords()`);
    // Only my notice is sent — never the whole list.
    assert.deepEqual(sent.map((p) => p.notifications.map((n) => n.id)), [["NTF-mine"]]);
  });

  test("a live update to a record with an unsent edit waits, then applies once saved", async () => {
    const { run } = setup();
    run(`data.notifications = [${JSON.stringify(notice("NTF-1", "2026-11-16T02:00:00Z"))}]; data.notifications[0].status = "Read"; markRecordsDirty("notifications", [data.notifications[0]]);`);
    run(`mergeLiveChanges([{ module: "notifications", key: "NTF-1", data: ${JSON.stringify(notice("NTF-1", "2026-11-16T02:00:00Z", { message: "edited elsewhere" }))} }])`);
    assert.equal(run(`data.notifications[0].status`), "Read", "unsent local edit is not overwritten");
    await run(`flushDirtyRecords()`);
    run(`mergeLiveChanges([])`);
    assert.equal(run(`data.notifications[0].message`), "edited elsewhere", "held update applied after the save");
  });

  test("background saves never send a whole per-record list", () => {
    const { run, stateSaves } = setup();
    run(`data.notifications = [${JSON.stringify(notice("NTF-1", "x"))}, ${JSON.stringify(notice("NTF-2", "y"))}]; data.calendarEvents = [{ id: "EVT-1", title: "x", date: "2099-01-01", time: "09:00" }];`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(savePayloadForKeys(["notifications", "calendarEvents"].filter((k) => !PER_RECORD_ONLY_KEYS.includes(k))))`)), {});
    run(`saveData(["notifications", "calendarEvents", "collectionContacts"])`);
    assert.equal(stateSaves.length, 0);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(readPendingSaveQueue())`)), {});
  });

  test("a failed calendar save retries only that event, not everyone's events", async () => {
    const { run, sent } = setup({ failSaves: 1 });
    run(`data.calendarEvents = [{ id: "EVT-other", title: "theirs", date: "2099-01-01", time: "09:00" }];`);
    const result = await run(`(async () => { const entry = { id: "EVT-mine", title: "mine", date: "2099-01-02", time: "10:00" }; data.calendarEvents.push(entry); return persistRecords({ calendarEvents: [entry] }); })()`);
    assert.equal(result.queued, true);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(readPendingSaveQueue())`)), {}, "nothing queued as a whole list");
    await run(`flushDirtyRecords()`);
    assert.deepEqual(sent.map((p) => p.calendarEvents.map((e) => e.id)), [["EVT-mine"], ["EVT-mine"]]);
    assert.equal(run(`isRecordDirty("calendarEvents", "EVT-mine")`), false);
  });

  test("collection contacts are one record per client", () => {
    const { run } = setup();
    assert.equal(run(`saveRecordKeyFor("collectionContacts", { client: "Alpha" }, 4)`), "Alpha");
  });

  test("old whole-list snapshots of per-record modules are dropped from the retry queue", () => {
    const { run } = setup();
    run(`pendingSaveQueueMemoryKey = pendingSaveQueueKey(); pendingSaveQueueMemory = { notifications: [], sales: [] }; pendingSaveQueueMeta = { notifications: newPendingSaveMeta(), sales: newPendingSaveMeta() };`);
    const dropped = run(`prunePendingSaveQueue(null)`);
    assert.deepEqual([...dropped], ["notifications"]);
  });

  test("cleared notices are hidden and the rest are newest first", () => {
    const { run } = setup();
    const list = run(`normalizeData({ ...emptyProductionData(), notifications: [${JSON.stringify(notice("a", "2026-11-15T00:00:00Z"))}, ${JSON.stringify(notice("b", "2026-11-16T00:00:00Z"))}, ${JSON.stringify(notice("c", "2026-11-17T00:00:00Z", { cleared: true }))}] }).notifications.map((n) => n.id).join()`);
    assert.equal(list, "b,a");
  });
});

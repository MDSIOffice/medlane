import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

const { trimPerRecordLogs, newestNoticesFirst, recordKeyFor } = worker;
const notice = (id, createdAt, extra = {}) => ({ module_name: "notifications", record_key: id, data: { id, createdAt, ...extra } });

describe("per-record keys", () => {
  test("notices and history are keyed by their own id, not list position", () => {
    assert.equal(recordKeyFor("notifications", { id: "NTF-1", message: "x" }, 0), "NTF-1");
    assert.equal(recordKeyFor("collectionContactHistory", { id: "CCH-1", client: "A" }, 3), "CCH-1");
  });
  test("collection contacts are keyed by client", () => {
    assert.equal(recordKeyFor("collectionContacts", { client: "St. Luke's", status: "Pending" }, 7), "St. Luke's");
  });
});

describe("notice ordering", () => {
  test("newest first, cleared hidden, undated last in original order", () => {
    const list = newestNoticesFirst([{ id: "a", createdAt: "2026-11-15T00:00:00Z" }, { id: "u1" }, { id: "b", createdAt: "2026-11-16T00:00:00Z" }, { id: "c", createdAt: "2026-11-17T00:00:00Z", cleared: true }, { id: "u2" }]);
    assert.deepEqual(list.map((n) => n.id), ["b", "a", "u1", "u2"]);
  });
});

describe("load trimming", () => {
  test("keeps the newest 150 notices, every generated alert, no cleared ones, and other modules untouched", () => {
    const rows = [];
    for (let i = 0; i < 200; i += 1) rows.push(notice(`NTF-${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
    rows.push(notice("GEN-ar-overdue", "2020-01-01T00:00:00Z", { generated: true }));
    rows.push(notice("NTF-cleared", "2030-01-01T00:00:00Z", { cleared: true }));
    rows.push({ module_name: "sales", record_key: "SI-1", data: { id: "SI-1" } });
    const kept = trimPerRecordLogs(rows);
    const keys = new Set(kept.map((row) => row.record_key));
    assert.equal(kept.filter((row) => row.module_name === "notifications" && !row.data.generated).length, 150);
    assert.ok(keys.has("NTF-199") && keys.has("NTF-50") && !keys.has("NTF-49"));
    assert.ok(keys.has("GEN-ar-overdue"));
    assert.ok(!keys.has("NTF-cleared"));
    assert.ok(keys.has("SI-1"));
  });
});

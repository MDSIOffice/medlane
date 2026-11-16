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

describe("trimmed state load", () => {
  const { loadStateRows, trimPaginatedModuleRows: trim } = worker;
  const env = { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "k", ENVIRONMENT: "test" };
  const row = (module_name, record_key, data, updated_at = "2026-01-01T00:00:00+00:00") => ({ module_name, record_key, data, updated_at });

  test("uses the database's pre-trimmed rows, totals and cursor", async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push(String(input));
      return Response.json({ rows: [row("clients", "A", { name: "A" })], totals: { sales: 900 }, cursor: "2026-11-16T00:00:00+00:00" });
    };
    const result = await loadStateRows(env, "production");
    assert.ok(calls[0].endsWith("/rest/v1/rpc/app_state_load"));
    assert.equal(result.rows.length, 1);
    assert.equal(result.totals.sales, 900);
    assert.equal(result.cursor, "2026-11-16T00:00:00+00:00");
  });

  test("falls back to the full read when the function isn't installed yet", async () => {
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/rpc/app_state_load")) return Response.json({ code: "PGRST202", message: "Could not find the function public.app_state_load in the schema cache" }, { status: 404 });
      return Response.json([row("clients", "A", { name: "A" }, "2026-01-01T00:00:00+00:00"), row("clients", "B", { name: "B" }, "2026-01-02T00:00:00+00:00")]);
    };
    const result = await loadStateRows(env, "production");
    assert.equal(result.rows.length, 2);
    assert.equal(result.totals, null);
    assert.equal(result.cursor, "2026-01-02T00:00:00+00:00");
    assert.ok(calls.some((url) => url.includes("/rest/v1/app_records?")));
  });

  test("other database errors are not hidden by the fallback", async () => {
    globalThis.fetch = async () => Response.json({ message: "permission denied for table app_records" }, { status: 403 });
    await assert.rejects(loadStateRows(env, "production"), /permission denied/);
  });

  test("'Load previous' still knows about rows the database left out", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row("sales", `SI-${i}`, { date: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}`, status: "Active", net: 0, paid: 0 }));
    assert.equal(trim(rows).pagination.sales.hasMore, true);
    assert.equal(trim(rows.slice(0, 50)).pagination.sales.hasMore, false);
    assert.equal(trim(rows.slice(0, 50), { sales: 900 }).pagination.sales.hasMore, true);
  });
});

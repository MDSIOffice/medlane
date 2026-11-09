// Backup → restore round trip: proves a backup file written to R2 can actually be read back and
// restored, for every module the app saves, using the real createBackup()/restoreBackupObject()
// against an in-memory Supabase (with PostgREST paging) and an in-memory R2 bucket.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

const { createBackup, restoreBackupObject, persistedKeys } = worker;
const STATE = "production";
const NOT_RESTORED = ["logs", "game-scores", "system-monitoring", "perf-snapshots", "discordKnownClients", "system-reset"];

/** In-memory app_records table + the few other endpoints the backup path calls. */
function fakeSupabase() {
  /** @type {Map<string, any>} */
  const table = new Map();
  const id = (row) => `${row.state_key}|${row.module_name}|${row.record_key}`;
  let clock = Date.parse("2026-11-01T00:00:00Z");
  const put = (row) => table.set(id(row), { ...row, updated_at: new Date(clock++).toISOString() });
  const listFrom = (rawQuery) => {
    const q = new URLSearchParams(rawQuery);
    let rows = [...table.values()].filter((row) => !q.get("state_key") || row.state_key === q.get("state_key").replace(/^eq\./, ""));
    const moduleFilter = q.get("module_name");
    if (moduleFilter?.startsWith("eq.")) rows = rows.filter((row) => row.module_name === moduleFilter.slice(3));
    if (moduleFilter?.startsWith("not.in.(")) {
      const excluded = moduleFilter.slice(8, -1).split(",").map((name) => name.replace(/^"|"$/g, ""));
      rows = rows.filter((row) => !excluded.includes(row.module_name));
    }
    if (q.get("record_key")?.startsWith("eq.")) rows = rows.filter((row) => row.record_key === q.get("record_key").slice(3));
    rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const total = rows.length;
    const offset = Number(q.get("offset") || 0);
    const limit = Number(q.get("limit") || total);
    return { page: rows.slice(offset, offset + limit), total, offset };
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/app_records" && method === "GET") {
      const { page, total, offset } = listFrom(url.search);
      // Real PostgREST page cap is enforced by limit; the content-range total drives supabaseFetchAll paging.
      return Response.json(page, { headers: { "content-range": `${offset}-${offset + page.length - 1}/${total}` } });
    }
    if (url.pathname === "/rest/v1/app_records" && method === "POST") {
      const body = JSON.parse(init.body);
      for (const row of Array.isArray(body) ? body : [body]) put({ state_key: STATE, ...row });
      return new Response(null, { status: 201 });
    }
    if (url.pathname === "/rest/v1/backup_runs" && method === "POST") return Response.json([{ id: crypto.randomUUID(), ...JSON.parse(init.body) }], { status: 201 });
    if (url.pathname.startsWith("/rest/v1/rpc/")) return Response.json([{ ok: true }]);
    throw new Error(`Unexpected request in backup test: ${method} ${url.pathname}${url.search}`);
  };
  return {
    seed: (moduleName, recordKey, data) => put({ state_key: STATE, module_name: moduleName, record_key: recordKey, data, updated_by: null }),
    get: (moduleName, recordKey) => table.get(`${STATE}|${moduleName}|${recordKey}`)?.data,
    rows: (moduleName) => [...table.values()].filter((row) => row.module_name === moduleName),
    wipeExcept: (keep) => { for (const [key, row] of table) if (!keep.includes(row.module_name)) table.delete(key); },
    clear: () => table.clear(),
  };
}

/** In-memory R2 bucket with the get/put/delete surface the worker uses. */
function fakeBucket() {
  /** @type {Map<string, Uint8Array>} */
  const objects = new Map();
  return {
    objects,
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) { const bytes = objects.get(key); return bytes ? { body: new Blob([bytes]).stream() } : null; },
    async delete(key) { objects.delete(key); },
  };
}

const gzipJson = async (value) => new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const gunzipJson = async (bytes) => JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text());

// A realistic record for every module the app persists, including awkward content.
const sample = (moduleName) => ({
  id: `${moduleName}-1`,
  name: `Sample ${moduleName} — Ñiño & "Co." <lab>, 日本`,
  amount: 12345.67,
  qty: 0.5,
  nested: { lines: [{ item: "Reagent", lot: "L-001", expiry: "2027-01-31" }], flags: [true, false, null] },
  note: "line one\nline two, with comma",
});

let db, bucket, env;
beforeEach(() => {
  db = fakeSupabase();
  bucket = fakeBucket();
  env = { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key", ENVIRONMENT: "production", DOCUMENTS_BUCKET: bucket };
});

describe("backup files can be restored", () => {
  test("round trip: every persisted module comes back exactly after a wipe", async () => {
    const restorable = persistedKeys.filter((key) => key !== "logs");
    for (const moduleName of restorable) db.seed(moduleName, `${moduleName}-1`, sample(moduleName));
    for (const moduleName of NOT_RESTORED) db.seed(moduleName, "x", { value: moduleName });
    db.seed("game-sessions", "token", { used: false });

    const run = await createBackup(env, "manual", null);
    assert.ok(bucket.objects.has(run.object_key), "backup object was written to R2");

    // The file itself: valid gzip JSON with everything except game-sessions.
    const payload = await gunzipJson(bucket.objects.get(run.object_key));
    assert.equal(payload.app, "medlane");
    assert.equal(payload.stateKey, STATE);
    assert.equal(run.records_count, payload.records.length);
    assert.ok(!payload.records.some((row) => row.module_name === "game-sessions"));

    db.wipeExcept(["users"]);
    for (const moduleName of restorable.filter((key) => key !== "users")) assert.equal(db.get(moduleName, `${moduleName}-1`), undefined);

    const result = await restoreBackupObject(env, run.object_key, null, {});
    assert.equal(result.restoredRecords, restorable.length);
    for (const moduleName of restorable) assert.deepEqual(db.get(moduleName, `${moduleName}-1`), sample(moduleName), `${moduleName} restored exactly`);
    // Deliberately not restored: audit logs and system/game bookkeeping.
    for (const moduleName of NOT_RESTORED.filter((name) => name !== "system-reset")) assert.equal(db.get(moduleName, "x"), undefined, `${moduleName} is not restored`);
  });

  test("a large backup (beyond one 1,000-row page) is complete and fully restorable", async () => {
    const count = 2600;
    for (let index = 0; index < count; index += 1) db.seed("sales", `SI-${index}`, { documentNo: `SI-${index}`, net: index });
    const run = await createBackup(env, "manual", null);
    const payload = await gunzipJson(bucket.objects.get(run.object_key));
    assert.equal(payload.records.length, count, "no rows silently cut off by paging");
    db.clear();
    const result = await restoreBackupObject(env, run.object_key, null, {});
    assert.equal(result.restoredRecords, count);
    assert.equal(db.rows("sales").length, count);
    assert.deepEqual(db.get("sales", "SI-2599"), { documentNo: "SI-2599", net: 2599 });
  });

  test("restore takes a pre-restore safety backup of the live data first, and that one is restorable too", async () => {
    db.seed("clients", "Old Lab", { name: "Old Lab" });
    const old = await createBackup(env, "manual", null);
    db.seed("clients", "Old Lab", { name: "Old Lab", terms: 90 });
    db.seed("clients", "New Lab", { name: "New Lab" });

    const result = await restoreBackupObject(env, old.object_key, null, {});
    const safety = await gunzipJson(bucket.objects.get(result.preRestoreBackupKey));
    assert.deepEqual(safety.records.find((row) => row.record_key === "Old Lab").data, { name: "Old Lab", terms: 90 });

    // Undo the restore by restoring the safety backup.
    await restoreBackupObject(env, result.preRestoreBackupKey, null, {});
    assert.deepEqual(db.get("clients", "Old Lab"), { name: "Old Lab", terms: 90 });
  });

  test("restore reverts edited records but keeps records created after the backup (merge, not replace)", async () => {
    db.seed("clients", "Lab A", { name: "Lab A", terms: 30 });
    const run = await createBackup(env, "manual", null);
    db.seed("clients", "Lab A", { name: "Lab A", terms: 60 });
    db.seed("clients", "Lab B", { name: "Lab B" });
    await restoreBackupObject(env, run.object_key, null, {});
    assert.deepEqual(db.get("clients", "Lab A"), { name: "Lab A", terms: 30 });
    assert.deepEqual(db.get("clients", "Lab B"), { name: "Lab B" }, "records newer than the backup are not deleted");
  });

  test("restore sets the data-reset marker so stale browser saves can't undo it", async () => {
    db.seed("sales", "SI-1", { documentNo: "SI-1" });
    const run = await createBackup(env, "manual", null);
    const before = Date.now();
    await restoreBackupObject(env, run.object_key, null, {});
    const marker = db.get("system-reset", "marker");
    assert.ok(marker && Date.parse(marker.resetAt) >= before - 1000);
  });
});

describe("bad backup files are refused without touching data", () => {
  const putRaw = async (key, value) => { bucket.objects.set(key, value instanceof Uint8Array ? value : await gzipJson(value)); return key; };
  const key = (name) => `backups/${STATE}/manual/${name}.json.gz`;
  const assertUntouched = () => assert.deepEqual(db.get("clients", "Live"), { name: "Live" });
  beforeEach(() => db.seed("clients", "Live", { name: "Live" }));

  test("key outside this environment's backup folder", async () => {
    await assert.rejects(restoreBackupObject(env, "uploads/general/x.json.gz", null, {}), /Invalid backup object key/);
  });
  test("missing file", async () => {
    await assert.rejects(restoreBackupObject(env, key("missing"), null, {}), /not found/);
  });
  test("not a Medlane backup", async () => {
    await assert.rejects(restoreBackupObject(env, await putRaw(key("other"), { app: "other", stateKey: STATE, records: [] }), null, {}), /Invalid Medlane backup payload/);
    assertUntouched();
  });
  test("backup from another environment", async () => {
    await assert.rejects(restoreBackupObject(env, await putRaw(key("preview"), { app: "medlane", stateKey: "preview", records: [{ module_name: "clients", record_key: "Live", data: { name: "WRONG" } }] }), null, {}), /Invalid Medlane backup payload/);
    assertUntouched();
  });
  test("backup with nothing restorable", async () => {
    await assert.rejects(restoreBackupObject(env, await putRaw(key("logs-only"), { app: "medlane", stateKey: STATE, records: [{ module_name: "logs", record_key: "l1", data: {} }] }), null, {}), /no restorable app records/);
    assertUntouched();
  });
  test("corrupted (truncated) file", async () => {
    const good = await gzipJson({ app: "medlane", stateKey: STATE, records: [{ module_name: "clients", record_key: "Live", data: { name: "WRONG" } }] });
    await assert.rejects(restoreBackupObject(env, await putRaw(key("truncated"), good.slice(0, Math.floor(good.length / 2))), null, {}));
    assertUntouched();
  });
});

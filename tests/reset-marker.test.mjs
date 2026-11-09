import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, stored } from "./helpers/load-worker.mjs";

const { assertSaveNotStale } = worker;
const RESET = "2026-11-09T10:00:00.000Z";
const withMarker = (resetAt = RESET) => mockSupabase({ "system-reset": resetAt ? [stored("marker", { resetAt })] : [] });

describe("data-reset marker", () => {
  test("a save based on data loaded before the reset is refused as a conflict", async () => {
    withMarker();
    await assert.rejects(assertSaveNotStale(env, STATE, "2026-11-09T09:59:59.000Z"), /APP_STATE_CONFLICT: STALE_SNAPSHOT/);
  });
  test("a save based on data loaded after the reset passes", async () => {
    withMarker();
    await assertSaveNotStale(env, STATE, "2026-11-09T10:00:01.000Z");
  });
  test("a Postgres-formatted resetAt (from the SQL wipe) is compared by time, not text", async () => {
    withMarker("2026-11-09 18:00:00+08");
    await assert.rejects(assertSaveNotStale(env, STATE, "2026-11-09T09:59:00.000Z"), /STALE_SNAPSHOT/);
    await assertSaveNotStale(env, STATE, "2026-11-09T10:01:00.000Z");
  });
  test("no marker means nothing is stale", async () => {
    withMarker(null);
    await assertSaveNotStale(env, STATE, "2001-01-01T00:00:00.000Z");
  });
  test("a save without basedOn (older cached build) is not checked", async () => {
    const calls = withMarker();
    await assertSaveNotStale(env, STATE, undefined);
    assert.equal(calls.length, 0);
  });
});

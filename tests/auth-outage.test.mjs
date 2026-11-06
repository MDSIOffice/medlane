// A Supabase outage must not look like an expired login: the client logs people out on a refused one.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv } from "./helpers/load-worker.mjs";

const env = { ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key" };

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const supabaseAnswers = (status, body) => { globalThis.fetch = async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); };
const refresh = () => worker.default.fetch(new Request("https://x.test/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: "r1" }) }), env, { waitUntil() {} });
const check = () => worker.authenticatedUser(new Request("https://x.test/", { headers: { authorization: "Bearer t" } }), env);

describe("/api/auth/refresh", () => {
  for (const status of [500, 502, 503, 429]) {
    test(`Supabase ${status} comes back as 503, not 401`, async () => {
      supabaseAnswers(status, "<html>down</html>");
      assert.equal((await refresh()).status, 503);
    });
  }
  test("a 200 with no token comes back as 503", async () => {
    supabaseAnswers(200, {});
    assert.equal((await refresh()).status, 503);
  });
  for (const status of [400, 401, 403]) {
    test(`Supabase refusing the token with ${status} comes back as 401`, async () => {
      supabaseAnswers(status, { error_description: "Invalid Refresh Token" });
      const response = await refresh();
      assert.equal(response.status, 401);
      assert.match((await response.json()).error, /Invalid Refresh Token/);
    });
  }
});

describe("authenticatedUser", () => {
  for (const status of [500, 503, 429]) {
    test(`Supabase ${status} isn't reported as an expired session`, async () => {
      supabaseAnswers(status, "<html>down</html>");
      await assert.rejects(check(), /temporarily unavailable/);
    });
  }
  for (const status of [401, 403]) {
    test(`Supabase ${status} is still an expired session`, async () => {
      supabaseAnswers(status, {});
      await assert.rejects(check(), /Invalid or expired session/);
    });
  }
  test("a valid user still passes", async () => {
    supabaseAnswers(200, { id: "u1" });
    assert.equal((await check()).user.id, "u1");
  });
});

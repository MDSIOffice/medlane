// Runs the real public/scripts/api-client.js in a sandbox with a fake browser and server.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/api-client.js", import.meta.url), "utf8");
const NOW = 1_800_000_000_000;
const jwt = (expiresInSeconds, tag = "x") => `h.${Buffer.from(JSON.stringify({ exp: NOW / 1000 + expiresInSeconds, tag })).toString("base64url")}.${tag}`;
const FRESH = 3600;

function setup({ token = jwt(FRESH), refreshToken = "r1", appSession = "s1", refresh = () => ({ status: 200, body: { session: { access_token: jwt(FRESH, "new"), refresh_token: "r2" } } }), api } = {}) {
  const store = new Map();
  const calls = [];
  const clock = { now: NOW };
  const validToken = (auth) => { try { return JSON.parse(Buffer.from(auth.replace("Bearer ", "").split(".")[1], "base64url")).exp * 1000 > clock.now; } catch { return false; } };
  const fakeFetch = async (path, options = {}) => {
    const url = String(path);
    const auth = options.headers?.Authorization || "";
    calls.push({ url, auth });
    const reply = ({ status = 200, body = {} }) => new Response(JSON.stringify(body), { status });
    if (url === "/api/auth/refresh") return reply(await refresh());
    if (api) return reply(api(url, auth));
    if (!auth) return reply({ status: 401, body: { error: "Authentication required" } });
    if (!validToken(auth)) return reply({ status: 401, body: { error: "Invalid or expired session" } });
    return reply({ body: { ok: true, cursor: "c2", changesCursor: "c1", url } });
  };
  const toasts = [];
  const sandbox = {
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    fetch: fakeFetch, atob, console, setTimeout, clearTimeout, AbortController, URLSearchParams, URL, FormData,
    navigator: { onLine: true }, toast: (m) => toasts.push(m), logoutCurrentUser() {}, setGlobalLoading() {}, clock,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext("Date.now = () => clock.now;", context);
  vm.runInContext(`${source}\n;globalThis.api = MedlaneAPI;`, context);
  if (token) sandbox.api.setSession({ access_token: token, refresh_token: refreshToken, app_session_id: appSession });
  const count = (url) => calls.filter((c) => c.url === url).length;
  return { api: sandbox.api, calls, count, clock, toasts };
}

describe("renewing before expiry", () => {
  test("a healthy token is left alone", async () => {
    const t = setup();
    await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 0);
  });
  test("an expired token is renewed before the request goes out", async () => {
    const t = setup({ token: jwt(-10) });
    await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 1);
    assert.equal(t.count("/api/x"), 1, "no failed first attempt");
  });
  test("a token inside the margin is renewed", async () => {
    const t = setup({ token: jwt(30) });
    await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 1);
  });
  test("a burst shares one renewal and sends no stale tokens", async () => {
    const t = setup({ token: jwt(-10) });
    await Promise.all(["/api/a", "/api/b", "/api/c", "/api/d", "/api/e"].map((p) => t.api.request(p)));
    assert.equal(t.count("/api/auth/refresh"), 1);
    assert.equal(t.calls.length, 6, "one refresh plus each request exactly once");
    const sent = t.calls.filter((c) => c.url !== "/api/auth/refresh");
    assert.ok(sent.every((c) => c.auth.endsWith(".new")), "every request used the new token");
  });
  test("downloads renew too", async () => {
    const t = setup({ token: jwt(-10) });
    await t.api.viewFile("f1").catch(() => null);
    assert.equal(t.count("/api/auth/refresh"), 1);
    assert.ok(t.calls.find((c) => c.url.startsWith("/api/files/")).auth.endsWith(".new"));
  });
  test("a token that can't be read isn't treated as expiring", async () => {
    const t = setup({ token: "not-a-jwt", api: () => ({ body: {} }) });
    await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 0);
  });
  test("a session with no refresh token doesn't try to renew", async () => {
    const t = setup({ token: jwt(-10), refreshToken: null, api: () => ({ body: {} }) });
    await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 0);
  });
  test("a wrong device clock can't turn every request into a refresh", async () => {
    const t = setup({ token: jwt(FRESH), api: () => ({ body: {} }) });
    t.clock.now = NOW + 10 * 3600 * 1000;
    for (let i = 0; i < 5; i += 1) await t.api.request("/api/x");
    assert.equal(t.count("/api/auth/refresh"), 1);
  });
});

describe("when renewal fails", () => {
  const failing = () => ({ status: 401, body: { error: "Invalid Refresh Token" } });
  test("a request still ends in the existing logout", async () => {
    const t = setup({ token: jwt(-10), refresh: failing });
    await assert.rejects(t.api.request("/api/x"), /session has expired/);
    assert.equal(t.api.session(), null);
  });
  test("a healthy-looking request isn't logged out by a failed early renewal", async () => {
    const t = setup({ token: jwt(30), refresh: failing });
    await t.api.request("/api/x");
    assert.notEqual(t.api.session(), null, "token still valid for 30s, so the user stays in");
  });
});

describe("a temporary failure doesn't end the login", () => {
  const expired = { status: 401, body: { error: "Invalid or expired session" } };
  for (const status of [500, 502, 503, 429]) {
    test(`renewal answering ${status} keeps the session`, async () => {
      const t = setup({ token: jwt(-10), refresh: () => ({ status, body: {} }) });
      await assert.rejects(t.api.request("/api/x"), (error) => error.status === status);
      assert.notEqual(t.api.session(), null);
      assert.deepEqual(t.toasts, []);
    });
  }
  test("renewal that can't reach the server keeps the session, marked retryable", async () => {
    const t = setup({ token: jwt(-10), refresh: () => { throw new TypeError("Failed to fetch"); } });
    await assert.rejects(t.api.request("/api/x"), (error) => error.transient === true);
    assert.notEqual(t.api.session(), null);
  });
  test("renewal returning no token keeps the session", async () => {
    const t = setup({ token: jwt(-10), refresh: () => ({ status: 200, body: {} }) });
    await assert.rejects(t.api.request("/api/x"));
    assert.notEqual(t.api.session(), null);
  });
  test("the same request works once the server is back", async () => {
    let healthy = false;
    const t = setup({ token: jwt(-10), refresh: () => (healthy ? { status: 200, body: { session: { access_token: jwt(FRESH, "new"), refresh_token: "r2" } } } : { status: 503, body: {} }) });
    await assert.rejects(t.api.request("/api/x"));
    healthy = true;
    assert.equal((await t.api.request("/api/x")).ok, true);
    assert.notEqual(t.api.session(), null);
  });
  test("saves retry through it instead of losing the session", async () => {
    let refreshes = 0;
    const t = setup({ token: jwt(-10), refresh: () => { refreshes += 1; return refreshes < 2 ? { status: 503, body: {} } : { status: 200, body: { session: { access_token: jwt(FRESH, "new"), refresh_token: "r2" } } }; } });
    assert.equal((await t.api.saveAppState({}, 1)).ok, true);
    assert.notEqual(t.api.session(), null);
  });
  for (const status of [400, 401]) {
    test(`the server refusing the token with ${status} still logs out`, async () => {
      const t = setup({ token: jwt(-10), refresh: () => ({ status, body: { error: "Invalid Refresh Token" } }) });
      await assert.rejects(t.api.request("/api/x"), /session has expired/);
      assert.equal(t.api.session(), null);
    });
  }
  test("a request the client didn't predict gets the same treatment", async () => {
    const t = setup({ refresh: () => ({ status: 503, body: {} }), api: () => expired });
    await assert.rejects(t.api.request("/api/x"), (error) => error.status === 503);
    assert.notEqual(t.api.session(), null);
  });
});

describe("logging out during a renewal", () => {
  const gate = () => { let open; const opened = new Promise((r) => { open = r; }); return { opened, open }; };
  const ok = { status: 200, body: { session: { access_token: jwt(FRESH, "old-user"), refresh_token: "r2" } } };
  test("doesn't bring the session back", async () => {
    const g = gate();
    const t = setup({ token: jwt(-10), refresh: async () => { await g.opened; return ok; } });
    const renewal = t.api.refreshSession();
    t.api.setSession(null);
    g.open();
    await renewal;
    assert.equal(t.api.session(), null);
  });
  test("doesn't overwrite someone else's new login", async () => {
    const g = gate();
    const t = setup({ token: jwt(-10), refresh: async () => { await g.opened; return ok; } });
    const renewal = t.api.refreshSession();
    t.api.setSession({ access_token: "other", refresh_token: "r9", app_session_id: "s2" });
    g.open();
    await renewal;
    assert.equal(t.api.session().access_token, "other");
  });
});

describe("background polling", () => {
  const start = async (t) => { await t.api.loadAppState(); t.calls.length = 0; };
  test("renews before polling", async () => {
    const t = setup({ refresh: () => ({ status: 200, body: { session: { access_token: jwt(9 * FRESH, "new"), refresh_token: "r2" } } }) });
    await start(t);
    t.clock.now = NOW + (FRESH + 60) * 1000;
    const payload = await t.api.loadChanges();
    assert.equal(payload.ok, true);
    assert.equal(t.count("/api/auth/refresh"), 1);
    assert.equal(t.calls.filter((c) => c.url.includes("/changes")).length, 1, "no failed first attempt");
  });
  test("renews and retries once on a 401 the client didn't predict", async () => {
    let first = true;
    const t = setup({ api: (url, auth) => {
      if (url.includes("/changes") && first) { first = false; return { status: 401, body: { error: "Invalid or expired session" } }; }
      return { body: { ok: true, cursor: "c2", changesCursor: "c1", auth } };
    } });
    await start(t);
    const payload = await t.api.loadChanges();
    assert.equal(payload.ok, true);
    assert.ok(payload.auth.endsWith(".new"));
    assert.equal(t.count("/api/auth/refresh"), 1);
  });
  test("a failed renewal is silent: no logout, and the next poll tries again", async () => {
    let healthy = false;
    const t = setup({ refresh: () => (healthy ? { status: 200, body: { session: { access_token: jwt(9 * FRESH, "new"), refresh_token: "r2" } } } : { status: 503, body: { error: "down" } }) });
    await start(t);
    t.clock.now = NOW + (FRESH + 60) * 1000;
    assert.equal(await t.api.loadChanges(), null);
    assert.notEqual(t.api.session(), null);
    assert.deepEqual(t.toasts, []);
    healthy = true;
    assert.equal((await t.api.loadChanges()).ok, true);
  });
  for (const error of ["SESSION_REVOKED", "SESSION_EXPIRED_12H"]) {
    test(`${error} doesn't trigger a renewal`, async () => {
      const t = setup({ api: (url) => (url.includes("/changes") ? { status: 401, body: { error } } : { body: { changesCursor: "c1" } }) });
      await start(t);
      assert.equal(await t.api.loadChanges(), null);
      assert.equal(t.count("/api/auth/refresh"), 0);
      assert.notEqual(t.api.session(), null);
    });
  }
  test("a server error returns nothing", async () => {
    const t = setup({ api: (url) => (url.includes("/changes") ? { status: 500, body: {} } : { body: { changesCursor: "c1" } }) });
    await start(t);
    assert.equal(await t.api.loadChanges(), null);
  });
  test("signed out returns nothing and sends nothing", async () => {
    const t = setup();
    await start(t);
    t.api.setSession(null);
    assert.equal(await t.api.loadChanges(), null);
    assert.equal(t.calls.length, 0);
  });
});

describe("existing session handling still works", () => {
  test("an unpredicted 401 still renews and retries", async () => {
    let first = true;
    const t = setup({ api: () => { if (first) { first = false; return { status: 401, body: { error: "Invalid or expired session" } }; } return { body: { ok: true } }; } });
    assert.equal((await t.api.request("/api/x")).ok, true);
    assert.equal(t.count("/api/auth/refresh"), 1);
  });
  test("a revoked session still logs out", async () => {
    const t = setup({ api: () => ({ status: 401, body: { error: "SESSION_REVOKED" } }) });
    await assert.rejects(t.api.request("/api/x"), /session was ended/);
    assert.equal(t.api.session(), null);
  });
  test("the 12-hour limit still logs out", async () => {
    const t = setup({ api: () => ({ status: 401, body: { error: "SESSION_EXPIRED_12H" } }) });
    await assert.rejects(t.api.request("/api/x"), /12-hour session/);
    assert.equal(t.api.session(), null);
  });
});

// Reproduced in a browser: this render sent eight tokenless API calls from the login page.
describe("the logged-out login page", () => {
  test("doesn't render the app", () => {
    const boot = readFileSync(new URL("../public/scripts/events-bootstrap.js", import.meta.url), "utf8");
    const route = boot.slice(boot.indexOf("async function initializeRoute()"), boot.indexOf("\ninitializeRoute();"));
    const loggedOut = route.slice(route.lastIndexOf('document.body.classList.add("login-route")'));
    assert.ok(loggedOut.includes("applyRole()"), "found the logged-out branch");
    assert.ok(!/^\s*renderAll\(\)/m.test(loggedOut));
  });
});

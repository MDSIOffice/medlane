// Account settings endpoints on the Worker: a user only ever sees and signs out their own sessions,
// signing out revokes the session on the server (the next request with it is refused) and writes an
// activity entry, and preference / notification changes are validated server-side.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv } from "./helpers/load-worker.mjs";

const env = { ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const S_HERE = "aaaaaaaa-0000-4000-8000-000000000001";
const S_PHONE = "aaaaaaaa-0000-4000-8000-000000000002";
const S_LAPTOP = "aaaaaaaa-0000-4000-8000-000000000003";
const S_THEIRS = "bbbbbbbb-0000-4000-8000-000000000001";
const recent = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

function fakeSupabase() {
  const db = {
    profiles: [
      { id: ME, email: "me@example.com", full_name: "Ana Cruz", role: "Sales", branch: "all", phone: "", created_at: "2026-01-01T00:00:00Z" },
      { id: OTHER, email: "other@example.com", full_name: "Ben Uy", role: "Sales", branch: "all", created_at: "2026-01-01T00:00:00Z" },
    ],
    sessions: [
      { id: S_HERE, user_id: ME, device_name: "macOS", browser: "Chrome", created_at: recent(), last_seen_at: new Date().toISOString(), revoked_at: null },
      { id: S_PHONE, user_id: ME, device_name: "iPhone", browser: "Safari", created_at: recent(), last_seen_at: recent(), revoked_at: null },
      { id: S_LAPTOP, user_id: ME, device_name: "Windows", browser: "Edge", created_at: recent(), last_seen_at: recent(), revoked_at: null },
      { id: S_THEIRS, user_id: OTHER, device_name: "Windows", browser: "Chrome", created_at: recent(), last_seen_at: recent(), revoked_at: null },
    ],
    prefs: [], settings: [], audit: [],
  };
  const filters = (url) => [...url.searchParams.entries()].filter(([key]) => !["select", "order", "limit", "on_conflict"].includes(key));
  const matches = (row, url) => filters(url).every(([key, value]) => {
    if (value === "is.null") return row[key] === null || row[key] === undefined;
    if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
    if (value.startsWith("neq.")) return String(row[key]) !== value.slice(4);
    return true;
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/auth/v1/user") {
      const token = String(init.headers?.authorization || init.headers?.Authorization || "");
      const id = token.includes("other") ? OTHER : ME;
      return Response.json({ id, email: db.profiles.find((p) => p.id === id).email });
    }
    if (url.pathname === "/rest/v1/app_sessions") {
      const rows = db.sessions.filter((row) => matches(row, url));
      if (method === "PATCH") { rows.forEach((row) => Object.assign(row, body)); return Response.json(rows); }
      return Response.json(rows);
    }
    if (url.pathname === "/rest/v1/profiles") {
      const rows = db.profiles.filter((row) => matches(row, url));
      if (method === "PATCH") { rows.forEach((row) => Object.assign(row, body)); return new Response(null, { status: 204 }); }
      return Response.json(rows);
    }
    if (url.pathname === "/rest/v1/module_permissions") return Response.json([]);
    if (url.pathname === "/rest/v1/user_preferences") {
      if (method === "POST") { for (const row of body) { const at = db.prefs.findIndex((p) => p.user_id === row.user_id); if (at >= 0) Object.assign(db.prefs[at], row); else db.prefs.push({ ...row }); } return new Response(null, { status: 201 }); }
      return Response.json(db.prefs.filter((row) => matches(row, url)));
    }
    if (url.pathname === "/rest/v1/notification_settings") {
      if (method === "POST") { for (const row of body) { const at = db.settings.findIndex((s) => s.user_id === row.user_id && s.alert_type === row.alert_type); if (at >= 0) Object.assign(db.settings[at], row); else db.settings.push({ ...row }); } return new Response(null, { status: 201 }); }
      return Response.json(db.settings.filter((row) => matches(row, url)));
    }
    if (url.pathname === "/rest/v1/app_records") { if (method === "POST") db.audit.push(...body.map((row) => row.data)); return method === "GET" ? Response.json([]) : new Response(null, { status: 201 }); }
    return Response.json([]);
  };
  return db;
}

const waits = [];
const ctx = { waitUntil: (p) => { waits.push(p); return p; } };
const settle = async () => { await Promise.all(waits.splice(0)); };
/** @param {string} path @param {{ method?: string, body?: any, session?: string, token?: string }} [options] */
const call = (path, { method = "GET", body, session = S_HERE, token = "Bearer mine" } = {}) => worker.default.fetch(new Request(`https://app.test${path}`, {
  method, headers: { authorization: token, "x-medlane-session-id": session, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
}), env, ctx);

describe("sessions", () => {
  test("the account page lists only my live sessions and marks this device", async () => {
    fakeSupabase();
    const res = await call("/api/account");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.sessions.map((s) => s.id).sort(), [S_HERE, S_PHONE, S_LAPTOP].sort());
    assert.equal(data.sessions.find((s) => s.current).id, S_HERE);
    assert.equal(data.preferences.rowsPerPage, 10);
    assert.ok(data.notificationSettings.some((s) => s.type === "security" && s.locked));
  });

  test("signing out one session revokes it server-side, and that session is refused afterwards", async () => {
    const db = fakeSupabase();
    const res = await call("/api/account/sessions/revoke", { method: "POST", body: { sessionId: S_PHONE } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).revoked, 1);
    assert.ok(db.sessions.find((s) => s.id === S_PHONE).revoked_at);
    assert.equal(db.sessions.find((s) => s.id === S_LAPTOP).revoked_at, null);
    // The phone's next request is rejected.
    const after = await call("/api/auth/me", { session: S_PHONE });
    assert.notEqual(after.status, 200);
    await settle();
    assert.equal(db.audit.filter((e) => e.action === "Signed out a session").length, 1);
    assert.equal(db.audit[0].module, "Account settings");
  });

  test("can't sign out someone else's session", async () => {
    const db = fakeSupabase();
    const res = await call("/api/account/sessions/revoke", { method: "POST", body: { sessionId: S_THEIRS } });
    assert.equal((await res.json()).revoked, 0);
    assert.equal(db.sessions.find((s) => s.id === S_THEIRS).revoked_at, null);
  });

  test("can't sign out this session from here (that's Log out)", async () => {
    fakeSupabase();
    const res = await call("/api/account/sessions/revoke", { method: "POST", body: { sessionId: S_HERE } });
    assert.equal(res.status, 400);
  });

  test("sign out all other sessions: every other one of mine, never this one, never anyone else's", async () => {
    const db = fakeSupabase();
    const res = await call("/api/account/sessions/revoke-others", { method: "POST" });
    assert.equal((await res.json()).revoked, 2);
    assert.equal(db.sessions.find((s) => s.id === S_HERE).revoked_at, null);
    assert.ok(db.sessions.find((s) => s.id === S_PHONE).revoked_at);
    assert.ok(db.sessions.find((s) => s.id === S_LAPTOP).revoked_at);
    assert.equal(db.sessions.find((s) => s.id === S_THEIRS).revoked_at, null);
    await settle();
    assert.equal(db.audit.filter((e) => e.action === "Signed out a session").length, 2);
    // This device still works.
    assert.equal((await call("/api/auth/me")).status, 200);
  });
});

describe("profile, preferences and notification settings", () => {
  test("profile save validates the PH mobile and logs before → after", async () => {
    const db = fakeSupabase();
    const bad = await call("/api/account/profile", { method: "PATCH", body: { fullName: "Ana Cruz", phone: "12345" } });
    assert.equal(bad.status, 400);
    const ok = await call("/api/account/profile", { method: "PATCH", body: { fullName: "Ana Cruz-Reyes", displayName: "Ana", phone: "0917 123 4567" } });
    assert.equal(ok.status, 200);
    assert.equal(db.profiles[0].full_name, "Ana Cruz-Reyes");
    assert.equal(db.profiles[0].phone, "+63 917 123 4567");
    assert.equal(db.prefs[0].display_name, "Ana");
    await settle();
    const entry = db.audit.find((e) => e.action === "Updated own profile");
    assert.ok(entry.changes.some((c) => c.field === "Full name" && c.from === "Ana Cruz" && c.to === "Ana Cruz-Reyes"));
  });

  test("preferences: valid change saved, invalid refused", async () => {
    const db = fakeSupabase();
    assert.equal((await call("/api/account/preferences", { method: "PATCH", body: { rowsPerPage: 30 } })).status, 400);
    const res = await call("/api/account/preferences", { method: "PATCH", body: { rowsPerPage: 25, welcome: "off" } });
    assert.equal(res.status, 200);
    assert.equal(db.prefs[0].rows_per_page, 25);
    assert.equal((await res.json()).preferences.welcome, "off");
  });

  test("notification settings: security can't be turned off; a toggle keeps the other channel", async () => {
    const db = fakeSupabase();
    assert.equal((await call("/api/account/notification-settings", { method: "PUT", body: { type: "security", channel: "email", value: false } })).status, 400);
    const res = await call("/api/account/notification-settings", { method: "PUT", body: { type: "approvals", channel: "email", value: false } });
    assert.equal(res.status, 200);
    assert.deepEqual(db.settings.map(({ alert_type, in_app, email }) => ({ alert_type, in_app, email })), [{ alert_type: "approvals", in_app: true, email: false }]);
  });

  test("login-time account data falls back to defaults before the migration runs", async () => {
    fakeSupabase();
    globalThis.fetch = ((inner) => async (input, init) => (String(input).includes("user_preferences") || String(input).includes("notification_settings") ? Response.json({ message: "relation does not exist" }, { status: 404 }) : inner(input, init)))(globalThis.fetch);
    const res = await call("/api/auth/me");
    assert.equal(res.status, 200);
    const { user } = await res.json();
    assert.equal(user.preferences.welcome, "daily");
    assert.ok(user.notificationSettings.length >= 1);
  });
});

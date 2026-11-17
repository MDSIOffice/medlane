// Users on the Worker: only Superadmin/CEO manage accounts, nobody is hard-deleted, passwords are
// never set by an admin, at least one active Superadmin always remains, invite links count as
// expired 24 hours after they're sent, and every change writes an Audit Log entry.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env as baseEnv } from "./helpers/load-worker.mjs";

const env = { ...baseEnv, SUPABASE_ANON_KEY: "test-anon-key" };
const { inviteInfo, superadminGuardError, userStatusFromAuth } = worker;
const HOUR = 3600000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** A tiny Supabase: profiles + auth users, recording every write. */
function fakeSupabase({ caller, profiles, authUsers }) {
  const db = { profiles: structuredClone(profiles), authUsers: structuredClone(authUsers), audit: [], writes: [], links: 0 };
  const eq = (url, name) => { const value = url.searchParams.get(name); return value?.startsWith("eq.") ? decodeURIComponent(value.slice(3)) : null; };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    if (method !== "GET") db.writes.push({ method, path: url.pathname, search: url.search, body });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: caller, email: db.profiles.find((p) => p.id === caller).email });
    if (url.pathname === "/rest/v1/app_sessions") return method === "GET" ? Response.json([]) : new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/module_permissions") return method === "GET" ? Response.json([]) : new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/app_records") { if (method === "POST") db.audit.push(...body.map((row) => row.data)); return method === "GET" ? Response.json([]) : new Response(null, { status: 201 }); }
    if (url.pathname === "/rest/v1/profiles") {
      const id = eq(url, "id"); const email = eq(url, "email");
      const match = db.profiles.filter((p) => (!id || p.id === id) && (!email || p.email === email));
      if (method === "PATCH") { match.forEach((p) => Object.assign(p, body)); return new Response(null, { status: 204 }); }
      if (method === "POST") { const rows = Array.isArray(body) ? body : [body]; for (const row of rows) { const at = db.profiles.findIndex((p) => p.id === row.id); if (at >= 0) Object.assign(db.profiles[at], row); else db.profiles.push(row); } return new Response(null, { status: 201 }); }
      return Response.json(match);
    }
    if (url.pathname === "/auth/v1/admin/users" && method === "GET") return Response.json({ users: db.authUsers });
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") { const user = { id: `new-${db.authUsers.length}`, email: body.email, user_metadata: body.user_metadata }; db.authUsers.push(user); return Response.json(user); }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      const user = db.authUsers.find((u) => u.id === decodeURIComponent(url.pathname.split("/").pop()));
      if (method === "DELETE") throw new Error("Users must never be deleted");
      if (body.ban_duration) user.banned_until = body.ban_duration === "none" ? null : "2126-01-01T00:00:00Z";
      if (body.user_metadata) user.user_metadata = body.user_metadata;
      return Response.json(user);
    }
    if (url.pathname === "/auth/v1/admin/generate_link") {
      let user = db.authUsers.find((u) => u.email === body.email);
      if (body.type === "invite" && user) return Response.json({ msg: "A user with this email address has already been registered" }, { status: 422 });
      if (!user) { user = { id: `new-${db.authUsers.length}`, email: body.email, invited_at: new Date().toISOString(), user_metadata: body.options?.data || {} }; db.authUsers.push(user); }
      db.links += 1;
      return Response.json({ ...user, action_link: `https://supabase.test/auth/v1/verify?token=T${db.links}&type=${body.type}` });
    }
    return Response.json([]);
  };
  return db;
}

const call = (path, body) => worker.default.fetch(new Request(`https://app.test${path}`, { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) }), env, { waitUntil: (p) => p });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const profile = (id, role, email = `${id}@example.com`) => ({ id, email, full_name: id, role, branch: "all" });
const accepted = (id, extra = {}) => ({ id, email: `${id}@example.com`, confirmed_at: ago(30 * 24 * HOUR), user_metadata: {}, ...extra });

describe("invite expiry", () => {
  test("pending inside 24 hours, expired after, accepted once confirmed, cancelled when withdrawn", () => {
    assert.equal(inviteInfo({ user_metadata: { invite_sent_at: ago(23 * HOUR) } }).state, "pending");
    assert.equal(inviteInfo({ user_metadata: { invite_sent_at: ago(25 * HOUR) } }).state, "expired");
    assert.equal(inviteInfo({ invited_at: ago(2 * HOUR), user_metadata: {} }).state, "pending", "falls back to Supabase's invited_at");
    assert.equal(inviteInfo({ confirmed_at: ago(HOUR), user_metadata: { invite_sent_at: ago(40 * HOUR) } }).state, "accepted");
    assert.equal(inviteInfo({ user_metadata: { invite_sent_at: ago(HOUR), invite_cancelled_at: ago(1) } }).state, "cancelled");
    assert.equal(inviteInfo({ user_metadata: {} }).state, "expired", "no send time means no valid link");
  });
  test("expiry is exactly 24 hours after the send", () => {
    const sent = Date.parse("2026-11-17T00:00:00Z");
    const info = inviteInfo({ user_metadata: { invite_sent_at: new Date(sent).toISOString() } }, sent);
    assert.equal(info.expiresAt, "2026-11-18T00:00:00.000Z");
    assert.equal(inviteInfo({ user_metadata: { invite_sent_at: new Date(sent).toISOString() } }, sent + 24 * HOUR - 1).state, "pending");
    assert.equal(inviteInfo({ user_metadata: { invite_sent_at: new Date(sent).toISOString() } }, sent + 24 * HOUR).state, "expired");
  });
  test("status text", () => {
    assert.equal(userStatusFromAuth(accepted("a")), "Active");
    assert.equal(userStatusFromAuth(accepted("a", { banned_until: "2126-01-01" })), "Disabled");
    assert.equal(userStatusFromAuth({ user_metadata: { invite_sent_at: ago(30 * HOUR) } }), "Invite expired");
    assert.equal(userStatusFromAuth({ banned_until: "2126-01-01", user_metadata: { invite_sent_at: ago(HOUR), invite_cancelled_at: ago(1) } }), "Invite cancelled");
  });
});

describe("last active Superadmin", () => {
  const authById = (users) => new Map(users.map((u) => [u.id, u]));
  test("can't demote or deactivate the only active Superadmin", () => {
    const profiles = [profile("s1", "Superadmin"), profile("c1", "CEO")];
    const auth = authById([accepted("s1"), accepted("c1")]);
    assert.match(superadminGuardError({ profiles, authById: auth, targetId: "s1", nextRole: "Admin" }), /At least one active Superadmin/);
    assert.match(superadminGuardError({ profiles, authById: auth, targetId: "s1", disabling: true }), /At least one active Superadmin/);
  });
  test("a deactivated or never-accepted Superadmin doesn't count", () => {
    const profiles = [profile("s1", "Superadmin"), profile("s2", "Superadmin"), profile("s3", "Superadmin")];
    const auth = authById([accepted("s1"), accepted("s2", { banned_until: "2126-01-01" }), { id: "s3", user_metadata: { invite_sent_at: ago(HOUR) } }]);
    assert.match(superadminGuardError({ profiles, authById: auth, targetId: "s1", disabling: true }), /At least one active Superadmin/);
  });
  test("fine when another active Superadmin remains, or the target isn't a Superadmin", () => {
    const profiles = [profile("s1", "Superadmin"), profile("s2", "Superadmin"), profile("a1", "Admin")];
    const auth = authById([accepted("s1"), accepted("s2"), accepted("a1")]);
    assert.equal(superadminGuardError({ profiles, authById: auth, targetId: "s1", nextRole: "CEO" }), "");
    assert.equal(superadminGuardError({ profiles, authById: auth, targetId: "a1", disabling: true }), "");
  });
});

describe("who can manage users", () => {
  for (const role of ["Admin", "Accounting", "Sales", "Logistics", "HR", "Product Specialist", "Engineering"]) {
    test(`${role} is refused on every account endpoint and nothing is written`, async () => {
      const db = fakeSupabase({ caller: "x", profiles: [profile("x", role), profile("a1", "Sales")], authUsers: [accepted("x"), accepted("a1")] });
      for (const [path, body] of [["/api/users/role", { email: "a1@example.com", role: "Admin" }], ["/api/users/status", { email: "a1@example.com", disabled: true, reason: "r" }], ["/api/users/reset-password", { email: "a1@example.com" }], ["/api/users/invite", { email: "n@example.com", role: "Sales" }], ["/api/users/invite/cancel", { email: "a1@example.com" }], ["/api/users/invite/resend", { email: "a1@example.com" }], ["/api/users/sessions/revoke-all", { userId: "00000000-0000-0000-0000-000000000000" }]]) {
        const response = await call(path, body);
        assert.notEqual(response.status, 200, path);
        assert.match((await response.json()).error, /Only Superadmin\/CEO can manage users/, path);
      }
      assert.deepEqual(db.writes, []);
    });
  }
  for (const path of ["/api/users/set-password", "/api/users/delete"]) {
    test(`${path} no longer exists`, async () => {
      const db = fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("a1", "Sales")], authUsers: [accepted("s1"), accepted("a1")] });
      const response = await call(path, { email: "a1@example.com", password: "Secret123!", confirmation: "a1@example.com" });
      assert.equal(response.status, 404);
      assert.deepEqual(db.writes, []);
    });
  }
});

describe("role change", () => {
  test("CEO changes a role: profile updated, custom access cleared, audited", async () => {
    const db = fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("a1", "Sales")], authUsers: [accepted("c1"), accepted("a1")] });
    const response = await call("/api/users/role", { email: "a1@example.com", role: "Accounting" });
    assert.equal(response.status, 200);
    await settle();
    assert.equal(db.profiles.find((p) => p.id === "a1").role, "Accounting");
    assert.ok(db.writes.some((w) => w.method === "DELETE" && w.path === "/rest/v1/module_permissions" && w.search.includes("a1")));
    const entry = db.audit.find((e) => e.action === "Role changed");
    assert.equal(entry.record, "a1@example.com");
    assert.deepEqual(entry.changes[0], { field: "Role", from: "Sales", to: "Accounting" });
  });
  test("refused for your own account", async () => {
    fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("s2", "Superadmin")], authUsers: [accepted("s1"), accepted("s2")] });
    assert.equal((await call("/api/users/role", { email: "s1@example.com", role: "Admin" })).status, 400);
  });
  test("refused when it would leave no active Superadmin", async () => {
    const db = fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("s1", "Superadmin")], authUsers: [accepted("c1"), accepted("s1")] });
    const response = await call("/api/users/role", { email: "s1@example.com", role: "Admin" });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /At least one active Superadmin/);
    assert.equal(db.profiles.find((p) => p.id === "s1").role, "Superadmin");
  });
  test("unknown role refused", async () => {
    fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("a1", "Sales")], authUsers: [accepted("c1"), accepted("a1")] });
    assert.equal((await call("/api/users/role", { email: "a1@example.com", role: "Owner" })).status, 400);
  });
});

describe("deactivate", () => {
  test("deactivating is a ban, never a delete, and is audited with the reason", async () => {
    const db = fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("a1", "Sales")], authUsers: [accepted("c1"), accepted("a1")] });
    assert.equal((await call("/api/users/status", { email: "a1@example.com", disabled: true, reason: "Left the company" })).status, 200);
    await settle();
    assert.ok(db.authUsers.find((u) => u.id === "a1").banned_until);
    assert.ok(!db.writes.some((w) => w.method === "DELETE" && w.path.startsWith("/auth/")));
    assert.match(db.audit.find((e) => e.action === "Deactivated user").record, /a1@example.com: Left the company/);
  });
  test("the last active Superadmin can't be deactivated", async () => {
    const db = fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("s1", "Superadmin"), profile("s2", "Superadmin")], authUsers: [accepted("c1"), accepted("s1"), accepted("s2", { banned_until: "2126-01-01" })] });
    const response = await call("/api/users/status", { email: "s1@example.com", disabled: true, reason: "x" });
    assert.equal(response.status, 400);
    assert.ok(!db.authUsers.find((u) => u.id === "s1").banned_until);
  });
});

describe("invites", () => {
  test("a new invite needs no name, stamps the send time and who sent it, and is audited", async () => {
    const db = fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin")], authUsers: [accepted("s1")] });
    const response = await call("/api/users/invite", { email: "New.Person@Example.com", role: "Logistics" });
    assert.equal(response.status, 201);
    await settle();
    const user = db.authUsers.find((u) => u.email === "new.person@example.com");
    assert.equal(inviteInfo(user).state, "pending");
    assert.equal(user.user_metadata.invited_by, "s1");
    assert.equal(db.profiles.find((p) => p.email === "new.person@example.com").full_name, "new.person");
    assert.ok(!db.writes.some((w) => w.method === "POST" && w.path === "/rest/v1/module_permissions"), "role defaults apply; no per-person rows");
    assert.ok(db.audit.some((e) => e.action === "Invited user" && e.record === "new.person@example.com · Logistics"));
  });
  test("refused for someone who already has an account, or an invite still waiting", async () => {
    fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("a1", "Sales"), profile("p1", "Sales")], authUsers: [accepted("s1"), accepted("a1"), { id: "p1", email: "p1@example.com", user_metadata: { invite_sent_at: ago(2 * HOUR) } }] });
    assert.equal((await call("/api/users/invite", { email: "a1@example.com", role: "Sales" })).status, 409);
    assert.equal((await call("/api/users/invite", { email: "p1@example.com", role: "Sales" })).status, 409);
  });
  test("an expired invite can be sent again, which restarts the 24 hours", async () => {
    const db = fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("p1", "Sales")], authUsers: [accepted("s1"), { id: "p1", email: "p1@example.com", user_metadata: { invite_sent_at: ago(30 * HOUR) } }] });
    assert.equal((await call("/api/users/invite", { email: "p1@example.com", role: "Sales" })).status, 201);
    assert.equal(inviteInfo(db.authUsers.find((u) => u.id === "p1")).state, "pending");
  });
  test("resend and copy-link make a new link each time and restart the clock; refused once accepted", async () => {
    const db = fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("p1", "Sales"), profile("a1", "Sales")], authUsers: [accepted("s1"), { id: "p1", email: "p1@example.com", user_metadata: { invite_sent_at: ago(30 * HOUR) } }, accepted("a1")] });
    const first = await (await call("/api/users/invite/link", { email: "p1@example.com" })).json();
    const second = await (await call("/api/users/invite/link", { email: "p1@example.com" })).json();
    assert.notEqual(first.actionLink, second.actionLink, "a new link replaces the old one");
    assert.match(second.actionLink, /^https:\/\/app\.test\/auth\/continue\?token=/, "link goes through our own domain");
    assert.equal(inviteInfo(db.authUsers.find((u) => u.id === "p1")).state, "pending");
    const response = await call("/api/users/invite/link", { email: "a1@example.com" });
    assert.notEqual(response.status, 200);
    assert.match((await response.json()).error, /haven't been accepted/);
    await settle();
    assert.equal(db.audit.filter((e) => e.action === "Copied a new invite link").length, 2);
  });
  test("cancel blocks the account and marks it, without deleting anything", async () => {
    const db = fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("p1", "Sales")], authUsers: [accepted("c1"), { id: "p1", email: "p1@example.com", user_metadata: { invite_sent_at: ago(HOUR) } }] });
    assert.equal((await call("/api/users/invite/cancel", { email: "p1@example.com" })).status, 200);
    await settle();
    const user = db.authUsers.find((u) => u.id === "p1");
    assert.equal(inviteInfo(user).state, "cancelled");
    assert.ok(user.banned_until);
    assert.ok(!db.writes.some((w) => w.method === "DELETE"));
    assert.ok(db.audit.some((e) => e.action === "Cancelled invite"));
  });
  test("an accepted invite can't be cancelled", async () => {
    fakeSupabase({ caller: "c1", profiles: [profile("c1", "CEO"), profile("a1", "Sales")], authUsers: [accepted("c1"), accepted("a1")] });
    assert.equal((await call("/api/users/invite/cancel", { email: "a1@example.com" })).status, 409);
  });
});

describe("password reset", () => {
  test("emails a recovery link, never takes a password, and is audited", async () => {
    const db = fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("a1", "Sales")], authUsers: [accepted("s1"), accepted("a1")] });
    const response = await call("/api/users/reset-password", { email: "a1@example.com", password: "ShouldBeIgnored1!" });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    await settle();
    const link = db.writes.find((w) => w.path === "/auth/v1/admin/generate_link");
    assert.equal(link.body.type, "recovery");
    assert.ok(!JSON.stringify(db.writes).includes("ShouldBeIgnored1!"), "the password is never stored or forwarded");
    assert.ok(db.audit.some((e) => /password reset link/i.test(e.action) && e.record === "a1@example.com"));
  });
  test("refused for a deactivated account or one that hasn't accepted its invite", async () => {
    fakeSupabase({ caller: "s1", profiles: [profile("s1", "Superadmin"), profile("d1", "Sales"), profile("p1", "Sales")], authUsers: [accepted("s1"), accepted("d1", { banned_until: "2126-01-01" }), { id: "p1", email: "p1@example.com", user_metadata: { invite_sent_at: ago(HOUR) } }] });
    assert.equal((await call("/api/users/reset-password", { email: "d1@example.com" })).status, 409);
    assert.equal((await call("/api/users/reset-password", { email: "p1@example.com" })).status, 409);
  });
});

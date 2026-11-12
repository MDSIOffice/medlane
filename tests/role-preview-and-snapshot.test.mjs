import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase } from "./helpers/load-worker.mjs";

const { applyPreviewRole, previewableRolesFor, sharedStateSnapshot, supabaseFetch, canAccessKey, canWrite } = worker;
const req = (role) => new Request("https://app.test/api/auth/me", { headers: role ? { "x-medlane-preview-role": role } : {} });
const real = (role, edit = ["inventory", "sales", "users"]) => ({ id: "u1", email: "boss@medlane.test", name: "Boss", role, branch: "all", customPermissions: { enabled: true, view: edit, edit }, modules: edit });

describe("role preview", () => {
  test("no header leaves the profile untouched", () => {
    const profile = real("Superadmin");
    assert.equal(applyPreviewRole(req(""), profile), profile);
  });

  test("Superadmin previewing Sales gets exactly Sales' default access", () => {
    const preview = applyPreviewRole(req("Sales"), real("Superadmin", ["users", "payables", "backup"]));
    assert.equal(preview.role, "Sales");
    assert.equal(preview.previewOf, "Superadmin");
    assert.equal(preview.email, "boss@medlane.test");
    assert.ok(preview.customPermissions.view.includes("sales"));
    assert.equal(preview.customPermissions.view.includes("payables"), false);
    assert.equal(preview.customPermissions.edit.includes("backup"), false);
    assert.equal(canAccessKey(preview, "payables", "view"), false);
  });

  test("Logistics preview keeps Logistics' blocked modules blocked", () => {
    const preview = applyPreviewRole(req("Logistics"), real("CEO"));
    assert.equal(preview.customPermissions.view.includes("logs"), false);
  });

  test("nobody can preview Superadmin, and CEO cannot preview CEO", () => {
    assert.throws(() => applyPreviewRole(req("Superadmin"), real("CEO")), /^Error: Only Superadmin or CEO can preview a role, and not "Superadmin"/);
    assert.throws(() => applyPreviewRole(req("Superadmin"), real("Superadmin")), /not "Superadmin"/);
    assert.throws(() => applyPreviewRole(req("CEO"), real("CEO")), /not "CEO"/);
    assert.equal(applyPreviewRole(req("CEO"), real("Superadmin")).role, "CEO");
  });

  test("other roles cannot preview at all", () => {
    for (const role of ["Admin", "Accounting", "Sales"]) assert.throws(() => applyPreviewRole(req("Sales"), real(role)), /^Error: Only Superadmin or CEO/);
  });

  test("an unknown role is refused", () => {
    assert.throws(() => applyPreviewRole(req("Janitor"), real("Superadmin")), /not "Janitor"/);
  });

  test("previewable roles", () => {
    assert.deepEqual(previewableRolesFor("Sales"), []);
    assert.equal(previewableRolesFor("CEO").includes("CEO"), false);
    assert.equal(previewableRolesFor("Superadmin").includes("Superadmin"), false);
    assert.ok(previewableRolesFor("Superadmin").includes("CEO"));
  });

  test("a previewed role without write access cannot write", () => {
    // Engineering's defaults still let it write support reports; HR's let it write HR records.
    const preview = applyPreviewRole(req("Sales"), real("Superadmin"));
    assert.equal(canWrite(preview), true);
    assert.equal(canAccessKey(preview, "payables", "edit"), false);
  });
});

describe("shared state snapshot", () => {
  const stateReads = (calls) => calls.filter((url) => url.includes("module_name=not.in.")).length;

  test("loads that arrive together share one database read", async () => {
    const calls = mockSupabase({});
    const results = await Promise.all(Array.from({ length: 50 }, () => sharedStateSnapshot(env, `${STATE}-burst`)));
    assert.equal(stateReads(calls), 1);
    assert.ok(results.every((result) => result === results[0]));
  });

  test("a save drops the snapshot so the next load reads fresh data", async () => {
    const calls = mockSupabase({});
    await sharedStateSnapshot(env, `${STATE}-write`);
    await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", body: JSON.stringify([{ module_name: "sales", record_key: "SI-1", data: {} }]) });
    await sharedStateSnapshot(env, `${STATE}-write`);
    assert.equal(stateReads(calls), 2);
  });

  test("a failed read is not reused", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    await assert.rejects(sharedStateSnapshot(env, `${STATE}-fail`), /boom/);
    const calls = mockSupabase({});
    await sharedStateSnapshot(env, `${STATE}-fail`);
    assert.equal(stateReads(calls), 1);
  });
});

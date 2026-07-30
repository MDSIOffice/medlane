const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const roleModules = {
  Superadmin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs"],
  CEO: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs"],
  Admin: ["dashboard", "analytics", "masterlists", "inventory", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs"],
  Accounting: ["dashboard", "analytics", "masterlists", "purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings", "logs"],
  Sales: ["dashboard", "masterlists", "inventory", "sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings"],
  Logistics: ["dashboard", "analytics", "inventory", "reports", "notifications", "user-settings", "logs"],
  HR: ["dashboard", "analytics", "masterlists", "replenishments", "reports", "notifications", "user-settings"],
};

const moduleRecordKeys = {
  users: ["users"],
  masterlists: ["clients", "items", "suppliers", "employees", "banks", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals", "masterTab"],
  inventory: ["inventory", "pendingTransfers", "transferHistory", "inventoryPurchaseOrders"],
  "purchase-orders": ["purchaseOrders"],
  invoicing: ["sales"],
  sales: ["sales"],
  receivables: ["sales", "payments", "collectionContacts", "collectionContactHistory"],
  warranty: ["warranties"],
  history: ["sales", "purchaseOrders", "payments"],
  collections: ["payments", "paymentRequests", "collectionContacts", "collectionContactHistory"],
  payables: ["payables"],
  expenses: ["replenishments"],
  imports: ["imports"],
  reports: ["reports"],
  reconciliation: ["reconHistory"],
  security: ["logs", "notifications"],
  settings: ["branch", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  "audit-logs": ["logs"],
  system: ["branch", "logs", "notifications", "imports", "reconHistory"],
};

const persistedKeys = [...new Set(Object.values(moduleRecordKeys).flat())];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function appStateKey(env) {
  return env.APP_STATE_KEY || env.ENVIRONMENT || "production";
}

function supabaseBaseUrl(env) {
  return new URL(env.SUPABASE_URL).origin;
}

function methodNotAllowed() {
  return json({ error: "Method not allowed" }, { status: 405 });
}

async function shortHash(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing Worker secret/var: ${missing.join(", ")}`);
}

function supabaseHeaders(env, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function requestOrigin(request) {
  return new URL(request.url).origin;
}

async function supabaseFetch(env, path, init = {}) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Supabase request failed: ${response.status}`);
  return payload;
}

async function supabaseAuthAdminFetch(env, path, init = {}) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Supabase Auth request failed: ${response.status}`);
  return payload;
}

async function authenticatedUser(request, env) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Invalid or expired session");
  return { token, user };
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

function browserName(userAgent = "") {
  const value = String(userAgent);
  if (/Edg\//.test(value)) return "Microsoft Edge";
  if (/OPR\//.test(value)) return "Opera";
  if (/Chrome\//.test(value) && !/Chromium\//.test(value)) return "Chrome";
  if (/Firefox\//.test(value)) return "Firefox";
  if (/Safari\//.test(value) && !/Chrome\//.test(value)) return "Safari";
  return "Unknown browser";
}

function deviceName(userAgent = "") {
  const value = String(userAgent);
  const os = /Windows/i.test(value) ? "Windows" : /Mac OS X|Macintosh/i.test(value) ? "Mac" : /iPhone/i.test(value) ? "iPhone" : /iPad/i.test(value) ? "iPad" : /Android/i.test(value) ? "Android" : /Linux/i.test(value) ? "Linux" : "Unknown device";
  const type = /Mobile|iPhone|Android/i.test(value) ? "Mobile" : /iPad|Tablet/i.test(value) ? "Tablet" : "Desktop";
  return os === "Unknown device" ? os : `${os} ${type}`;
}

function sessionHeader(request) {
  const value = request.headers.get("x-medlane-session-id") || "";
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

async function createAppSession(env, request, userId) {
  const userAgent = request.headers.get("user-agent") || "";
  try {
    const rows = await supabaseFetch(env, "/rest/v1/app_sessions", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, device_name: deviceName(userAgent), browser: browserName(userAgent), ip_address: clientIp(request), user_agent: userAgent }),
    });
    return rows[0] || null;
  } catch (error) {
    console.error(JSON.stringify({ message: "App session tracking failed", error: error.message }));
    return null;
  }
}

async function validateAppSession(env, request, userId) {
  const id = sessionHeader(request);
  if (!id) return;
  const rows = await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,revoked_at`);
  if (!rows[0]) throw new Error("Invalid app session");
  if (rows[0].revoked_at) throw new Error("SESSION_REVOKED");
  await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), ip_address: clientIp(request) }),
  });
}

async function profileForUser(env, userId, email) {
  const profile = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!profile[0]) throw new Error(`No Medlane profile found for ${email || "this account"}`);
  const permissions = await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(userId)}&select=module_key,can_view,can_edit`);
  const fallback = roleModules[profile[0].role] || roleModules.Sales;
  const view = permissions.length ? permissions.filter((item) => item.can_view).map((item) => item.module_key) : fallback;
  const edit = permissions.length ? permissions.filter((item) => item.can_edit).map((item) => item.module_key) : fallback;
  if (["Superadmin", "CEO"].includes(profile[0].role)) {
    if (!view.includes("backup")) view.push("backup");
    if (!edit.includes("backup")) edit.push("backup");
  }
  return {
    id: profile[0].id,
    name: profile[0].full_name,
    email: profile[0].email,
    role: profile[0].role,
    branch: profile[0].branch || "all",
    phone: profile[0].phone || "",
    modules: view,
    customPermissions: { enabled: true, view, edit },
  };
}

async function authenticatedProfile(request, env) {
  const { user } = await authenticatedUser(request, env);
  await validateAppSession(env, request, user.id);
  return { authUser: user, profile: await profileForUser(env, user.id, user.email) };
}

function canWrite(profile) {
  return Boolean(profile?.customPermissions?.edit?.length || ["Superadmin", "CEO", "Admin"].includes(profile?.role));
}

function requireWriteAccess(profile) {
  if (!canWrite(profile)) throw new Error("You do not have permission to edit production data");
}

function requireUserAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can manage users");
}

function requireBackupAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can manage backups");
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validRole(role) {
  return Object.prototype.hasOwnProperty.call(roleModules, role);
}

function moduleForKey(key) {
  return Object.entries(moduleRecordKeys).find(([, keys]) => keys.includes(key))?.[0] || "system";
}

function recordKeyFor(key, value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return key;
  return String(value.id || value.documentNo || value.receiptNo || value.cvNo || value.code || value.name || value.email || `${key}-${index}`);
}

function stateFromRecords(records) {
  const next = {};
  for (const key of persistedKeys) next[key] = ["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key) ? undefined : [];
  for (const row of records) {
    const key = row.module_name;
    if (["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key)) next[key] = row.data?.value;
    else {
      next[key] ||= [];
      next[key].push(row.data);
    }
  }
  for (const key of ["branch", "masterTab", "branchAddresses", "invoiceApprovals"]) if (next[key] === undefined) delete next[key];
  return next;
}

function recordsFromState(data, userId, stateKey) {
  const rows = [];
  for (const key of persistedKeys) {
    const value = data?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => rows.push({ state_key: stateKey, module_name: key, record_key: recordKeyFor(key, item, index), data: item, updated_by: userId }));
    } else {
      rows.push({ state_key: stateKey, module_name: key, record_key: key, data: { value }, updated_by: userId });
    }
  }
  return rows;
}

async function storageUsage(env) {
  if (!env.DOCUMENTS_BUCKET) {
    return { configured: false, usedBytes: 0, objectCount: 0, truncated: false };
  }

  let cursor;
  let usedBytes = 0;
  let objectCount = 0;
  let truncated = false;

  do {
    const page = await env.DOCUMENTS_BUCKET.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      usedBytes += object.size || 0;
      objectCount += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
    truncated = Boolean(page.truncated);
  } while (cursor && objectCount < 10000);

  return { configured: true, usedBytes, objectCount, truncated };
}

async function activeMetadataUsage(env) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/storage_usage?bucket=eq.${encodeURIComponent(env.R2_BUCKET_NAME || "medlane-documents")}&select=used_bytes`);
    if (rows[0]) return Number(rows[0].used_bytes || 0);
    const files = await supabaseFetch(env, "/rest/v1/file_objects?deleted_at=is.null&select=size_bytes");
    return files.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  } catch {
    return null;
  }
}

async function reserveStorage(env, size) {
  return supabaseFetch(env, "/rest/v1/rpc/reserve_file_storage", {
    method: "POST",
    body: JSON.stringify({ bucket_name: env.R2_BUCKET_NAME || "medlane-documents", bytes_to_add: size, max_allowed: Number(env.MAX_R2_BYTES || 536870912000) }),
  });
}

async function releaseStorage(env, size) {
  return supabaseFetch(env, "/rest/v1/rpc/release_file_storage", {
    method: "POST",
    body: JSON.stringify({ bucket_name: env.R2_BUCKET_NAME || "medlane-documents", bytes_to_remove: size }),
  });
}

function safeFileName(name) {
  return String(name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 140) || "upload.bin";
}

function objectKeyFor(fileName, recordType) {
  const folder = safeFileName(recordType || "general").toLowerCase();
  return `uploads/${folder}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

function backupTypeForCron(cron) {
  if (cron === "0 18 1 1 *") return "yearly";
  if (cron === "0 18 1 * *") return "monthly";
  if (cron === "0 18 * * sun") return "weekly";
  return "manual";
}

async function gzipBytes(text) {
  const stream = new Blob([text], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function createBackup(env, backupType = "manual", actor = null) {
  if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
  const stateKey = appStateKey(env);
  const records = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&select=module_name,record_key,data,updated_at&order=updated_at.asc`);
  const createdAt = new Date().toISOString();
  const payload = { app: "medlane", stateKey, backupType, mode: "compressed-full", sinceAt: null, createdAt, records };
  const bytes = await gzipBytes(JSON.stringify(payload));
  const objectKey = `backups/${stateKey}/${backupType}/${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json.gz`;
  await reserveStorage(env, bytes.byteLength);
  try {
    await env.DOCUMENTS_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { backupType, stateKey, records: String(records.length) } });
    const inserted = await supabaseFetch(env, "/rest/v1/backup_runs", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ state_key: stateKey, backup_type: backupType, mode: payload.mode, object_key: objectKey, records_count: records.length, size_bytes: bytes.byteLength, since_at: null, created_by: actor }),
    });
    return inserted[0];
  } catch (error) {
    await releaseStorage(env, bytes.byteLength).catch(() => null);
    await env.DOCUMENTS_BUCKET.delete(objectKey).catch(() => null);
    throw error;
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(createBackup(env, backupTypeForCron(event.cron), null).catch((error) => console.error(JSON.stringify({ message: "Scheduled backup failed", cron: event.cron, error: error.message }))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    try {

      if (url.pathname === "/api/health") {
        if (request.method !== "GET") return methodNotAllowed();
        const supabaseUrl = env.SUPABASE_URL ? new URL(env.SUPABASE_URL) : null;
        return json({
          ok: true,
          app: "medlane",
          r2Configured: Boolean(env.DOCUMENTS_BUCKET),
          supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
          supabaseHost: supabaseUrl?.hostname || null,
          supabasePath: supabaseUrl?.pathname || null,
          supabaseAnonKeyConfigured: Boolean(env.SUPABASE_ANON_KEY),
          supabaseAnonKeyPrefix: env.SUPABASE_ANON_KEY ? `${env.SUPABASE_ANON_KEY.slice(0, 12)}...` : null,
          supabaseAnonKeyHash: await shortHash(env.SUPABASE_ANON_KEY),
          supabaseSecretConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        });
      }

      if (url.pathname === "/api/auth/login") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { email, password } = await request.json();
        const authResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const session = await authResponse.json().catch(() => null);
        if (!authResponse.ok) {
          const authError = session?.error_description || session?.msg || session?.error || "Invalid email or password";
          const debug = url.searchParams.get("debug") === "1";
          console.error(JSON.stringify({ message: "Supabase login failed", authError, status: authResponse.status }));
          return json({ error: authError, ...(debug ? { supabaseStatus: authResponse.status, supabaseResponse: session, supabaseHost: new URL(env.SUPABASE_URL).hostname, supabasePath: new URL(env.SUPABASE_URL).pathname, authUrl: `${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, anonKeyHash: await shortHash(env.SUPABASE_ANON_KEY) } : {}) }, { status: 401 });
        }
        const user = await profileForUser(env, session.user.id, email);
        const appSession = await createAppSession(env, request, session.user.id);
        return json({ session: { ...session, app_session_id: appSession?.id || null }, user });
      }

      if (url.pathname === "/api/auth/me") {
        if (request.method !== "GET") return methodNotAllowed();
        const { profile } = await authenticatedProfile(request, env);
        return json({ user: profile });
      }

      if (url.pathname === "/api/app-state") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/app_state?key=eq.${encodeURIComponent(appStateKey(env))}&select=data,updated_at,revision`);
          return json({ data: rows[0]?.data || null, updatedAt: rows[0]?.updated_at || null, revision: rows[0]?.revision || 0 });
        }
        if (request.method === "PUT") {
          requireWriteAccess(profile);
          const { data, revision } = await request.json();
          const rows = await supabaseFetch(env, "/rest/v1/rpc/update_app_state", {
            method: "POST",
            body: JSON.stringify({ expected_revision: Number(revision || 0), next_data: data, actor: authUser.id, state_key: appStateKey(env) }),
          });
          return json({ ok: true, revision: rows[0]?.revision, updatedAt: rows[0]?.updated_at });
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/auth/set-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { accessToken, password } = await request.json();
        if (!accessToken) return json({ error: "Invite or reset token is required" }, { status: 400 });
        if (String(password || "").length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 400 });
        const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return json({ error: payload?.msg || payload?.message || payload?.error || "Password setup failed" }, { status: 400 });
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/change-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { token, user } = await authenticatedUser(request, env);
        const { currentPassword, newPassword } = await request.json();
        if (!currentPassword) return json({ error: "Current password is required" }, { status: 400 });
        if (String(newPassword || "").length < 8) return json({ error: "New password must be at least 8 characters" }, { status: 400 });
        const verifyResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, password: currentPassword }),
        });
        if (!verifyResponse.ok) return json({ error: "Current password is incorrect" }, { status: 401 });
        const updateResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        });
        const payload = await updateResponse.json().catch(() => null);
        if (!updateResponse.ok) return json({ error: payload?.msg || payload?.message || payload?.error || "Password update failed" }, { status: 400 });
        return json({ ok: true });
      }

      if (url.pathname === "/api/modules/state") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&select=module_name,record_key,data&order=updated_at.asc`);
          return json({ data: stateFromRecords(rows), revision: Date.now() });
        }
        if (request.method === "PUT") {
          requireWriteAccess(profile);
          const { data } = await request.json();
          const rows = recordsFromState(data, authUser.id, stateKey);
          await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}`, { method: "DELETE" });
          if (rows.length) {
            await supabaseFetch(env, "/rest/v1/app_records", {
              method: "POST",
              headers: { prefer: "return=minimal" },
              body: JSON.stringify(rows),
            });
          }
          return json({ ok: true, savedRecords: rows.length, revision: Date.now() });
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/users/invite") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const body = await request.json();
        const email = cleanEmail(body.email);
        const fullName = String(body.name || "").trim();
        const role = String(body.role || "").trim();
        const branch = String(body.branch || "Both").trim();
        const view = Array.isArray(body.modules) ? body.modules.filter(Boolean) : roleModules[role] || [];
        const edit = Array.isArray(body.editModules) ? body.editModules.filter((module) => view.includes(module)) : view;
        if (!fullName) return json({ error: "Name is required" }, { status: 400 });
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (!validRole(role)) return json({ error: "Invalid role" }, { status: 400 });
        const existingProfiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email`);
        if (existingProfiles.length) return json({ error: "A user with this email already exists" }, { status: 409 });

        const redirectTo = `${requestOrigin(request)}/?login=1`;
        const invited = await supabaseAuthAdminFetch(env, `/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
          method: "POST",
          body: JSON.stringify({ email, data: { full_name: fullName, role, branch } }),
        });
        const authUser = invited.user || invited;
        if (!authUser?.id) throw new Error("Supabase did not return an invited user ID");

        await supabaseFetch(env, "/rest/v1/profiles", {
          method: "POST",
          body: JSON.stringify({ id: authUser.id, email, full_name: fullName, role, branch, is_superadmin: role === "Superadmin" }),
        });
        if (view.length) {
          await supabaseFetch(env, "/rest/v1/module_permissions", {
            method: "POST",
            body: JSON.stringify(view.map((moduleKey) => ({ user_id: authUser.id, module_key: moduleKey, can_view: true, can_edit: edit.includes(moduleKey) }))),
          });
        }
        return json({ user: { id: authUser.id, name: fullName, email, role, branch, modules: view, customPermissions: { enabled: true, view, edit }, superadminPermissions: role === "Superadmin", access: `${role} with ${view.length} view / ${edit.length} edit modules`, inviteStatus: "Invited" } }, { status: 201 });
      }

      if (url.pathname === "/api/users/sessions") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        requireUserAdmin(profile);
        let userId = String(url.searchParams.get("userId") || "").trim();
        const email = cleanEmail(url.searchParams.get("email"));
        if (!userId && email) {
          const matches = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`);
          userId = matches[0]?.id || "";
        }
        if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ sessions: [], user: null });
        const rows = await supabaseFetch(env, `/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,device_name,browser,ip_address,created_at,last_seen_at,revoked_at&order=last_seen_at.desc`);
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role`);
        return json({ user: profiles[0] || null, sessions: rows.map((row) => ({ ...row, profile: profiles[0] || null })) });
      }

      if (url.pathname === "/api/users/sessions/revoke") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { sessionId } = await request.json();
        if (!/^[0-9a-f-]{36}$/i.test(String(sessionId || ""))) return json({ error: "Invalid session id" }, { status: 400 });
        await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_by: authUser.id }),
        });
        return json({ ok: true });
      }

      if (url.pathname === "/api/backups") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/backup_runs?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=id,backup_type,mode,records_count,size_bytes,since_at,created_at&order=created_at.desc&limit=100`);
          return json({ backups: rows });
        }
        if (request.method === "POST") {
          const { backupType = "manual" } = await request.json().catch(() => ({}));
          if (!["manual", "weekly", "monthly", "yearly"].includes(backupType)) return json({ error: "Invalid backup type" }, { status: 400 });
          const backup = await createBackup(env, backupType, authUser.id);
          return json({ backup }, { status: 201 });
        }
        return methodNotAllowed();
      }

      if (url.pathname.startsWith("/api/backups/") && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const rows = await supabaseFetch(env, `/rest/v1/backup_runs?id=eq.${encodeURIComponent(id)}&state_key=eq.${encodeURIComponent(appStateKey(env))}&select=*`);
        if (!rows[0]) return json({ error: "Backup not found" }, { status: 404 });
        const object = await env.DOCUMENTS_BUCKET.get(rows[0].object_key);
        if (!object) return json({ error: "Backup object not found" }, { status: 404 });
        return new Response(object.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="medlane-${rows[0].backup_type}-${rows[0].created_at.slice(0, 10)}.json.gz"`, "cache-control": "private, max-age=60" } });
      }

      if (url.pathname === "/api/storage/usage") {
        if (request.method !== "GET") return methodNotAllowed();
        await authenticatedProfile(request, env);
        const maxBytes = Number(env.MAX_R2_BYTES || 536870912000);
        const metadataBytes = await activeMetadataUsage(env);
        const usage = metadataBytes === null ? await storageUsage(env) : { configured: true, usedBytes: metadataBytes, objectCount: null, truncated: false };
        return json({ ...usage, maxBytes, remainingBytes: Math.max(maxBytes - usage.usedBytes, 0) });
      }

      if (url.pathname === "/api/files") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, "/rest/v1/file_objects?deleted_at=is.null&select=*&order=uploaded_at.desc");
          return json({ files: rows });
        }
        if (request.method !== "POST") return methodNotAllowed();
        requireWriteAccess(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "File is required" }, { status: 400 });
        const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 26214400);
        if (file.size > maxUploadBytes) return json({ error: `File is too large. Max upload is ${Math.floor(maxUploadBytes / 1048576)} MB.` }, { status: 413 });
        const maxBytes = Number(env.MAX_R2_BYTES || 536870912000);
        const recordType = String(form.get("recordType") || "general");
        const recordId = String(form.get("recordId") || "");
        const objectKey = objectKeyFor(file.name, recordType);
        await reserveStorage(env, file.size);
        let inserted;
        try {
          await env.DOCUMENTS_BUCKET.put(objectKey, file.stream(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
            customMetadata: { uploadedBy: authUser.id, recordType, recordId },
          });
          inserted = await supabaseFetch(env, "/rest/v1/file_objects?select=*", {
            method: "POST",
            headers: { prefer: "return=representation" },
            body: JSON.stringify({ bucket: env.R2_BUCKET_NAME || "medlane-documents", object_key: objectKey, file_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size, record_type: recordType, record_id: recordId || null, uploaded_by: authUser.id }),
          });
        } catch (error) {
          await releaseStorage(env, file.size).catch(() => null);
          await env.DOCUMENTS_BUCKET.delete(objectKey).catch(() => null);
          throw error;
        }
        return json({ file: inserted[0] }, { status: 201 });
      }

      if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
        await authenticatedProfile(request, env);
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const rows = await supabaseFetch(env, `/rest/v1/file_objects?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*`);
        if (!rows[0]) return json({ error: "File not found" }, { status: 404 });
        const object = await env.DOCUMENTS_BUCKET.get(rows[0].object_key);
        if (!object) return json({ error: "R2 object not found" }, { status: 404 });
        return new Response(object.body, { headers: { "content-type": rows[0].mime_type, "content-disposition": `inline; filename="${safeFileName(rows[0].file_name)}"`, "cache-control": `private, max-age=${Number(env.DOWNLOAD_CACHE_SECONDS || 300)}` } });
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, { status: 404 });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: error.message, path: url.pathname }));
      const status = /Authentication required|Invalid or expired|Invalid app session|SESSION_REVOKED/.test(error.message) ? 401 : /No Medlane profile|permission/.test(error.message) ? 403 : /APP_STATE_CONFLICT/.test(error.message) ? 409 : /STORAGE_LIMIT_REACHED/.test(error.message) ? 409 : 500;
      return json({ error: error.message || "Server error" }, { status });
    }
  },
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const roleModules = {
  Superadmin: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  CEO: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "imports", "reports", "reconciliation", "security", "users", "settings", "backup", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  Admin: ["dashboard", "analytics", "masterlists", "inventory", "item-forecast", "purchase-orders", "sales", "invoicing", "collections", "receivables-tracker", "client-invoices", "warranty", "purchase-history", "payables", "replenishments", "reports", "reconciliation", "security", "notifications", "user-settings", "logs", "product-issues", "print-templates"],
  Accounting: ["dashboard", "analytics", "masterlists", "purchase-orders", "invoicing", "collections", "receivables-tracker", "client-invoices", "payables", "replenishments", "reports", "reconciliation", "notifications", "user-settings", "logs"],
  Sales: ["dashboard", "inventory", "sales", "receivables-tracker", "client-invoices", "purchase-history", "notifications", "user-settings", "product-issues"],
  Logistics: ["dashboard", "analytics", "inventory", "item-forecast", "reports", "notifications", "user-settings", "product-issues"],
  "Product Specialist": ["dashboard", "analytics", "inventory", "item-forecast", "reports", "notifications", "user-settings", "product-issues"],
  Engineering: ["dashboard", "analytics", "inventory", "reports", "notifications", "user-settings", "product-issues"],
  HR: ["dashboard", "analytics", "masterlists", "replenishments", "reports", "notifications", "user-settings"],
};
// Every role can view memos (audience targeting is enforced per-memo, not per-module); only
// requireMemoAdmin() gates who may post one.
Object.values(roleModules).forEach((modules) => modules.push("memos"));

const DISCORD_ROLE_IDS = {
  nagaTeam: "1356861232480780421",
  lpTeam: "1356901352487391233",
  Accounting: "1356901581030690986",
  Engineering: "1356901760442040390",
  Sales: "1356901905372151839",
  Logistics: "1382979208883732500",
  "Product Specialist": "1527546344477036544",
};

const digestRoleMentions = {
  Accounting: [DISCORD_ROLE_IDS.Accounting],
  Sales: [DISCORD_ROLE_IDS.Sales],
  Logistics: [DISCORD_ROLE_IDS.Logistics],
  "Product Specialist": [DISCORD_ROLE_IDS["Product Specialist"]],
  Engineering: [DISCORD_ROLE_IDS.Engineering],
  Superadmin: [DISCORD_ROLE_IDS.Accounting, DISCORD_ROLE_IDS.lpTeam, DISCORD_ROLE_IDS.nagaTeam].filter(Boolean),
  CEO: [DISCORD_ROLE_IDS.Accounting, DISCORD_ROLE_IDS.lpTeam, DISCORD_ROLE_IDS.nagaTeam].filter(Boolean),
};

const moduleRecordKeys = {
  users: ["users"],
  masterlists: ["clients", "items", "suppliers", "employees", "banks", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals", "masterTab"],
  inventory: ["inventory", "pendingTransfers", "transferHistory", "inventoryPurchaseOrders", "inventoryDemoRequests"],
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
  security: ["notifications"],
  settings: ["branch", "platformAreas", "platformBranches", "branchAddresses", "invoiceApprovals"],
  system: ["branch", "notifications", "imports", "reconHistory"],
  "product-issues": ["productIssues"],
  "print-templates": ["printTemplates"],
  memos: ["memos"],
};

const persistedKeys = [...new Set(Object.values(moduleRecordKeys).flat())];
const genericStateBlockedKeys = new Set(["users", "branch", "masterTab"]);
const defaultSeedSignature = { clients: 2, items: 4, suppliers: 3, employees: 1, banks: 2 };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function shortDate() {
  return new Date().toISOString().slice(0, 10);
}

const poNextStatus = { Approved: "Sent to Supplier", "Sent to Supplier": "In Transit", "In Transit": "For Receiving" };
const poCancellableStatuses = ["Approved", "Sent to Supplier", "In Transit", "For Receiving", "Partially Received"];
function poTimestamp() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

function passwordPolicyError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter";
  if (!/\d/.test(value)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one special character";
  if (/\s/.test(value)) return "Password cannot contain spaces";
  return "";
}

function resendFrom(env) {
  return env.RESEND_FROM || "Medlane OS <onboarding@resend.dev>";
}

function medlaneLogoUrl(origin = "https://medlane.tofllorin.workers.dev") {
  return `${String(origin || "https://medlane.tofllorin.workers.dev").replace(/\/$/, "")}/medlane.jpg`;
}

function brandedEmailHtml({ title, eyebrow = "Medlane Diagnostic Solutions", intro = "", bodyHtml = "", origin = "https://medlane.tofllorin.workers.dev" }) {
  const year = new Date().getFullYear();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#eaf7ff;font-family:Arial,Helvetica,sans-serif;color:#10213d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#dff4ff 0%,#f7fcff 55%,#fff7ec 100%);padding:34px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #bfe7fb;box-shadow:0 24px 70px rgba(0,46,93,.16);"><tr><td style="background:linear-gradient(120deg,#0b2f52 0%,#1d6fa5 100%);padding:28px 30px;color:#fff;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="width:62px;vertical-align:top;"><img src="${escapeHtml(medlaneLogoUrl(origin))}" width="52" height="52" alt="Medlane" style="display:block;border-radius:16px;background:#fff;padding:5px;box-shadow:0 10px 28px rgba(0,0,0,.18);"></td><td style="vertical-align:top;padding-left:14px;"><div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#e8c684;">${escapeHtml(eyebrow)}</div><h1 style="margin:8px 0 0;font-size:30px;line-height:1.08;letter-spacing:-.02em;color:#ffffff;">${escapeHtml(title)}</h1>${intro ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#dcedf9;">${escapeHtml(intro)}</p>` : ""}</td></tr></table></td></tr><tr><td style="padding:28px 30px;font-size:14px;line-height:1.65;border-top:4px solid #c98a1f;">${bodyHtml || "<p>Nothing to report.</p>"}</td></tr><tr><td style="padding:18px 30px;background:#f3fbff;border-top:1px solid #d8eef9;color:#4f6b86;font-size:12px;line-height:1.6;">© ${year} Medlane Diagnostic Solutions, Inc. Automated system email - do not reply.</td></tr></table></td></tr></table></body></html>`;
}

function brandedInviteEmailHtml({ fullName, email, role, actionLink, origin }) {
  const body = `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi <strong>${escapeHtml(fullName)}</strong>,</p><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to Medlane OS as <strong>${escapeHtml(role)}</strong>. Use the button below to create your password and activate your account.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#f59e0b;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:15px 26px;color:#10213d;text-decoration:none;font-weight:900;font-size:15px;border-radius:999px;">Accept Invitation</a></td></tr></table><div style="background:#f3fbff;border:1px solid #bfe7fb;border-left:5px solid #f59e0b;border-radius:18px;padding:18px;margin:20px 0;"><strong style="display:block;margin-bottom:8px;color:#003f73;">Account details</strong><div>Email: ${escapeHtml(email)}</div><div>Role: ${escapeHtml(role)}</div></div><p style="margin:18px 0 0;color:#4f6b86;font-size:13px;line-height:1.55;">If the button does not work, open this secure link:<br><a href="${escapeHtml(actionLink)}" style="color:#0077bd;word-break:break-all;">${escapeHtml(actionLink)}</a></p>`;
  return brandedEmailHtml({ title: "Welcome to Medlane OS", intro: "Your secure workspace for inventory, invoicing, collections, reports, and audit-ready operations.", bodyHtml: body, origin });
}

function inviteEmailHtml({ fullName, email, role, actionLink, origin }) {
  const year = new Date().getFullYear();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Medlane OS</title></head><body style="margin:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#10213d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#eaf6ff,#fff5f5);padding:32px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #cfe5f7;box-shadow:0 24px 70px rgba(16,33,61,.14);"><tr><td style="background:linear-gradient(135deg,#005a9c,#008bd2 62%,#ef4b4f);padding:30px;color:#fff;"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">Medlane Diagnostic Solutions</div><h1 style="margin:12px 0 6px;font-size:34px;line-height:1.05;">Welcome to Medlane OS</h1><p style="margin:0;font-size:16px;line-height:1.6;opacity:.96;">Your secure workspace for inventory, invoicing, collections, reports, and audit-ready operations.</p></td></tr><tr><td style="padding:30px;"><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi <strong>${escapeHtml(fullName)}</strong>,</p><p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to Medlane OS as <strong>${escapeHtml(role)}</strong>. Use the button below to create your password and activate your account.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:999px;background:#0077bd;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:15px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;border-radius:999px;">Accept Invitation</a></td></tr></table><div style="background:#f4f9ff;border:1px solid #d8ebfb;border-radius:18px;padding:18px;margin:20px 0;"><strong style="display:block;margin-bottom:8px;color:#005a9c;">Security reminder</strong><p style="margin:0;font-size:14px;line-height:1.6;color:#4c6280;">Create a password with at least 8 characters, one letter, one number, and one special character. Never share your password or invitation link.</p></div><p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#4c6280;">If the button does not work, copy and paste this link into your browser:</p><p style="word-break:break-all;margin:0 0 18px;font-size:13px;line-height:1.6;color:#0077bd;">${escapeHtml(actionLink)}</p><p style="margin:0;font-size:14px;line-height:1.6;color:#4c6280;">Account email: <strong>${escapeHtml(email)}</strong><br>Login site: <a href="${escapeHtml(origin)}" style="color:#0077bd;">${escapeHtml(origin)}</a></p></td></tr><tr><td style="padding:22px 30px;background:#f8fbff;border-top:1px solid #e1eef8;color:#60738f;font-size:12px;line-height:1.6;">© ${year} Medlane Diagnostic Solutions, Inc. This message was sent for account access setup. If you did not expect this invitation, ignore this email or contact your administrator.</td></tr></table></td></tr></table></body></html>`;
}

async function recordSystemLog(env, { action, module, record }) {
  const stateKey = appStateKey(env);
  const entry = {
    date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }),
    user: "System",
    role: "System",
    action,
    module,
    record: record || "",
  };
  await supabaseFetch(env, "/rest/v1/app_records", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: null }]),
  }).catch(() => null);
}

async function sendResendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    await recordSystemLog(env, { action: "Email skipped", module: "Email", record: `${to} — ${subject} (RESEND_API_KEY not configured)` });
    return { sent: false, provider: "resend", reason: "RESEND_API_KEY is not configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: resendFrom(env), to: [to], subject, html }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    await recordSystemLog(env, { action: "Email failed", module: "Email", record: `${to} — ${subject}: ${payload?.message || payload?.error || response.status}` });
    throw new Error(payload?.message || payload?.error || `Resend failed: ${response.status}`);
  }
  await recordSystemLog(env, { action: "Email sent", module: "Email", record: `${to} — ${subject}` });
  return { sent: true, provider: "resend", id: payload?.id || null };
}

async function sendDiscordWebhook(env, { content = "", embeds = [], allowedMentions = null } = {}) {
  const label = embeds[0]?.title || content.slice(0, 80) || "Discord message";
  if (!env.DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord post skipped", module: "Discord", record: `${label} (DISCORD_WEBHOOK_URL not configured)` });
    return { sent: false, provider: "discord", reason: "DISCORD_WEBHOOK_URL is not configured" };
  }
  const response = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, embeds, username: "Medlane OS", ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    await recordSystemLog(env, { action: "Discord post failed", module: "Discord", record: `${label}: ${response.status} ${text}` });
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
  await recordSystemLog(env, { action: "Discord post sent", module: "Discord", record: label });
  return { sent: true, provider: "discord" };
}

async function sendDiscordWebhookUrl(env, webhookUrl, { content = "", embeds = [], allowedMentions = null, wait = false } = {}) {
  const label = embeds[0]?.title || content.slice(0, 80) || "Discord message";
  if (!webhookUrl) return { sent: false, provider: "discord", reason: "Webhook URL is not configured" };
  const url = new URL(webhookUrl);
  if (wait) url.searchParams.set("wait", "true");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, embeds, username: "Medlane OS", ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
  });
  const payload = wait ? await response.json().catch(() => null) : null;
  if (!response.ok && response.status !== 204) {
    const text = payload ? JSON.stringify(payload).slice(0, 500) : await response.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${label}: ${response.status} ${text}`);
  }
  return { sent: true, provider: "discord", messageId: payload?.id || null };
}

async function editDiscordWebhookMessage(webhookUrl, messageId, { content = "", embeds = [], allowedMentions = null } = {}) {
  if (!webhookUrl || !messageId) return { edited: false, reason: "Webhook URL or message ID is missing" };
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.searchParams.delete("wait");
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, embeds, ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord webhook edit failed: ${response.status} ${text}`);
  }
  return { edited: true };
}

function discordFieldValue(lines, limit = 900, totalCount = lines.length) {
  if (!lines.length) return "None";
  let value = "";
  let shown = 0;
  for (const line of lines) {
    const candidate = value ? `${value}\n${line}` : line;
    if (candidate.length > limit) break;
    value = candidate;
    shown += 1;
  }
  const hidden = totalCount - shown;
  if (hidden > 0) value += `\n*…+${hidden} more — open the app to review.*`;
  return value || "None";
}

function moduleRecordMap(rows, moduleName) {
  const map = new Map();
  rows.filter((row) => row.module_name === moduleName).forEach((row) => map.set(String(row.record_key), row.data || {}));
  return map;
}

function inventoryPoTotal(po) {
  return (po.lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0);
}

function salesPoTotal(po) {
  return Number(po.amount || po.total || po.net || 0);
}

function eventActor(profile) {
  return profile.name || profile.email || "System User";
}

function webhookText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function discordEventEmbed(title, color, fields, profile) {
  return {
    title,
    color,
    fields: [
      ...fields.filter((field) => field.value !== undefined && field.value !== null).map((field) => ({ ...field, value: String(field.value).slice(0, 1024) })),
      { name: "Created / Updated By", value: `${eventActor(profile)} (${profile.role || "Unknown"})`, inline: false },
    ].slice(0, 25),
    timestamp: new Date().toISOString(),
  };
}

async function postNewRecordEventsToDiscord(env, profile, beforeRows, savedRows) {
  if (!env.DISCORD_WEBHOOK_URL || !savedRows.length) return;
  const beforeByModule = {};
  ["purchaseOrders", "inventoryPurchaseOrders", "paymentRequests", "pendingTransfers"].forEach((moduleName) => { beforeByModule[moduleName] = moduleRecordMap(beforeRows, moduleName); });
  const posts = [];
  for (const row of savedRows) {
    const key = String(row.record_key);
    if (beforeByModule[row.module_name]?.has(key)) continue;
    const record = row.data || {};
    if (row.module_name === "purchaseOrders") {
      posts.push(sendDiscordWebhook(env, { embeds: [discordEventEmbed("New Sales Purchase Order", 0x0077bd, [
        { name: "PO", value: webhookText(record.id || key), inline: true },
        { name: "Client", value: webhookText(record.client), inline: true },
        { name: "Amount", value: money(salesPoTotal(record)), inline: true },
        { name: "Date", value: webhookText(record.date), inline: true },
        { name: "Status", value: webhookText(record.status || "Open"), inline: true },
      ], profile)] }).catch((error) => recordSystemLog(env, { action: "Discord event post failed", module: "Discord", record: `New sales PO ${record.id || key}: ${error.message}` })));
    } else if (row.module_name === "inventoryPurchaseOrders") {
      posts.push(sendDiscordWebhook(env, { embeds: [discordEventEmbed("New Inventory Purchase Order", 0xf59e0b, [
        { name: "PO", value: webhookText(record.id || key), inline: true },
        { name: "Supplier", value: webhookText(record.supplier), inline: true },
        { name: "Total", value: money(inventoryPoTotal(record)), inline: true },
        { name: "Branch", value: webhookText(record.branch), inline: true },
        { name: "Status", value: webhookText(record.status || "Pending Approval"), inline: true },
      ], profile)] }).catch((error) => recordSystemLog(env, { action: "Discord event post failed", module: "Discord", record: `New inventory PO ${record.id || key}: ${error.message}` })));
    } else if (row.module_name === "paymentRequests" && record.invoice && record.requestStatus === "Pending") {
      posts.push(sendDiscordWebhook(env, { embeds: [discordEventEmbed("New Collection Approval", 0x22c55e, [
        { name: "Request", value: webhookText(record.cvNo || record.id || key), inline: true },
        { name: "Invoice", value: webhookText(record.invoice), inline: true },
        { name: "Amount", value: money(record.total || record.amount), inline: true },
        { name: "Employee", value: webhookText(record.employee || record.requestedBy), inline: true },
        { name: "Status", value: webhookText(record.requestStatus), inline: true },
      ], profile)] }).catch((error) => recordSystemLog(env, { action: "Discord event post failed", module: "Discord", record: `New collection approval ${record.cvNo || record.id || key}: ${error.message}` })));
    } else if (row.module_name === "pendingTransfers" && !/received|cancelled/i.test(record.status || "")) {
      posts.push(sendDiscordWebhook(env, { embeds: [discordEventEmbed("New Pending Transfer", 0x8b5cf6, [
        { name: "Transfer", value: webhookText(record.id || key), inline: true },
        { name: "Item", value: webhookText(record.item || record.code || "Items"), inline: true },
        { name: "Quantity", value: webhookText(record.qty || record.quantity), inline: true },
        { name: "Route", value: `${webhookText(record.from)} -> ${webhookText(record.to)}`, inline: false },
        { name: "Status", value: webhookText(record.status || "Pending"), inline: true },
      ], profile)] }).catch((error) => recordSystemLog(env, { action: "Discord event post failed", module: "Discord", record: `New pending transfer ${record.id || key}: ${error.message}` })));
    }
  }
  if (posts.length) await Promise.allSettled(posts);
}

async function trackNewOccurrences(env, moduleName, currentIds) {
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.${encodeURIComponent(moduleName)}&record_key=eq.state&select=data`);
  const known = new Set(rows[0]?.data?.ids || []);
  const ids = [...new Set(currentIds.filter(Boolean))];
  const fresh = ids.filter((id) => !known.has(id));
  const merged = [...new Set([...known, ...ids])];
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ state_key: stateKey, module_name: moduleName, record_key: "state", data: { ids: merged } }]),
  });
  return fresh;
}

async function findAuthUserByEmail(env, email) {
  const target = cleanEmail(email);
  for (let page = 1; page <= 25; page += 1) {
    const payload = await supabaseAuthAdminFetch(env, `/auth/v1/admin/users?page=${page}&per_page=1000`).catch((error) => ({ _error: error.message, users: [] }));
    const match = (payload.users || []).find((user) => cleanEmail(user.email) === target);
    if (match) return match;
    if (!payload.users || payload.users.length < 1000) break;
  }
  return null;
}

async function findAuthUserForProfileOrEmail(env, profile, email) {
  if (profile?.id) {
    const user = await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(profile.id)}`).catch(() => null);
    if (user?.id && cleanEmail(user.email || email) === cleanEmail(email)) return user;
  }
  return findAuthUserByEmail(env, email);
}

function extractLinkResult(payload) {
  // Supabase's raw /admin/generate_link REST response puts the user's fields at the top level
  // of the payload (not nested under a "user" key the way the supabase-js SDK abstracts it), with
  // the link fields alongside them. Support both shapes defensively.
  if (!payload) return null;
  const user = payload.user?.id ? payload.user : payload.id ? payload : null;
  if (!user) return null;
  const actionLink = payload.action_link || payload.properties?.action_link || "";
  return { authUser: user, actionLink };
}

async function generateSupabaseActionLink(env, { email, fullName, role, branch, origin }) {
  const redirectTo = `${origin}/?login=1`;
  const options = { redirect_to: redirectTo, data: { full_name: fullName, role, branch } };
  const invitePayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "invite", email, options }),
  }).catch((error) => ({ _error: error.message }));
  const inviteResult = extractLinkResult(invitePayload);
  if (inviteResult) return inviteResult;
  const recoveryPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", email, options }),
  }).catch((error) => ({ _error: error.message }));
  const recoveryResult = extractLinkResult(recoveryPayload);
  if (recoveryResult) return recoveryResult;
  const adminUserPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: fullName, role, branch } }),
  }).catch((error) => ({ _error: error.message }));
  // Prefer the recovery-call failure reason: for an account that already exists, the invite call
  // failing with "already registered" is expected noise, not the real problem. Recovery is the
  // correct call for an existing account, so its error (or the final create attempt's) is what
  // actually explains why no link came back.
  const detail = recoveryPayload?._error || adminUserPayload?._error || invitePayload?._error || "Unknown Supabase response";
  if (adminUserPayload?.id) {
    return { authUser: adminUserPayload, actionLink: "", linkError: detail };
  }
  // Every attempt above failed, but a "duplicate" error means the account genuinely already
  // exists in Supabase even though our earlier lookup missed it (e.g. a concurrent invite for
  // the same email). Re-fetch it directly instead of surfacing a confusing failure while leaving
  // the account orphaned with no profile row.
  if (/already.*regist|already.*exist/i.test(detail)) {
    const existing = await findAuthUserByEmail(env, email);
    if (existing) return { authUser: existing, actionLink: "", linkError: detail };
  }
  throw new Error(`Could not create Supabase user: ${detail}`);
}

async function resolveInviteLink(env, email, origin) {
  const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
  if (!profiles[0]) throw new Error("User profile not found");
  const role = profiles[0].role || "Sales";
  const fullName = profiles[0].full_name || email;
  const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch: profiles[0].branch || "all", origin });
  if (!generated.actionLink) throw new Error(generated.linkError ? `Invitation link could not be generated: ${generated.linkError}` : "Invitation link could not be generated");
  return { actionLink: generated.actionLink, fullName, role };
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

const APP_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function validateAppSession(env, request, userId) {
  const id = sessionHeader(request);
  if (!id) return;
  const rows = await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,revoked_at,created_at`);
  if (!rows[0]) throw new Error("Invalid app session");
  if (rows[0].revoked_at) throw new Error("SESSION_REVOKED");
  if (Date.now() - new Date(rows[0].created_at).getTime() >= APP_SESSION_MAX_AGE_MS) throw new Error("SESSION_EXPIRED_12H");
  await supabaseFetch(env, `/rest/v1/app_sessions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), ip_address: clientIp(request) }),
  });
}

const PASSWORD_KYC_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

async function profileForUser(env, userId, email) {
  const profile = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!profile[0]) throw new Error(`No Medlane profile found for ${email || "this account"}`);
  const permissions = await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(userId)}&select=module_key,can_view,can_edit`);
  const fallback = roleModules[profile[0].role] || roleModules.Sales;
  const view = permissions.length ? permissions.filter((item) => item.can_view).map((item) => item.module_key) : fallback;
  const edit = permissions.length ? permissions.filter((item) => item.can_edit).map((item) => item.module_key) : fallback;
  // Every role can view memos regardless of when their module_permissions rows were created —
  // this is a newer module that predates most existing users' explicit permission grants, and
  // memo posting is separately gated by requireMemoAdmin(), not by this permission list.
  if (!view.includes("memos")) view.push("memos");
  if (["Superadmin", "CEO"].includes(profile[0].role)) {
    if (!view.includes("backup")) view.push("backup");
    if (!edit.includes("backup")) edit.push("backup");
  }
  const passwordConfirmedAt = profile[0].password_confirmed_at || profile[0].created_at;
  const passwordKycDue = !passwordConfirmedAt || Date.now() - new Date(passwordConfirmedAt).getTime() >= PASSWORD_KYC_MAX_AGE_MS;
  return {
    id: profile[0].id,
    name: profile[0].full_name,
    email: profile[0].email,
    role: profile[0].role,
    branch: profile[0].branch || "all",
    phone: profile[0].phone || "",
    modules: view,
    customPermissions: { enabled: true, view, edit },
    passwordKycDue,
    themePreference: profile[0].theme_preference === "dark" ? "dark" : "light",
  };
}

async function markPasswordConfirmed(env, userId) {
  try {
    await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ password_confirmed_at: new Date().toISOString() }),
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Failed to mark password confirmed", error: error.message }));
  }
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

function requireMemoAdmin(profile) {
  if (!["Superadmin", "CEO", "HR"].includes(profile?.role)) throw new Error("Only Superadmin, CEO, or HR can post a memo");
}

async function postMemoToDiscord(env, memo) {
  if (!env.MEMO_DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Memo Discord post skipped", module: "Discord", record: `${memo.id}: MEMO_DISCORD_WEBHOOK_URL not configured` });
    return;
  }
  const audienceLabel = memo.audience === "all" ? "🌐 All Departments" : `🎯 ${memo.audience.join(", ")}`;
  const bodyPreview = String(memo.body || "").length > 600 ? `${memo.body.slice(0, 600)}…` : memo.body;
  const fields = [
    { name: "👥 Audience", value: audienceLabel, inline: true },
    { name: "🧑‍💼 Posted By", value: `${memo.createdBy} (${memo.createdByRole})`, inline: true },
  ];
  if (memo.eventDate) fields.push({ name: "📅 Event", value: `${memo.eventDate}${memo.eventTime ? ` · 🕒 ${memo.eventTime}` : ""}${memo.place ? ` · 📍 ${memo.place}` : ""}`, inline: false });
  fields.push({ name: "📝 Message", value: bodyPreview || "—", inline: false });
  await sendDiscordWebhookUrl(env, env.MEMO_DISCORD_WEBHOOK_URL, {
    content: "@everyone 📢 **New Memo Posted!**",
    allowedMentions: { parse: ["everyone"] },
    embeds: [{ title: `📋 ${memo.title}`, description: `Memo No. **${memo.id}**`, color: 0x006eb6, fields, timestamp: new Date().toISOString(), footer: { text: "Medlane OS · Memos & Announcements" } }],
  }).catch(async (error) => {
    await recordSystemLog(env, { action: "Memo Discord post failed", module: "Discord", record: `${memo.id}: ${error.message}` }).catch(() => null);
  });
}

function requireBackupAdmin(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can manage backups");
}

function requirePoApprover(profile) {
  if (profile?.role !== "Superadmin") throw new Error("Only Superadmin can approve purchase orders");
}

function requirePoReceiver(profile) {
  if (!["Superadmin", "Logistics"].includes(profile?.role)) throw new Error("Only Logistics/Superadmin can update purchase order receiving");
}

function requirePaymentRequestApprover(profile) {
  if (!["Superadmin", "CEO"].includes(profile?.role)) throw new Error("Only Superadmin/CEO can approve payment requests");
}

function userStatusFromAuth(authUser) {
  if (!authUser) return "Profile only";
  if (authUser.banned_until) return "Disabled";
  if (authUser.confirmed_at || authUser.email_confirmed_at) return "Active";
  if (authUser.invited_at) return "Pending Invite";
  return "Pending";
}

function userDisplayName(profile, authUser, email = "") {
  const value = profile?.full_name || authUser?.user_metadata?.full_name || authUser?.raw_user_meta_data?.full_name || authUser?.user_metadata?.name || "";
  return String(value || "").trim() || (profile || authUser ? email : "Unlinked Auth Account (no profile)");
}

function userFromProfileAndAuth(profile, authUser, permissions = []) {
  const role = profile?.role || authUser?.user_metadata?.role || "Sales";
  const fallback = roleModules[role] || roleModules.Sales;
  const view = permissions.length ? permissions.filter((item) => item.can_view).map((item) => item.module_key) : fallback;
  const edit = permissions.length ? permissions.filter((item) => item.can_edit).map((item) => item.module_key) : roleEditableFallback(role, view);
  const email = cleanEmail(profile?.email || authUser?.email || "");
  return {
    id: profile?.id || authUser?.id || email,
    name: userDisplayName(profile, authUser, email),
    email,
    role,
    branch: profile?.branch || authUser?.user_metadata?.branch || "all",
    phone: profile?.phone || authUser?.phone || "",
    modules: view,
    customPermissions: { enabled: true, view, edit },
    superadminPermissions: role === "Superadmin" || Boolean(profile?.is_superadmin),
    inviteStatus: userStatusFromAuth(authUser),
    disabledReason: authUser?.user_metadata?.disabled_reason || "",
    access: `${role} with ${view.length} view / ${edit.length} edit modules`,
  };
}

async function userDeleteBlockers(env, { id, email, name }) {
  const needles = [id, email, name].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const blockers = [];
  if (!needles.length) return blockers;
  const sessions = id ? await supabaseFetch(env, `/rest/v1/app_sessions?user_id=eq.${encodeURIComponent(id)}&revoked_at=is.null&select=id`) .catch(() => []) : [];
  if (sessions.length) blockers.push(`${sessions.length} active device session${sessions.length === 1 ? "" : "s"}`);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=module_name,record_key,data`);
  const ignored = new Set(["users", "logs", "notifications"]);
  for (const row of rows) {
    if (ignored.has(row.module_name)) continue;
    const text = JSON.stringify(row.data || {}).toLowerCase();
    if (needles.some((needle) => text.includes(needle))) blockers.push(`${row.module_name}: ${row.record_key}`);
    if (blockers.length >= 12) break;
  }
  return blockers;
}

function roleEditableFallback(role, view) {
  if (["Superadmin", "CEO", "Admin"].includes(role)) return view;
  return view.filter((module) => !["users", "settings", "backup", "security", "logs"].includes(module));
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

function modulesForKey(key) {
  return Object.entries(moduleRecordKeys).filter(([, keys]) => keys.includes(key)).map(([module]) => module);
}

function canAccessKey(profile, key, mode = "view") {
  if (["Superadmin", "CEO"].includes(profile?.role)) return true;
  const allowed = profile?.customPermissions?.[mode] || [];
  const modules = modulesForKey(key);
  return modules.some((module) => allowed.includes(module));
}

function writableKeys(profile) {
  return persistedKeys.filter((key) => !genericStateBlockedKeys.has(key) && canAccessKey(profile, key, "edit"));
}

function filterRecordsForProfile(records, profile, mode = "view") {
  return records.filter((row) => canAccessKey(profile, row.module_name, mode));
}

function recordKeyFor(key, value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return key;
  if (key === "inventory") return [value.code || value.item || "stock", value.branch || "branch", value.lot || value.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
  if (key === "transferHistory") return String(value.id || [value.transferId, value.date, value.action].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "warranties") return String(value.serial || value.id || `${value.client || "client"}|${value.equipment || "equipment"}|${value.warrantyEnd || index}`);
  if (key === "imports") return String(value.id || [value.date, value.module, value.file].filter(Boolean).join("|") || `${key}-${index}`);
  if (key === "reconHistory") return String(value.id || [value.date, value.range, value.period].filter(Boolean).join("|") || `${key}-${index}`);
  return String(value.id || value.documentNo || value.receiptNo || value.cvNo || value.code || value.name || value.email || `${key}-${index}`);
}

function stateFromRecords(records) {
  const next = {};
  const keyedArrays = {};
  for (const key of persistedKeys) next[key] = ["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key) ? undefined : [];
  for (const row of records) {
    const key = row.module_name;
    if (["branch", "masterTab", "branchAddresses", "invoiceApprovals"].includes(key)) next[key] = row.data?.value;
    else {
      keyedArrays[key] ||= new Map();
      keyedArrays[key].set(recordKeyFor(key, row.data, keyedArrays[key].size), row.data);
    }
  }
  for (const [key, map] of Object.entries(keyedArrays)) next[key] = [...map.values()];
  for (const key of ["branch", "masterTab", "branchAddresses", "invoiceApprovals"]) if (next[key] === undefined) delete next[key];
  return next;
}

function auditContextForRequest(request) {
  const userAgent = request.headers.get("user-agent") || "";
  return { device: deviceName(userAgent), browser: browserName(userAgent), ipAddress: clientIp(request), userAgent, serverCapturedAt: new Date().toISOString() };
}

function enrichAuditLogEntry(entry, auditContext) {
  if (!entry || typeof entry !== "object") return entry;
  return { ...entry, device: auditContext.device, browser: auditContext.browser, ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent, serverCapturedAt: entry.serverCapturedAt || auditContext.serverCapturedAt };
}

function recordsFromState(data, userId, stateKey, allowedKeys = persistedKeys, auditContext = null) {
  const rows = [];
  for (const key of allowedKeys) {
    const value = data?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const record = key === "logs" && auditContext ? enrichAuditLogEntry(item, auditContext) : item;
        rows.push({ state_key: stateKey, module_name: key, record_key: recordKeyFor(key, record, index), data: record, updated_by: userId });
      });
    } else {
      rows.push({ state_key: stateKey, module_name: key, record_key: key, data: { value }, updated_by: userId });
    }
  }
  return dedupeRowsByRecordKey(rows);
}

// A single upsert statement that targets the same (module_name, record_key) twice is
// rejected outright by Postgres ("ON CONFLICT DO UPDATE command cannot affect row a
// second time"), taking the whole batch down with it. Two client-supplied records that
// resolve to the same derived key (e.g. an import with a repeated code) must never be
// allowed to reach that statement — collapse them here, keeping the last occurrence so
// the most recently supplied version of a record wins, matching normal upsert semantics.
function dedupeRowsByRecordKey(rows) {
  const seen = new Map();
  const order = [];
  for (const row of rows) {
    const dedupeKey = `${row.module_name} ${row.record_key}`;
    if (!seen.has(dedupeKey)) order.push(dedupeKey);
    seen.set(dedupeKey, row);
  }
  return order.map((dedupeKey) => seen.get(dedupeKey));
}

function postgrestIn(values) {
  return `(${values.map((value) => `"${String(value).replace(/"/g, "\\\"")}"`).join(",")})`;
}

function manilaTimestamp() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}

// Writes directly to the "logs" module so a save's trail survives even if the
// save that produced it gets rejected — never routed through the same
// delete-then-insert path used for regular module state.
async function writeAuditTrace(env, stateKey, { actor, role, action, module, record }, userId, context) {
  const entry = {
    date: manilaTimestamp(),
    user: actor || "System User",
    role: role || "Unknown",
    action,
    module: module || "System",
    record: record || "",
    device: context?.device,
    browser: context?.browser,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
    serverCapturedAt: context?.serverCapturedAt,
  };
  await supabaseFetch(env, "/rest/v1/app_records", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: userId || null }]),
  }).catch(() => null);
}

function money(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function moneyWithCents(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function saleStatus(sale) {
  if (sale.status === "Cancelled") return "Cancelled";
  const balance = Number(sale.net || 0) - Number(sale.paid || 0);
  if (balance <= 0) return "Paid";
  const due = new Date(addDays(sale.date, sale.terms || 0)).getTime();
  const now = Date.now();
  if (due < now) return "Overdue";
  if (due - now <= 7 * 86400000) return "Near Due";
  if (Number(sale.paid || 0) > 0) return "Partially Paid";
  return "Unpaid";
}

function inventoryState(item) {
  const expiry = item.expiry && item.expiry !== "N/A" ? new Date(item.expiry).getTime() : null;
  if (expiry && expiry < Date.now()) return "For Disposal";
  if (Number(item.qty || 0) <= Math.ceil(Number(item.min || 0) * 0.5)) return "Critical";
  if (Number(item.qty || 0) < Number(item.min || 0)) return "Low Stock";
  if (expiry && expiry - Date.now() <= 183 * 86400000) return "Near Expiry";
  return "Available";
}

function generateReportsFromState(data, branch = "all") {
  const byBranch = (rows, key = "branch") => branch === "all" ? rows : rows.filter((row) => row[key] === branch || row.area === branch);
  const sales = byBranch(data.sales || [], "area");
  const inventory = byBranch(data.inventory || []);
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.net || 0), 0);
  const totalPaid = sales.reduce((sum, sale) => sum + Number(sale.paid || 0), 0);
  const overdue = sales.filter((sale) => saleStatus(sale) === "Overdue").length;
  const lowStock = inventory.filter((item) => ["Low Stock", "Critical"].includes(inventoryState(item))).length;
  return [
    { icon: "₱", title: "Sales by Territory", body: `Area, client, salesperson, SI/TS/DR, and item movement. ${money(totalSales)} current view.`, section: "sales", actionLabel: "Open Sales", rows: sales.map((sale) => [sale.area, sale.client, sale.salesperson, sale.documentNo || sale.id, `${sale.qty || ""} ${sale.uom || ""} ${sale.item || ""}`.trim(), money(sale.net)]) },
    { icon: "●", title: "Collections & AR", body: `${money(totalPaid)} collected. ${overdue} overdue invoice/s.`, section: "collections", actionLabel: "Open Collections", rows: sales.map((sale) => [sale.id, sale.client, saleStatus(sale), money(sale.paid), money(Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0)), addDays(sale.date, sale.terms || 0)]) },
    { icon: "▤", title: "Reagent Expiry", body: `${lowStock} low or critical stock records with lot and expiry tracking.`, section: "inventory", actionLabel: "Open Inventory", rows: inventory.map((item) => [item.item, item.branch, item.lot, item.expiry, item.qty, inventoryState(item)]) },
    { icon: "◆", title: "Client Documents", body: "BIR, SEC, TIN, required permits, and account attachments.", section: "masterlists", actionLabel: "Open Masterlists", rows: (data.clients || []).map((client) => [client.name, client.area, client.tin, money(client.creditLimit), client.docs]) },
    { icon: "◇", title: "Supplier Payables", body: `${(data.payables || []).length} supplier payable records with payment method tracking.`, section: "payables", actionLabel: "Open Payables", rows: (data.payables || []).map((payable) => [payable.supplier, payable.item, payable.method, money(payable.amount), money(payable.paid), money(Number(payable.amount || 0) - Number(payable.paid || 0)), payable.status]) },
    { icon: "◉", title: "Service & Warranty", body: "Equipment install, serial number, warranty, and customer support history.", section: "warranty", actionLabel: "Open Warranty", rows: (data.warranties || []).map((warranty) => [warranty.client, warranty.equipment, warranty.serial, warranty.installDate, warranty.warrantyEnd, warranty.status]) },
    { icon: "◎", title: "Compliance Audit", body: `${(data.logs || []).length} traceable changes for corrections, exports, and approvals.`, section: "logs", actionLabel: "Open Audit Logs", rows: (data.logs || []).map((log) => [log.date, log.user, log.module, log.action, log.record]) },
  ];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function documentType(type) {
  return type === "DRS" ? "DR" : String(type || "SI");
}

function formMoney(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundCurrency(value) { return Math.round(Number(value || 0) * 100) / 100; }
function withholdingBaseFromGross(gross) { return roundCurrency(Number(gross || 0) / 1.12); }
function hasWithholding(value) { return value === true || Number(value || 0) > 0; }
function itemGross(items = []) { return items.reduce((sum, item) => sum + Number(item.amount || 0), 0); }

function formDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function lineAmount(line) {
  return Number(line?.qty || 0) * Number(line?.price || 0);
}

function isEquipmentItem(item) {
  const category = String(item?.category || item?.classification || "").trim().toLowerCase();
  return category === "equipment";
}

function saleTaxBreakdown(sale) {
  const subtotal = Number(sale.amount || 0) - Number(sale.discount || 0);
  const totalAmountDue = Number(sale.net || subtotal);
  const isSi = documentType(sale.type) === "SI";
  const totalSalesVatInclusive = isSi ? totalAmountDue : subtotal;
  const isVatable = isSi && sale.vatCode !== "NO VAT";
  const addVat = isVatable ? Math.max(totalSalesVatInclusive - totalSalesVatInclusive / 1.12, 0) : 0;
  return { totalSalesVatInclusive, amountNetVat: totalSalesVatInclusive - addVat, addVat, totalAmountDue };
}

function printableBranchAllowed(profile, sale) {
  const branch = String(profile?.branch || "all");
  return ["all", "Both", "All"].includes(branch) || sale.area === branch || sale.branch === branch;
}

// A saved custom template supplies { fields: { fieldKey: {left,top,width,align,fontSize} }, row: {left,right,top,height,spacing} }.
// Only properties actually present are emitted as inline style, so anything the user never touched keeps using the CSS default.
function fieldOverrideStyle(o) {
  if (!o) return "";
  const parts = [];
  if (o.left != null) parts.push(`left:${o.left}in`);
  if (o.top != null) parts.push(`top:${o.top}in`);
  if (o.width != null) parts.push(`width:${o.width}in`);
  if (o.align) parts.push(`text-align:${o.align}`);
  if (o.fontSize != null) parts.push(`font-size:${o.fontSize}px`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

function rowOverrideStyle(row, index) {
  if (!row) return ` style="--row:${index}"`;
  const parts = [`--row:${index}`, `top:${round3(Number(row.top || 0) + index * Number(row.spacing || 0))}in`];
  if (row.left != null) parts.push(`left:${row.left}in`);
  if (row.right != null) parts.push(`right:${row.right}in`);
  if (row.height != null) parts.push(`height:${row.height}in`);
  return ` style="${parts.join(";")}"`;
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function printableRows(sale, variant, templateOverrides) {
  const lines = sale.lines?.length ? sale.lines : [{ item: sale.item, brand: sale.brand, qty: sale.qty, uom: sale.uom, price: Number(sale.amount || 0) / Math.max(Number(sale.qty || 1), 1), lot: "", expiry: "" }];
  const fields = templateOverrides?.fields || {};
  const row = templateOverrides?.row || null;
  return lines.slice(0, variant === "si" ? 10 : 8).map((line, index) => {
    const expiry = line.expiry && line.expiry !== "N/A" ? ` · Exp ${escapeHtml(line.expiry)}` : "";
    const lotExpiry = `<small>Lot ${escapeHtml(line.lot || "-")}${expiry}</small>`;
    const rowStyle = rowOverrideStyle(row, index);
    if (variant === "si") return `<div class="si-row"${rowStyle}><span class="si-item"${fieldOverrideStyle(fields["si-item"])}>${escapeHtml(line.item)}${lotExpiry}</span><span class="si-qty"${fieldOverrideStyle(fields["si-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="si-price"${fieldOverrideStyle(fields["si-price"])}>${formMoney(line.price)}</span><span class="si-amount"${fieldOverrideStyle(fields["si-amount"])}>${formMoney(lineAmount(line))}</span></div>`;
    if (variant === "ts") return `<div class="ts-row"${rowStyle}><span class="ts-code"${fieldOverrideStyle(fields["ts-code"])}>${escapeHtml(line.code || "")}</span><span class="ts-item"${fieldOverrideStyle(fields["ts-item"])}>${escapeHtml(line.item)}${lotExpiry}</span><span class="ts-qty"${fieldOverrideStyle(fields["ts-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="ts-amount"${fieldOverrideStyle(fields["ts-amount"])}>${formMoney(lineAmount(line))}</span></div>`;
    return `<div class="dr-row"${rowStyle}><span class="dr-qty"${fieldOverrideStyle(fields["dr-qty"])}>${Number(line.qty || 0)} ${escapeHtml(line.uom || "")}</span><span class="dr-item"${fieldOverrideStyle(fields["dr-item"])}>${escapeHtml(line.item)}${lotExpiry}</span><span class="dr-price"${fieldOverrideStyle(fields["dr-price"])}></span><span class="dr-amount"${fieldOverrideStyle(fields["dr-amount"])}></span></div>`;
  }).join("");
}

const printableCompanyFooter = "MEDLANE DIAGNOSTIC SOLUTIONS, INC.<br>13 Gumamela St. Pilar Village, Las Piñas<br>Las Piñas City 1740<br>Tel. No. (02) 8836-2853 Email: receivables.mdsi@gmail.com";
function printableBrandHeader(title = "") {
  return `<header class="print-brand-header"><img src="/medlane.jpg" alt="Medlane Diagnostic Solutions" /><div><strong>MEDLANE DIAGNOSTIC SOLUTIONS, INC.</strong>${title ? `<span>${escapeHtml(title)}</span>` : ""}</div></header>`;
}
function printableFooter() {
  return `<div class="print-company-footer">${printableCompanyFooter}</div>`;
}
function templateBranding() {
  return `<img class="template-print-logo" src="/medlane.jpg" alt="Medlane Diagnostic Solutions" /><div class="template-print-footer">${printableCompanyFooter}</div>`;
}

function printableInvoiceHtml({ sale, client, approvals, preparedBy, noDate, templateOverrides }) {
  const type = documentType(sale.type);
  const approvedBy = escapeHtml(approvals?.[type] || "ECTOSOC");
  const f = templateOverrides?.fields || {};
  const fs = (key) => fieldOverrideStyle(f[key]);
  if (type === "TS") return `<section class="template-overlay template-ts">${templateBranding()}${noDate ? "" : `<span class="field ts-date"${fs("ts-date")}>${formDate(new Date().toISOString())}</span>`}<span class="field ts-po"${fs("ts-po")}>${escapeHtml(sale.po || "")}</span><span class="field ts-terms"${fs("ts-terms")}>Terms: ${Number(sale.terms || 30)} Days</span><span class="field ts-client"${fs("ts-client")}>${escapeHtml(sale.client)}</span><span class="field ts-address"${fs("ts-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "ts", templateOverrides)}<span class="field ts-tax-label"${fs("ts-tax-label")}>NOT VALID FOR CLAIMING OF INPUT TAX</span><span class="field ts-total"${fs("ts-total")}>${formMoney(sale.net || sale.amount || 0)}</span><span class="field ts-prepared"${fs("ts-prepared")}>${escapeHtml(preparedBy)}</span><span class="field ts-approved"${fs("ts-approved")}>${approvedBy}</span><span class="field ts-received"></span></section>`;
  if (type === "DR") return `<section class="template-overlay template-dr">${templateBranding()}${noDate ? "" : `<span class="field dr-date"${fs("dr-date")}>${formDate(new Date().toISOString())}</span>`}<span class="field dr-po"${fs("dr-po")}>${escapeHtml(sale.po || "")}</span><span class="field dr-terms"${fs("dr-terms")}>${Number(sale.terms || 30)} Days</span><span class="field dr-client"${fs("dr-client")}>${escapeHtml(sale.client)}</span><span class="field dr-address"${fs("dr-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "dr", templateOverrides)}<span class="field dr-prepared"${fs("dr-prepared")}>${escapeHtml(preparedBy)}</span><span class="field dr-recorded"${fs("dr-recorded")}></span><span class="field dr-approved"${fs("dr-approved")}>${approvedBy}</span><span class="field dr-received"${fs("dr-received")}></span></section>`;
  const breakdown = saleTaxBreakdown(sale);
  return `<section class="template-overlay template-si">${templateBranding()}${noDate ? "" : `<span class="field si-date"${fs("si-date")}>${formDate(sale.date)}</span>`}<span class="field si-po"${fs("si-po")}>${escapeHtml(sale.po || "")}</span><span class="field si-terms"${fs("si-terms")}>Terms of Payment ${Number(sale.terms || 30)} Days</span><span class="field si-sold"${fs("si-sold")}>${escapeHtml(sale.client)}</span><span class="field si-registered"${fs("si-registered")}>${escapeHtml(sale.client)}</span><span class="field si-tin"${fs("si-tin")}>${escapeHtml(client.tin || "")}</span><span class="field si-address"${fs("si-address")}>${escapeHtml(client.address || sale.area || "")}</span>${printableRows(sale, "si", templateOverrides)}<span class="field si-total-sales"${fs("si-total-sales")}>${formMoney(breakdown.totalSalesVatInclusive)}</span><span class="field si-net-vat"${fs("si-net-vat")}>${formMoney(breakdown.amountNetVat)}</span><span class="field si-discount"${fs("si-discount")}>${formMoney(sale.discount || 0)}</span><span class="field si-vat"${fs("si-vat")}>${formMoney(breakdown.addVat)}</span><span class="field si-amount-due"${fs("si-amount-due")}>${formMoney(breakdown.totalAmountDue)}</span><span class="field si-prepared"${fs("si-prepared")}>${escapeHtml(preparedBy)}</span><span class="field si-approved"${fs("si-approved")}>${approvedBy}</span></section>`;
}

function paymentRequestPrintableHtml(request) {
  const items = request.items?.length ? request.items : [{ particulars: request.particulars || "", amount: request.amount || request.total || 0 }];
  // Collections created with the per-invoice itemized editor carry an explicit invoice + net
  // amount on every item; older/general payment requests only have flat particulars/amount
  // lines with one aggregate withholding deduction for the whole voucher.
  const perInvoice = items.length > 0 && items.every((item) => item.invoice && item.netAmount != null);
  const paymentDetails = ["Check", "Bank Transfer"].includes(request.paymentType) ? `<div><strong>PAYMENT DETAILS:</strong><br>Bank Name: ${escapeHtml(request.bank || "-")}<br>Account No.: ${escapeHtml(request.bankAccount || "-")}<br>Check no: ${escapeHtml(request.cheque || "-")}<br>Date: ${escapeHtml((request.paymentType === "Bank Transfer" ? request.transferDate : request.chequeDate) || "-")}</div>` : "";
  const metaNetAmount = request.netAmount ? `<span>Net Amount: <strong>${money(request.netAmount)}</strong></span>` : "";
  let tableHtml;
  let total;
  if (perInvoice) {
    total = items.reduce((sum, item) => sum + Number(item.netAmount || 0), 0);
    tableHtml = `<table><thead><tr><th>Invoice</th><th>Amount</th><th>VAT-excl. Base</th><th>WTax 5%</th><th>EWT 1%</th><th>Net Amount</th></tr></thead><tbody>${items.map((item) => {
      // Withholding is computed off the invoice's gross amount due (falling back to the
      // collected amount for older records saved before amountDue was tracked per line), not
      // the cash collected — see paymentRequestRowDeductions in modules.js for why.
      const taxBase = withholdingBaseFromGross(Number(item.amountDue ?? item.amount ?? 0));
      const withholdingTax = hasWithholding(item.withholdingTax) ? roundCurrency(taxBase * 0.05) : 0;
      const expandedWithholdingTax = hasWithholding(item.expandedWithholdingTax) ? roundCurrency(taxBase * 0.01) : 0;
      return `<tr><td>${escapeHtml(item.invoice)}</td><td>${money(item.amount)}</td><td>${moneyWithCents(taxBase)}</td><td>${withholdingTax ? moneyWithCents(withholdingTax) : "-"}</td><td>${expandedWithholdingTax ? moneyWithCents(expandedWithholdingTax) : "-"}</td><td>${money(item.netAmount)}</td></tr>`;
    }).join("")}<tr><td colspan="5"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>`;
  } else {
    const oldWithholdingTax = Number(request.withholdingTax || 0);
    const oldExpandedWithholdingTax = Number(request.expandedWithholdingTax || 0);
    const gross = Number(request.gross || 0) || itemGross(items) || Number(request.total || 0) + oldWithholdingTax + oldExpandedWithholdingTax;
    const taxBase = withholdingBaseFromGross(gross);
    const withholdingTax = hasWithholding(request.withholdingTax) ? roundCurrency(taxBase * 0.05) : 0;
    const expandedWithholdingTax = hasWithholding(request.expandedWithholdingTax) ? roundCurrency(taxBase * 0.01) : 0;
    total = roundCurrency(Math.max(gross - withholdingTax - expandedWithholdingTax, 0));
    tableHtml = `<table><thead><tr><th>Date</th><th>Particulars</th><th>Amount</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index === 0 ? escapeHtml(request.date) : ""}</td><td>${escapeHtml(item.particulars)}</td><td>${money(item.amount)}</td></tr>`).join("")}${withholdingTax ? `<tr><td colspan="2">Less: Withholding Tax 5%</td><td>${moneyWithCents(withholdingTax)}</td></tr>` : ""}${expandedWithholdingTax ? `<tr><td colspan="2">Less: Expanded Withholding Tax 1%</td><td>${moneyWithCents(expandedWithholdingTax)}</td></tr>` : ""}<tr><td colspan="2"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>`;
  }
  return `<section class="payment-request-print">${printableBrandHeader(request.cvNo)}<div class="pr-meta"><span>Client: <strong>${escapeHtml(request.employee)}</strong></span><span>Department: <strong>${escapeHtml(request.department)}</strong></span><span>Date: <strong>${escapeHtml(request.date)}</strong></span>${metaNetAmount}</div><div class="pr-checks"><strong>Mode of Payment:</strong><span>${request.paymentType === "Cash" ? "[x]" : "[ ]"} Cash</span><span>${request.paymentType === "Check" ? "[x]" : "[ ]"} Check</span><span>${request.paymentType === "Bank Transfer" ? "[x]" : "[ ]"} Bank Transfer</span><span>${request.paymentType === "Debit Memo" ? "[x]" : "[ ]"} Debit Memo</span></div>${tableHtml}<p class="pr-instructions"><strong>Attach supporting official receipts, invoices, or billing statements before approval and release.</strong></p><footer><div>Prepared by:<br><strong>${escapeHtml(request.preparedBy)}</strong><br>${escapeHtml(request.preparedRole)}</div><div>Approved by:<br><strong>Maria Emma F. Llorin</strong><br>CEO</div>${paymentDetails}</footer>${printableFooter()}</section>`;
}

function financialRequestPrintableHtml(record, type) {
  const items = record.items?.length ? record.items : [{ particulars: record.item || record.requestNote || "Request", amount: record.amount || 0 }];
  const partyLabel = type === "payable" ? "Supplier" : "Requester";
  const partyValue = type === "payable" ? record.supplier : record.requester;
  const extraMeta = type === "payable"
    ? `<span>Contact: <strong>${escapeHtml(record.contact || "-")}</strong></span>`
    : `<span>Office: <strong>${escapeHtml(record.office || "-")}</strong></span><span>Type: <strong>${escapeHtml(record.type || "-")}</strong></span>`;
  const hasVendorColumn = type === "payable" && items.some((item) => item.vendor);
  const gross = Number(record.grossAmount || 0) || itemGross(items) || Number(record.amount || 0) + Number(record.withholdingTax1 || 0) + Number(record.withholdingTax2 || 0);
  const taxBase = withholdingBaseFromGross(gross);
  const withholdingTax1 = type === "payable" && hasWithholding(record.withholdingTax1) ? roundCurrency(taxBase * 0.01) : 0;
  const withholdingTax2 = type === "payable" && hasWithholding(record.withholdingTax2) ? roundCurrency(taxBase * 0.02) : 0;
  const netTotal = type === "payable" ? roundCurrency(Math.max(gross - withholdingTax1 - withholdingTax2, 0)) : Number(record.amount || 0);
  const withholdingRows = type === "payable" ? `${withholdingTax1 ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Less: Withholding 1%</td><td>${moneyWithCents(withholdingTax1)}</td></tr>` : ""}${withholdingTax2 ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Less: Withholding 2%</td><td>${moneyWithCents(withholdingTax2)}</td></tr>` : ""}` : "";
  const totalLabel = type === "payable" ? "Net Total" : "Total";
  return `<section class="payment-request-print">${printableBrandHeader(record.id)}<div class="pr-meta"><span>${partyLabel}: <strong>${escapeHtml(partyValue || "-")}</strong></span>${extraMeta}<span>Status: <strong>${escapeHtml(record.requestStatus || record.status || "-")}</strong></span></div><table><thead><tr>${hasVendorColumn ? "<th>Vendor</th>" : ""}<th>Particulars</th><th>Amount</th></tr></thead><tbody>${items.map((item) => `<tr>${hasVendorColumn ? `<td>${escapeHtml(item.vendor || "-")}</td>` : ""}<td>${escapeHtml(item.particulars || "")}</td><td>${money(item.amount || 0)}</td></tr>`).join("")}${type === "payable" ? `<tr><td${hasVendorColumn ? ' colspan="2"' : ""}>Gross Total</td><td>${money(gross)}</td></tr>` : ""}${withholdingRows}<tr><td${hasVendorColumn ? ' colspan="2"' : ""}><strong>${totalLabel}</strong></td><td><strong>${money(netTotal)}</strong></td></tr></tbody></table>${record.requestNote ? `<p class="pr-instructions"><strong>Notes:</strong> ${escapeHtml(record.requestNote)}</p>` : ""}<footer><div>Payment Method:<br><strong>${escapeHtml(record.method || "Not set")}</strong></div><div>Approved by:<br><strong>${escapeHtml(record.approvedBy || "Pending")}</strong></div></footer>${printableFooter()}</section>`;
}

function inventoryPoPrintableHtml(po) {
  const total = (po.lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0);
  return `<section class="payment-request-print inventory-po-print">${printableBrandHeader(po.id)}<div class="pr-meta"><span>Supplier: <strong>${escapeHtml(po.supplier)}</strong></span><span>Date: <strong>${escapeHtml(po.date)}</strong></span><span>Terms: <strong>${Number(po.terms || 30)} Days</strong></span></div><table><thead><tr><th>Qty.</th><th>U/M</th><th>Item Description</th><th>Lot</th><th>Expiry</th><th>Unit Cost</th><th>Disc. Amt</th><th>Total Amount</th></tr></thead><tbody>${(po.lines || []).map((line) => { const discount = Number(line.discount || 0); const totalLine = Number(line.qty || 0) * Number(line.price || 0) - discount; return `<tr><td>${Number(line.qty || 0)}</td><td>${escapeHtml(line.uom || "")}</td><td>${escapeHtml(line.item)}<br><small>${escapeHtml(line.brand || "")}</small></td><td>${escapeHtml(line.lot || "-")}</td><td>${escapeHtml(line.expiry || "N/A")}</td><td>${money(line.price || 0)}</td><td>${money(discount)}</td><td>${money(totalLine)}</td></tr>`; }).join("")}<tr><td colspan="7"><strong>Total</strong></td><td><strong>${money(total)}</strong></td></tr></tbody></table>${printableFooter()}</section>`;
}

function transferRequestPrintableHtml(transfer) {
  const lines = transfer.lines || [];
  return `<section class="payment-request-print">${printableBrandHeader(transfer.id)}<div class="pr-meta"><span>From: <strong>${escapeHtml(transfer.from)}</strong></span><span>To: <strong>${escapeHtml(transfer.to)}</strong></span><span>Status: <strong>${escapeHtml(transfer.status || "-")}</strong></span><span>Requested by: <strong>${escapeHtml(transfer.requestedBy || "-")}</strong></span>${transfer.dispatchedAt ? `<span>Dispatched: <strong>${escapeHtml(transfer.dispatchedAt)}</strong></span>` : ""}</div><table><thead><tr><th>Item</th><th>Requested Qty</th><th>Requested Lot</th><th>Requested Expiry</th><th>Dispatched Qty</th><th>Dispatched Lot</th><th>Dispatched Expiry</th></tr></thead><tbody>${lines.map((line) => `<tr><td>${escapeHtml(line.item)}<br><small>${escapeHtml(line.code || "")}</small></td><td>${Number(line.requestedQty || 0)}</td><td>${escapeHtml(line.requestedLot || "-")}</td><td>${escapeHtml(line.requestedExpiry || "N/A")}</td><td>${line.dispatchedQty != null ? Number(line.dispatchedQty) : "-"}</td><td>${escapeHtml(line.dispatchedLot || "-")}</td><td>${escapeHtml(line.dispatchedExpiry || "-")}</td></tr>`).join("")}</tbody></table><footer><div>Prepared by:<br><strong>${escapeHtml(transfer.requestedBy || "-")}</strong></div><div>Dispatched by:<br><strong>${escapeHtml(transfer.dispatchedBy || "Pending")}</strong></div></footer>${printableFooter()}</section>`;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function productIssuePrintableHtml(report) {
  const selectedTypes = new Set(splitList(report.typeOfSupport));
  const selectedTopics = new Set(splitList(report.topicsDiscussed));
  const mark = (on) => (on ? "X" : "");
  const rows = report.qcParameters?.length ? report.qcParameters : [];
  const paramRows = rows.slice(0, 12).map((row, index) => `<span class="field tsr-param-row" style="--row:${index}"><span class="field tsr-param-name">${escapeHtml(row.parameter || "")}</span><span class="field tsr-param-factor">${escapeHtml(row.factor || "")}</span><span class="field tsr-l1-range">${escapeHtml(row.l1Range || "")}</span><span class="field tsr-l1-result">${escapeHtml(row.l1Result || "")}</span><span class="field tsr-l1-p">${mark(row.l1P)}</span><span class="field tsr-l1-f">${mark(row.l1F)}</span><span class="field tsr-l2-range">${escapeHtml(row.l2Range || "")}</span><span class="field tsr-l2-result">${escapeHtml(row.l2Result || "")}</span><span class="field tsr-l2-p">${mark(row.l2P)}</span><span class="field tsr-l2-f">${mark(row.l2F)}</span><span class="field tsr-l3-range">${escapeHtml(row.l3Range || "")}</span><span class="field tsr-l3-result">${escapeHtml(row.l3Result || "")}</span><span class="field tsr-l3-p">${mark(row.l3P)}</span><span class="field tsr-l3-f">${mark(row.l3F)}</span></span>`).join("");
  return `<section class="template-overlay template-tsr">${templateBranding()}<span class="field tsr-company">${escapeHtml(report.companyName || "")}</span><span class="field tsr-address">${escapeHtml(report.address || "")}</span><span class="field tsr-contact-person">${escapeHtml(report.contactPerson || "")}</span><span class="field tsr-type-app">${selectedTypes.has("Application Troubleshooting") ? "X" : ""}</span><span class="field tsr-type-training">${selectedTypes.has("Training Support") ? "X" : ""}</span><span class="field tsr-type-tech">${selectedTypes.has("Technical Support") ? "X" : ""}</span><span class="field tsr-topic-theories">${selectedTopics.has("Theories and Principles") ? "X" : ""}</span><span class="field tsr-topic-operation">${selectedTopics.has("Unit Operation") ? "X" : ""}</span><span class="field tsr-topic-parameter">${selectedTopics.has("Parameter Prog.") ? "X" : ""}</span><span class="field tsr-topic-maintenance">${selectedTopics.has("Unit Maintenance") ? "X" : ""}</span><span class="field tsr-topic-basic">${selectedTopics.has("Basic Troubleshooting") ? "X" : ""}</span><span class="field tsr-topic-pm">${selectedTopics.has("PM and Calibration") ? "X" : ""}</span><span class="field tsr-equipment">${escapeHtml(report.equipment || "")}</span><span class="field tsr-serial">${escapeHtml(report.serialNo || "")}</span><span class="field tsr-concerns">${escapeHtml(report.concerns || "")}</span><span class="field tsr-actions">${escapeHtml(report.actionsTaken || "")}</span><span class="field tsr-l1-lot">${escapeHtml(report.qcLevel1Lot || "")}</span><span class="field tsr-l2-lot">${escapeHtml(report.qcLevel2Lot || "")}</span><span class="field tsr-l3-lot">${escapeHtml(report.qcLevel3Lot || "")}</span>${paramRows}<span class="field tsr-performed">${escapeHtml(report.performedBy || "")}</span><span class="field tsr-conforme">${escapeHtml(report.conforme || "")}</span></section>`;
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

async function gzipBytes(text) {
  const stream = new Blob([text], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipText(object) {
  const stream = object.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function createBackup(env, backupType = "manual", actor = null) {
  if (env.ENVIRONMENT !== "production") throw new Error("Backups are disabled outside production");
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
    await sendDiscordWebhook(env, { embeds: [{ title: "Backup Completed", color: 0x22c55e, fields: [{ name: "Type", value: backupType, inline: true }, { name: "Records", value: String(records.length), inline: true }, { name: "Size", value: `${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`, inline: true }], timestamp: new Date().toISOString() }] }).catch((error) => console.error(JSON.stringify({ message: "Discord backup notice failed", error: error.message })));
    return inserted[0];
  } catch (error) {
    await releaseStorage(env, bytes.byteLength).catch(() => null);
    await env.DOCUMENTS_BUCKET.delete(objectKey).catch(() => null);
    await sendDiscordWebhook(env, { content: "Backup failed. Immediate review recommended.", embeds: [{ title: "Backup Failed", color: 0xef4b4f, description: String(error.message || error).slice(0, 500), fields: [{ name: "Type", value: backupType, inline: true }], timestamp: new Date().toISOString() }] }).catch(() => null);
    throw error;
  }
}

async function restoreBackupObject(env, key, actorId, auditContext) {
  if (env.ENVIRONMENT !== "production") throw new Error("Restore is disabled outside production");
  if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
  const stateKey = appStateKey(env);
  const prefix = `backups/${stateKey}/`;
  if (!key.startsWith(prefix) || !key.endsWith(".json.gz")) throw new Error("Invalid backup object key");
  const object = await env.DOCUMENTS_BUCKET.get(key);
  if (!object) throw new Error("Backup object not found");
  const payload = JSON.parse(await gunzipText(object));
  if (!payload || payload.app !== "medlane" || payload.stateKey !== stateKey || !Array.isArray(payload.records)) throw new Error("Invalid Medlane backup payload");
  const records = payload.records
    .filter((row) => (!row?.state_key || row.state_key === stateKey) && persistedKeys.includes(row.module_name) && row.module_name !== "logs")
    .map((row) => ({ state_key: stateKey, module_name: row.module_name, record_key: String(row.record_key || recordKeyFor(row.module_name, row.data, 0)), data: row.data || {}, updated_by: actorId || null }));
  if (!records.length) throw new Error("Backup has no restorable app records");
  // Snapshot the current data BEFORE overwriting it with the older backup. This is not the
  // backup being restored — it is a full backup of whatever was live a moment ago, so the true
  // latest state can always be recovered no matter how many times a user restores an old
  // backup afterward (each restore snapshots what was live right before it, chaining back to
  // the original latest state).
  const preRestoreBackup = await createBackup(env, "pre-restore", actorId);
  const chunkSize = 300;
  for (let index = 0; index < records.length; index += chunkSize) {
    await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(records.slice(index, index + chunkSize)),
    });
  }
  await writeAuditTrace(env, stateKey, { actor: actorId || "System User", role: "Superadmin", action: "Restored backup object", module: "Backup", record: `${key} · ${records.length} records upserted · pre-restore safety backup ${preRestoreBackup.object_key}` }, actorId, auditContext);
  return { restoredRecords: records.length, objectKey: key, backupCreatedAt: payload.createdAt || null, preRestoreBackupKey: preRestoreBackup.object_key };
}

// ---- Automated alert / digest emails (threshold, approval-needed, daily/weekly digest) ----

const DIGEST_ROLE_RECIPIENTS = {
  thresholdInventory: ["Logistics", "Product Specialist"],
  thresholdCredit: ["Accounting", "Sales"],
  thresholdWarranty: ["Engineering", "Product Specialist"],
  approvalPo: ["Superadmin"],
  approvalPaymentRequest: ["Superadmin", "CEO"],
  approvalPayable: ["Superadmin", "CEO"],
  approvalDemoSales: ["Sales"],
  approvalDemoManagement: ["Superadmin", "CEO"],
  approvalProductIssue: ["Engineering"],
  digestBusiness: ["Accounting", "CEO", "Superadmin"],
  digestAuditLog: ["Superadmin", "CEO"],
};

const FIVE_MINUTE_MONITOR_CRON = "*/5 * * * *";

function digestDaysUntil(dateStr) {
  if (!dateStr || dateStr === "N/A") return NaN;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function digestInventoryStatus(item) {
  const min = Number(item.min || 0);
  if (item.expiry && item.expiry !== "N/A" && digestDaysUntil(item.expiry) < 0) return "For Disposal";
  if (item.qty <= Math.ceil(min * 0.5)) return "Critical";
  if (item.qty < min) return "Low Stock";
  if (item.expiry && item.expiry !== "N/A" && digestDaysUntil(item.expiry) <= 183) return "Near Expiry";
  return "Available";
}

function digestSaleStatus(sale) {
  if (sale.status === "Cancelled") return "Cancelled";
  const balance = Number(sale.net || 0) - Number(sale.paid || 0);
  const dueIn = digestDaysUntil(addDays(sale.date, sale.terms));
  if (balance <= 0) return "Paid";
  if (dueIn < 0) return "Overdue";
  if (dueIn <= 7) return "Near Due";
  if (Number(sale.paid || 0) > 0) return "Partially Paid";
  return "Unpaid";
}

function digestClientBalance(clientName, sales) {
  return sales.filter((sale) => sale.client === clientName && sale.status !== "Cancelled").reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
}

const LARGE_TRANSACTION_THRESHOLD = 100000;

function poFullyPaidServer(po, sales) {
  const linkedSales = sales.filter((sale) => sale.po === po.id && sale.status !== "Cancelled");
  return linkedSales.length > 0 && linkedSales.every((sale) => Number(sale.paid || 0) >= Number(sale.net || 0));
}

function salesPoStatusServer(po, sales) {
  const lines = po.lines || [];
  const linkedSales = sales.filter((sale) => sale.po === po.id && sale.status !== "Cancelled");
  if (!linkedSales.length) return "For Invoicing";
  const pendingQty = lines.reduce((sum, line) => {
    const served = linkedSales.flatMap((sale) => sale.lines || []).filter((saleLine) => (saleLine.code && line.code && saleLine.code === line.code) || saleLine.item === line.item).reduce((lineSum, saleLine) => lineSum + Number(saleLine.qty || 0), 0);
    return sum + Math.max(Number(line.qty || 0) - served, 0);
  }, 0);
  if (pendingQty > 0) return "Pending Orders";
  return linkedSales.some((sale) => sale.type === "SI") ? "Sales Invoice" : "Transmittal Slip";
}

const digestStateModules = ["inventory", "sales", "clients", "warranties", "inventoryPurchaseOrders", "inventoryDemoRequests", "pendingTransfers", "collectionContacts", "purchaseOrders", "paymentRequests", "payables", "replenishments", "productIssues", "payments", "imports", "reconHistory"];

async function loadDigestState(env, modules = digestStateModules) {
  const stateKey = appStateKey(env);
  const chunks = [];
  for (let index = 0; index < modules.length; index += 5) chunks.push(modules.slice(index, index + 5));
  const results = await Promise.all(chunks.map((chunk) => supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(chunk))}&select=module_name,record_key,data`)));
  return stateFromRecords(results.flat());
}

function pendingSummaryFields(state) {
  const sales = state.sales || [];
  const salesPurchaseOrders = (state.purchaseOrders || []).filter((po) => !["Sales Invoice", "Transmittal Slip"].includes(salesPoStatusServer(po, sales)) && !poFullyPaidServer(po, sales));
  const inventoryPurchaseOrders = (state.inventoryPurchaseOrders || []).filter((po) => !/approved|fully received|cancelled/i.test(po.status || ""));
  const inventoryPoApproval = inventoryPurchaseOrders.filter((po) => po.status === "Pending Approval");
  const transfers = (state.pendingTransfers || []).filter((transfer) => !/received|cancelled/i.test(transfer.status || ""));
  const collectionContacts = (state.collectionContacts || []).filter((contact) => ["Pending", "No Response", "Unreached", "Cheque Available"].includes(contact.status));
  // Payment requests awaiting approval are surfaced once, under "Pending Approvals" —
  // repeating them under "Collections" as well just duplicates the same rows and was
  // a big part of why this digest read as noisy.
  const collectionApprovals = (state.paymentRequests || []).filter((request) => request.invoice && request.requestStatus === "Pending");
  const payables = (state.payables || []).filter((payable) => (payable.requestStatus || payable.status) === "For Approval");
  const expenses = (state.replenishments || []).filter((expense) => (expense.requestStatus || expense.status) === "For Approval");
  const PREVIEW_ROWS = 6;
  const field = (emoji, name, rows, mapper) => {
    if (!rows.length) return null;
    const preview = rows.slice(0, PREVIEW_ROWS).map((row) => `▸ ${mapper(row)}`);
    return { name: `${emoji} ${name} (${rows.length})`, value: discordFieldValue(preview, 900, rows.length), inline: false };
  };
  return [
    field("📄", "Sales Purchase Orders", salesPurchaseOrders, (po) => `\`${po.id}\` — **${po.client || "No client"}** · ${salesPoStatusServer(po, sales)}`),
    field("📦", "Inventory Purchase Orders", inventoryPurchaseOrders, (po) => `\`${po.id}\` — **${po.supplier || "No supplier"}** · ${po.status || "Pending"}`),
    field("✅", "Pending Approvals", [...inventoryPoApproval, ...collectionApprovals], (item) => item.supplier ? `Inventory PO \`${item.id}\` — **${item.supplier}**` : `Collection \`${item.cvNo || item.id || "Request"}\` — **${item.employee || item.invoice}**`),
    field("🚚", "Transfers", transfers, (transfer) => `\`${transfer.id}\` — **${transfer.item || "Items"}**, ${transfer.from || "-"} → ${transfer.to || "-"} · ${transfer.status || "Pending"}`),
    field("💰", "Collections", collectionContacts, (contact) => `**${contact.client || "Client"}** — ${contact.status}${contact.chequeInvoice ? ` (${contact.chequeInvoice})` : ""}`),
    field("💸", "Payables", payables, (payable) => `\`${payable.id || "Payable"}\` — **${payable.supplier || "Vendor"}**, ${money(payable.amount || payable.total || 0)} · ${payable.requestStatus || payable.status}`),
    field("🧾", "Expenses", expenses, (expense) => `\`${expense.id || "Expense"}\` — **${expense.type || "Expense"}**, ${money(expense.amount || expense.total || 0)} · ${expense.requestStatus || expense.status}`),
  ].filter(Boolean);
}

function detectThresholdsAndApprovals(state) {
  const sections = {};
  const pushSection = (roles, title, lines) => {
    if (!lines.length) return;
    roles.forEach((role) => {
      sections[role] ||= [];
      sections[role].push({ title, lines });
    });
  };

  const inventory = state.inventory || [];
  const lowStock = inventory.filter((item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item)));
  const nearExpiry = inventory.filter((item) => digestInventoryStatus(item) === "Near Expiry");
  if (lowStock.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdInventory, "Low / Critical Stock", lowStock.map((item) => `${item.item} (${item.branch}) — ${item.qty} left, lot ${item.lot}`));
  if (nearExpiry.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdInventory, "Near-Expiry Stock", nearExpiry.map((item) => `${item.item} (${item.branch}) — lot ${item.lot}, expires ${item.expiry}`));

  const sales = state.sales || [];
  const clients = state.clients || [];
  const overdue = sales.filter((sale) => digestSaleStatus(sale) === "Overdue");
  if (overdue.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdCredit, "Overdue Invoices", overdue.map((sale) => `${sale.documentNo || sale.id} — ${sale.client}, ${money(Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0))} overdue`));
  const creditBreach = clients.filter((client) => Number(client.creditLimit || 0) > 0 && digestClientBalance(client.name, sales) > Number(client.creditLimit));
  if (creditBreach.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdCredit, "Credit Limit Breach", creditBreach.map((client) => `${client.name} — ${money(digestClientBalance(client.name, sales))} used / ${money(client.creditLimit)} limit`));

  const warranties = state.warranties || [];
  const warrantyEnding = warranties.filter((item) => { const d = digestDaysUntil(item.warrantyEnd); return d >= 0 && d <= 30; });
  const warrantyExpired = warranties.filter((item) => digestDaysUntil(item.warrantyEnd) < 0 || String(item.status || "").toLowerCase().includes("expired"));
  if (warrantyEnding.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdWarranty, "Warranty Ending Soon", warrantyEnding.map((item) => `${item.client} — ${item.equipment} (${item.serial}), ends ${item.warrantyEnd}`));
  if (warrantyExpired.length) pushSection(DIGEST_ROLE_RECIPIENTS.thresholdWarranty, "Warranty Expired", warrantyExpired.map((item) => `${item.client} — ${item.equipment} (${item.serial})`));

  const inventoryPOs = state.inventoryPurchaseOrders || [];
  const poPending = inventoryPOs.filter((po) => po.status === "Pending Approval");
  if (poPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPo, "Purchase Orders Awaiting Approval", poPending.map((po) => `${po.id} — ${po.supplier}`));

  const paymentRequests = state.paymentRequests || [];
  const paymentPending = paymentRequests.filter((request) => request.invoice && request.requestStatus === "Pending");
  if (paymentPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPaymentRequest, "Payments Received Awaiting Approval", paymentPending.map((request) => `${request.cvNo} — ${request.invoice}, ${money(request.total)}`));

  const payables = state.payables || [];
  const payablesPending = payables.filter((payable) => (payable.requestStatus || payable.status) === "For Approval");
  const replenishments = state.replenishments || [];
  const replenishmentsPending = replenishments.filter((item) => (item.requestStatus || item.status) === "For Approval");
  const financialPending = [...payablesPending.map((p) => `Payable — ${p.supplier}, ${money(p.amount)}`), ...replenishmentsPending.map((r) => `Expense — ${r.type}, ${money(r.amount)}`)];
  if (financialPending.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalPayable, "Payables / Expenses Awaiting Approval", financialPending);

  const demoRequests = state.inventoryDemoRequests || [];
  const demoSalesApproval = demoRequests.filter((request) => request.status === "For Sales Approval");
  const demoManagementApproval = demoRequests.filter((request) => request.status === "For Management Approval");
  if (demoSalesApproval.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalDemoSales, "Demo Requests Awaiting Sales Approval", demoSalesApproval.map((request) => `${request.id} — ${request.client}, ${request.lines?.length || 0} item(s)`));
  if (demoManagementApproval.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalDemoManagement, "Demo Requests Awaiting Management Approval", demoManagementApproval.map((request) => `${request.id} — ${request.client}, sales-approved by ${request.salesApprovedBy || "-"}`));

  const productIssues = state.productIssues || [];
  const passedIssues = productIssues.filter((report) => ["Pass to Engineering", "Pass to Product Specialist"].includes(report.status));
  if (passedIssues.length) pushSection(DIGEST_ROLE_RECIPIENTS.approvalProductIssue, "Support Reports Awaiting Handoff", passedIssues.map((report) => `${report.id} — ${report.companyName} (${report.status})`));

  return sections;
}

function computeBusinessMetrics(state) {
  const sales = (state.sales || []).filter((sale) => sale.status !== "Cancelled");
  const payments = state.payments || [];
  const inventory = state.inventory || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.net || 0), 0);
  const totalCollected = sales.reduce((sum, sale) => sum + Number(sale.paid || 0), 0);
  const totalExpenses = [...payables, ...replenishments].reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
  const overdueCount = sales.filter((sale) => digestSaleStatus(sale) === "Overdue").length;
  const pendingDeposit = payments.filter((payment) => ["For Deposition", "Posted Date"].includes(payment.collectionStatus)).length;
  const bounced = payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce")).length;
  const lowStock = inventory.filter((item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item))).length;
  const activeDemos = demoRequests.filter((request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || "")).length;
  return {
    salesCount: sales.length,
    totalSales,
    totalCollected,
    openReceivables: Math.max(totalSales - totalCollected, 0),
    totalExpenses,
    overdueCount,
    pendingDeposit,
    bounced,
    lowStock,
    activeDemos,
  };
}

function buildBusinessSummaryLines(state) {
  const m = computeBusinessMetrics(state);
  return [
    `New/active invoices tracked: ${m.salesCount}`,
    `Total invoiced: ${money(m.totalSales)}`,
    `Total collected: ${money(m.totalCollected)}`,
    `Open receivables: ${money(m.openReceivables)}`,
    `Total business expenses (payables + expenses): ${money(m.totalExpenses)}`,
    `Overdue invoices: ${m.overdueCount}`,
    `Collections pending deposit: ${m.pendingDeposit}`,
    `Bounced payments: ${m.bounced}`,
    `Low / critical inventory: ${m.lowStock}`,
    `Active demo requests: ${m.activeDemos}`,
  ];
}

function financialDigestLines(state, sinceIso) {
  const since = new Date(sinceIso);
  const inPeriod = (value) => value && new Date(value) >= since;
  const purchaseOrders = state.purchaseOrders || [];
  const inventoryPurchaseOrders = state.inventoryPurchaseOrders || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const openClientPos = purchaseOrders.filter((po) => !/completed|cancelled|invoice/i.test(po.status || ""));
  const newClientPos = purchaseOrders.filter((po) => inPeriod(po.date));
  const openInventoryPos = inventoryPurchaseOrders.filter((po) => !/completed|cancelled|received/i.test(po.status || ""));
  const inventoryPoTotal = openInventoryPos.reduce((sum, po) => sum + (po.lines || []).reduce((lineSum, line) => lineSum + Number(line.qty || 0) * Number(line.price || 0) - Number(line.discount || 0), 0), 0);
  const openPayables = payables.filter((payable) => !/paid|cancelled|rejected/i.test(payable.requestStatus || payable.status || ""));
  const pendingExpenses = replenishments.filter((expense) => !/paid|liquidated|cancelled|rejected/i.test(expense.requestStatus || expense.status || ""));
  const combinedExpenses = [...payables, ...replenishments];
  const activeDemos = demoRequests.filter((request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  const newDemos = demoRequests.filter((request) => inPeriod(request.date || request.demoDate));
  return [
    `Client purchase orders open: ${openClientPos.length}`,
    `Client purchase orders created: ${newClientPos.length}`,
    `Inventory purchase orders open: ${openInventoryPos.length} (${money(inventoryPoTotal)})`,
    `Payables open/for approval: ${openPayables.length} (${money(openPayables.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `Expenses pending/for approval: ${pendingExpenses.length} (${money(pendingExpenses.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `All expenses booked (payables + expenses): ${combinedExpenses.length} (${money(combinedExpenses.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0))})`,
    `Demo requests active/created: ${activeDemos.length} active / ${newDemos.length} created`,
  ];
}

function manilaMonthParts(value = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { key: `${map.year}-${map.month}`, label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date(value)) };
}

function recordMonthKey(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : manilaMonthParts(date).key;
}

function dashboardAnalyticsFields(state, monthKey) {
  const sales = (state.sales || []).filter((sale) => sale.status !== "Cancelled");
  const payments = state.payments || [];
  const inventory = state.inventory || [];
  const payables = state.payables || [];
  const replenishments = state.replenishments || [];
  const demoRequests = state.inventoryDemoRequests || [];
  const monthSales = sales.filter((sale) => recordMonthKey(sale.date) === monthKey);
  const monthPayments = payments.filter((payment) => recordMonthKey(payment.dateRecorded || payment.date || payment.postedDate) === monthKey);
  const monthPayables = payables.filter((payable) => recordMonthKey(payable.date) === monthKey);
  const monthExpenses = replenishments.filter((expense) => recordMonthKey(expense.date) === monthKey);
  const totalSales = monthSales.reduce((sum, sale) => sum + Number(sale.net || 0), 0);
  const totalCollected = monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const openReceivables = Math.max(sales.reduce((sum, sale) => sum + Number(sale.net || 0), 0) - sales.reduce((sum, sale) => sum + Number(sale.paid || 0), 0), 0);
  const overdue = sales.filter((sale) => digestSaleStatus(sale) === "Overdue");
  const lowStock = inventory.filter((item) => ["Low Stock", "Critical"].includes(digestInventoryStatus(item)));
  const pendingPayables = monthPayables.filter((payable) => ["For Approval", "Approved"].includes(payable.requestStatus || payable.status));
  const pendingExpenses = monthExpenses.filter((expense) => ["For Approval", "Approved"].includes(expense.requestStatus || expense.status));
  const monthExpenseTotal = [...monthPayables, ...monthExpenses].reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
  const activeDemos = demoRequests.filter((request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  return [
    { name: "💰 Sales", value: [`**Invoices this month:** ${monthSales.length}`, `**Month invoiced:** ${money(totalSales)}`, `**Open AR total:** ${money(openReceivables)}`].join("\n"), inline: true },
    { name: "🏦 Collections", value: [`**Collected this month:** ${money(totalCollected)}`, `**Deposits pending:** ${payments.filter((payment) => ["For Deposition", "Posted Date"].includes(payment.collectionStatus)).length}`, `**Overdue invoices:** ${overdue.length}`].join("\n"), inline: true },
    { name: "📦 Operations", value: [`**Low / critical stock:** ${lowStock.length}`, `**Business expenses this month:** ${monthPayables.length + monthExpenses.length}`, `**Expense amount:** ${money(monthExpenseTotal)}`].join("\n"), inline: true },
    { name: "⚠️ Attention", value: [`**Payables/expenses pending:** ${pendingPayables.length + pendingExpenses.length}`, `**Active demo requests:** ${activeDemos.length}`, `**Bounced payments:** ${payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce")).length}`].join("\n"), inline: true },
  ];
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isTransientJwtClockSkew(error) {
  return /jwt.*future|issued at future|not active|nbf/i.test(String(error?.message || error || ""));
}

async function checkSupabaseAppRecordsHealth(env) {
  const query = `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=module_name&limit=1`;
  try {
    requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    await supabaseFetch(env, query);
    return { name: "Supabase app_records", ok: true };
  } catch (error) {
    if (!isTransientJwtClockSkew(error)) return { name: "Supabase app_records", ok: false, error: error.message };
    await sleep(1500);
    try {
      await supabaseFetch(env, query);
      return { name: "Supabase app_records", ok: true, note: "Recovered after JWT clock-skew retry" };
    } catch (retryError) {
      return { name: "Supabase app_records", ok: false, error: `${retryError.message} (retried after JWT clock-skew)` };
    }
  }
}

async function checkAssetPageHealth(env, path, name) {
  if (!env.ASSETS) return { name, ok: false, error: "ASSETS binding missing" };
  try {
    const response = await env.ASSETS.fetch(new Request(`https://medlane.local${path}`, { method: "GET" }));
    return { name, ok: response.ok, error: response.ok ? "" : `HTTP ${response.status}` };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

// Backups only run weekly (Sun), monthly (1st), yearly (Jan 1) — never daily — so "stale" must
// be judged against that cadence, not a flat 24h window. A flat 24h threshold would report
// "stale" on 6 of every 7 days by design, not because anything is wrong.
const BACKUP_STALE_HOURS = 24 * 7;

async function backupStatus(env) {
  const rows = await supabaseFetch(env, `/rest/v1/backup_runs?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=id,backup_type,mode,object_key,records_count,size_bytes,created_at&order=created_at.desc&limit=1`);
  const latest = rows[0] || null;
  const ageHours = latest?.created_at ? (Date.now() - new Date(latest.created_at).getTime()) / 36e5 : null;
  return { latest, ageHours, stale: !latest || ageHours > BACKUP_STALE_HOURS };
}

async function checkBackupFreshnessHealth(env) {
  try {
    const status = await backupStatus(env);
    return { name: "Backup freshness", ok: !status.stale, note: status.latest ? `Latest ${status.latest.backup_type} backup ${status.ageHours.toFixed(1)} hours ago` : "No successful backup recorded", error: status.stale ? `No successful backup in the last ${BACKUP_STALE_HOURS / 24} days` : "" };
  } catch (error) {
    return { name: "Backup freshness", ok: false, error: error.message };
  }
}

async function timedHealthCheck(name, check) {
  const started = Date.now();
  try {
    const result = await check();
    return { name, ...result, durationMs: Date.now() - started };
  } catch (error) {
    return { name, ok: false, error: error.message, durationMs: Date.now() - started };
  }
}

function staticHealthCheck(name, ok, error = "") {
  return { name, ok, error: ok ? "" : error, durationMs: 0 };
}

function healthCheckLine(check) {
  const timing = typeof check.durationMs === "number" ? ` (${check.durationMs} ms)` : "";
  return `${check.ok ? "✅" : "❌"} **${check.name}**${timing}${check.note ? `\n↳ ${check.note}` : ""}${check.error ? `\n↳ ${check.error}` : ""}`;
}

async function updateMonthlyUptime(env, ok) {
  const month = manilaMonthParts();
  const key = `api-health-uptime-${month.key}`;
  const state = await monitoringState(env, key).catch(() => ({}));
  const checks = Number(state.checks || 0) + 1;
  const successes = Number(state.successes || 0) + (ok ? 1 : 0);
  const failures = Number(state.failures || 0) + (ok ? 0 : 1);
  const updated = { monthKey: month.key, monthLabel: month.label, checks, successes, failures, uptimePercent: checks ? Number(((successes / checks) * 100).toFixed(2)) : 100, lastStatus: ok ? "ok" : "failed", lastCheckedAt: new Date().toISOString() };
  await saveMonitoringState(env, key, updated).catch((error) => recordSystemLog(env, { action: "Health uptime state save failed", module: "Monitoring", record: error.message }));
  return updated;
}

async function monitoringState(env, recordKey) {
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.system-monitoring&record_key=eq.${encodeURIComponent(recordKey)}&select=data`);
  return rows[0]?.data || {};
}

async function saveMonitoringState(env, recordKey, state) {
  await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ state_key: appStateKey(env), module_name: "system-monitoring", record_key: recordKey, data: state, updated_by: null }]),
  });
}

async function runApiHealthMonitor(env) {
  const checks = [];
  const started = Date.now();
  checks.push(await timedHealthCheck("Supabase app_records", () => checkSupabaseAppRecordsHealth(env)));
  checks.push(await timedHealthCheck("Landing page", () => checkAssetPageHealth(env, "/", "Landing page")));
  checks.push(await timedHealthCheck("Login page", () => checkAssetPageHealth(env, "/login", "Login page")));
  checks.push(await timedHealthCheck("Backup freshness", () => checkBackupFreshnessHealth(env)));
  checks.push(staticHealthCheck("R2 binding", Boolean(env.DOCUMENTS_BUCKET), "DOCUMENTS_BUCKET binding missing"));
  checks.push(staticHealthCheck("Supabase URL", Boolean(env.SUPABASE_URL), "SUPABASE_URL missing"));
  checks.push(staticHealthCheck("Supabase anon key", Boolean(env.SUPABASE_ANON_KEY), "SUPABASE_ANON_KEY missing"));
  checks.push(staticHealthCheck("Supabase service role", Boolean(env.SUPABASE_SERVICE_ROLE_KEY), "SUPABASE_SERVICE_ROLE_KEY missing"));
  const failed = checks.filter((check) => !check.ok);
  const checkRuntimeMs = Date.now() - started;
  const statusState = await monitoringState(env, "api-health-status").catch(() => ({}));
  const recovered = statusState.lastStatus === "failed" && !failed.length;
  const uptime = await updateMonthlyUptime(env, !failed.length);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const embed = { title: failed.length ? "🔴 Medlane API Health — Failed" : "🟢 Medlane API Health — OK", color: failed.length ? 0xef4b4f : 0x22c55e, description: failed.length ? "🚨 **Immediate review needed.** One or more API checks failed." : "✅ **All monitored API checks are healthy.**", fields: [{ name: "🕒 Latest Update", value: `**${updatedAt} PHT**`, inline: false }, { name: "⚡ Check Runtime", value: `**${checkRuntimeMs} ms**`, inline: true }, { name: "📈 Monthly Uptime", value: `**${uptime.uptimePercent.toFixed(2)}%** (${uptime.successes}/${uptime.checks} checks)`, inline: true }, { name: "🧪 Checks by Duration", value: checks.map(healthCheckLine).join("\n").slice(0, 1500), inline: false }], timestamp: new Date().toISOString() };
  if (env.DISCORD_HEALTH_WEBHOOK_URL) {
    const stored = await monitoringState(env, "discord-health").catch(() => ({}));
    if (stored.messageId) {
      const edited = await editDiscordWebhookMessage(env.DISCORD_HEALTH_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
      if (edited?.edited) await saveMonitoringState(env, "discord-health", { ...stored, updatedAt: new Date().toISOString() }).catch((error) => recordSystemLog(env, { action: "Discord health state save failed", module: "Discord", record: error.message }));
      else {
        await recordSystemLog(env, { action: "Discord health edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
        stored.messageId = "";
      }
    }
    if (!stored.messageId) {
      const sent = await sendDiscordWebhookUrl(env, env.DISCORD_HEALTH_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
      if (sent.error) await recordSystemLog(env, { action: "Discord health monitor skipped/failed", module: "Discord", record: sent.error.message });
      else if (sent.messageId) await saveMonitoringState(env, "discord-health", { messageId: sent.messageId, updatedAt: new Date().toISOString() }).catch((error) => recordSystemLog(env, { action: "Discord health state save failed", module: "Discord", record: error.message }));
      else await recordSystemLog(env, { action: "Discord health message id missing", module: "Discord", record: "Discord post succeeded but did not return a message ID" });
    }
  } else await recordSystemLog(env, { action: "Discord health monitor skipped", module: "Discord", record: "DISCORD_HEALTH_WEBHOOK_URL not configured" });
  await saveMonitoringState(env, "api-health-status", { lastStatus: failed.length ? "failed" : "ok", lastCheckedAt: new Date().toISOString(), lastFailedAt: failed.length ? new Date().toISOString() : statusState.lastFailedAt || null, lastRecoveredAt: recovered ? new Date().toISOString() : statusState.lastRecoveredAt || null, failedChecks: failed.map((check) => check.name) }).catch((error) => recordSystemLog(env, { action: "Health status state save failed", module: "Monitoring", record: error.message }));
  if (failed.length) await sendDiscordWebhook(env, { content: "🚨 **Medlane API health check failed.**", embeds: [embed] });
  else if (recovered) await sendDiscordWebhook(env, { embeds: [{ title: "Medlane API Health Recovered", color: 0x22c55e, description: "All monitored API checks are back to OK after the previous failure.", fields: [{ name: "Recovered At", value: `**${updatedAt} PHT**`, inline: false }, { name: "Monthly Uptime", value: `${uptime.uptimePercent.toFixed(2)}%`, inline: true }], timestamp: new Date().toISOString() }] });
}

async function runDashboardAnalyticsMonitor(env) {
  if (!env.DISCORD_DASHBOARD_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord dashboard monitor skipped", module: "Discord", record: "DISCORD_DASHBOARD_WEBHOOK_URL not configured" });
  const cached = await monitoringState(env, "dashboard-analytics-cache").catch(() => ({}));
  const cacheAgeMs = cached.cachedAt ? Date.now() - new Date(cached.cachedAt).getTime() : Infinity;
  const state = cached.state && cacheAgeMs < 10 * 60 * 1000 ? cached.state : await loadDigestState(env, ["sales", "payments", "inventory", "payables", "replenishments"]);
  if (!cached.state || cacheAgeMs >= 10 * 60 * 1000) await saveMonitoringState(env, "dashboard-analytics-cache", { cachedAt: new Date().toISOString(), state }).catch((error) => recordSystemLog(env, { action: "Dashboard analytics cache save failed", module: "Monitoring", record: error.message }));
  const month = manilaMonthParts();
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const embed = { title: "📊 Medlane Dashboard & Analytics", color: 0x0077bd, description: `📅 **Current month:** ${month.label}\n🕒 **Latest update:** ${updatedAt} PHT`, fields: dashboardAnalyticsFields(state, month.key), timestamp: new Date().toISOString() };
  const stored = await monitoringState(env, "discord-dashboard").catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_DASHBOARD_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch(() => null);
    if (edited?.edited) return saveMonitoringState(env, "discord-dashboard", { ...stored, updatedAt: new Date().toISOString() });
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_DASHBOARD_WEBHOOK_URL, { embeds: [embed], wait: true });
  if (sent.messageId) await saveMonitoringState(env, "discord-dashboard", { messageId: sent.messageId, updatedAt: new Date().toISOString() });
}

async function runPendingItemsMonitor(env) {
  if (!env.DISCORD_PENDING_WEBHOOK_URL) return recordSystemLog(env, { action: "Discord pending monitor skipped", module: "Discord", record: "DISCORD_PENDING_WEBHOOK_URL not configured" });
  const state = await loadDigestState(env, ["sales", "purchaseOrders", "inventoryPurchaseOrders", "pendingTransfers", "collectionContacts", "paymentRequests", "payables", "replenishments"]);
  const updatedAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fields = pendingSummaryFields(state);
  const totalPending = fields.reduce((sum, field) => sum + Number(field.name.match(/\((\d+)\)/)?.[1] || 0), 0);
  const description = totalPending
    ? `Items needing approval, receiving, collection follow-up, or action.\n🕒 **Latest update:** ${updatedAt} PHT\n📋 **${totalPending} pending item${totalPending === 1 ? "" : "s"}** across **${fields.length} categor${fields.length === 1 ? "y" : "ies"}**`
    : `✨ Nothing pending — all clear.\n🕒 **Latest update:** ${updatedAt} PHT`;
  const embed = { title: "📌 Medlane Pending Items", color: totalPending ? 0xf59e0b : 0x22c55e, description, fields, timestamp: new Date().toISOString() };
  const stored = await monitoringState(env, "discord-pending").catch(() => ({}));
  if (stored.messageId) {
    const edited = await editDiscordWebhookMessage(env.DISCORD_PENDING_WEBHOOK_URL, stored.messageId, { embeds: [embed] }).catch((error) => ({ error }));
    if (edited?.edited) return saveMonitoringState(env, "discord-pending", { ...stored, updatedAt: new Date().toISOString() });
    await recordSystemLog(env, { action: "Discord pending edit failed", module: "Discord", record: edited?.error?.message || "Unknown edit failure" });
  }
  const sent = await sendDiscordWebhookUrl(env, env.DISCORD_PENDING_WEBHOOK_URL, { embeds: [embed], wait: true }).catch((error) => ({ error }));
  if (sent.error) return recordSystemLog(env, { action: "Discord pending monitor failed", module: "Discord", record: sent.error.message });
  if (sent.messageId) await saveMonitoringState(env, "discord-pending", { messageId: sent.messageId, updatedAt: new Date().toISOString() });
  else await recordSystemLog(env, { action: "Discord pending message id missing", module: "Discord", record: "Discord post succeeded but did not return a message ID" });
}

async function runFiveMinuteDiscordMonitors(env) {
  const scheduled = manilaScheduleParts(Date.now());
  const tasks = [runApiHealthMonitor(env)];
  if (["00", "15", "30", "45"].includes(scheduled.minute)) tasks.push(runDashboardAnalyticsMonitor(env), runPendingItemsMonitor(env));
  await Promise.allSettled(tasks);
}

function manilaScheduleParts(value) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

async function runFiveMinuteScheduledTasks(event, env) {
  const scheduled = manilaScheduleParts(event.scheduledTime || Date.now());
  const tasks = [runApiHealthMonitor(env)];
  if (["00", "15", "30", "45"].includes(scheduled.minute)) tasks.push(runDashboardAnalyticsMonitor(env), runPendingItemsMonitor(env));
  // 18:00 (6:00 PM) Asia/Manila is the only place digest/backup send time is configured. There
  // used to be separate "0 10 * * *" (daily digest) / "0 10 * * fri" (weekly digest) cron
  // strings, but wrangler.jsonc only ever registers the 5-minute cron, so those never actually
  // fired — this internal hour check is what has always driven the real sends.
  if (scheduled.minute === "00" && scheduled.hour === "18") {
    tasks.push(runDailyDigest(env));
    if (scheduled.weekday === "Fri") tasks.push(runWeeklyDigest(env), createBackup(env, "weekly", null));
    if (scheduled.day === "01") tasks.push(createBackup(env, "monthly", null));
    if (scheduled.month === "01" && scheduled.day === "01") tasks.push(createBackup(env, "yearly", null));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status !== "rejected") continue;
    const message = result.reason?.message || String(result.reason);
    console.error(JSON.stringify({ message: "Five-minute scheduled task failed", error: message }));
    await recordSystemLog(env, { action: "Scheduled task failed", module: "System", record: message }).catch(() => null);
  }
}

function backupDigestLines(auditRows) {
  const backupRows = auditRows.filter((entry) => String(entry.module || "").toLowerCase() === "backup" || /backup/i.test(`${entry.action || ""} ${entry.record || ""}`));
  const completed = backupRows.filter((entry) => /created|completed|success/i.test(`${entry.action || ""} ${entry.record || ""}`)).length;
  const failed = backupRows.filter((entry) => /failed|error/i.test(`${entry.action || ""} ${entry.record || ""}`)).length;
  return [`Backups completed/logged: ${completed}`, `Backups failed/logged: ${failed}`];
}

// High-frequency housekeeping actions that dominate raw counts (dozens of times per digest
// period) without carrying any operational signal — dropped so the digest's audit section
// reflects actions someone would actually want to scan.
const DIGEST_AUDIT_NOISE_ACTIONS = new Set(["Saved app state (record count changed)", "Ignored destructive save cleanup", "Discord post sent"]);

async function auditLogDigestRows(env, sinceIso) {
  const stateKey = appStateKey(env);
  const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.logs&updated_at=gte.${encodeURIComponent(sinceIso)}&select=data&order=updated_at.desc&limit=200`);
  return rows.map((row) => row.data).filter((entry) => !DIGEST_AUDIT_NOISE_ACTIONS.has(entry.action));
}

async function emailsForRoles(env, roles) {
  if (!roles.length) return [];
  const wanted = new Set(roles);
  const emails = new Set();
  const profiles = await supabaseFetch(env, "/rest/v1/profiles?select=email,role").catch(() => []);
  profiles.forEach((row) => { if (wanted.has(row.role) && row.email) emails.add(row.email); });
  const stateKey = appStateKey(env);
  const appUsers = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.users&select=data`).catch(() => []);
  appUsers.forEach((row) => {
    const user = row.data || {};
    if (wanted.has(user.role) && user.email) emails.add(user.email);
  });
  return [...emails];
}

const DIGEST_COLORS = {
  navy: "#0b2f52",
  blue: "#1d6fa5",
  blueSoft: "#eaf4fb",
  blueBorder: "#c9e2f3",
  gold: "#c98a1f",
  success: "#157a3c",
  successSoft: "#e8f7ee",
  successBorder: "#bfe6cd",
  warn: "#b45309",
  warnSoft: "#fdf1e0",
  warnBorder: "#f3d9ac",
  critical: "#b91c1c",
  criticalSoft: "#fbe9e9",
  criticalBorder: "#f0c1c1",
  surface: "#f8fafc",
  card: "#ffffff",
  border: "#e1e8f2",
  muted: "#5b6b85",
  text: "#16233d",
};

function digestToneColors(tone) {
  switch (tone) {
    case "good": return { fg: DIGEST_COLORS.success, bg: DIGEST_COLORS.successSoft, border: DIGEST_COLORS.successBorder };
    case "warn": return { fg: DIGEST_COLORS.warn, bg: DIGEST_COLORS.warnSoft, border: DIGEST_COLORS.warnBorder };
    case "critical": return { fg: DIGEST_COLORS.critical, bg: DIGEST_COLORS.criticalSoft, border: DIGEST_COLORS.criticalBorder };
    case "neutral": return { fg: DIGEST_COLORS.muted, bg: DIGEST_COLORS.surface, border: DIGEST_COLORS.border };
    default: return { fg: DIGEST_COLORS.blue, bg: DIGEST_COLORS.blueSoft, border: DIGEST_COLORS.blueBorder };
  }
}

function digestDeltaBadge(current, previous, { invert = false } = {}) {
  if (typeof previous !== "number" || Number.isNaN(previous)) {
    const colors = digestToneColors("neutral");
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">NEW</span>`;
  }
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : diff === 0 ? 0 : 100;
  const flat = Math.abs(diff) < 0.005 || Math.abs(pct) < 0.5;
  const dir = flat ? "flat" : diff > 0 ? "up" : "down";
  const good = flat ? null : invert ? dir === "down" : dir === "up";
  const tone = flat ? "neutral" : good ? "good" : "critical";
  const colors = digestToneColors(tone);
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
  const label = flat ? "flat vs last period" : `${arrow} ${Math.abs(pct).toFixed(1)}% vs last period`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">${escapeHtml(label)}</span>`;
}

const DIGEST_METRIC_CARDS = [
  { key: "salesCount", label: "Invoices Tracked", format: (v) => String(v) },
  { key: "totalSales", label: "Total Invoiced", format: money, trend: true },
  { key: "totalCollected", label: "Total Collected", format: money, trend: true },
  { key: "openReceivables", label: "Open Receivables", format: money, trend: true, invert: true },
  { key: "totalExpenses", label: "Business Expenses", format: money, trend: true, invert: true },
  { key: "overdueCount", label: "Overdue Invoices", format: (v) => String(v), tone: (v) => (v > 0 ? "critical" : "good") },
  { key: "bounced", label: "Bounced Payments", format: (v) => String(v), tone: (v) => (v > 0 ? "critical" : "good") },
  { key: "lowStock", label: "Low / Critical Stock", format: (v) => String(v), tone: (v) => (v > 0 ? "warn" : "good") },
  { key: "pendingDeposit", label: "Pending Deposit", format: (v) => String(v), tone: (v) => (v > 0 ? "warn" : "good") },
  { key: "activeDemos", label: "Active Demo Requests", format: (v) => String(v) },
];

function digestStatCardsHtml(metrics, previous) {
  const cells = DIGEST_METRIC_CARDS.map(({ key, label, format, trend, invert, tone }) => {
    const value = metrics[key] ?? 0;
    const colors = digestToneColors(tone ? tone(value) : "default");
    const delta = trend ? digestDeltaBadge(value, previous?.[key], { invert }) : "";
    return `<td width="50%" valign="top" style="padding:6px;"><div style="border:1px solid ${DIGEST_COLORS.border};border-left:4px solid ${colors.fg};border-radius:14px;padding:14px 16px;background:${DIGEST_COLORS.card};"><span style="display:block;color:${DIGEST_COLORS.muted};font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(label)}</span><strong style="display:block;margin-top:6px;color:${DIGEST_COLORS.text};font-size:20px;line-height:1.2;">${escapeHtml(format(value))}</strong>${delta ? `<div style="margin-top:6px;">${delta}</div>` : ""}</div></td>`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells.slice(i, i + 2).join("")}</tr>`);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>`;
}

function digestAttentionBannerHtml(metrics, taskFailures) {
  const items = [
    { count: metrics.overdueCount, label: (n) => `${n} overdue invoice${n === 1 ? "" : "s"} need follow-up` },
    { count: metrics.bounced, label: (n) => `${n} bounced payment${n === 1 ? "" : "s"} to resolve` },
    { count: metrics.lowStock, label: (n) => `${n} item${n === 1 ? "" : "s"} at low/critical stock` },
    { count: taskFailures, label: (n) => `${n} scheduled task${n === 1 ? "" : "s"} failed in this period` },
  ].filter((item) => item.count > 0);
  if (!items.length) return `<div style="border:1px solid ${DIGEST_COLORS.successBorder};border-left:5px solid ${DIGEST_COLORS.success};border-radius:16px;padding:14px 18px;margin:0 0 22px;background:${DIGEST_COLORS.successSoft};color:${DIGEST_COLORS.success};font-weight:800;font-size:13.5px;">✅ No overdue invoices, bounced payments, stock shortages, or task failures this period.</div>`;
  const rows = items.map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item.label(item.count))}</li>`).join("");
  return `<div style="border:1px solid ${DIGEST_COLORS.criticalBorder};border-left:5px solid ${DIGEST_COLORS.critical};border-radius:16px;padding:14px 18px 12px;margin:0 0 22px;background:${DIGEST_COLORS.criticalSoft};"><strong style="display:block;color:${DIGEST_COLORS.critical};font-size:14px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">⚠ Needs Attention</strong><ul style="margin:0;padding-left:18px;color:#7a1f1f;font-size:13.5px;line-height:1.6;">${rows}</ul></div>`;
}

const DIGEST_SECTION_STYLE = {
  "Low / Critical Stock": "warn",
  "Near-Expiry Stock": "warn",
  "Overdue Invoices": "critical",
  "Credit Limit Breach": "critical",
  "Warranty Ending Soon": "warn",
  "Warranty Expired": "critical",
};

function digestSectionHtml(sections) {
  return sections.map((section) => {
    const colors = digestToneColors(DIGEST_SECTION_STYLE[section.title] || "default");
    const rows = section.lines.map((line) => `<li style="margin:0 0 4px;">${escapeHtml(line)}</li>`).join("");
    return `<div style="border:1px solid ${colors.border};border-left:4px solid ${colors.fg};border-radius:14px;padding:12px 16px;margin:0 0 14px;background:${DIGEST_COLORS.card};"><strong style="display:block;color:${colors.fg};font-size:13.5px;margin-bottom:6px;">${escapeHtml(section.title)} <span style="color:${DIGEST_COLORS.muted};font-weight:700;">(${section.lines.length})</span></strong><ul style="margin:0;padding-left:18px;color:${DIGEST_COLORS.text};font-size:13.5px;line-height:1.6;">${rows}</ul></div>`;
  }).join("");
}

function auditLogTableHtml(rows) {
  if (!rows.length) return `<div style="border:1px solid ${DIGEST_COLORS.border};border-radius:16px;padding:16px;background:${DIGEST_COLORS.surface};color:${DIGEST_COLORS.muted};">No recorded actions in this period.</div>`;
  const truncated = rows.length >= 200;
  const byModule = rows.reduce((acc, entry) => { const key = entry.module || "Other"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const byAction = rows.reduce((acc, entry) => { const key = entry.action || "Action"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const moduleCards = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([module, count]) => `<td width="33%" valign="top" style="padding:5px;"><div style="padding:10px;border:1px solid ${DIGEST_COLORS.border};border-radius:14px;background:${DIGEST_COLORS.surface};"><span style="display:block;color:${DIGEST_COLORS.muted};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(module)}</span><strong style="display:block;margin-top:4px;color:${DIGEST_COLORS.blue};font-size:22px;">${count}</strong></div></td>`).join("");
  const topActions = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([action, count]) => { const failed = /fail|error/i.test(action); return `<li style="${failed ? `color:${DIGEST_COLORS.critical};` : ""}"><strong>${escapeHtml(action)}</strong> - ${count} time${count === 1 ? "" : "s"}${failed ? " ⚠" : ""}</li>`; }).join("");
  const recent = rows.slice(0, 12).map((entry) => { const failed = /fail|error/i.test(`${entry.action || ""}`); const accent = failed ? DIGEST_COLORS.critical : DIGEST_COLORS.border; return `<div style="border:1px solid ${DIGEST_COLORS.border};border-left:3px solid ${accent};border-radius:14px;padding:12px 14px;margin:8px 0;background:${DIGEST_COLORS.card};"><div style="color:${DIGEST_COLORS.muted};font-size:12px;font-weight:800;">${escapeHtml(entry.date || "-")} · ${escapeHtml(entry.user || "System")} · ${escapeHtml(entry.role || "-")}</div><strong style="display:block;margin-top:5px;color:${failed ? DIGEST_COLORS.critical : DIGEST_COLORS.text};">${escapeHtml(entry.action || "Action")}</strong><div style="margin-top:4px;color:${DIGEST_COLORS.blue};font-weight:800;">${escapeHtml(entry.module || "-")}</div>${entry.record ? `<div style="margin-top:4px;color:#334155;">${escapeHtml(String(entry.record).slice(0, 180))}</div>` : ""}</div>`; }).join("");
  return `<div style="margin-bottom:14px;"><strong style="display:block;color:${DIGEST_COLORS.blue};font-size:16px;margin-bottom:8px;">Audit Summary</strong><p style="margin:0 0 12px;color:${DIGEST_COLORS.muted};">${rows.length} action${rows.length === 1 ? "" : "s"} recorded. Grouped below so the important activity is easier to scan.</p><table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>${moduleCards}</tr></table><ul style="margin:12px 0 0;padding-left:20px;">${topActions}</ul></div><div><strong style="display:block;color:${DIGEST_COLORS.blue};font-size:16px;margin:18px 0 8px;">Recent Activity Highlights</strong>${recent}</div>${truncated ? `<p style="color:${DIGEST_COLORS.muted};">Showing summary from the first 200 actions - see Audit Logs in Medlane OS for full history.</p>` : ""}`;
}

function digestEmailHtml({ title, bodyHtml }) {
  return brandedEmailHtml({ title, intro: "Operational summary, approvals, finance, and audit highlights from Medlane OS.", bodyHtml: bodyHtml || "<p>Nothing to report for this period.</p>" });
}

async function loadDigestSnapshot(env, periodLabel) {
  return monitoringState(env, `digest-snapshot-${periodLabel.toLowerCase()}`).catch(() => ({}));
}

async function saveDigestSnapshot(env, periodLabel, metrics) {
  await saveMonitoringState(env, `digest-snapshot-${periodLabel.toLowerCase()}`, { ...metrics, capturedAt: new Date().toISOString() }).catch((error) => recordSystemLog(env, { action: "Digest snapshot save failed", module: "Email", record: error.message }));
}

async function composeAndSendDigest(env, { periodLabel, auditSinceIso, auditLimitLabel }) {
  const state = await loadDigestState(env);
  const sections = detectThresholdsAndApprovals(state);
  const allRoles = new Set([...Object.keys(sections), ...DIGEST_ROLE_RECIPIENTS.digestBusiness, ...DIGEST_ROLE_RECIPIENTS.digestAuditLog]);
  const businessSummary = buildBusinessSummaryLines(state);
  const financialSummary = financialDigestLines(state, auditSinceIso);
  const auditRows = await auditLogDigestRows(env, auditSinceIso);

  const metrics = computeBusinessMetrics(state);
  const previousSnapshot = await loadDigestSnapshot(env, periodLabel);
  const taskFailures = auditRows.filter((entry) => entry.action === "Scheduled task failed").length;
  const attentionHtml = digestAttentionBannerHtml(metrics, taskFailures);
  const statCardsHtml = digestStatCardsHtml(metrics, previousSnapshot);
  const operationalHtml = digestSectionHtml([{ title: `${periodLabel} Purchase Orders, Expenses & Backups`, lines: [...financialSummary, ...backupDigestLines(auditRows)] }]);
  await saveDigestSnapshot(env, periodLabel, metrics);
  const ctaHtml = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;"><tr><td style="border-radius:999px;background:${DIGEST_COLORS.navy};"><a href="https://medlane.tofllorin.workers.dev/dashboard" style="display:inline-block;padding:13px 24px;color:#fff;text-decoration:none;font-weight:800;font-size:13.5px;border-radius:999px;">Open Medlane OS →</a></td></tr></table>`;

  const sends = [];
  for (const role of allRoles) {
    try {
      const parts = [];
      if (sections[role]?.length) parts.push(digestSectionHtml(sections[role]));
      if (DIGEST_ROLE_RECIPIENTS.digestBusiness.includes(role) && businessSummary.length) {
        parts.push(attentionHtml);
        parts.push(`<h3 style="margin:18px 0 8px;color:${DIGEST_COLORS.navy};">${escapeHtml(`${periodLabel} Business Summary`)}</h3>${statCardsHtml}`);
        parts.push(operationalHtml);
      }
      if (DIGEST_ROLE_RECIPIENTS.digestAuditLog.includes(role)) parts.push(`<h3 style="margin:18px 0 8px;color:${DIGEST_COLORS.navy};">${escapeHtml(`${periodLabel} Audit Log (${auditLimitLabel})`)}</h3>${auditLogTableHtml(auditRows)}`);
      if (!parts.length) continue;
      parts.push(ctaHtml);
      const emails = await emailsForRoles(env, [role]);
      const html = digestEmailHtml({ title: `${periodLabel} Digest`, bodyHtml: parts.join("") });
      for (const email of emails) {
        sends.push(sendResendEmail(env, { to: email, subject: `Medlane OS — ${periodLabel} Digest`, html }).catch((error) => console.error(JSON.stringify({ message: "Digest email failed", role, email, error: error.message }))));
      }
    } catch (error) {
      // A single role's lookup/build failing (e.g. a transient Supabase error) must never
      // stop other roles from getting their digest, nor block the Discord post below.
      console.error(JSON.stringify({ message: "Digest role processing failed", role, error: error.message }));
      await recordSystemLog(env, { action: "Digest role failed", module: "Email", record: `${role}: ${error.message}` }).catch(() => null);
    }
  }
  await Promise.all(sends);
  await sendDiscordDigest(env, { periodLabel, state, sections, businessSummary, financialSummary, auditRows, auditLimitLabel, auditSinceIso }).catch(async (error) => {
    console.error(JSON.stringify({ message: "Discord digest failed", error: error.message }));
    await recordSystemLog(env, { action: "Discord digest failed", module: "Discord", record: `${periodLabel}: ${error.message}` }).catch(() => null);
  });
}

async function sendDiscordDigest(env, { periodLabel, state, sections, businessSummary, financialSummary, auditRows, auditLimitLabel, auditSinceIso }) {
  if (!env.DISCORD_WEBHOOK_URL) {
    await recordSystemLog(env, { action: "Discord digest skipped", module: "Discord", record: `${periodLabel}: DISCORD_WEBHOOK_URL not configured` });
    return;
  }
  const sales = state.sales || [];
  const clients = state.clients || [];
  const purchaseOrders = state.purchaseOrders || [];
  const payments = state.payments || [];
  const imports = state.imports || [];
  const reconHistory = state.reconHistory || [];
  const demoRequests = state.inventoryDemoRequests || [];

  const bouncedCheques = payments.filter((payment) => String(payment.collectionStatus || "").toLowerCase().includes("bounce"));
  const pendingDeposits = payments.filter((payment) => ["For Deposition", "Posted Date"].includes(payment.collectionStatus));
  const largeSales = sales.filter((sale) => sale.status !== "Cancelled" && Number(sale.net || 0) >= LARGE_TRANSACTION_THRESHOLD && new Date(sale.date) >= new Date(auditSinceIso));
  const largePayments = payments.filter((payment) => Number(payment.amount || 0) >= LARGE_TRANSACTION_THRESHOLD && new Date(payment.dateRecorded || payment.dateCollected || 0) >= new Date(auditSinceIso));
  const blockedImports = imports.filter((item) => /blocked|invalid|skipped|no valid/i.test(item.status || ""));
  const activeDemos = demoRequests.filter((request) => !/[Rr]eturned|To Sales|Cancelled/.test(request.status || ""));
  const closedDemos = demoRequests.filter((request) => /[Rr]eturned|To Sales/.test(request.status || "") && new Date(request.history?.at(-1)?.date || request.date || 0) >= new Date(auditSinceIso));
  const latestRecon = reconHistory[0];

  // These two "what's new since last digest" lookups are a nice-to-have, not core to the
  // digest — a failure here (e.g. a transient Supabase error) must never prevent the digest
  // embed itself from posting, so each is isolated with its own catch.
  const newlyPaidPoIds = await trackNewOccurrences(env, "discordKnownPaidPOs", purchaseOrders.filter((po) => poFullyPaidServer(po, sales)).map((po) => po.id)).catch(async (error) => {
    await recordSystemLog(env, { action: "Discord digest tracking failed", module: "Discord", record: `discordKnownPaidPOs: ${error.message}` }).catch(() => null);
    return [];
  });
  const newlyPaidPos = purchaseOrders.filter((po) => newlyPaidPoIds.includes(po.id));
  const newClientNames = await trackNewOccurrences(env, "discordKnownClients", clients.map((client) => client.name)).catch(async (error) => {
    await recordSystemLog(env, { action: "Discord digest tracking failed", module: "Discord", record: `discordKnownClients: ${error.message}` }).catch(() => null);
    return [];
  });

  const fields = [];
  const mentionedRoleIds = new Set();
  Object.entries(sections).forEach(([role, roleSections]) => {
    (digestRoleMentions[role] || []).forEach((id) => mentionedRoleIds.add(id));
    roleSections.forEach((section) => fields.push({ name: `${section.title} (${role})`, value: discordFieldValue(section.lines, 300) }));
  });
  if (businessSummary.length) fields.push({ name: `${periodLabel} Business Summary`, value: discordFieldValue(businessSummary, 300) });
  if (financialSummary.length) fields.push({ name: "Payables, Expenses & POs", value: discordFieldValue(financialSummary, 300) });
  if (pendingDeposits.length) fields.push({ name: "Collections Pending Deposit", value: discordFieldValue(pendingDeposits.map((p) => `${p.receiptNo} — ${p.client}, ${money(p.amount)} (${p.collectionStatus})`), 300) });
  if (bouncedCheques.length) fields.push({ name: "Bounced Cheques", value: discordFieldValue(bouncedCheques.map((p) => `${p.receiptNo} — ${p.client}, ${money(p.amount)}`), 300) });
  fields.push({ name: "Backup Status", value: discordFieldValue(backupDigestLines(auditRows), 300) });
  if (largeSales.length || largePayments.length) fields.push({ name: `Large Transactions (≥ ${money(LARGE_TRANSACTION_THRESHOLD)})`, value: discordFieldValue([...largeSales.map((s) => `Invoice ${s.documentNo || s.id} — ${s.client}, ${money(s.net)}`), ...largePayments.map((p) => `Payment ${p.receiptNo} — ${p.client}, ${money(p.amount)}`)], 300) });
  if (activeDemos.length || closedDemos.length) fields.push({ name: "Demo Requests", value: discordFieldValue([...activeDemos.slice(0, 6).map((request) => `${request.id} — ${request.client} (${request.status})`), ...closedDemos.slice(0, 4).map((request) => `${request.id} — ${request.client} closed as ${request.status}`)], 300) });
  if (newlyPaidPos.length) fields.push({ name: "Purchase Orders Fully Paid", value: discordFieldValue(newlyPaidPos.map((po) => `${po.id} — ${po.client}`), 300) });
  if (newClientNames.length) fields.push({ name: "New Clients Onboarded", value: discordFieldValue(newClientNames, 300) });
  if (blockedImports.length) fields.push({ name: "Import Issues", value: discordFieldValue(blockedImports.map((item) => `${item.date} ${item.module} ${item.file} — ${item.status}`), 300) });
  if (latestRecon?.high > 0) fields.push({ name: "Reconciliation Risk", value: `${latestRecon.high} high-severity finding${latestRecon.high === 1 ? "" : "s"} (${latestRecon.date || "latest run"})` });
  fields.push({ name: `Audit Log (${auditLimitLabel})`, value: `${auditRows.length} recorded action${auditRows.length === 1 ? "" : "s"} — see the Audit Logs page for details.` });

  if (!fields.length) return;
  const color = latestRecon?.high > 0 || bouncedCheques.length ? 0xef4b4f : Object.keys(sections).length ? 0xf59e0b : 0x22c55e;
  // Discord caps a single embed at 6000 total characters and 25 fields; stay well under both.
  const budgetedFields = [];
  let charBudget = 5300;
  for (const field of fields) {
    const cost = field.name.length + field.value.length;
    if (budgetedFields.length >= 24 || charBudget - cost < 0) { budgetedFields.push({ name: "More", value: `${fields.length - budgetedFields.length} additional item(s) omitted — see the app for full details.` }); break; }
    budgetedFields.push(field);
    charBudget -= cost;
  }
  const mentionContent = ["@everyone", ...[...mentionedRoleIds].map((id) => `<@&${id}>`)].join(" ");
  await sendDiscordWebhook(env, { content: mentionContent, allowedMentions: { parse: ["everyone"], roles: [...mentionedRoleIds] }, embeds: [{ title: `Medlane OS — ${periodLabel} Digest`, color, fields: budgetedFields, timestamp: new Date().toISOString() }] });
}

async function runDailyDigest(env) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await composeAndSendDigest(env, { periodLabel: "Daily", auditSinceIso: since, auditLimitLabel: "last 24 hours" });
}

async function runWeeklyDigest(env) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await composeAndSendDigest(env, { periodLabel: "Weekly", auditSinceIso: since, auditLimitLabel: "last 7 days" });
}

export default {
  async scheduled(event, env, ctx) {
    if (env.ENVIRONMENT !== "production") return;
    ctx.waitUntil(runFiveMinuteScheduledTasks(event, env).catch((error) => console.error(JSON.stringify({ message: "Scheduled tasks failed", cron: event.cron || FIVE_MINUTE_MONITOR_CRON, error: error.message }))));
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

      if (url.pathname === "/api/auth/refresh") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { refreshToken } = await request.json();
        if (!refreshToken) return json({ error: "Refresh token is required" }, { status: 400 });
        const refreshResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const session = await refreshResponse.json().catch(() => null);
        if (!refreshResponse.ok || !session?.access_token) {
          const authError = session?.error_description || session?.msg || session?.error || "Session refresh failed";
          return json({ error: authError }, { status: 401 });
        }
        const user = await profileForUser(env, session.user.id, session.user.email).catch(() => null);
        return json({ session, user });
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
        const policyError = passwordPolicyError(password);
        if (policyError) return json({ error: policyError }, { status: 400 });
        const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return json({ error: payload?.msg || payload?.message || payload?.error || "Password setup failed" }, { status: 400 });
        if (payload?.id) await markPasswordConfirmed(env, payload.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/password-kyc/keep") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser } = await authenticatedProfile(request, env);
        await markPasswordConfirmed(env, authUser.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth/theme") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser } = await authenticatedProfile(request, env);
        const { theme } = await request.json();
        if (!["light", "dark"].includes(theme)) return json({ error: "Theme must be \"light\" or \"dark\"" }, { status: 400 });
        await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ theme_preference: theme }),
        });
        return json({ ok: true, theme });
      }

      if (url.pathname === "/api/auth/change-password") {
        if (request.method !== "POST") return methodNotAllowed();
        requireEnv(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
        const { token, user } = await authenticatedUser(request, env);
        const { currentPassword, newPassword } = await request.json();
        if (!currentPassword) return json({ error: "Current password is required" }, { status: 400 });
        const policyError = passwordPolicyError(newPassword);
        if (policyError) return json({ error: policyError }, { status: 400 });
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
        await markPasswordConfirmed(env, user.id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/logs" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const { action, module, record } = await request.json();
        if (!action) return json({ error: "Action is required" }, { status: 400 });
        const context = auditContextForRequest(request);
        const entry = {
          date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }),
          user: profile.name || profile.email || "System User",
          role: profile.role || "Unknown",
          action,
          module: module || "",
          record: record || "",
          device: context.device,
          browser: context.browser,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          serverCapturedAt: context.serverCapturedAt,
        };
        await supabaseFetch(env, "/rest/v1/app_records", {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "logs", record_key: `logs-${crypto.randomUUID()}`, data: entry, updated_by: authUser.id }]),
        });
        return json({ ok: true }, { status: 201 });
      }

      if (url.pathname === "/api/logs" && request.method === "GET") {
        const { profile } = await authenticatedProfile(request, env);
        if (!["Superadmin", "CEO"].includes(profile.role) && !profile.customPermissions?.view?.includes("logs")) return json({ error: "You do not have permission to view audit logs" }, { status: 403 });
        const stateKey = appStateKey(env);
        const now = new Date();
        const dateFrom = url.searchParams.get("dateFrom") || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const dateTo = url.searchParams.get("dateTo") || now.toISOString();
        const roleFilter = url.searchParams.get("role") || "";
        const moduleFilter = url.searchParams.get("module") || "";
        const userFilter = (url.searchParams.get("user") || "").trim().toLowerCase();
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
        const modules = moduleFilter ? moduleFilter.split(",").map((m) => m.trim()).filter(Boolean) : null;
        const matchesFilters = (entry) => (!roleFilter || entry.role === roleFilter) && (!modules || modules.includes(entry.module)) && (!userFilter || String(entry.user || "").trim().toLowerCase() === userFilter);
        // A narrow filter (e.g. one module) can match only a small fraction of raw
        // audit rows in any given window. Fetching one flat batch and filtering it
        // in-memory could yield an empty page — with matches only a few windows
        // further back — while still reporting a nextCursor from the raw rows, so
        // "no records" would flip to populated results on the very next Load More.
        // Keep expanding the raw-row window until the page is full or the range
        // (or a sane iteration cap) is exhausted, so a page is only ever empty when
        // there's genuinely nothing left to show.
        const entries = [];
        let cursor = before || dateTo;
        let exhausted = false;
        for (let iteration = 0; iteration < 10 && entries.length < limit; iteration++) {
          const batchSize = limit * 4;
          let query = `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.logs&updated_at=gte.${encodeURIComponent(dateFrom)}&updated_at=lt.${encodeURIComponent(cursor)}`;
          query += `&select=data,updated_at&order=updated_at.desc&limit=${batchSize}`;
          const rows = await supabaseFetch(env, query);
          if (!rows.length) { exhausted = true; break; }
          for (const row of rows) {
            const entry = { ...row.data, updatedAt: row.updated_at };
            if (matchesFilters(entry)) entries.push(entry);
          }
          cursor = rows[rows.length - 1].updated_at;
          if (rows.length < batchSize) { exhausted = true; break; }
        }
        const nextCursor = exhausted ? null : cursor;
        return json({ entries: entries.slice(0, limit), nextCursor });
      }

      if (url.pathname === "/api/modules/state") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=neq.logs&select=module_name,record_key,data&order=updated_at.asc`);
          return json({ data: stateFromRecords(filterRecordsForProfile(rows, profile, "view")), revision: Date.now() });
        }
        if (request.method === "PUT") {
          requireWriteAccess(profile);
          const { data } = await request.json();
          const keys = writableKeys(profile);
          if (!keys.length) throw new Error("You do not have permission to edit production data");
          // Only replace modules the client actually included in this save. A key
          // that's simply absent from `data` (a stale or partial client snapshot —
          // e.g. an old tab, or a client-side bug that dropped a field) must never
          // be treated as "empty this module out": that previously deleted whatever
          // module the client's local copy happened not to have loaded, even though
          // nothing about that module was ever intentionally changed.
          const presentKeys = keys.filter((key) => data?.[key] !== undefined && key !== "logs");
          const auditContext = auditContextForRequest(request);
          const rows = recordsFromState(data, authUser.id, stateKey, presentKeys, auditContext);
          const actor = profile.name || profile.email || "System User";

          if (presentKeys.length) {
            // Circuit breaker: compare how many records each affected module has
            // right now against how many this save is about to leave it with.
            // A save that would wipe out a module that had a meaningful number of
            // records is almost always a stale/partial client snapshot clobbering
            // real data (the exact bug that previously erased the database), not
            // an intentional bulk delete — refuse it and log full context instead
            // of silently applying it.
            const eventModules = presentKeys.filter((key) => ["purchaseOrders", "inventoryPurchaseOrders", "paymentRequests", "pendingTransfers"].includes(key));
            const beforeRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(presentKeys))}&select=module_name,record_key${eventModules.length ? ",data" : ""}`);
            const beforeCounts = {};
            const beforeKeysByModule = {};
            for (const row of beforeRows) {
              beforeCounts[row.module_name] = (beforeCounts[row.module_name] || 0) + 1;
              beforeKeysByModule[row.module_name] ||= new Set();
              beforeKeysByModule[row.module_name].add(row.record_key);
            }
            const afterCounts = {};
            const incomingKeysByModule = {};
            for (const row of rows) {
              afterCounts[row.module_name] = (afterCounts[row.module_name] || 0) + 1;
              incomingKeysByModule[row.module_name] ||= new Set();
              incomingKeysByModule[row.module_name].add(row.record_key);
            }
            const totalBefore = beforeRows.length;
            const totalAfter = rows.length;
            const wipedModules = presentKeys.filter((key) => (beforeCounts[key] || 0) > 0 && (afterCounts[key] || 0) === 0);
            const seededModules = env.ENVIRONMENT === "production" ? Object.entries(defaultSeedSignature).filter(([key, count]) => presentKeys.includes(key) && (beforeCounts[key] || 0) === 0 && (afterCounts[key] || 0) === count).map(([key]) => key) : [];
            const defaultSeedBurst = seededModules.length >= 3;

            if (defaultSeedBurst) {
              const deltaSummary = presentKeys.map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
              await writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "BLOCKED save — default masterlist seed detected",
                module: "System",
                record: `${deltaSummary}. Seeded modules: ${seededModules.join(", ")}.`,
              }, authUser.id, auditContext);
              throw new Error(`Save blocked: this looks like bundled default masterlist data being written to production. Restore from Backup instead. This attempt has been recorded in Audit Logs.`);
            }

            if (wipedModules.length) {
              const deltaSummary = presentKeys.map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
              await writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Preserved existing records omitted from save payload",
                module: "System",
                record: `${deltaSummary}. Omitted modules preserved: ${wipedModules.join(", ")}.`,
              }, authUser.id, auditContext);
            }

            if (rows.length) {
              await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
                method: "POST",
                headers: { prefer: "resolution=merge-duplicates,return=minimal" },
                body: JSON.stringify(rows),
              });
            }
            const missingSummary = presentKeys.map((key) => {
              const beforeKeys = beforeKeysByModule[key] || new Set();
              const incomingKeys = incomingKeysByModule[key] || new Set();
              const missing = [...beforeKeys].filter((recordKey) => !incomingKeys.has(recordKey));
              return missing.length ? `${key}: preserved ${missing.length} existing record(s) absent from save` : "";
            }).filter(Boolean).join(", ");
            if (missingSummary) {
              await writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Ignored destructive save cleanup",
                module: "System",
                record: missingSummary,
              }, authUser.id, auditContext);
            }

            // Trace every save so a future incident can be pinpointed to the exact
            // user, time, and modules touched — only note modules whose record
            // count actually changed, to keep routine content-only edits quiet.
            const changedSummary = presentKeys.filter((key) => (beforeCounts[key] || 0) !== (afterCounts[key] || 0)).map((key) => `${key}: ${beforeCounts[key] || 0}->${afterCounts[key] || 0}`).join(", ");
            if (changedSummary) {
              await writeAuditTrace(env, stateKey, {
                actor, role: profile.role,
                action: "Saved app state (record count changed)",
                module: "System",
                record: changedSummary,
              }, authUser.id, auditContext);
            }
            await postNewRecordEventsToDiscord(env, profile, beforeRows, rows);
          }
          return json({ ok: true, savedRecords: rows.length, revision: Date.now() });
        }
        return methodNotAllowed();
      }

      if (url.pathname === "/api/memos" && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireMemoAdmin(profile);
        const body = await request.json().catch(() => ({}));
        const title = String(body.title || "").trim();
        const bodyText = String(body.body || "").trim();
        if (!title) return json({ error: "Memo title is required" }, { status: 400 });
        if (!bodyText) return json({ error: "Memo body is required" }, { status: 400 });
        const audience = body.audience === "all" ? "all" : (Array.isArray(body.audience) ? [...new Set(body.audience.filter(Boolean))] : []);
        if (audience !== "all" && !audience.length) return json({ error: "Select at least one role or All Roles" }, { status: 400 });
        const stateKey = appStateKey(env);
        const existing = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.memos&select=record_key`);
        // Memo numbers are entered manually (the client pre-fills a suggested next number, but
        // the user can override it) — validate it here too, since the client's suggestion can
        // race with another admin posting at the same time.
        const requestedId = String(body.id || "").trim();
        if (!requestedId) return json({ error: "Memo number is required" }, { status: 400 });
        if (existing.some((row) => row.record_key.toLowerCase() === requestedId.toLowerCase())) return json({ error: `${requestedId} is already in use. Enter a different memo number.` }, { status: 409 });
        const id = requestedId;
        const memo = {
          id, title, body: bodyText,
          eventDate: String(body.eventDate || "").trim(),
          eventTime: String(body.eventTime || "").trim(),
          place: String(body.place || "").trim(),
          attachments: Array.isArray(body.attachments) ? body.attachments.filter((item) => item?.id && item?.file_name) : [],
          audience,
          createdBy: profile.name || profile.email || "System User",
          createdByRole: profile.role,
          createdAt: new Date().toISOString(),
          acknowledgments: [],
        };
        await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ state_key: stateKey, module_name: "memos", record_key: id, data: memo, updated_by: authUser.id }]),
        });
        await writeAuditTrace(env, stateKey, { actor: profile.name, role: profile.role, action: "Posted memo", module: "Memos", record: `${id}: ${title}` }, authUser.id, auditContextForRequest(request));
        await postMemoToDiscord(env, memo).catch(() => null);
        return json({ ok: true, memo }, { status: 201 });
      }

      if (/^\/api\/memos\/[^/]+\/acknowledge$/.test(url.pathname) && request.method === "POST") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        const stateKey = appStateKey(env);
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.memos&record_key=eq.${encodeURIComponent(id)}&select=data`);
        const memo = rows[0]?.data;
        if (!memo) return json({ error: "Memo not found" }, { status: 404 });
        const email = cleanEmail(profile.email);
        memo.acknowledgments = memo.acknowledgments || [];
        if (!memo.acknowledgments.some((entry) => cleanEmail(entry.email) === email)) {
          memo.acknowledgments.push({ name: profile.name || profile.email || "System User", email: profile.email, role: profile.role, at: manilaTimestamp() });
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{ state_key: stateKey, module_name: "memos", record_key: id, data: memo, updated_by: authUser.id }]),
          });
        }
        return json({ ok: true, memo });
      }

      if (url.pathname === "/api/modules/records") {
        if (request.method !== "POST") return methodNotAllowed();
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireWriteAccess(profile);
        const stateKey = appStateKey(env);
        const body = await request.json().catch(() => ({}));
        const records = body.records && typeof body.records === "object" ? body.records : {};
        const recordKeys = body.recordKeys && typeof body.recordKeys === "object" ? body.recordKeys : {};
        const allowedKeys = new Set(writableKeys(profile));
        let rows = [];
        for (const [key, value] of Object.entries(records)) {
          if (!allowedKeys.has(key)) throw new Error(`You do not have permission to edit ${key}`);
          if (!Array.isArray(value)) throw new Error(`Per-record saves require an array for ${key}`);
          value.forEach((record, index) => rows.push({ state_key: stateKey, module_name: key, record_key: String(recordKeys[key]?.[index] || recordKeyFor(key, record, index)), data: record, updated_by: authUser.id }));
        }
        rows = dedupeRowsByRecordKey(rows);
        const eventModules = [...new Set(rows.map((row) => row.module_name).filter((key) => ["purchaseOrders", "inventoryPurchaseOrders", "paymentRequests", "pendingTransfers"].includes(key)))];
        const beforeRows = eventModules.length ? await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=in.${encodeURIComponent(postgrestIn(eventModules))}&select=module_name,record_key,data`) : [];
        if (rows.length) {
          await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(rows),
          });
          await postNewRecordEventsToDiscord(env, profile, beforeRows, rows);
        }
        return json({ ok: true, savedRecords: rows.length, revision: Date.now() });
      }

      if (url.pathname.startsWith("/api/purchase-orders/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const poId = decodeURIComponent(segments[2] || "");
        const action = segments[3] || "";
        if (request.method !== "POST") return methodNotAllowed();
        if (!poId || !["approve", "advance", "cancel", "receive"].includes(action)) return json({ error: "Unknown purchase order action" }, { status: 404 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        const stateKey = appStateKey(env);
        const poRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(poId)}&select=data`);
        const po = poRows[0]?.data;
        if (!po) return json({ error: "Purchase order not found" }, { status: 404 });
        const by = profile.name || profile.email || "System User";
        const timestamp = poTimestamp();
        po.history = po.history || [];

        if (action === "approve") {
          requirePoApprover(profile);
          if (po.status !== "Pending Approval") throw new Error(`Cannot approve a purchase order with status "${po.status}"`);
          po.status = "Approved";
          po.approvedBy = by;
          po.approvedAt = shortDate();
          po.history.push({ date: timestamp, status: "Approved", note: `Approved by ${by}.`, by });
        } else if (action === "advance") {
          requirePoReceiver(profile);
          const next = poNextStatus[po.status];
          if (!next) throw new Error(`Cannot advance a purchase order with status "${po.status}"`);
          po.status = next;
          po.history.push({ date: timestamp, status: next, note: `Marked ${next} by ${by}.`, by });
        } else if (action === "cancel") {
          requirePoReceiver(profile);
          if (!poCancellableStatuses.includes(po.status)) throw new Error(`Cannot cancel a purchase order with status "${po.status}"`);
          const body = await request.json().catch(() => ({}));
          po.status = "Cancelled";
          po.cancelledBy = by;
          po.cancelledAt = shortDate();
          po.history.push({ date: timestamp, status: "Cancelled", note: String(body.reason || "").trim() || "Order cancelled.", by });
        } else if (action === "receive") {
          requirePoReceiver(profile);
          if (!["For Receiving", "Partially Received"].includes(po.status)) throw new Error(`Cannot receive stock for a purchase order with status "${po.status}"`);
          const body = await request.json().catch(() => ({}));
          const submittedLines = Array.isArray(body.lines) ? body.lines : [];
          if (!submittedLines.length) throw new Error("No receiving lines provided");
          const invRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventory&select=record_key,data`);
          const inventory = invRows.map((row) => row.data);
          const itemRows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.items&select=data`);
          const items = itemRows.map((row) => row.data);
          let totalReceived = 0;
          for (const submitted of submittedLines) {
            const line = (po.lines || []).find((entry) => entry.code === submitted.code && (!entry.lot || entry.lot === submitted.lot) && Number(entry.qty || 0) > Number(entry.receivedQty || 0));
            if (!line) throw new Error(`Line not found on this purchase order: ${submitted.code} / ${submitted.lot}`);
            const item = items.find((entry) => entry.code === submitted.code || entry.name === line.item);
            const equipment = isEquipmentItem(item || line);
            const remaining = Number(line.qty || 0) - Number(line.receivedQty || 0);
            const qty = Number(submitted.qty || 0);
            if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid quantity for ${submitted.code}`);
            if (qty > remaining) throw new Error(`Cannot receive ${qty} of ${submitted.code} — only ${remaining} remain on this order`);
            const branch = String(submitted.branch || po.branch || "").trim();
            if (!branch) throw new Error(`Branch is required for ${submitted.code}`);
            const lot = String(submitted.lot || "").trim();
            const expiry = equipment ? "N/A" : String(submitted.expiry || line.expiry || "").trim();
            if (!lot || (!equipment && !expiry)) throw new Error(`Lot and expiry are required for ${submitted.code}`);
            line.lot = line.lot || lot;
            line.expiry = line.expiry || expiry;
            line.receivedQty = Number(line.receivedQty || 0) + qty;
            totalReceived += qty;
            const existing = inventory.find((entry) => entry.code === submitted.code && entry.branch === branch && entry.lot === lot);
            if (existing) existing.qty = Number(existing.qty || 0) + qty;
            else inventory.push({ code: submitted.code, item: line.item, brand: line.brand || "Medlane", branch, lot, serial: lot, expiry, qty, min: 10 });
          }
          const fullyReceived = (po.lines || []).every((line) => Number(line.receivedQty || 0) >= Number(line.qty || 0));
          po.status = fullyReceived ? "Fully Received" : "Partially Received";
          if (fullyReceived) { po.receivedBy = by; po.receivedAt = shortDate(); }
          po.history.push({ date: timestamp, status: po.status, note: `Received ${totalReceived} unit(s) across ${submittedLines.length} line(s).`, by });
          const invRecords = recordsFromState({ inventory }, authUser.id, stateKey, ["inventory"]);
          if (invRecords.length) await supabaseFetch(env, "/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(invRecords) });
        }

        await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(stateKey)}&module_name=eq.inventoryPurchaseOrders&record_key=eq.${encodeURIComponent(poId)}`, {
          method: "PATCH",
          body: JSON.stringify({ data: po, updated_by: authUser.id }),
        });
        return json({ ok: true, po });
      }

      if (url.pathname === "/api/reports") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!profile.customPermissions?.view?.includes("reports") && !["Superadmin", "CEO"].includes(profile.role)) throw new Error("You do not have permission to view reports");
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(filterRecordsForProfile(rows, profile, "view"));
        return json({ reports: generateReportsFromState(state, url.searchParams.get("branch") || "all") });
      }

      if (url.pathname === "/api/printables/invoice") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "sales", "view")) throw new Error("You do not have permission to print invoices");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Invoice ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=in.${encodeURIComponent(postgrestIn(["sales", "clients", "invoiceApprovals", "printTemplates"]))}&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const sale = (state.sales || []).find((item) => item.id === id || item.documentNo === id);
        if (!sale || !printableBranchAllowed(profile, sale)) return json({ error: "Invoice not found" }, { status: 404 });
        const type = documentType(sale.type);
        const customTemplate = (state.printTemplates || []).find((t) => t.type === type) || null;
        const useCustom = url.searchParams.get("template") === "custom" && customTemplate;
        return json({
          id: sale.id,
          documentNo: sale.documentNo || sale.id,
          type,
          title: `Print ${type} ${sale.documentNo || sale.id}`,
          description: url.searchParams.get("noDate") === "1" ? "Server-rendered data-only overlay without date. Load the physical template in the printer before printing." : "Server-rendered data-only overlay for the pre-printed form. Load the physical template in the printer before printing.",
          hasCustomTemplate: Boolean(customTemplate),
          html: printableInvoiceHtml({ sale, client: (state.clients || []).find((client) => client.name === sale.client) || {}, approvals: state.invoiceApprovals || {}, preparedBy: profile.name || "System User", noDate: url.searchParams.get("noDate") === "1", templateOverrides: useCustom ? customTemplate : null }),
        });
      }

      if (url.pathname === "/api/printables/payment-request") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "paymentRequests", "view")) throw new Error("You do not have permission to print payment requests");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Payment request ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.paymentRequests&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const requestRecord = (state.paymentRequests || []).find((item) => item.cvNo === id || item.id === id);
        if (!requestRecord) return json({ error: "Payment request not found" }, { status: 404 });
        return json({ id: requestRecord.cvNo || requestRecord.id, title: requestRecord.cvNo || requestRecord.id, html: paymentRequestPrintableHtml(requestRecord) });
      }

      if (url.pathname === "/api/printables/transfer") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "pendingTransfers", "view")) throw new Error("You do not have permission to print transfer requests");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Transfer ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.pendingTransfers&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const transfer = (state.pendingTransfers || []).find((item) => item.id === id);
        if (!transfer) return json({ error: "Transfer request not found" }, { status: 404 });
        return json({ id: transfer.id, title: `Transfer Request ${transfer.id}`, description: `${transfer.from} to ${transfer.to} · ${transfer.status || "-"}`, html: transferRequestPrintableHtml(transfer) });
      }

      if (url.pathname === "/api/printables/inventory-po") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "inventoryPurchaseOrders", "view")) throw new Error("You do not have permission to print inventory purchase orders");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Inventory PO ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.inventoryPurchaseOrders&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const po = (state.inventoryPurchaseOrders || []).find((item) => item.id === id);
        if (!po) return json({ error: "Inventory PO not found" }, { status: 404 });
        return json({ id: po.id, title: `Purchase Order ${po.id}`, description: `${po.supplier} · Terms ${po.terms || 30} days`, html: inventoryPoPrintableHtml(po) });
      }

      if (url.pathname === "/api/printables/product-issue") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        if (!canAccessKey(profile, "productIssues", "view")) throw new Error("You do not have permission to print support reports");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Report ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.productIssues&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const report = (state.productIssues || []).find((item) => item.id === id);
        if (!report) return json({ error: "Support report not found" }, { status: 404 });
        return json({ id: report.id, title: `Technical Support Report ${report.id}`, description: `${report.companyName || "Client"} · ${report.status || "Open"}`, html: productIssuePrintableHtml(report) });
      }

      if (url.pathname === "/api/printables/financial-request") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        const type = String(url.searchParams.get("type") || "").trim();
        const key = type === "payable" ? "payables" : type === "expense" ? "replenishments" : "";
        if (!key) return json({ error: "Invalid financial request type" }, { status: 400 });
        if (!canAccessKey(profile, key, "view")) throw new Error("You do not have permission to print this request");
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ error: "Request ID is required" }, { status: 400 });
        const rows = await supabaseFetch(env, `/rest/v1/app_records?state_key=eq.${encodeURIComponent(appStateKey(env))}&module_name=eq.${encodeURIComponent(key)}&select=module_name,record_key,data&order=updated_at.asc`);
        const state = stateFromRecords(rows);
        const record = (state[key] || []).find((item) => item.id === id);
        if (!record) return json({ error: "Request not found" }, { status: 404 });
        const titleType = type === "payable" ? "Payable" : "Expense";
        return json({ id: record.id, title: `${titleType} Request ${record.id}`, description: `${record.supplier || record.requester || "Request"} · ${money(record.amount)}`, html: financialRequestPrintableHtml(record, type) });
      }

      if (url.pathname === "/api/users") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "GET") return methodNotAllowed();
        requireUserAdmin(profile);
        const [profiles, permissions, authPayload] = await Promise.all([
          supabaseFetch(env, "/rest/v1/profiles?select=*"),
          supabaseFetch(env, "/rest/v1/module_permissions?select=user_id,module_key,can_view,can_edit"),
          supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000").catch(() => ({ users: [] })),
        ]);
        const authUsers = authPayload.users || [];
        const profileById = new Map(profiles.map((item) => [item.id, item]));
        const authById = new Map(authUsers.map((item) => [item.id, item]));
        const permissionByUser = permissions.reduce((map, item) => {
          map.set(item.user_id, [...(map.get(item.user_id) || []), item]);
          return map;
        }, new Map());
        const ids = new Set([...profileById.keys(), ...authById.keys()]);
        const users = [...ids].map((id) => userFromProfileAndAuth(profileById.get(id), authById.get(id), permissionByUser.get(id) || []));
        return json({ users: users.sort((a, b) => String(a.email || a.name).localeCompare(String(b.email || b.name))) });
      }

      if (url.pathname === "/api/users/invite") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const body = await request.json();
        const email = cleanEmail(body.email);
        const fullName = String(body.name || "").trim();
        const role = String(body.role || "").trim();
        const branch = "all";
        const view = Array.isArray(body.modules) ? body.modules.filter(Boolean) : roleModules[role] || [];
        const edit = Array.isArray(body.editModules) ? body.editModules.filter((module) => view.includes(module)) : view;
        if (!fullName) return json({ error: "Name is required" }, { status: 400 });
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (!validRole(role)) return json({ error: "Invalid role" }, { status: 400 });
        const existingProfiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
        const existingAuthUser = await findAuthUserForProfileOrEmail(env, existingProfiles[0], email);

        if (existingProfiles.length && existingAuthUser && userStatusFromAuth(existingAuthUser) === "Active") {
          // A real, fully-registered user already exists: return it as-is instead of re-inviting.
          const existingPermissions = await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(existingProfiles[0].id)}&select=user_id,module_key,can_view,can_edit`);
          const existingUser = userFromProfileAndAuth(existingProfiles[0], existingAuthUser, existingPermissions);
          return json({ user: existingUser, existing: true, emailDelivery: { sent: false, reason: "User profile already exists" } });
        }

        if (existingProfiles.length && !existingAuthUser) {
          // Orphaned profile row left over from a deletion that only removed the Supabase Auth
          // account (e.g. deleted directly in the Supabase dashboard instead of through this app).
          // Clean it up so the invite below can create a fresh, consistent account for this email.
          await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(existingProfiles[0].id)}`, { method: "DELETE" }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(existingProfiles[0].id)}`, { method: "DELETE" }).catch(() => null);
        }

        let authUser = existingAuthUser;
        let actionLink = "";
        let linkError = "";
        if (!authUser) {
          const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch, origin: requestOrigin(request) });
          authUser = generated.authUser;
          actionLink = generated.actionLink;
          linkError = generated.linkError || "";
        } else {
          const generated = await generateSupabaseActionLink(env, { email, fullName, role, branch, origin: requestOrigin(request) }).catch((error) => ({ _error: error.message }));
          authUser = generated?.authUser || authUser;
          actionLink = generated?.actionLink || "";
          linkError = generated?._error || generated?.linkError || "";
        }
        if (!authUser?.id) throw new Error("Could not create or find the Supabase user account");

        await supabaseFetch(env, "/rest/v1/profiles?on_conflict=id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ id: authUser.id, email, full_name: fullName, role, branch, is_superadmin: role === "Superadmin" }),
        });
        await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(authUser.id)}`, { method: "DELETE" }).catch(() => null);
        if (view.length) {
          await supabaseFetch(env, "/rest/v1/module_permissions", {
            method: "POST",
            body: JSON.stringify(view.map((moduleKey) => ({ user_id: authUser.id, module_key: moduleKey, can_view: true, can_edit: edit.includes(moduleKey) }))),
          });
        }
        const emailDelivery = actionLink ? await sendResendEmail(env, { to: email, subject: "Welcome to Medlane OS - activate your account", html: brandedInviteEmailHtml({ fullName, email, role, actionLink, origin: requestOrigin(request) }) }).catch((error) => ({ sent: false, reason: error.message })) : { sent: false, reason: linkError ? `Invitation link could not be generated: ${linkError}` : "Invitation link could not be generated" };
        return json({ user: { id: authUser.id, name: fullName, email, role, branch, modules: view, customPermissions: { enabled: true, view, edit }, superadminPermissions: role === "Superadmin", access: `${role} with ${view.length} view / ${edit.length} edit modules`, inviteStatus: emailDelivery.sent ? "Invited" : "Email Not Sent" }, emailDelivery }, { status: 201 });
      }

      if (url.pathname === "/api/users/invite/resend") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const { actionLink, fullName, role } = await resolveInviteLink(env, email, requestOrigin(request));
        const emailDelivery = await sendResendEmail(env, { to: email, subject: "Your Medlane OS invitation link", html: brandedInviteEmailHtml({ fullName, email, role, actionLink, origin: requestOrigin(request) }) }).catch((error) => ({ sent: false, reason: error.message }));
        return json({ ok: true, emailDelivery });
      }

      if (url.pathname === "/api/users/invite/link") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const { actionLink } = await resolveInviteLink(env, email, requestOrigin(request));
        return json({ actionLink });
      }

      if (url.pathname === "/api/users/set-password") {
        const { profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, password } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        const policyError = passwordPolicyError(password);
        if (policyError) return json({ error: policyError }, { status: 400 });
        const target = await findAuthUserByEmail(env, email);
        if (!target?.id) return json({ error: "Supabase Auth user not found" }, { status: 404 });
        await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, {
          method: "PUT",
          body: JSON.stringify({ password, email_confirm: true }),
        });
        return json({ ok: true });
      }

      if (url.pathname === "/api/users/status") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, disabled, reason = "" } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot disable your own account" }, { status: 400 });
        if (disabled && !String(reason).trim()) return json({ error: "Disable reason is required" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`);
        const authPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000");
        const target = await findAuthUserForProfileOrEmail(env, profiles[0], email) || (authPayload.users || []).find((user) => cleanEmail(user.email) === email);
        if (!target?.id) return json({ error: "Supabase Auth user not found" }, { status: 404 });
        await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, {
          method: "PUT",
          body: JSON.stringify({ ban_duration: disabled ? "876000h" : "none", user_metadata: { ...(target.user_metadata || {}), disabled_reason: disabled ? String(reason).trim() : "", disabled_at: disabled ? new Date().toISOString() : "" } }),
        });
        return json({ ok: true, disabled: Boolean(disabled), reason: disabled ? String(reason).trim() : "" });
      }

      if (url.pathname === "/api/users/superadmin") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, granted } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot change your own Superadmin permission" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,role,base_role`);
        const target = profiles[0];
        if (!target) return json({ error: "User profile not found" }, { status: 404 });
        // Every permission gate in this app checks profiles.role directly, so granting
        // "Superadmin permissions" has to actually set role = 'Superadmin' (not just a
        // cosmetic flag) to have any real effect. base_role remembers what to restore
        // on revoke — it's part of the schema for exactly this, previously unused.
        if (granted) {
          if (target.role === "Superadmin") return json({ ok: true, granted: true, role: target.role });
          await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}`, {
            method: "PATCH",
            headers: { prefer: "return=minimal" },
            body: JSON.stringify({ role: "Superadmin", base_role: target.base_role || target.role, is_superadmin: true }),
          });
          // profileForUser() prefers any existing module_permissions rows over role
          // defaults, so a leftover custom permission set (from before this grant)
          // would keep the user capped at their old module list despite role =
          // Superadmin. Clear it so they fall back to the full Superadmin module set.
          await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(target.id)}`, { method: "DELETE" }).catch(() => null);
          return json({ ok: true, granted: true, role: "Superadmin" });
        }
        const superadmins = await supabaseFetch(env, `/rest/v1/profiles?role=eq.Superadmin&select=id`);
        if (target.role === "Superadmin" && superadmins.length <= 1) return json({ error: "At least one Superadmin must remain" }, { status: 400 });
        const restoredRole = target.base_role || "Admin";
        await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ role: restoredRole, base_role: null, is_superadmin: false }),
        });
        return json({ ok: true, granted: false, role: restoredRole });
      }

      if (url.pathname === "/api/users/delete") {
        const { authUser, profile } = await authenticatedProfile(request, env);
        if (request.method !== "POST") return methodNotAllowed();
        requireUserAdmin(profile);
        const { email: rawEmail, confirmation } = await request.json();
        const email = cleanEmail(rawEmail);
        if (!validEmail(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
        if (email === cleanEmail(authUser.email)) return json({ error: "You cannot delete your own account" }, { status: 400 });
        const profiles = await supabaseFetch(env, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`);
        const authPayload = await supabaseAuthAdminFetch(env, "/auth/v1/admin/users?page=1&per_page=1000");
        const target = await findAuthUserForProfileOrEmail(env, profiles[0], email) || (authPayload.users || []).find((user) => cleanEmail(user.email) === email);
        const fullName = userDisplayName(profiles[0], target, email);
        if (String(confirmation || "").trim() !== fullName) return json({ error: `Type the user's full name exactly: ${fullName}` }, { status: 400 });
        const userId = profiles[0]?.id || target?.id;
        const blockers = await userDeleteBlockers(env, { id: userId, email, name: fullName });
        if (blockers.length) return json({ error: `Cannot delete user with active or linked records: ${blockers.join(", ")}` }, { status: 409 });
        // app_state/app_records/file_objects keep a nullable "who last touched this"
        // reference to profiles.id. Deleting the profile (directly, or via cascade from
        // the Auth admin delete below) fails on that foreign key unless those references
        // are cleared first — the audit rows themselves are preserved, just detached.
        if (userId) {
          await supabaseFetch(env, `/rest/v1/app_state?updated_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ updated_by: null }) }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/app_records?updated_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ updated_by: null }) }).catch(() => null);
          await supabaseFetch(env, `/rest/v1/file_objects?uploaded_by=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ uploaded_by: null }) }).catch(() => null);
        }
        // Delete the Supabase Auth account first so failures here are not silently
        // hidden. If this throws, the profile/permissions rows are left intact so
        // the delete can be retried, and the frontend surfaces a real error instead
        // of reporting success while the Auth user (and its email) stays registered.
        if (target?.id) {
          await supabaseAuthAdminFetch(env, `/auth/v1/admin/users/${encodeURIComponent(target.id)}`, { method: "DELETE" });
        }
        if (userId) await supabaseFetch(env, `/rest/v1/module_permissions?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
        if (profiles[0]?.id) await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(profiles[0].id)}`, { method: "DELETE" }).catch(() => null);
        return json({ ok: true });
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
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (request.method === "GET") {
          const rows = await supabaseFetch(env, `/rest/v1/backup_runs?state_key=eq.${encodeURIComponent(appStateKey(env))}&select=id,backup_type,mode,object_key,records_count,size_bytes,since_at,created_at&order=created_at.desc&limit=100`);
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

      if (url.pathname === "/api/backups/status" && request.method === "GET") {
        await authenticatedProfile(request, env);
        if (env.ENVIRONMENT !== "production") return json({ latest: null, ageHours: null, stale: true, message: "Backups are disabled outside production" });
        const status = await backupStatus(env);
        return json(status);
      }

      if (url.pathname === "/api/backups/objects" && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const prefix = `backups/${appStateKey(env)}/`;
        const cursor = url.searchParams.get("cursor") || undefined;
        const listed = await env.DOCUMENTS_BUCKET.list({ prefix, cursor, limit: 100 });
        return json({ objects: listed.objects.map((object) => ({ key: object.key, size: object.size, uploaded: object.uploaded, customMetadata: object.customMetadata || {} })), cursor: listed.truncated ? listed.cursor : null, truncated: listed.truncated });
      }

      if (url.pathname === "/api/backups/object" && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
        const { profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        if (!env.DOCUMENTS_BUCKET) throw new Error("R2 bucket binding is not configured");
        const key = String(url.searchParams.get("key") || "");
        const prefix = `backups/${appStateKey(env)}/`;
        if (!key.startsWith(prefix) || !key.endsWith(".json.gz")) return json({ error: "Invalid backup object key" }, { status: 400 });
        const object = await env.DOCUMENTS_BUCKET.get(key);
        if (!object) return json({ error: "Backup object not found" }, { status: 404 });
        return new Response(object.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${safeFileName(key.split("/").pop() || "medlane-backup.json.gz")}"`, "cache-control": "private, max-age=60" } });
      }

      if (url.pathname === "/api/backups/restore" && request.method === "POST") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Restore is disabled outside production" }, { status: 403 });
        const { authUser, profile } = await authenticatedProfile(request, env);
        requireBackupAdmin(profile);
        const body = await request.json().catch(() => ({}));
        let key = String(body.key || "");
        if (!key && body.id) {
          const rows = await supabaseFetch(env, `/rest/v1/backup_runs?id=eq.${encodeURIComponent(String(body.id))}&state_key=eq.${encodeURIComponent(appStateKey(env))}&select=object_key`);
          key = rows[0]?.object_key || "";
        }
        if (!key) return json({ error: "Backup object key is required" }, { status: 400 });
        const result = await restoreBackupObject(env, key, authUser.id, auditContextForRequest(request));
        return json({ ok: true, restore: result });
      }

      if (url.pathname.startsWith("/api/backups/") && request.method === "GET") {
        if (env.ENVIRONMENT !== "production") return json({ error: "Backups are disabled outside production" }, { status: 403 });
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

      if (["/", "/index.html", "/login", "/login/", "/dashboard", "/dashboard/"].includes(url.pathname) || url.pathname.toLowerCase().endsWith(".mp3")) {
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        headers.set("cache-control", "no-cache, must-revalidate");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: error.message, path: url.pathname }));
      const status = /Authentication required|Invalid or expired|Invalid app session|SESSION_REVOKED|SESSION_EXPIRED_12H/.test(error.message) ? 401 : /No Medlane profile|permission/.test(error.message) ? 403 : /APP_STATE_CONFLICT/.test(error.message) ? 409 : /STORAGE_LIMIT_REACHED/.test(error.message) ? 409 : 500;
      return json({ error: error.message || "Server error" }, { status });
    }
  },
};

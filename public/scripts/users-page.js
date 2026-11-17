// Users page: who can sign in, what each role can do, open invitations and recent sign-ins.
// Every change goes through a Superadmin/CEO-only Worker endpoint (requireUserAdmin) that writes
// the Audit Log entry. Nobody is ever deleted: people are deactivated, invites are cancelled.
// Passwords are never typed or seen by an admin; "Reset password" emails a link instead.
// Everyone works across all branches, and invite links expire 24 hours after they are sent.

const USER_TAB_LABELS = /** @type {Record<string, string>} */ ({ people: "Users", invites: "Invitations", roles: "Roles & access", activity: "Sign-in activity" });
const USER_TABS = Object.keys(USER_TAB_LABELS);
const usersSeed = moduleUrlSeed("users", USER_TABS);
let usersPageTab = usersSeed.tab;
/** @type {UiViewState} */
let usersView = usersSeed.view;
/** Sign-in activity for the last 7 days, loaded once per visit to that tab. @type {{ entries: any[] | null, loading: boolean, error: string }} */
const usersActivity = { entries: null, loading: false, error: "" };
/** Role picked from Roles & access → "Show users", "" for all roles. */
let usersRoleFilter = "";
/** Days without any activity before an account counts as inactive. */
const USER_INACTIVE_DAYS = 30;
/** Failed sign-ins in the window that flag an account. */
const USER_FAILED_FLAG = 3;

// One line per role, written from the current permission rules (the Roles tab shows the detail).
const USER_ROLE_INFO = /** @type {Record<string, { desc: string, approves: string, short?: string }>} */ ({
  Superadmin: { desc: "Everything, including users, Recon fixes and every approval.", approves: "Supplier POs, stock receipts, payables, expenses, over-limit invoices, Recon fixes", short: "All approvals + Recon fixes" },
  CEO: { desc: "Everything except Recon fixes, including users and approvals.", approves: "Supplier POs, stock receipts, payables, expenses, over-limit invoices", short: "All approvals" },
  Admin: { desc: "Runs day-to-day operations across all modules. Can’t manage users.", approves: "Over-limit invoices" },
  Accounting: { desc: "Invoicing, collections, payables, expenses and supplier POs. No approvals.", approves: "—" },
  Sales: { desc: "Client orders, invoices for their clients, and stock levels.", approves: "—" },
  Logistics: { desc: "Stock, receiving, transfers and supplier POs.", approves: "—" },
  HR: { desc: "Employees, expenses, reports and company memos.", approves: "—" },
  "Product Specialist": { desc: "Support Tracker reports and stock levels.", approves: "—" },
  Engineering: { desc: "Support Tracker reports and stock levels.", approves: "—" },
});
const USER_ROLES = Object.keys(USER_ROLE_INFO);

/** Friendly module names, taken from the side navigation. @param {string} module */
function usersModuleLabel(module) {
  const nav = document.querySelector(`.nav-item[data-section="${CSS.escape(module)}"]`);
  const fixed = /** @type {Record<string, string>} */ ({ notifications: "Notifications", "user-settings": "My settings", memos: "Memos", "client-invoices": "Client invoice timeline", receivables: "Receivables" });
  return fixed[module] || nav?.getAttribute("data-title") || module.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** View/edit list for a role under the current rules (the same tables nav and the Worker use). @param {string} role @returns {{ module: string, label: string, edit: boolean }[]} */
function usersRoleAccess(role) {
  const blocked = [...(roleBlockedModules[role] || []), ...(["Superadmin", "CEO"].includes(role) ? [] : ["reconciliation"])];
  const hidden = ["notifications", "user-settings"];
  const view = [...new Set(accounts[role]?.modules || [])].filter((module) => !blocked.includes(module) && !hidden.includes(module));
  const edit = new Set(roleEditableModules[role] || []);
  return view.map((module) => ({ module, label: usersModuleLabel(module), edit: edit.has(module) }));
}
/** @param {string} role @returns {UiLine[]} */
function usersAccessLines(role) {
  return usersRoleAccess(role).map((entry) => ({ left: entry.label, right: entry.edit ? "View and edit" : "View only", tone: entry.edit ? "green" : "slate" }));
}

/** @param {AppUser} user */
function usersEmail(user) { return String(user.email || user.username || "").trim().toLowerCase(); }
/** @param {AppUser} user */
function usersName(user) {
  const email = usersEmail(user);
  const name = String(user.name || user.full_name || "").trim();
  return name && name.toLowerCase() !== email ? name : email.split("@")[0] || "—";
}
/** @param {AppUser} user */
function usersIsSelf(user) { return usersEmail(user) === String(currentUser?.email || "").trim().toLowerCase() || Boolean(user.id && user.id === currentUser?.id); }

/**
 * Where an account stands. The server sends `invite` ({ state, sentAt, expiresAt, invitedBy });
 * older cached rows only have the status text.
 * @param {AppUser} user @returns {"active" | "deactivated" | "pending" | "expired" | "cancelled"}
 */
function usersState(user) {
  const state = user.invite?.state;
  const status = String(user.inviteStatus || "Active").toLowerCase();
  if (state === "cancelled" || status.includes("cancel")) return "cancelled";
  if (state === "accepted" || (!state && !/pending|invite|not sent/.test(status))) return /disabled|archived/.test(status) ? "deactivated" : "active";
  if (state === "expired" || status.includes("expired")) return "expired";
  if (state === "pending" && user.invite?.expiresAt && Date.parse(user.invite.expiresAt) <= Date.now()) return "expired";
  return "pending";
}

/** "3 hours ago", "12 Nov 2026". @param {string} [iso] */
function usersAgo(iso) {
  const ms = Date.parse(String(iso || ""));
  if (!Number.isFinite(ms)) return "Never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return uiDate(manilaDayOf(ms));
}
/** YYYY-MM-DD in Manila time. @param {number} ms */
function manilaDayOf(ms) { return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
/** Days since the last sign-in or activity, Infinity when never. @param {AppUser} user */
function usersIdleDays(user) {
  const ms = Date.parse(String(user.lastActiveAt || user.lastSignInAt || ""));
  return Number.isFinite(ms) ? (Date.now() - ms) / 86400000 : Infinity;
}
/** "Expires in 5 hours" / "Expired 2 days ago". @param {AppUser} user */
function usersInviteWhen(user) {
  const state = usersState(user);
  if (state === "cancelled") return "Cancelled";
  const ms = Date.parse(String(user.invite?.expiresAt || ""));
  if (!Number.isFinite(ms)) return state === "expired" ? "Link expired" : "";
  const hours = Math.round((ms - Date.now()) / 3600000);
  if (state === "pending") return hours <= 1 ? "Expires within the hour" : `Expires in ${hours} hours`;
  return `Expired ${usersAgo(new Date(ms).toISOString()).toLowerCase()}`;
}

function usersAll() { return /** @type {AppUser[]} */ (dedupedUsers()); }
function usersAccounts() { return usersAll().filter((user) => ["active", "deactivated"].includes(usersState(user))); }
function usersInvites() { return usersAll().filter((user) => ["pending", "expired", "cancelled"].includes(usersState(user))); }
function usersQueryString() { return moduleViewQueryString("users", usersPageTab, "people", usersView); }

/** @param {string} role */
function usersRolePill(role) { return uiPill(role || "—", ["Superadmin", "CEO"].includes(role) ? "accent" : role === "Admin" ? "blue" : "slate"); }

// ----- tab models ---------------------------------------------------------------------------------
/** @returns {UiView} */
function usersPeopleModel() {
  const manage = canManageUsers();
  const rows = usersAccounts().map(/** @returns {UiViewRow} */ (user) => {
    const email = usersEmail(user);
    const state = usersState(user);
    const idle = usersIdleDays(user);
    const inactive = state === "active" && idle >= USER_INACTIVE_DAYS;
    const self = usersIsSelf(user);
    const statusPill = state === "deactivated" ? uiPill("Deactivated", "slate") : inactive ? uiPill("Inactive", "amber") : uiPill("Active", "green");
    const lastActive = user.lastActiveAt || user.lastSignInAt || "";
    return {
      id: email, branches: [], search: [usersName(user), email, user.role, state].join(" "),
      scopes: [state, ...(inactive ? ["inactive"] : [])],
      sortValues: { user: usersName(user).toLowerCase(), role: String(user.role || ""), last: lastActive || "0", status: state },
      csv: [usersName(user), email, user.role, "All branches", lastActive ? formatSessionDate(lastActive) : "Never", state === "deactivated" ? "Deactivated" : "Active"],
      cells: [
        uiCellDoc(usersName(user), uiViewSelect("users", email), email, { plain: true }),
        usersRolePill(String(user.role || "")),
        escapeHtml("All branches"),
        uiCellText(usersAgo(lastActive), lastActive && idle >= 1 ? formatSessionDate(lastActive) : ""),
        statusPill,
      ],
      detail: () => {
        const actions = manage ? [
          ...(self ? [] : [uiButton("Change role", { "data-users-role": email })]),
          ...(state === "active" ? [uiButton("Reset password", { "data-users-reset": email })] : []),
          uiButton("Devices", { "data-users-devices": email }),
          ...(!self && Number(user.openSessions) > 0 ? [uiButton("Sign out everywhere", { "data-users-signout": email })] : []),
          ...(user.hasCustomAccess && user.role !== "Superadmin" ? [uiButton("Use role access", { "data-users-reset-access": email })] : []),
          ...(self ? [] : state === "deactivated" ? [uiButton("Reactivate", { "data-users-reactivate": email }, { primary: true })] : [uiButton("Deactivate", { "data-users-deactivate": email }, { danger: true })]),
        ] : [];
        return {
          eyebrow: "User", title: usersName(user), label: `${usersName(user)} details`, closeAttrs: { "data-users-close": "" },
          pill: state === "deactivated" ? { text: "Deactivated", tone: "slate" } : inactive ? { text: "Inactive", tone: "amber" } : { text: "Active", tone: "green" },
          fields: [
            { label: "Email", value: email, wide: true },
            { label: "Role", value: String(user.role || "—") },
            { label: "Branch", value: "All branches" },
            { label: "Last active", value: lastActive ? formatSessionDate(lastActive) : "Never" },
            { label: "Signed in on", value: plural(Number(user.openSessions) || 0, "device") },
            ...(state === "deactivated" ? [{ label: "Reason", value: String(user.disabledReason || "—"), wide: true }] : []),
            ...(user.hasCustomAccess ? [{ label: "Access", value: "Custom (differs from the role)", wide: true }] : []),
          ],
          linesTitle: user.hasCustomAccess ? `What a ${user.role} can do (their own access differs)` : "What they can do",
          lines: usersAccessLines(String(user.role || "")),
          note: self ? { text: "This is you. Another Superadmin or CEO has to change your role or deactivate you.", tone: "slate" } : inactive ? { text: `No sign-in for ${Number.isFinite(idle) ? `${Math.floor(idle)} days` : "a long time"}. Deactivate the account if they no longer need it.`, tone: "amber" } : undefined,
          actions,
        };
      },
    };
  });
  const active = rows.filter((row) => row.scopes.includes("active")).length;
  const inactive = rows.filter((row) => row.scopes.includes("inactive")).length;
  const superadmins = usersAccounts().filter((user) => user.role === "Superadmin" && usersState(user) === "active").length;
  return {
    title: "Users", intro: "Everyone who can sign in. Change a role, send a password reset or deactivate someone. Users are never deleted, so the Audit Log keeps their history.",
    placeholder: "Name or email", minWidth: 760,
    actions: [],
    stats: [
      { label: "Active users", value: active, sub: `${superadmins} Superadmin${superadmins === 1 ? "" : "s"}`, tone: "blue", scope: "active" },
      { label: `Inactive ${USER_INACTIVE_DAYS}+ days`, value: inactive, sub: inactive ? "Still have access" : "Everyone signed in recently", tone: inactive ? "amber" : "green", scope: "inactive" },
      { label: "Deactivated", value: rows.filter((row) => row.scopes.includes("deactivated")).length, sub: "Kept for the Audit Log", tone: "slate", scope: "deactivated" },
    ],
    cols: [{ key: "user", label: "User", sortable: true }, { key: "role", label: "Role", sortable: true }, { key: "branch", label: "Branch" }, { key: "last", label: "Last active", sortable: true }, { key: "status", label: "Status" }],
    csvName: "users.csv", csvHeader: ["Name", "Email", "Role", "Branch", "Last active", "Status"],
    rows, empty: ["No users yet", "Invite someone to get started."], defaultSort: { key: "user", dir: 1 },
    extraFilter: usersRoleFilter ? (row) => row.sortValues.role === usersRoleFilter : undefined, filtersOn: Boolean(usersRoleFilter),
    toolbarExtra: usersRoleFilter ? uiButton(`${usersRoleFilter} only ×`, { "data-users-clear": "" }, { size: "sm" }) : "",
    chips: [{ key: "active", label: "Active", tone: "green" }, { key: "inactive", label: `Inactive ${USER_INACTIVE_DAYS}+ days`, tone: "amber" }, { key: "deactivated", label: "Deactivated", tone: "slate" }],
    defaultScope: "active",
  };
}

/** @returns {UiView} */
function usersInvitesModel() {
  const manage = canManageUsers();
  const rows = usersInvites().map(/** @returns {UiViewRow} */ (user) => {
    const email = usersEmail(user);
    const state = usersState(user);
    const sentAt = String(user.invite?.sentAt || "");
    const by = String(user.invite?.invitedBy || "");
    const pill = state === "pending" ? uiPill("Pending", "amber") : state === "expired" ? uiPill("Expired", "red") : uiPill("Cancelled", "slate");
    const rowButton = !manage ? "" : state === "pending" ? uiButton("Copy link", { "data-users-copy": email }, { size: "sm" }) : uiButton("Resend", { "data-users-resend": email }, { size: "sm" });
    return {
      id: email, branches: [], search: [usersName(user), email, user.role, by, state].join(" "), scopes: [state, ...(state === "cancelled" ? [] : ["open"])],
      sortValues: { invited: email, role: String(user.role || ""), sent: sentAt || "0", status: state },
      csv: [email, user.role, "All branches", sentAt ? formatSessionDate(sentAt) : "", by, state],
      cells: [
        uiCellDoc(email, uiViewSelect("users", email), usersName(user) !== email.split("@")[0] ? usersName(user) : "", { plain: true }),
        usersRolePill(String(user.role || "")),
        escapeHtml("All branches"),
        uiCellText(sentAt ? usersAgo(sentAt) : "—", by ? `by ${by}` : ""),
        `${pill}<div class="ui-sub">${escapeHtml(usersInviteWhen(user))}</div>`,
        rowButton,
      ],
      detail: () => ({
        eyebrow: "Invitation", title: email, label: `Invitation for ${email}`, closeAttrs: { "data-users-close": "" },
        pill: state === "pending" ? { text: "Pending", tone: "amber" } : state === "expired" ? { text: "Expired", tone: "red" } : { text: "Cancelled", tone: "slate" },
        fields: [
          { label: "Name", value: usersName(user) },
          { label: "Role", value: String(user.role || "—") },
          { label: "Branch", value: "All branches" },
          { label: "Invited by", value: by || "—" },
          { label: "Sent", value: sentAt ? formatSessionDate(sentAt) : "—" },
          { label: "Link", value: usersInviteWhen(user) || "—" },
        ],
        linesTitle: "Access when they accept", lines: usersAccessLines(String(user.role || "")),
        note: { text: "Each link works once and expires 24 hours after it’s sent. Resending or copying a new link replaces the old one.", tone: "slate" },
        actions: manage ? [
          state === "pending" ? uiButton("Copy new link", { "data-users-copy": email }) : "",
          uiButton(state === "pending" ? "Resend invite" : "Send a new invite", { "data-users-resend": email }, { primary: state !== "pending" }),
          uiButton("Change role", { "data-users-role": email }),
          state === "cancelled" ? "" : uiButton("Cancel invite", { "data-users-cancel": email }, { danger: true }),
        ].filter(Boolean) : [],
      }),
    };
  });
  return {
    title: "Invitations", intro: "Invites that haven’t been accepted yet. Links expire after 24 hours; resend one to start a new 24 hours.",
    placeholder: "Email or name", minWidth: 780, actions: [],
    stats: [
      { label: "Waiting", value: rows.filter((row) => row.scopes.includes("pending")).length, sub: "Link still valid", tone: "amber", scope: "pending" },
      { label: "Expired", value: rows.filter((row) => row.scopes.includes("expired")).length, sub: "Need a new link", tone: "red", scope: "expired" },
    ],
    cols: [{ key: "invited", label: "Invited", sortable: true }, { key: "role", label: "Role", sortable: true }, { key: "branch", label: "Branch" }, { key: "sent", label: "Sent", sortable: true }, { key: "status", label: "Status" }, { key: "act", label: "", align: "right" }],
    csvName: "invitations.csv", csvHeader: ["Email", "Role", "Branch", "Sent", "Invited by", "Status"],
    rows, empty: ["No open invitations", "Everyone you invited has accepted."], defaultSort: { key: "sent", dir: -1 },
    chips: [{ key: "pending", label: "Pending", tone: "amber" }, { key: "expired", label: "Expired", tone: "red" }, { key: "cancelled", label: "Cancelled", tone: "slate" }],
    defaultScope: "open",
  };
}

/** @returns {UiView} */
function usersRolesModel() {
  const people = usersAccounts().filter((user) => usersState(user) === "active");
  const rows = USER_ROLES.map(/** @returns {UiViewRow} */ (role) => {
    const info = USER_ROLE_INFO[role];
    const count = people.filter((user) => user.role === role).length;
    const access = usersRoleAccess(role);
    return {
      id: role, branches: [], scopes: [], search: [role, info.desc, info.approves].join(" "),
      sortValues: { role: USER_ROLES.indexOf(role), users: count },
      csv: [role, info.desc, count, info.approves, "All branches"],
      cells: [uiCellDoc(role, uiViewSelect("users", role), info.desc, { plain: true }), uiCellNum(count), escapeHtml(info.short || info.approves), escapeHtml("All branches")],
      detail: () => ({
        eyebrow: "Role", title: role, label: `${role} access`, closeAttrs: { "data-users-close": "" },
        fields: [
          { label: "What it’s for", value: info.desc, wide: true },
          { label: "Approves", value: info.approves, wide: true },
          { label: "Users", value: String(count) },
          { label: "Branch scope", value: "All branches" },
          { label: "Modules", value: `${access.length} (${access.filter((entry) => entry.edit).length} editable)` },
        ],
        linesTitle: "What this role can do", lines: usersAccessLines(role),
        note: { text: "These are the rules in force today, checked by the server on every request.", tone: "slate" },
        actions: count ? [uiButton(`Show ${plural(count, "user")}`, { "data-users-show-role": role })] : [],
      }),
    };
  });
  return {
    title: "Roles & access", intro: "What each role can see and change. A person’s access follows their role; changing their role changes it straight away.",
    placeholder: "Role", minWidth: 760, actions: [], stats: [],
    cols: [{ key: "role", label: "Role", sortable: true }, { key: "users", label: "Users", align: "right", sortable: true }, { key: "approves", label: "Approves" }, { key: "branch", label: "Branch scope" }],
    csvName: "roles.csv", csvHeader: ["Role", "Description", "Users", "Approves", "Branch scope"],
    rows, empty: ["No roles", ""], defaultSort: { key: "role", dir: 1 }, chips: [], defaultScope: "",
  };
}

/** Sign-in events plus account changes from the Audit Log, last 7 days. @returns {UiView} */
function usersActivityModel() {
  const entries = usersActivity.entries || [];
  /** @type {Map<string, number>} */
  const failures = new Map();
  for (const entry of entries) if (entry.event === "signin-failed") failures.set(String(entry.email || entry.record || "").toLowerCase(), (failures.get(String(entry.email || entry.record || "").toLowerCase()) || 0) + 1);
  const rows = entries.map(/** @returns {UiViewRow} */ (entry, index) => {
    const at = String(entry.updatedAt || entry.serverCapturedAt || "");
    const who = String(entry.email || entry.record || "").toLowerCase();
    const failed = entry.event === "signin-failed";
    const signin = entry.event === "signin" || failed;
    const flagged = failed && (failures.get(who) || 0) >= USER_FAILED_FLAG;
    const device = [entry.device, entry.browser].filter(Boolean).join(" · ") || "—";
    const event = signin ? (failed ? "Failed sign-in" : "Signed in") : String(entry.action || "");
    const result = flagged ? uiPill("Flagged", "red") : failed ? uiPill("Failed", "amber") : signin ? uiPill("OK", "green") : uiPill("Change", "blue");
    const id = `A${index}`;
    return {
      id, branches: [], search: [entry.user, entry.email, entry.record, event, device, entry.ipAddress].join(" "),
      scopes: [signin ? "signins" : "changes", ...(failed ? ["failed"] : []), ...(flagged ? ["flagged"] : [])],
      sortValues: { when: at, user: String(entry.user || "").toLowerCase() },
      csv: [at ? formatSessionDate(at) : "", String(entry.user || ""), event, String(entry.record || ""), device, String(entry.ipAddress || ""), flagged ? "Flagged" : failed ? "Failed" : signin ? "OK" : "Change"],
      cells: [
        uiCellDoc(at ? usersAgo(at) : "—", uiViewSelect("users", id), at ? formatSessionDate(at) : "", { plain: true }),
        uiCellText(String(entry.user || "—"), signin ? "" : String(entry.record || "")),
        escapeHtml(event),
        uiCellText(device, String(entry.ipAddress || "")),
        result,
      ],
      detail: () => ({
        eyebrow: signin ? "Sign-in" : "Account change", title: event, label: `${event} details`, closeAttrs: { "data-users-close": "" },
        pill: flagged ? { text: "Flagged", tone: "red" } : failed ? { text: "Failed", tone: "amber" } : undefined,
        fields: [
          { label: "When", value: at ? formatSessionDate(at) : "—" },
          { label: signin ? "Account" : "By", value: String(entry.user || "—") },
          ...(signin ? [] : [{ label: "Record", value: String(entry.record || "—"), wide: true }]),
          { label: "Device", value: device },
          { label: "IP address", value: String(entry.ipAddress || "—"), mono: true },
        ],
        note: flagged ? { text: `${failures.get(who)} failed sign-ins for this email in the last 7 days. If it wasn’t them, send a password reset or deactivate the account.`, tone: "red" } : undefined,
        actions: [],
      }),
    };
  });
  const flaggedEmails = [...failures.entries()].filter(([, count]) => count >= USER_FAILED_FLAG).length;
  return {
    title: "Sign-in activity", intro: "Sign-ins and account changes from the last 7 days, newest first. Three or more failed sign-ins for one email are flagged.",
    placeholder: "Name, email, device or IP", minWidth: 820, actions: [],
    stats: [
      { label: "Sign-ins", value: rows.filter((row) => row.scopes.includes("signins") && !row.scopes.includes("failed")).length, sub: "Last 7 days", tone: "blue", scope: "signins" },
      { label: "Failed sign-ins", value: rows.filter((row) => row.scopes.includes("failed")).length, sub: flaggedEmails ? `${plural(flaggedEmails, "email")} flagged` : "None flagged", tone: flaggedEmails ? "red" : "slate", scope: "failed" },
      { label: "Account changes", value: rows.filter((row) => row.scopes.includes("changes")).length, sub: "Invites, roles, resets, deactivations", tone: "slate", scope: "changes" },
    ],
    cols: [{ key: "when", label: "When", sortable: true }, { key: "user", label: "User", sortable: true }, { key: "event", label: "Event" }, { key: "device", label: "Device" }, { key: "result", label: "Result" }],
    csvName: "sign-in-activity.csv", csvHeader: ["When", "User", "Event", "Record", "Device", "IP address", "Result"],
    rows, empty: usersActivity.error ? ["Activity couldn’t load", usersActivity.error] : usersActivity.loading || !usersActivity.entries ? ["Loading activity…", ""] : ["No sign-ins in the last 7 days", ""],
    defaultSort: { key: "when", dir: -1 },
    chips: [{ key: "signins", label: "Sign-ins", tone: "blue" }, { key: "failed", label: "Failed", tone: "amber" }, { key: "flagged", label: "Flagged", tone: "red" }, { key: "changes", label: "Account changes", tone: "slate" }],
    defaultScope: "",
  };
}

/** Loads the activity tab's entries (Audit Log summary: sign-ins + Access-sensitive entries). */
async function loadUsersActivity() {
  if (usersActivity.loading || usersActivity.entries || !MedlaneAPI?.session()?.access_token) return;
  usersActivity.loading = true;
  try {
    const summary = await MedlaneAPI.auditSummary(7);
    const changes = (summary.sensitive || []).filter((/** @type {any} */ entry) => ["Users", "Authentication"].includes(String(entry.module)) && !/^(signed in|failed sign-in)$/i.test(String(entry.action || "")));
    usersActivity.entries = [...(summary.signins || []), ...changes].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  } catch (/** @type {any} */ error) {
    usersActivity.error = error?.message || "Try again later.";
    usersActivity.entries = [];
  }
  usersActivity.loading = false;
  if (document.body.dataset.activeSection === "users") renderUsers();
}

/** @param {string} tab */
function usersTabModel(tab) {
  if (tab === "invites") return usersInvitesModel();
  if (tab === "roles") return usersRolesModel();
  if (tab === "activity") return usersActivityModel();
  return usersPeopleModel();
}

function renderUsers() {
  const panel = qs("#users-tab-panel");
  if (!panel) return;
  if (!USER_TABS.includes(usersPageTab)) usersPageTab = "people";
  if (usersPageTab === "activity") loadUsersActivity();
  const counts = /** @type {Record<string, number | undefined>} */ ({ people: usersAccounts().filter((user) => usersState(user) === "active").length, invites: usersInvites().filter((user) => usersState(user) !== "cancelled").length, roles: USER_ROLES.length });
  qs("#users-tabs").innerHTML = uiModuleTabs({ tabs: USER_TABS.map((key) => ({ key, label: USER_TAB_LABELS[key], count: counts[key] })), active: usersPageTab, attr: "data-users-tab" });
  const header = qs("#users-actions");
  if (header) header.innerHTML = canManageUsers() ? uiButton("Invite user", { "data-users-invite": "" }, { primary: true }) : "";
  renderModuleAssistant("users");
  uiRender(panel, uiViewHtml(usersTabModel(usersPageTab), usersView, "users"));
  syncModuleUrl("users", usersQueryString());
}

WORKFLOW_RULES.users = [
  { id: "users-expired-invites", rule: () => {
    if (!canManageUsers()) return null;
    const expired = usersInvites().filter((user) => usersState(user) === "expired");
    return expired.length ? { tone: /** @type {UiTone} */ ("amber"), text: `${plural(expired.length, "invite")} expired before ${expired.length === 1 ? "it was" : "they were"} accepted.`, action: "Resend", attrs: { "data-wa-goto": "users|invites|expired|" } } : null;
  } },
  { id: "users-inactive", rule: () => {
    if (!canManageUsers()) return null;
    const idle = usersAccounts().filter((user) => usersState(user) === "active" && usersIdleDays(user) >= USER_INACTIVE_DAYS);
    return idle.length ? { tone: /** @type {UiTone} */ ("amber"), text: `${plural(idle.length, "user")} haven’t signed in for ${USER_INACTIVE_DAYS}+ days but still have access.`, action: "Review", attrs: { "data-wa-goto": "users|people|inactive|" } } : null;
  } },
];

// ----- actions ------------------------------------------------------------------------------------
/** @param {string} email */
function usersFind(email) { return usersAll().find((user) => usersEmail(user) === email); }
/** Reloads accounts from the server after a change, then redraws. */
async function usersRefresh() {
  await syncBackendUsers();
  usersActivity.entries = null; // the change is now in the Audit Log
  renderUsers();
}
/** Runs an account change and reports the result. @param {() => Promise<any>} call @param {string} done */
async function usersRun(call, done) {
  const result = await call().catch((/** @type {any} */ error) => ({ error }));
  if (result?.error) { toast(result.error.message || "That didn’t work. Try again."); return null; }
  toast(done);
  await usersRefresh();
  return result;
}

/** Role picker cards (radio inputs) with one-line descriptions. @param {string} selected @param {string} [skip] */
function usersRolePickerHtml(selected, skip = "") {
  return `<fieldset class="users-role-picker"><legend>Role</legend>${USER_ROLES.filter((role) => role !== skip).map((role) => `<label class="users-role-card"><input type="radio" name="role" value="${escapeHtml(role)}" ${role === selected ? "checked" : ""} required /><span><strong>${escapeHtml(role)}</strong><small>${escapeHtml(USER_ROLE_INFO[role].desc)}</small></span></label>`).join("")}</fieldset>`;
}
/** Live "What a <role> can do" list. @param {string} role */
function usersCanDoHtml(role) {
  const access = usersRoleAccess(role);
  const approves = USER_ROLE_INFO[role]?.approves || "—";
  return `<h3>What ${/^[AEIOU]/.test(role) ? "an" : "a"} ${escapeHtml(role)} can do</h3><ul>${access.map((entry) => `<li><span>${escapeHtml(entry.label)}</span><em class="${entry.edit ? "edit" : ""}">${entry.edit ? "View and edit" : "View only"}</em></li>`).join("")}</ul><p><strong>Approves:</strong> ${escapeHtml(approves)}</p>`;
}
/** Keeps the drawer's "can do" list in step with the picked role (wired in events-bootstrap.js). @param {Element} target */
function usersSyncCanDo(target) {
  if (!(target instanceof HTMLInputElement) || target.name !== "role" || !target.closest("#recon-dialog")) return;
  const host = document.querySelector("#recon-dialog [data-users-cando]");
  if (host) host.innerHTML = usersCanDoHtml(target.value);
}

async function usersInvite() {
  if (!canManageUsers()) return toast("Only Superadmin or CEO can invite users.");
  const known = new Set(usersAll().filter((user) => usersState(user) !== "cancelled").map(usersEmail));
  const values = await reconDialog({
    eyebrow: "Users", title: "Invite user", sub: "They’ll get an email link to set their own password. The link expires in 24 hours.", drawer: true,
    body: `<div class="field"><label for="ui-email">Email</label><input id="ui-email" name="email" type="email" required autocomplete="off" placeholder="name@company.com" /></div>
      <div class="field"><label for="ui-name">Name (optional)</label><input id="ui-name" name="name" maxlength="80" autocomplete="off" /></div>
      ${usersRolePickerHtml("Sales")}
      <p class="users-branch-note">Branch: <strong>All branches</strong>. Everyone sees both branches.</p>
      <div class="users-cando" data-users-cando>${usersCanDoHtml("Sales")}</div>`,
    submit: "Send invite",
  });
  if (!values) return;
  const email = String(values.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email address.");
  if (known.has(email)) {
    const existing = usersFind(email);
    const state = existing ? usersState(existing) : "active";
    return toast(state === "pending" ? "An invite is already waiting for this email. Resend it from Invitations." : state === "expired" ? "This email has an expired invite. Resend it from Invitations." : "This person already has an account.");
  }
  if (!USER_ROLES.includes(values.role)) return toast("Pick a role.");
  const result = /** @type {any} */ (await MedlaneAPI.inviteUser({ email, name: String(values.name || "").trim(), role: values.role, branch: "all" }).catch((/** @type {any} */ error) => ({ error })));
  if (result?.error) return toast(result.error.message || "The invite couldn’t be sent.");
  toast(result.emailDelivery?.sent ? `Invite sent to ${email}.` : `Account created, but the email didn’t send (${result.emailDelivery?.reason || "unknown reason"}). Use Copy link on Invitations.`);
  usersPageTab = "invites";
  usersView = { ...uiBlankViewState(), sel: email };
  await usersRefresh();
}

/** @param {string} email */
async function usersChangeRole(email) {
  const user = usersFind(email);
  if (!user || !canManageUsers()) return;
  if (usersIsSelf(user)) return toast("Another Superadmin or CEO has to change your role.");
  const values = await reconDialog({
    eyebrow: "Change role", title: usersName(user), sub: `Currently ${user.role}. Their access changes as soon as you save; any custom access they had is cleared.`, drawer: true,
    body: `${usersRolePickerHtml(String(user.role || ""))}<div class="users-cando" data-users-cando>${usersCanDoHtml(String(user.role || "Sales"))}</div>`,
    submit: "Change role",
  });
  if (!values || values.role === user.role) return;
  await usersRun(() => MedlaneAPI.changeUserRole(email, values.role), `${usersName(user)} is now ${values.role}.`);
}

/** @param {string} email */
async function usersSendReset(email) {
  const user = usersFind(email);
  if (!user || !canManageUsers()) return;
  if (!(await reconDialog({ eyebrow: "Reset password", title: usersName(user), sub: `We’ll email ${email} a link to choose a new password. Their current password keeps working until they do.`, body: "", submit: "Send reset link" }))) return;
  const result = await usersRun(() => MedlaneAPI.sendUserPasswordReset(email), `Reset link sent to ${email}.`);
  if (result && result.emailDelivery && !result.emailDelivery.sent) toast(`The reset email didn’t send: ${result.emailDelivery.reason || "unknown reason"}.`);
}

/** @param {string} email @param {boolean} deactivate */
async function usersSetActive(email, deactivate) {
  const user = usersFind(email);
  if (!user || !canManageUsers()) return;
  if (usersIsSelf(user)) return toast("You can’t deactivate your own account.");
  if (deactivate) {
    const values = await reconDialog({
      eyebrow: "Deactivate", title: usersName(user), danger: true,
      sub: "They’re signed out and can’t sign in again until reactivated. Their records and history stay.",
      body: `<div class="field full"><label for="ud-reason">Reason</label><input id="ud-reason" name="reason" required maxlength="200" placeholder="e.g. Left the company" /></div>`,
      submit: "Deactivate",
    });
    if (!values) return;
    await usersRun(() => MedlaneAPI.setUserDisabled(email, true, values.reason.trim()), `${usersName(user)} deactivated.`);
    return;
  }
  if (!(await reconDialog({ eyebrow: "Reactivate", title: usersName(user), sub: `They can sign in again as ${user.role}.`, body: "", submit: "Reactivate" }))) return;
  await usersRun(() => MedlaneAPI.setUserDisabled(email, false, ""), `${usersName(user)} reactivated.`);
}

/** @param {string} email @param {"resend" | "copy" | "cancel"} kind */
async function usersInviteAction(email, kind) {
  const user = usersFind(email);
  if (!user || !canManageUsers()) return;
  if (kind === "cancel") {
    if (!(await reconDialog({ eyebrow: "Cancel invite", title: email, danger: true, sub: "The link stops working. You can invite them again later.", body: "", submit: "Cancel invite" }))) return;
    await usersRun(() => MedlaneAPI.cancelInvite(email), `Invite for ${email} cancelled.`);
    return;
  }
  if (kind === "resend") {
    const result = await usersRun(() => MedlaneAPI.resendInvite(email), `New invite sent to ${email}. It expires in 24 hours.`);
    if (result?.emailDelivery && !result.emailDelivery.sent) toast(`The email didn’t send (${result.emailDelivery.reason || "unknown reason"}). Use Copy link instead.`);
    return;
  }
  toast("Making a new link…");
  const result = await usersRun(() => MedlaneAPI.getInviteLink(email), "New invite link copied. It replaces the old one and expires in 24 hours.");
  if (!result?.actionLink) return;
  try { await navigator.clipboard.writeText(result.actionLink); } catch { await reconDialog({ eyebrow: "Invite link", title: email, sub: "Copy this link and send it to them. It works once.", body: `<div class="field full"><input readonly value="${escapeHtml(result.actionLink)}" onfocus="this.select()" /></div>`, submit: "Done" }); }
}

/** @param {string} email */
async function usersSignOutAll(email) {
  const user = usersFind(email);
  if (!user?.id || !canManageUsers()) return;
  if (!(await reconDialog({ eyebrow: "Sign out everywhere", title: usersName(user), sub: "Every device they’re signed in on is signed out. They can sign in again.", body: "", submit: "Sign out everywhere" }))) return;
  await usersRun(() => MedlaneAPI.revokeAllUserSessions(String(user.id)), `${usersName(user)} was signed out everywhere.`);
}

/** @param {string} email */
async function usersUseRoleAccess(email) {
  const user = usersFind(email);
  if (!user || !canManageUsers()) return;
  if (!(await reconDialog({ eyebrow: "Access", title: usersName(user), sub: `Clear the custom access saved for them so they get exactly what a ${user.role} gets.`, body: "", submit: "Use role access" }))) return;
  await usersRun(() => MedlaneAPI.resetUserPermissions(email), `${usersName(user)} now has ${user.role} access.`);
}

/** Click handling for the Users section (wired in events-bootstrap.js). @param {Element} target */
function handleUsersClick(target) {
  const tab = closestEl(target, "[data-users-tab]");
  if (tab) {
    if (tab.dataset.usersTab !== usersPageTab) { usersView = uiBlankViewState(); usersRoleFilter = ""; }
    usersPageTab = /** @type {string} */ (tab.dataset.usersTab);
    return renderUsers();
  }
  /** @param {string} name */
  const attr = (name) => { const el = closestEl(target, `[data-users-${name}]`); return el ? String(el.getAttribute(`data-users-${name}`) || "") : null; };
  let email;
  if (attr("invite") !== null) return usersInvite();
  if ((email = attr("role"))) return usersChangeRole(email);
  if ((email = attr("reset"))) return usersSendReset(email);
  if ((email = attr("deactivate"))) return usersSetActive(email, true);
  if ((email = attr("reactivate"))) return usersSetActive(email, false);
  if ((email = attr("resend"))) return usersInviteAction(email, "resend");
  if ((email = attr("copy"))) return usersInviteAction(email, "copy");
  if ((email = attr("cancel"))) return usersInviteAction(email, "cancel");
  if ((email = attr("signout"))) return usersSignOutAll(email);
  if ((email = attr("reset-access"))) return usersUseRoleAccess(email);
  if ((email = attr("devices"))) {
    const user = usersFind(email);
    if (!user) return;
    renderUserSessions({ id: user.id, email: usersEmail(user), name: usersName(user) });
    return qs("#user-devices-modal")?.showModal();
  }
  const role = attr("show-role");
  if (role) {
    usersPageTab = "people";
    usersView = { ...uiBlankViewState(), scope: "active" };
    usersRoleFilter = role;
    return renderUsers();
  }
  uiViewClick(target, "users", { state: () => usersView, view: () => usersTabModel(usersPageTab), render: renderUsers, extraReset: () => { usersRoleFilter = ""; } });
}

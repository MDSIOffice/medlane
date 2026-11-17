// Account settings (section "user-settings"): the signed-in user's own profile, sign-in security,
// notification settings and preferences. Everything here changes only the signed-in account; the
// Worker enforces that (/api/account/*, src/account.js). Preferences and notification toggles save
// immediately with an optimistic update and roll back if the server refuses.

const ACCOUNT_TAB_LABELS = /** @type {Record<string, string>} */ ({ profile: "Profile", security: "Sign-in & security", notifications: "Notifications", preferences: "Preferences" });
const ACCOUNT_TABS = Object.keys(ACCOUNT_TAB_LABELS);
const accountSeed = moduleUrlSeed("user-settings", ACCOUNT_TABS);
let accountTab = accountSeed.tab;
/** @type {{ data: AccountResponse | null, loading: boolean, error: string }} */
const accountState = { data: null, loading: false, error: "" };
/** Last save confirmation ("Saved", "Profile saved", an error…) shown under the tabs. */
let accountFlash = { text: "", state: "saved", at: 0 };
/** @type {ReturnType<typeof setTimeout> | undefined} */
let accountFlashTimer;

const ACCOUNT_START_PAGES = /** @type {[UserPreferences["startPage"], string, string][]} */ ([["dashboard", "Dashboard", "dashboard"], ["inventory", "Inventory", "inventory"], ["sales", "Sales", "sales"], ["last", "Last page I used", ""]]);
const ACCOUNT_LAST_PAGE_KEY = "medlane-last-section";

/** Same rule as normalizePhMobile in src/account.js: "+63 9XX XXX XXXX", "" when blank, null when invalid. @param {string} value */
function accountPhMobile(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : null;
}

/** @param {string} text @param {"saved" | "saving" | "error"} [state] */
function accountShowFlash(text, state = "saved") {
  accountFlash = { text, state, at: Date.now() };
  clearTimeout(accountFlashTimer);
  if (state !== "saving") accountFlashTimer = setTimeout(() => { accountFlash = { text: "", state: "saved", at: 0 }; const el = document.getElementById("account-flash"); if (el) el.innerHTML = ""; }, 3500);
  const el = document.getElementById("account-flash");
  if (el) el.innerHTML = accountFlashHtml();
}
function accountFlashHtml() {
  return accountFlash.text ? `<span class="ui-saved" data-state="${escapeHtml(accountFlash.state)}">${uiDot(accountFlash.state === "error" ? "red" : accountFlash.state === "saving" ? "amber" : "green")}${escapeHtml(accountFlash.text)}</span>` : "";
}

/** Fetches settings + sessions once per visit (and after changes that affect them). */
async function loadAccount(force = false) {
  // After a failure, wait for a deliberate retry (force) instead of re-fetching on every render.
  if (accountState.loading || ((accountState.data || accountState.error) && !force)) return;
  accountState.loading = true;
  accountState.error = "";
  try {
    accountState.data = await MedlaneAPI.loadAccount();
    if (currentUser) {
      currentUser.preferences = accountState.data.preferences;
      currentUser.notificationSettings = accountState.data.notificationSettings;
      currentUser.passwordAge = accountState.data.passwordAge;
      persistCurrentUser();
    }
  } catch (/** @type {any} */ error) {
    accountState.error = error?.message || "Couldn’t load your settings.";
  } finally {
    accountState.loading = false;
    if (document.body.dataset.activeSection === "user-settings") renderUserSettings();
  }
}

/** Saves currentUser (with its preferences) for the next page load. */
function persistCurrentUser() {
  try { localStorage.setItem("medlane-session", JSON.stringify(currentUser)); } catch { /* storage full or blocked */ }
  syncPreferences();
  if (currentUser?.email) rememberSoundPreference(currentUser.email, !soundEffectsOn());
}

function accountPrefs() { return accountState.data?.preferences || userPreferences(); }
/** @returns {NotificationSetting[]} */
function accountNotificationSettings() { return accountState.data?.notificationSettings || currentUser?.notificationSettings || []; }

// ---- Rendering -------------------------------------------------------------------------------

/** @param {boolean} on @param {string} label @param {UiAttrs} attrs @param {{ locked?: boolean }} [options] */
function accountSwitch(on, label, attrs, { locked = false } = {}) {
  return `<button type="button" class="acct-switch" role="switch" aria-checked="${on}" aria-label="${escapeHtml(label)}"${locked ? ` aria-disabled="true" title="Always on"` : ""} ${uiAttrs(attrs)}><span aria-hidden="true"></span></button>`;
}

/** @param {string} label @param {string} key @param {[string | number, string][]} options @param {string | number} active */
function accountSegment(label, key, options, active) {
  return `<div class="ui-seg" role="group" aria-label="${escapeHtml(label)}">${options.map(([value, text]) => `<button type="button" data-account-pref="${escapeHtml(key)}" data-value="${escapeHtml(String(value))}" aria-pressed="${String(value) === String(active)}">${escapeHtml(text)}</button>`).join("")}</div>`;
}

/** @param {string} title @param {string} sub @param {string} control @param {string} [extra] */
function accountRow(title, sub, control, extra = "") {
  return `<div class="acct-row"><div class="acct-row-text"><div class="acct-row-title">${escapeHtml(title)}</div><div class="acct-row-sub">${sub}</div>${extra}</div><div class="acct-row-control">${control}</div></div>`;
}

function accountAvatarHtml(size = 64) {
  const photo = accountPrefs().avatar;
  const name = String(currentUser?.name || currentUser?.email || "User");
  return photo
    ? `<span class="acct-avatar" style="--acct-avatar:${size}px"><img src="${escapeHtml(photo)}" alt="Your photo" /></span>`
    : `<span class="acct-avatar" style="--acct-avatar:${size}px" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

function accountBranchLabel() {
  const branch = String(currentUser?.branch || "all");
  return branch === "all" ? "All areas" : branch;
}

function accountProfileHtml() {
  const prefs = accountPrefs();
  const name = String(currentUser?.name || "");
  return `<section class="ui-card acct-card" aria-label="Profile">
    <div class="acct-profile-head">
      ${accountAvatarHtml(64)}
      <div class="acct-profile-who"><div class="acct-profile-name">${escapeHtml(name || currentUser?.email || "")}</div><div class="acct-row-sub">${escapeHtml(currentUser?.role || "")} · ${escapeHtml(accountBranchLabel())}</div></div>
      <div class="acct-photo-actions">
        ${uiButton(prefs.avatar ? "Change photo" : "Add photo", { "data-account-photo": "" }, { size: "sm" })}
        ${prefs.avatar ? uiButton("Remove", { "data-account-photo-remove": "" }, { size: "sm" }) : ""}
        <input type="file" id="account-photo-input" accept="image/jpeg,image/png,image/webp" hidden />
      </div>
    </div>
    <form id="account-profile-form" class="acct-form" novalidate>
      <label class="acct-field"><span>Full name</span><input name="fullName" autocomplete="name" maxlength="80" required value="${escapeHtml(name)}" /></label>
      <label class="acct-field"><span>Display name <small>Used in greetings</small></span><input name="displayName" maxlength="40" placeholder="${escapeHtml(firstName(name))}" value="${escapeHtml(prefs.displayName)}" /></label>
      <label class="acct-field"><span>Mobile</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="0917 123 4567" value="${escapeHtml(String(currentUser?.phone || ""))}" aria-describedby="account-phone-error" /><small class="acct-error" id="account-phone-error" hidden></small></label>
      <div class="acct-field"><span>Work email</span><div class="acct-readonly">${escapeHtml(currentUser?.email || "")}</div><small>Used to sign in. A superadmin can change it in Users.</small></div>
    </form>
    <div class="acct-managed"><span><b>Role:</b> ${escapeHtml(currentUser?.role || "")}</span><span><b>Branch:</b> ${escapeHtml(accountBranchLabel())}</span><span class="acct-row-sub">Managed in Users.</span></div>
    <div class="acct-actions">${uiButton("Save changes", { "data-account-save-profile": "" }, { primary: true })}</div>
  </section>`;
}

/** @param {string} iso */
function accountWhen(iso) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const mins = Math.round((Date.now() - time) / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `${mins} min ago`;
  const day = (/** @type {Date} */ d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const date = new Date(time);
  const clock = date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });
  if (day(date) === day(new Date())) return `Today ${clock}`;
  return date.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" });
}

function accountPasswordRow() {
  const age = accountState.data?.passwordAge || currentUser?.passwordAge;
  const sub = age?.days === null || age?.days === undefined
    ? "We recommend changing it every 90 days."
    : `Last changed ${age.days === 0 ? "today" : `${plural(age.days, "day")} ago`}. We recommend changing it every 90 days.`;
  const pill = age?.status === "overdue" ? uiPill("Change now", "red") : age?.status === "due-soon" ? uiPill(`Due in ${plural(Number(age.dueInDays), "day")}`, "amber") : "";
  return accountRow("Password", escapeHtml(sub), `${pill}${uiButton("Change password", { "data-account-password": "" }, { primary: true })}`);
}

function accountSecurityHtml() {
  const sessions = accountState.data?.sessions || [];
  const others = sessions.filter((session) => !session.current);
  const list = accountState.loading && !accountState.data ? `<p class="ui-muted acct-pad">Loading your sessions…</p>`
    : accountState.error && !accountState.data ? `<p class="ui-muted acct-pad">${escapeHtml(accountState.error)}</p>`
    : sessions.map((session) => `<div class="acct-session">
        <span class="acct-session-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${/phone|iphone|android/i.test(session.device) ? `<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>` : `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`}</svg></span>
        <div class="acct-session-text"><div class="acct-row-title">${escapeHtml(`${session.browser || "Browser"} on ${session.device || "device"}`)}</div><div class="acct-row-sub">${escapeHtml([session.ipAddress, session.current ? "Active now" : accountWhen(session.lastSeenAt)].filter(Boolean).join(" · "))}</div></div>
        ${session.current ? uiPill("This device", "green") : uiButton("Sign out", { "data-account-signout": session.id }, { size: "sm" })}
      </div>`).join("") || `<p class="ui-muted acct-pad">No other active sessions.</p>`;
  return `<section class="ui-card acct-card" aria-label="Password">${accountPasswordRow()}</section>
  <section class="ui-card acct-card" aria-label="Where you’re signed in">
    ${accountRow("Where you’re signed in", "Sign out any session you don’t recognise, then change your password.", others.length ? uiButton("Sign out all other sessions", { "data-account-signout-others": "" }, { size: "sm" }) : "")}
    <div class="acct-sessions">${list}</div>
    ${canSeeOwnActivity() ? `<div class="acct-pad"><button type="button" class="ui-link" data-account-activity="signins">See all your sign-ins and changes in the activity log →</button></div>` : ""}
  </section>`;
}

function accountNotificationsHtml() {
  const prefs = accountPrefs();
  const rows = accountNotificationSettings();
  const matrix = rows.map((row) => `<div class="acct-matrix-row${row.locked ? " is-locked" : ""}">
      <div class="acct-row-text"><div class="acct-row-title">${escapeHtml(row.label)}</div><div class="acct-row-sub">${escapeHtml(row.sub)}</div></div>
      <div class="acct-matrix-cell">${accountSwitch(row.inApp, `${row.label} in app`, { "data-account-alert": row.type, "data-channel": "inApp" }, { locked: row.locked })}</div>
      <div class="acct-matrix-cell">${accountSwitch(row.email, `${row.label} by email`, { "data-account-alert": row.type, "data-channel": "email" }, { locked: row.locked })}</div>
    </div>`).join("");
  const quietTimes = `<div class="acct-quiet-times"${prefs.quietHoursEnabled ? "" : " hidden"}><label>From <input type="time" step="900" data-account-quiet="quietStart" value="${escapeHtml(prefs.quietStart)}" /></label><label>to <input type="time" step="900" data-account-quiet="quietEnd" value="${escapeHtml(prefs.quietEnd)}" /></label><span class="acct-row-sub">Manila time</span></div>`;
  return `<section class="ui-card acct-card" aria-label="Notification settings">
    <div class="acct-matrix-head" aria-hidden="true"><span>Alert</span><span>In app</span><span>Email</span></div>
    ${matrix || `<p class="ui-muted acct-pad">Loading…</p>`}
    ${accountRow("Daily summary email", "One email at 07:00 with everything on your Dashboard that needs you today.", accountSwitch(prefs.dailySummary, "Daily summary email", { "data-account-toggle": "dailySummary" }))}
    ${accountRow("Quiet hours", `No emails between ${escapeHtml(prefs.quietStart)} and ${escapeHtml(prefs.quietEnd)}. Urgent and security alerts still come through.`, accountSwitch(prefs.quietHoursEnabled, "Quiet hours", { "data-account-toggle": "quietHoursEnabled" }), quietTimes)}
  </section>`;
}

function accountPreferencesHtml() {
  const prefs = accountPrefs();
  const branches = platformBranches().map(String);
  const starts = ACCOUNT_START_PAGES.filter(([, , section]) => !section || canViewModule(section)).map(([value, label]) => /** @type {[string, string]} */ ([value, label]));
  return `<section class="ui-card acct-card" aria-label="Preferences">
    ${accountRow("Sound effects", "Plays the welcome sound after sign-in and a soft chime for urgent alerts. With sound off the Welcome animation still plays, silently.", accountSwitch(prefs.sound, "Sound effects", { "data-account-toggle": "sound" }))}
    ${accountRow("Welcome screen", "The greeting with your tasks, shown after you sign in.", accountSegment("Welcome screen", "welcome", [["daily", "Once a day"], ["every", "Every sign-in"], ["off", "Off"]], prefs.welcome))}
    ${accountRow("Start page", "Where you land after the Welcome screen.", accountSegment("Start page", "startPage", starts, prefs.startPage))}
    ${accountRow("Rows per page", "Default page size for tables and lists. You can still change it on each page.", accountSegment("Rows per page", "rowsPerPage", [[10, "10"], [25, "25"], [50, "50"]], prefs.rowsPerPage))}
    ${branches.length > 1 ? accountRow("Default branch view", "Which branch lists and totals open with.", accountSegment("Default branch view", "defaultBranch", [["all", "Both branches"], ...branches.map((branch) => /** @type {[string, string]} */ ([branch, branch === "Las Pinas" ? "Las Piñas" : branch]))], prefs.defaultBranch)) : ""}
  </section>`;
}

/** Whether "View my activity" can open anything for this user. */
/** Everyone can see their own activity (the server limits it to them). */
function canSeeOwnActivity() { return true; }

function renderUserSettings() {
  const panel = qs("#account-tab-panel");
  if (!panel || !currentUser) return;
  if (!ACCOUNT_TABS.includes(accountTab)) accountTab = "profile";
  loadAccount();
  qs("#account-tabs").innerHTML = uiModuleTabs({ tabs: ACCOUNT_TABS.map((key) => ({ key, label: ACCOUNT_TAB_LABELS[key] })), active: accountTab, attr: "data-account-tab" });
  const header = qs("#account-actions");
  if (header) header.innerHTML = canSeeOwnActivity() ? uiButton("View my activity", { "data-account-activity": "all" }) : "";
  renderModuleAssistant("user-settings");
  const body = accountTab === "security" ? accountSecurityHtml() : accountTab === "notifications" ? accountNotificationsHtml() : accountTab === "preferences" ? accountPreferencesHtml() : accountProfileHtml();
  uiRender(panel, `<div class="acct-flash" id="account-flash" role="status" aria-live="polite">${accountFlashHtml()}</div>${body}`);
  const game = qs("#account-game-panel");
  if (game) game.hidden = accountTab !== "preferences";
  syncModuleUrl("user-settings", accountQueryString());
}
function accountQueryString() {
  const p = new URLSearchParams({ section: "user-settings" });
  if (accountTab !== "profile") p.set("tab", accountTab);
  return p.toString();
}

// ---- Workflow Assistant: password nearing 90 days, sessions on other devices ----
WORKFLOW_RULES["user-settings"] = [
  { id: "account-password-age", rule: () => {
    const age = accountState.data?.passwordAge || currentUser?.passwordAge;
    if (!age || (age.status !== "due-soon" && age.status !== "overdue")) return null;
    return { tone: /** @type {UiTone} */ (age.status === "overdue" ? "red" : "amber"), text: age.status === "overdue" ? `Your password is ${age.days} days old — past the 90-day limit.` : `Your password is ${age.days} days old. Change it before it reaches 90 days.`, action: "Change password", attrs: { "data-account-password": "" } };
  } },
  { id: "account-other-devices", rule: () => {
    const sessions = accountState.data?.sessions || [];
    const here = sessions.find((session) => session.current);
    const others = sessions.filter((session) => !session.current && (!here || session.device !== here.device || session.browser !== here.browser));
    if (!others.length) return null;
    const first = others[0];
    return { tone: /** @type {UiTone} */ ("amber"), text: others.length === 1 ? `You’re also signed in on ${first.browser} on ${first.device}. Not you? Sign it out.` : `You’re signed in on ${others.length} other devices. Sign out any you don’t recognise.`, action: "Review", attrs: { "data-account-tab": "security" } };
  } },
];

// ---- Actions ---------------------------------------------------------------------------------

/**
 * Applies a preference locally, saves it, and rolls back on failure.
 * @param {Partial<UserPreferences>} patch
 */
async function accountSavePreference(patch) {
  if (!currentUser) return;
  const before = { ...accountPrefs() };
  const previousBranch = prefDefaultBranch();
  const next = { ...before, ...patch };
  if (accountState.data) accountState.data.preferences = next;
  currentUser.preferences = next;
  persistCurrentUser();
  if ("defaultBranch" in patch) applyPreferencesToViews(previousBranch);
  renderUserSettings();
  if ("avatar" in patch || "displayName" in patch) renderUserMenu();
  accountShowFlash("Saving…", "saving");
  try {
    const result = await MedlaneAPI.saveAccountPreferences(patch);
    if (accountState.data) accountState.data.preferences = result.preferences;
    currentUser.preferences = result.preferences;
    persistCurrentUser();
    accountShowFlash("Saved");
  } catch (/** @type {any} */ error) {
    if (accountState.data) accountState.data.preferences = before;
    currentUser.preferences = before;
    persistCurrentUser();
    if ("defaultBranch" in patch) applyPreferencesToViews(prefDefaultBranch() === previousBranch ? String(next.defaultBranch) : previousBranch);
    accountShowFlash(error?.message || "Couldn’t save — try again.", "error");
    renderUserSettings();
    if ("avatar" in patch || "displayName" in patch) renderUserMenu();
  }
}

/** @param {string} type @param {"inApp" | "email"} channel */
async function accountToggleAlert(type, channel) {
  const rows = accountNotificationSettings();
  const row = rows.find((item) => item.type === type);
  if (!row || row.locked) return accountShowFlash("Security alerts are always on.", "error");
  const before = rows.map((item) => ({ ...item }));
  row[channel] = !row[channel];
  renderUserSettings();
  /** @type {HTMLElement | null} */ (document.querySelector(`[data-account-alert="${type}"][data-channel="${channel}"]`))?.focus();
  accountShowFlash("Saving…", "saving");
  try {
    const result = await MedlaneAPI.saveNotificationSetting(type, channel, row[channel]);
    if (accountState.data) accountState.data.notificationSettings = result.notificationSettings;
    if (currentUser) { currentUser.notificationSettings = result.notificationSettings; persistCurrentUser(); }
    accountShowFlash("Saved");
  } catch (/** @type {any} */ error) {
    if (accountState.data) accountState.data.notificationSettings = before;
    accountShowFlash(error?.message || "Couldn’t save — try again.", "error");
    renderUserSettings();
  }
}

async function accountSaveProfile() {
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById("account-profile-form"));
  if (!form || !currentUser) return;
  const values = formObject(form);
  const phoneError = /** @type {HTMLElement} */ (form.querySelector("#account-phone-error"));
  const phone = accountPhMobile(String(values.phone || ""));
  const phoneInput = /** @type {HTMLInputElement} */ (form.querySelector("[name='phone']"));
  if (phone === null) {
    phoneError.textContent = "Enter a Philippine mobile number, e.g. 0917 123 4567.";
    phoneError.hidden = false;
    phoneInput.setAttribute("aria-invalid", "true");
    phoneInput.focus();
    return;
  }
  phoneError.hidden = true;
  phoneInput.removeAttribute("aria-invalid");
  const fullName = String(values.fullName || "").trim();
  if (!fullName) { accountShowFlash("Full name is required.", "error"); return /** @type {HTMLInputElement} */ (form.querySelector("[name='fullName']")).focus(); }
  accountShowFlash("Saving…", "saving");
  try {
    const result = await MedlaneAPI.saveAccountProfile({ fullName, displayName: String(values.displayName || "").trim(), phone });
    currentUser.name = result.name;
    currentUser.phone = result.phone;
    currentUser.preferences = { ...accountPrefs(), displayName: result.displayName };
    if (accountState.data) accountState.data.preferences = currentUser.preferences;
    persistCurrentUser();
    renderUserMenu();
    renderUserSettings();
    accountShowFlash("Profile saved");
  } catch (/** @type {any} */ error) {
    accountShowFlash(error?.message || "Couldn’t save your profile.", "error");
  }
}

/** Resizes a picked photo to a 160px square JPEG data URL (fits the server's 90 KB limit). @param {File} file @returns {Promise<string>} */
function accountResizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Choose a JPEG, PNG or WebP photo."));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That photo is too large (max 15 MB)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("Couldn’t read that photo.")); }
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let quality = 0.86;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 110000 && quality > 0.4) { quality -= 0.12; data = canvas.toDataURL("image/jpeg", quality); }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn’t read that photo.")); };
    img.src = url;
  });
}

/** @param {string} sessionId */
async function accountSignOutSession(sessionId) {
  const session = accountState.data?.sessions.find((item) => item.id === sessionId);
  try {
    await MedlaneAPI.signOutMySession(sessionId);
    if (accountState.data) accountState.data.sessions = accountState.data.sessions.filter((item) => item.id !== sessionId);
    renderUserSettings();
    accountShowFlash(`${session ? `${session.browser} on ${session.device}` : "Session"} signed out`);
  } catch (/** @type {any} */ error) {
    accountShowFlash(error?.message || "Couldn’t sign that session out.", "error");
  }
}

async function accountSignOutOthers() {
  if (!(await confirmFinalSave("Sign out every other session? Anyone using them will need to sign in again."))) return;
  try {
    const result = await MedlaneAPI.signOutMyOtherSessions();
    if (accountState.data) accountState.data.sessions = accountState.data.sessions.filter((item) => item.current);
    renderUserSettings();
    accountShowFlash(result.revoked ? `Signed out of ${plural(result.revoked, "other session")}` : "No other sessions to sign out");
  } catch (/** @type {any} */ error) {
    accountShowFlash(error?.message || "Couldn’t sign the other sessions out.", "error");
  }
}

/** Opens the activity log filtered to the signed-in user (optionally the Sign-ins tab). @param {string} tab */
function openMyActivity(tab) {
  openActivityFor(String(currentUser?.name || currentUser?.email || ""), tab === "signins" ? "signins" : "all");
}

/** Activity log searched for one person, on the given tab. @param {string} user @param {string} tab */
function openActivityLogFor(user, tab) {
  logsTab = LOGS_TABS.includes(tab) ? tab : "activity";
  logsView = { ...uiBlankViewState(), q: user };
  showSection("logs");
}

/** Click handling for Account settings (wired in events-bootstrap.js). @param {Element} target @returns {boolean} */
function handleAccountClick(target) {
  const el = (/** @type {string} */ name) => closestEl(target, `[${name}]`);
  let hit;
  if ((hit = el("data-account-tab"))) { accountTab = String(hit.getAttribute("data-account-tab")); renderUserSettings(); return true; }
  if (el("data-account-save-profile")) { accountSaveProfile(); return true; }
  if (el("data-account-password")) { qs("#password-form").reset(); qs("#password-modal").showModal(); return true; }
  if (el("data-account-photo")) { /** @type {HTMLInputElement | null} */ (document.getElementById("account-photo-input"))?.click(); return true; }
  if (el("data-account-photo-remove")) { accountSavePreference({ avatar: "" }); return true; }
  if ((hit = el("data-account-signout"))) { accountSignOutSession(String(hit.getAttribute("data-account-signout"))); return true; }
  if (el("data-account-signout-others")) { accountSignOutOthers(); return true; }
  if ((hit = el("data-account-activity"))) { openMyActivity(String(hit.getAttribute("data-account-activity"))); return true; }
  if ((hit = el("data-account-alert"))) {
    if (hit.getAttribute("aria-disabled") === "true") { accountShowFlash("Security alerts are always on, so you never miss a sign-in you didn’t make.", "error"); return true; }
    accountToggleAlert(String(hit.getAttribute("data-account-alert")), /** @type {"inApp" | "email"} */ (hit.getAttribute("data-channel")));
    return true;
  }
  if ((hit = el("data-account-toggle"))) {
    const key = /** @type {"sound" | "dailySummary" | "quietHoursEnabled"} */ (hit.getAttribute("data-account-toggle"));
    accountSavePreference({ [key]: !accountPrefs()[key] });
    return true;
  }
  if ((hit = el("data-account-pref"))) {
    const key = String(hit.getAttribute("data-account-pref"));
    const raw = String(hit.getAttribute("data-value"));
    const value = key === "rowsPerPage" ? Number(raw) : raw;
    if (String(/** @type {any} */ (accountPrefs())[key]) !== String(value)) accountSavePreference(/** @type {Partial<UserPreferences>} */ ({ [key]: value }));
    return true;
  }
  return false;
}

/** Change handling (photo picker, quiet-hour times). @param {Element} target @returns {Promise<boolean>} */
async function handleAccountChange(target) {
  if (target instanceof HTMLInputElement && target.id === "account-photo-input") {
    const file = target.files?.[0];
    target.value = "";
    if (!file) return true;
    try { accountSavePreference({ avatar: await accountResizePhoto(file) }); }
    catch (/** @type {any} */ error) { accountShowFlash(error?.message || "Couldn’t use that photo.", "error"); }
    return true;
  }
  if (target instanceof HTMLInputElement && target.dataset.accountQuiet) {
    const key = /** @type {"quietStart" | "quietEnd"} */ (target.dataset.accountQuiet);
    if (/^\d{2}:\d{2}$/.test(target.value) && target.value !== accountPrefs()[key]) accountSavePreference({ [key]: target.value });
    return true;
  }
  return false;
}

// ---- Applying preferences outside this page ----------------------------------------------------

/** Remembers the last section for "Start page → Last page I used". @param {string} section */
function rememberLastSection(section) {
  if (!section || ["user-settings", "notifications"].includes(section)) return;
  try { localStorage.setItem(`${ACCOUNT_LAST_PAGE_KEY}:${currentUser?.email || ""}`, section); } catch { /* storage blocked */ }
}

/** Where to land after the Welcome screen (or straight after sign-in when it's off). */
function preferredStartSection() {
  const pref = userPreferences().startPage;
  if (pref === "last") {
    let last = "";
    try { last = localStorage.getItem(`${ACCOUNT_LAST_PAGE_KEY}:${currentUser?.email || ""}`) || ""; } catch { /* storage blocked */ }
    return last && canViewModule(last) ? last : "dashboard";
  }
  const match = ACCOUNT_START_PAGES.find(([value]) => value === pref);
  return match && match[2] && canViewModule(match[2]) ? match[2] : "dashboard";
}

/** Sound effects preference (Welcome sound and the urgent-alert chime). */
function soundEffectsOn() { return userPreferences().sound !== false; }

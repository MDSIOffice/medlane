// Real-browser test of the whole app on slow connections, against the LOCAL copy (npm run local):
// the real Worker, real Postgres, real sign-in. Chrome's network throttling (the same engine as
// DevTools' "Slow 3G" etc.) applies to every request, including the gzip-compressed API payloads.
//
//   npx playwright test -c tests/slow-network/playwright.config.mjs
//
// Fails on anything a user would hit: uncaught errors, console errors, failed or 4xx/5xx API
// calls, error toasts, a page that never finishes loading. Writes timings to
// .local/slow-network-report.md.
import { test, expect } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const PASSWORD = "LocalTest!2026";
const REPORT = ".local/slow-network-report.md";
const PROFILES = {
  // Chrome DevTools presets (bytes/second, latency in ms) plus a weak-LTE profile typical of
  // provincial mobile data.
  "Slow 3G": { latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 },
  "Fast 3G": { latency: 563, downloadThroughput: 180_000, uploadThroughput: 84_375 },
  "Weak 4G": { latency: 150, downloadThroughput: 500_000, uploadThroughput: 250_000 },
};
const ROLE_ACCOUNTS = ["ceo", "admin", "accounting", "sales", "logistics", "hr", "ps", "engineering"];
// Toasts that mean something went wrong for the user.
const ERROR_TOAST = /fail|error|not saved|could not|couldn't|unable|invalid|denied|permission|try again|timed out/i;

mkdirSync(".local", { recursive: true });
const report = (line) => appendFileSync(REPORT, `${line}\n`);
test.beforeAll(() => { if (test.info().workerIndex === 0) writeFileSync(REPORT, `# Slow-network test — ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}\n\n`); });

async function throttle(page, profile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  const apply = (conditions) => cdp.send("Network.emulateNetworkConditions", { offline: false, ...conditions });
  await apply(profile);
  return { cdp, apply, offline: () => cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }) };
}

// Collect everything that should never happen on a healthy page.
async function watch(page, { allowToasts = [] } = {}) {
  const problems = [];
  const local = (url) => !url || url.startsWith("http://127.0.0.1");
  // Only the app itself is under test: block third-party hosts (fonts/maps) so their speed
  // doesn't skew timings — the app must still work without them. Blocked via CDP, NOT
  // page.route(): Playwright request interception switches the browser's HTTP cache off, which
  // would make every "warm" reload re-download everything.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*://fonts.googleapis.com/*", "*://fonts.gstatic.com/*", "*://maps.google.com/*", "*://www.google.com/*", "*://*.instagram.com/*"] });
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && local(message.location().url) && !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    // The local copy runs with ENVIRONMENT=local, where the server refuses backups even for
    // Superadmin/CEO; for them only, that refusal is a local-only artefact. Anyone else asking is a bug.
    if (url.pathname.startsWith("/api/backups") && response.status() === 403 && page.__backupAdmin) return;
    if (url.pathname.startsWith("/api/") && response.status() >= 400) problems.push(`api: ${response.request().method()} ${url.pathname} → ${response.status()}`);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    // ERR_ABORTED = the browser cancelled it because the page navigated/reloaded (not an error).
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    if (url.hostname === "127.0.0.1" && !page.__expectOffline) problems.push(`request failed: ${request.method()} ${url.pathname} (${request.failure()?.errorText})`);
  });
  await page.addInitScript(() => {
    window.__toasts = [];
    const start = () => {
      const el = document.querySelector("#toast");
      if (!el) return setTimeout(start, 200);
      new MutationObserver(() => { const text = el.textContent?.trim(); if (text && window.__toasts.at(-1) !== text) window.__toasts.push(text); }).observe(el, { childList: true, characterData: true, subtree: true });
    };
    document.addEventListener("DOMContentLoaded", start);
  });
  return {
    problems,
    async check() {
      const toasts = await page.evaluate(() => window.__toasts || []).catch(() => []);
      const bad = toasts.filter((text) => ERROR_TOAST.test(text) && !allowToasts.some((allowed) => allowed.test(text)));
      return [...problems, ...bad.map((text) => `error toast: ${text}`)];
    },
  };
}

async function signIn(page, email) {
  page.__backupAdmin = /^(superadmin|ceo)@/.test(email);
  const started = Date.now();
  await page.goto("/login", { timeout: 180_000 });
  await page.locator("#login-email").waitFor({ timeout: 180_000 });
  const loginReady = Date.now() - started;
  await page.fill("#login-email", email);
  await page.fill("#login-password", PASSWORD);
  const submitted = Date.now();
  await page.locator("#login-form").evaluate((form) => { if (!form.dataset.submitting) form.requestSubmit(); });
  await page.waitForURL("**/dashboard*", { timeout: 300_000 });
  await expect(page.locator("body")).toHaveClass(/app-route/, { timeout: 300_000 });
  await expect(page.locator("#loading-overlay")).toHaveClass(/hide/, { timeout: 300_000 });
  return { loginReady, signIn: Date.now() - submitted };
}

// Visit every module this account can see; each must become active and settle without errors.
async function visitAllSections(page) {
  const sections = await page.locator(".nav-item[data-section]:not([hidden])").evaluateAll((items) => items.map((item) => item.dataset.section));
  const timings = [];
  for (const section of sections) {
    const started = Date.now();
    await page.locator(`.nav-item[data-section="${section}"]:not([hidden])`).first().click();
    await expect(page.locator(`#${section}.section`)).toHaveClass(/active/, { timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    await expect(page.locator(`#${section}.section`)).toBeVisible();
    timings.push([section, Date.now() - started]);
  }
  return timings;
}

const fmt = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

for (const [name, profile] of Object.entries(PROFILES)) {
  test(`${name}: sign in, open every module, save, reload — no errors`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    const watcher = await watch(page);
    const net = await throttle(page, profile);
    const { loginReady, signIn: signInMs } = await signIn(page, "superadmin@medlane.local");
    const sections = await visitAllSections(page);

    // A real save under the slow connection: add a calendar event and wait for "Saved".
    await page.locator('.nav-item[data-section="calendar"]').click();
    await page.locator("#calendar [data-calendar-add]").first().click();
    const title = `Slow-net check ${name} ${Date.now()}`;
    await page.fill("#calendar-event-title", title);
    await page.fill("#calendar-event-time", "10:30");
    const saveStarted = Date.now();
    await page.locator('dialog[open] button[value="confirm"]').click();
    await expect(page.locator("#save-status-text")).toHaveText(/Saved/, { timeout: 180_000 });
    await expect(page.locator("#calendar")).toContainText(title.slice(0, 20), { timeout: 60_000 });
    const saveMs = Date.now() - saveStarted;

    // Returning visit: reload with the browser cache warm.
    const reloadStarted = Date.now();
    await page.reload({ timeout: 300_000 });
    await expect(page.locator("#loading-overlay")).toHaveClass(/hide/, { timeout: 300_000 });
    const reloadMs = Date.now() - reloadStarted;

    const problems = await watcher.check();
    const slowest = [...sections].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, ms]) => `${s} ${fmt(ms)}`).join(", ");
    report(`## ${name} (${profile.latency} ms latency, ${Math.round(profile.downloadThroughput * 8 / 1000)} kbps down)\n- Login page ready: ${fmt(loginReady)}\n- Sign in → dashboard usable: ${fmt(signInMs)}\n- ${sections.length} modules opened, slowest: ${slowest}\n- Save calendar event → "Saved": ${fmt(saveMs)}\n- Reload (warm cache): ${fmt(reloadMs)}\n- Problems: ${problems.length ? problems.map((p) => `\n  - ${p}`).join("") : "none"}\n`);
    expect(problems).toEqual([]);
  });
}

test("Fast 3G: every role signs in and opens all its modules without errors", async ({ browser }) => {
  test.setTimeout(45 * 60_000);
  const lines = [];
  const failures = [];
  for (const account of ROLE_ACCOUNTS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const watcher = await watch(page);
    await throttle(page, PROFILES["Fast 3G"]);
    const { signIn: signInMs } = await signIn(page, `${account}@medlane.local`);
    const role = await page.locator("#user-popover-role").textContent();
    const sections = await visitAllSections(page);
    const problems = await watcher.check();
    lines.push(`- ${role} (${account}@): sign in ${fmt(signInMs)}, ${sections.length} modules, ${problems.length ? `PROBLEMS: ${problems.join("; ")}` : "no problems"}`);
    failures.push(...problems.map((p) => `${account}: ${p}`));
    await context.close();
  }
  report(`## Every role on Fast 3G\n${lines.join("\n")}\n`);
  expect(failures).toEqual([]);
});

test("Connection drops mid-save: change is kept and saved when it comes back", async ({ page, request }) => {
  test.setTimeout(15 * 60_000);
  // While offline the app is expected to say it couldn't save / will retry.
  const watcher = await watch(page, { allowToasts: [/queued for retry|pending save|offline|failed to fetch|will retry|save failed/i] });
  const net = await throttle(page, PROFILES["Fast 3G"]);
  await signIn(page, "admin@medlane.local");
  await page.locator('.nav-item[data-section="calendar"]').click();
  await page.locator("#calendar [data-calendar-add]").first().click();
  const title = `Offline check ${Date.now()}`;
  await page.fill("#calendar-event-title", title);
  page.__expectOffline = true;
  await net.offline();
  await page.locator('dialog[open] button[value="confirm"]').click();
  await page.waitForTimeout(8000);
  const offlineStatus = await page.locator("#save-status-text").textContent();
  await net.apply(PROFILES["Fast 3G"]);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  page.__expectOffline = false;
  await expect(page.locator("#save-status-text")).toHaveText(/Saved/, { timeout: 180_000 });
  // Confirm the server really has it.
  const login = await (await request.post("/api/auth/login", { data: { email: "admin@medlane.local", password: PASSWORD } })).json();
  const state = await (await request.get("/api/modules/state", { headers: { authorization: `Bearer ${login.session.access_token}`, "x-medlane-session-id": login.session.app_session_id } })).json();
  const saved = (state.data.calendarEvents || []).some((event) => event.title === title && !event.removed);
  const problems = await watcher.check();
  report(`## Connection drop during save\n- Status while offline: "${offlineStatus}"\n- Saved on the server after reconnecting: ${saved ? "yes" : "NO"}\n- Problems: ${problems.length ? problems.join("; ") : "none"}\n`);
  expect(saved).toBe(true);
  expect(problems).toEqual([]);
});

test("Opening the app with no connection fails gracefully and recovers", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const watcher = await watch(page, { allowToasts: [/offline|connection|network|failed to fetch|try again/i] });
  const net = await throttle(page, PROFILES["Fast 3G"]);
  await signIn(page, "accounting@medlane.local");
  page.__expectOffline = true;
  await net.offline();
  await page.reload().catch(() => {});
  await page.waitForTimeout(3000);
  await net.apply(PROFILES["Fast 3G"]);
  page.__expectOffline = false;
  await page.reload({ timeout: 300_000 });
  await expect(page.locator("body")).toHaveClass(/app-route/, { timeout: 300_000 });
  await expect(page.locator("#loading-overlay")).toHaveClass(/hide/, { timeout: 300_000 });
  const stillSignedIn = await page.locator("#user-popover-role").textContent();
  const problems = (await watcher.check()).filter((p) => !/uncaught: .*(Failed to fetch|NetworkError)/.test(p));
  report(`## Offline at page load\n- Back online → app loads, still signed in as: ${stillSignedIn}\n- Problems: ${problems.length ? problems.join("; ") : "none"}\n`);
  expect(problems).toEqual([]);
});

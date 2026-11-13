import { test, expect } from "@playwright/test";

const SECTIONS = ["dashboard", "calendar", "analytics", "masterlists", "inventory", "item-forecast", "sales", "purchase-orders", "invoicing", "collections", "receivables-tracker", "payables", "replenishments", "reports", "reconciliation", "warranty", "product-issues", "purchase-history", "imports", "users", "logs", "backup", "security", "settings", "print-templates"];
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (role, expiresInSeconds) => `${b64({ alg: "none" })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.fake`;

// Collects everything that should never happen on a healthy page.
async function watch(page) {
  const problems = [];
  const api = [];
  const local = (url) => !url || url.startsWith("http://127.0.0.1");
  await page.context().route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
  await page.routeWebSocket(/\/api\/live/, () => {});
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && local(message.location().url)) problems.push(`console: ${message.text()} (${message.location().url})`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    api.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    if (response.status() >= 400) problems.push(`api: ${response.request().method()} ${url.pathname} returned ${response.status()}`);
  });
  return { problems, api };
}

async function logIn(page, email = "superadmin@medlane.test") {
  await page.goto("/login");
  await page.fill("#login-email", email);
  await page.fill("#login-password", "fake-backend-accepts-anything");
  // Filling both fields can trigger the page's autofill sign-in, and a double submit is ignored.
  await page.locator("#login-form").evaluate((form) => { if (!form.dataset.submitting) form.requestSubmit(); });
  await page.waitForURL("**/dashboard*");
  await expect(page.locator("body")).toHaveClass(/app-route/);
}

const APP_SCRIPTS = /scripts\/(modules|state|api-client|ui-utils|events-bootstrap|game|config-data|vendor\/pdf-lib)/;
function trackScripts(page) {
  const loaded = [];
  page.on("request", (request) => { if (APP_SCRIPTS.test(request.url())) loaded.push(new URL(request.url()).pathname); });
  return loaded;
}

for (const url of ["/", "/?utm_source=facebook&fbclid=abc", "/#lr-journey"]) {
  test(`public visitor on ${url} downloads no app code and sees a working landing page`, async ({ page }) => {
    const { problems, api } = await watch(page);
    const appScripts = trackScripts(page);
    await page.goto(url);
    await expect(page.locator("#landing-page")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/public-landing/);
    await expect(page.locator("#login-screen")).toBeHidden();
    await expect(page.locator("#loading-overlay")).toHaveClass(/hide/);
    await page.waitForTimeout(1000);
    expect(appScripts).toEqual([]);
    expect(api).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("the app still loads for logins, invites and unrecognised links", async ({ page }) => {
  await watch(page);
  for (const url of ["/login", "/?login=1", "/?dashboard=1", "/?something=1"]) {
    const appScripts = trackScripts(page);
    await page.goto(url);
    await page.waitForTimeout(800);
    expect(appScripts.length, url).toBeGreaterThanOrEqual(7);
  }
  const appScripts = trackScripts(page);
  await page.goto(`/#access_token=${token("Superadmin", 3600)}&type=invite`);
  await page.waitForTimeout(800);
  expect(appScripts.length).toBeGreaterThanOrEqual(7);
  await expect(page.locator("#reset-new-password")).toBeVisible();
});

test("a logged-in user opening the home page still lands in the app", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/app-route/);
  await expect(page.locator("#page-title")).toHaveText("Dashboard");
  expect(problems).toEqual([]);
});

test("logged-out login page makes no API calls and shows no toast", async ({ page }) => {
  const { problems, api } = await watch(page);
  await page.goto("/login");
  await expect(page.locator("#login-email")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(api).toEqual([]);
  expect(problems).toEqual([]);
  await expect(page.getByText("session has expired")).toHaveCount(0);
});

test("logging in draws the dashboard and the parts shared by every page", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await expect(page.locator("#logout-top-button").locator("..")).toContainText("Fake Superadmin");
  await expect(page.locator("#page-title")).toHaveText("Dashboard");
  await expect(page.locator("#alerts-list .alert-item").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("every section opens without errors", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  const opened = [];
  for (const section of SECTIONS) {
    const link = page.locator(`.nav-item[data-section="${section}"]`);
    if (!(await link.count())) { problems.push(`no nav item for ${section}`); continue; }
    await link.evaluate((element) => element.click());
    await expect(page.locator(`section.section#${section}`), section).toHaveClass(/active/);
    await page.waitForTimeout(150);
    opened.push(section);
    if (problems.length) problems.push(`-- while on ${section}`);
  }
  expect(problems).toEqual([]);
  expect(opened).toEqual(SECTIONS);
});

test("a page reload stays logged in and on the same section", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await page.locator('.nav-item[data-section="invoicing"]').evaluate((element) => element.click());
  await page.reload();
  await expect(page.locator("section.section#invoicing")).toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test("logging out stops API calls and stays logged out after a reload", async ({ page }) => {
  const { problems, api } = await watch(page);
  await logIn(page);
  await page.waitForTimeout(1000);
  await page.locator("#logout-top-button").evaluate((element) => element.click());
  await expect(page.locator("#login-email")).toBeVisible();
  const before = api.length;
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.locator("#login-email")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(api.slice(before)).toEqual([]);
  expect(problems).toEqual([]);
});

test("an expired token renews without a single failed request", async ({ page }) => {
  const { problems, api } = await watch(page);
  await page.addInitScript((session) => {
    if (!localStorage.getItem("seeded")) {
      localStorage.setItem("seeded", "1");
      localStorage.setItem("medlane-api-session", JSON.stringify(session));
    }
  }, { access_token: token("Superadmin", -60), refresh_token: "refresh-Superadmin", app_session_id: "00000000-0000-4000-8000-000000000001" });
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveClass(/app-route/);
  await page.waitForTimeout(1000);
  expect(api[0]).toBe("POST /api/auth/refresh 200");
  expect(problems).toEqual([]);
});

test("a refused refresh token ends up on the login page", async ({ page }) => {
  await page.addInitScript((session) => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("medlane-api-session", JSON.stringify(session));
    }
  }, { access_token: token("Superadmin", -60), refresh_token: "refused", app_session_id: "00000000-0000-4000-8000-000000000001" });
  await page.goto("/dashboard");
  await expect(page.locator("#login-email")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("medlane-api-session"))).toBeNull();
});

for (const [role, reachable, blocked] of [
  ["logistics", "inventory", ["users", "payables"]],
  ["accounting", "payables", ["users", "backup"]],
]) {
  test(`${role} only reaches its own sections, without errors`, async ({ page }) => {
    const { problems } = await watch(page);
    await logIn(page, `${role}@medlane.test`);
    const visible = await page.locator(".nav-item:visible").evaluateAll((items) => items.map((item) => item.dataset.section));
    expect(visible).toContain(reachable);
    for (const section of blocked) expect(visible).not.toContain(section);
    for (const section of visible.filter(Boolean)) {
      await page.locator(`.nav-item[data-section="${section}"]`).evaluate((element) => element.click());
      await expect(page.locator(`section.section#${section}`), section).toHaveClass(/active/);
      await page.waitForTimeout(100);
    }
    expect(problems).toEqual([]);
  });
}

test("logging in only draws what's on screen, and skips the calls other sections make", async ({ page }) => {
  const { problems, api } = await watch(page);
  await logIn(page);
  await page.waitForTimeout(1000);
  expect(await page.locator("#inventory-stock-list").innerHTML()).not.toContain("Glucose Reagent");
  expect(api.filter((call) => /\/api\/(logs|files|backups) /.test(call) && !call.startsWith("POST"))).toEqual([]);
  expect(problems).toEqual([]);
});

// Each section is drawn on first open, so check it actually fills in with its own records.
for (const [section, selector, text] of [
  ["masterlists", "#masterlists", "Naga City Lab"],
  ["inventory", "#inventory", "Glucose Reagent"],
  ["sales", "#sales", "PO-1"], // opens on Sales orders (client POs); SI-1 is on the Invoices tab
  ["purchase-orders", "#purchase-orders", "Reagent Supply Co"], // supplier purchasing (client POs live in Sales → Sales orders)
  ["invoicing", "#invoicing", "SI-1"],
  ["collections", "#collections", "Naga City Lab"],
  ["payables", "#payables", "PAY-1"],
  ["replenishments", "#replenishments", "EXP-1"],
  ["reconciliation", "#reconciliation", "Client Docs"],
]) {
  test(`${section} shows its records the first time it's opened`, async ({ page }) => {
    const { problems } = await watch(page);
    await logIn(page);
    await page.locator(`.nav-item[data-section="${section}"]`).evaluate((element) => element.click());
    await expect(page.locator(selector)).toContainText(text);
    expect(problems).toEqual([]);
  });
  test(`${section} shows its records when it's the page you load`, async ({ page }) => {
    const { problems } = await watch(page);
    await logIn(page);
    await page.goto(`/dashboard?section=${section}`);
    await expect(page.locator(`section.section#${section}`)).toHaveClass(/active/);
    await expect(page.locator(selector)).toContainText(text);
    expect(problems).toEqual([]);
  });
}

test("a section's Workflow assistant appears the first time it's opened", async ({ page }) => {
  await watch(page);
  await logIn(page);
  await expect(page.locator("#sales")).not.toContainText("Workflow assistant");
  await page.locator('.nav-item[data-section="sales"]').evaluate((element) => element.click());
  await expect(page.locator("#sales")).toContainText("Workflow assistant");
});

test("the notification count shows on the dashboard without opening notifications", async ({ page }) => {
  await watch(page);
  await logIn(page);
  await expect(page.locator("#notification-count")).not.toBeEmpty();
});

test("the next person to log in on a tab gets their own page, not the last person's", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "superadmin@medlane.test");
  await page.locator("#logout-top-button").evaluate((element) => element.click());
  await expect(page.locator("#login-email")).toBeVisible();
  await logIn(page, "accounting@medlane.test");
  await expect(page.locator("#logout-top-button").locator("..")).toContainText("Fake Accounting");
  await expect(page.locator('.nav-item[data-section="users"]')).toBeHidden();
  expect(problems).toEqual([]);
});

test("reconciliation doesn't flag documents that were uploaded, even when opened first", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  const files = await page.evaluate(() => data.clients.flatMap((client) => requiredClientDocs.map((doc, index) => ({
    id: `${client.name}-${index}`, file_name: "doc.pdf", mime_type: "application/pdf", size_bytes: 1, record_type: "client-doc", record_id: clientDocRecordId(client.name, doc), uploaded_at: "2026-01-01",
  }))));
  await page.route("**/api/files", (route) => route.fulfill({ json: { files } }));
  await page.goto("/dashboard?section=reconciliation");
  await expect(page.locator("section.section#reconciliation")).toHaveClass(/active/);
  await expect(page.locator("#reconciliation")).not.toContainText("Client Docs");
  expect(problems).toEqual([]);
});

const PDF_LIB = "**/scripts/vendor/pdf-lib.min.js";
const makeBir2307 = (page) => page.evaluate(async () => {
  const pdf = await generateBir2307Pdf({ id: "PAY-1", supplier: "Reagent Supply Co", date: "2026-11-01", amount: 5000, grossAmount: 5000, withholdingTax1: 50 });
  return pdf === undefined ? "no result" : "made";
});

test("the PDF tool isn't downloaded until a 2307 is made, then only once", async ({ page }) => {
  const { problems } = await watch(page);
  const requests = [];
  page.on("request", (request) => { if (request.url().includes("pdf-lib")) requests.push(request.url()); });
  await logIn(page);
  await page.waitForTimeout(1000);
  expect(requests).toEqual([]);
  await makeBir2307(page);
  await makeBir2307(page);
  expect(requests.length).toBe(1);
  expect(problems).toEqual([]);
});

test("a failed PDF tool download explains itself and the next try works", async ({ page }) => {
  await watch(page);
  await logIn(page);
  await page.route(PDF_LIB, (route) => route.abort());
  await expect(makeBir2307(page)).rejects.toThrow(/Could not load the PDF tool/);
  await page.unroute(PDF_LIB);
  await makeBir2307(page);
});

test("every partner links to its own site in a new tab, and every logo loads", async ({ page }) => {
  const { problems } = await watch(page);
  await page.goto("/");
  const partners = page.locator("#lr-partners .lr-partner");
  await partners.last().scrollIntoViewIfNeeded();
  const found = await partners.evaluateAll((links) => links.map((link) => [link.getAttribute("aria-label").split(" website")[0], link.getAttribute("href"), link.target, link.rel]));
  expect(found).toEqual([
    ["Balio Diagnostics", "https://baliodiagnostics.com/"], ["Cypress Diagnostics", "https://diagnostics.be/"], ["iMedikers", "http://i-medikers.com/"], ["iMediSync", "https://www.imedisync.com/"],
    ["Lifotronic", "https://en.lifotronic.com/"], ["VedaLab", "https://www.vedalab.com/"], ["Zybio", "https://www.zybio.com/"],
  ].map((partner) => [...partner, "_blank", "noopener noreferrer"]));
  const logos = page.locator("#lr-partners img");
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect.poll(() => logo.evaluate((image) => image.complete && image.naturalWidth > 0), await logo.getAttribute("alt")).toBe(true);
  }
  await expect(logos).toHaveCount(7);
  await expect(page.locator("#lr-partners .lr-partner-grid li").last()).toHaveCSS("opacity", "1");
  expect(problems).toEqual([]);
});

test("partner tiles are visible straight away for people who turn off animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watch(page);
  await page.goto("/");
  await page.locator("#lr-partners").scrollIntoViewIfNeeded();
  await expect(page.locator("#lr-partners .lr-partner-grid li").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("#lr-partners .lr-partner-grid li").first()).toHaveCSS("animation-name", "none");
});

test("the navbar's Partners link goes to the partners section and lights up there", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await watch(page);
  await page.goto("/");
  const link = page.locator('.lr-nav-links a[href="#lr-partners"]');
  await link.click();
  await expect(page.locator("#lr-partners")).toBeInViewport();
  await expect(link).toHaveClass(/is-active/);
});

test("every report opens from the hub and its card agrees with its page", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await page.goto("/dashboard?section=reports");
  await expect(page.locator("#report-grid .rh-card")).toHaveCount(13);

  const cardFigure = await page.locator('.rh-card:has([data-operational-report="collections-ar"]) .rh-figure-value').textContent();
  await page.locator('.rh-card [data-operational-report="collections-ar"]').click();
  await expect(page.locator("#report-detail")).toHaveClass(/active/);
  const outstanding = (await page.locator("#report-detail-kpis .rd-kpi").nth(1).locator("strong").textContent()).replace(/[₱,]/g, "");
  expect(cardFigure).toBe(await page.evaluate((value) => pesoCompact(Number(value)), outstanding));

  // A filter picked in one report must not carry over into the next one.
  await page.selectOption("#report-detail-status-filter", { index: 1 });
  await page.locator("#report-detail .rd-back").click();
  await page.locator('.rh-card [data-operational-report="supplier-payables"]').click();
  await expect(page.locator("#report-detail-status-filter")).toHaveValue("");

  const reports = await page.evaluate(() => ({ operational: Object.keys(operationalReports), sales: Object.keys(salesBreakdownDimensions) }));
  for (const key of reports.operational) {
    await page.locator("#report-detail .rd-back").click();
    await page.locator(`.rh-card [data-operational-report="${key}"]`).click();
    await expect(page.locator("#report-detail-title")).toHaveText(await page.evaluate((k) => operationalReports[k].title, key));
    await expect(page.locator("#report-detail-table-count")).toHaveText(/record/);
  }
  await page.locator("#report-detail .rd-back").click();
  for (const key of reports.sales) {
    await page.locator(`.rh-card [data-sales-breakdown="${key}"]`).click();
    await expect(page.locator("#sales-breakdown-detail")).toHaveClass(/active/);
    await expect(page.locator("#sales-breakdown-table-count")).toHaveText(/record/);
    await page.locator("#sales-breakdown-detail .rd-back").click();
  }
  expect(problems).toEqual([]);
});

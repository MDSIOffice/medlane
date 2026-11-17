import { test, expect } from "@playwright/test";

const SECTIONS = ["dashboard", "calendar", "analytics", "masterlists", "inventory", "item-forecast", "sales", "purchase-orders", "invoicing", "collections", "receivables-tracker", "payables", "replenishments", "reports", "reconciliation", "warranty", "product-issues", "purchase-history", "imports", "users", "logs", "backup", "security", "print-templates"];
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

async function logIn(page, email = "superadmin@medlane.test", { stayOnWelcome = false } = {}) {
  await page.goto("/login");
  await page.fill("#login-email", email);
  await page.fill("#login-password", "fake-backend-accepts-anything");
  // Filling both fields can trigger the page's autofill sign-in, and a double submit is ignored.
  await page.locator("#login-form").evaluate((form) => { if (!form.dataset.submitting) form.requestSubmit(); });
  await page.waitForURL("**/dashboard*");
  await expect(page.locator("body")).toHaveClass(/app-route/);
  // Every sign-in opens on the Welcome screen; continue past it like a person would.
  await expect(page.locator("#welcome-screen")).toBeVisible();
  if (stayOnWelcome) return;
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page.locator("#welcome-screen")).toBeHidden();
}

const APP_SCRIPTS = /scripts\/(modules|state|api-client|ui-utils|events-bootstrap|recon-page|masterlists-page|game|config-data|vendor\/pdf-lib)/;
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
  await expect(page.locator("#dashboard .ui-kpi").first()).toBeVisible();
  await expect(page.locator("#dashboard")).toContainText("Needs attention today");
  await expect(page.locator(".nav-item").first()).toHaveAttribute("data-section", "dashboard");
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

test("supplier POs open inside Inventory", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await page.goto("/dashboard?section=inventory&tab=purchasing");
  await expect(page.locator("#inventory-purchasing")).toBeVisible();
  await expect(page.locator("#inventory-purchasing")).toContainText("Reagent Supply Co");
  expect(problems).toEqual([]);
});

// Each section is drawn on first open, so check it actually fills in with its own records.
for (const [section, selector, text] of [
  ["masterlists", "#masterlists", "Records complete"], // opens on Overview
  ["inventory", "#inventory", "Glucose Reagent"],
  ["sales", "#sales", "PO-1"], // opens on Sales orders (client POs); SI-1 is on the Invoices tab
  ["purchase-orders", "#purchase-orders", "PO-1"], // client POs (sales & invoicing); supplier POs are Inventory → Supplier POs
  ["invoicing", "#invoicing", "SI-1"],
  ["collections", "#collections", "Naga City Lab"],
  ["payables", "#payables", "PAY-1"],
  ["replenishments", "#replenishments", "EXP-1"],
  ["reconciliation", "#reconciliation", "Checks passed"], // results come from the fake /api/recon (real checks over the seed)
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
    ["Cypress Diagnostics", "https://diagnostics.be/"], ["Eaglenos", "https://www.eaglenos.com/en/"], ["iMedikers", "http://i-medikers.com/"], ["iMediSync", "https://www.imedisync.com/"],
    ["Lifotronic", "https://en.lifotronic.com/"], ["VedaLab", "https://www.vedalab.com/"], ["YD Diagnostics", "http://yd-diagnostics.com/2012/eng/"], ["Zybio", "https://www.zybio.com/"],
  ].map((partner) => [...partner, "_blank", "noopener noreferrer"]));
  const logos = page.locator("#lr-partners img");
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect.poll(() => logo.evaluate((image) => image.complete && image.naturalWidth > 0), await logo.getAttribute("alt")).toBe(true);
  }
  await expect(logos).toHaveCount(8);
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

for (const [email, heading] of [["superadmin@medlane.test", "Needs you today"], ["sales@medlane.test", "Your day"], ["logistics@medlane.test", "Your day"], ["accounting@medlane.test", "Needs you today"]]) {
  test(`${email.split("@")[0]} gets the Welcome screen after signing in, and Enter continues`, async ({ page }) => {
    const { problems } = await watch(page);
    await logIn(page, email, { stayOnWelcome: true });
    const screen = page.locator("#welcome-screen");
    await expect(screen.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), \S+\.$/);
    await expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    await expect(screen.locator(".wl-action")).toHaveCount(4);
    await expect(screen.getByRole("button", { name: "Continue to dashboard" })).toBeFocused();
    // Keyboard focus stays inside it: the app behind is inert.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#welcome-screen")) || document.activeElement === document.body)).toBe(true);
    }
    await page.locator(".wl-greeting").click();
    await page.keyboard.press("Enter");
    await expect(screen).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-active-section", "dashboard");
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/app-route/);
    await page.waitForTimeout(800);
    await expect(screen).toBeHidden();
    expect(problems).toEqual([]);
  });
}

test("a Welcome quick action closes it and opens that page", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "logistics@medlane.test", { stayOnWelcome: true });
  await page.locator("#welcome-screen .wl-action").first().click();
  await expect(page.locator("#welcome-screen")).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-active-section", "inventory");
  expect(problems).toEqual([]);
});

test("with reduced motion the loader shows a still logo and only the bar moves", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/login");
  const styles = await page.evaluate(() => {
    const get = (/** @type {string} */ sel, /** @type {string} */ prop) => getComputedStyle(/** @type {Element} */ (document.querySelector(sel))).getPropertyValue(prop);
    return { draw: get(".app-loader .ml-logo-fill", "animation-name"), dash: get(".app-loader .ml-logo-fill", "clip-path"), pulse: get(".app-loader .ml-tile", "animation-name"), ring: get(".app-loader .ml-ring", "display"), bar: get(".app-loader-bar span", "animation-name"), barTime: get(".app-loader-bar span", "animation-duration") };
  });
  expect(styles).toEqual({ draw: "none", dash: "none", pulse: "none", ring: "none", bar: "ml-bar", barTime: "3s" });
  await expect(page.locator("#loading-overlay")).toHaveAttribute("role", "status");
  await expect(page.locator("#loading-overlay")).toHaveAttribute("aria-live", "polite");
  await context.close();
});

test("marking a collection deposited records the company bank it went into", async ({ page }) => {
  const { problems } = await watch(page);
  await page.route("**/api/modules/state", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.banks = [{ name: "BDO", account: "0012-3456-78" }, { name: "Metrobank", account: "777-1" }];
    await route.fulfill({ response, json: body });
  });
  /** @type {any[]} */
  const saved = [];
  // The real server answers a save with ok: true.
  await page.route("**/api/modules/records", async (route) => { saved.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true, revision: 2 } }); });
  await logIn(page);
  await page.evaluate(() => { /** @type {any} */ (window).updateCollectionPaymentStatus("OR-1", "Deposited"); });
  const dialog = page.locator("dialog[open]").filter({ has: page.locator("#deposit-bank") });
  await expect(dialog.getByRole("heading")).toHaveText("Mark OR-1 deposited");
  // It won't go through without a bank.
  await dialog.getByRole("button", { name: "Mark deposited" }).click();
  await expect(dialog).toBeVisible();
  await dialog.locator("#deposit-bank").selectOption("Metrobank");
  await dialog.getByRole("button", { name: "Mark deposited" }).click();
  await expect(page.locator("#toast")).toContainText("OR-1 marked Deposited to Metrobank");
  expect(JSON.stringify(saved)).toContain('"depositBank":"Metrobank"');
  expect(JSON.stringify(saved)).toContain('"depositBankAccount":"777-1"');
  await page.evaluate(() => /** @type {any} */ (window).showSection("collections"));
  await expect(page.locator("#collections")).toContainText("Deposited to Metrobank · 777-1");
  expect(problems).toEqual([]);
});

// A fast-moving item: 180 units delivered in the last 90 days (2 a day), only 10 on hand and
// nothing on order, so it must be "Order now" with a reorder point of 2 × (14 lead + 14 safety) = 56.
function withFastItem(body) {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const d = body.data;
  d.items.push({ code: "CBC-9", name: "CBC Diluent", brand: "Medlane", uom: "box", price: 800, cost: 500, category: "Reagent", minLevel: 20, archived: false });
  d.inventory.push({ code: "CBC-9", item: "CBC Diluent", brand: "Medlane", branch: "Las Pinas", lot: "C1", expiry: day(200), qty: 10, min: 20 });
  for (let i = 0; i < 6; i += 1) d.sales.push({ id: `SI-F${i}`, documentNo: `SI-F${i}`, type: "SI", client: "Naga City Lab", area: "Naga", po: "", noPo: true, date: day(-5 - i * 12), terms: 30, salesperson: "Fake Sales", lines: [{ item: "CBC Diluent", code: "CBC-9", qty: 30, price: 800, lot: "C1" }], qty: 30, amount: 24000, discount: 0, net: 24000, paid: 24000, status: "Active" });
  return body;
}

test("Item Forecast flags a fast mover, shows the calculation and pre-fills a draft PO without saving", async ({ page }) => {
  const { problems } = await watch(page);
  await page.route("**/api/modules/state", async (route) => { const response = await route.fetch(); await route.fulfill({ response, json: withFastItem(await response.json()) }); });
  const saves = [];
  await page.route("**/api/modules/records", async (route) => { saves.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true, revision: 2 } }); });
  await logIn(page);
  await page.evaluate(() => /** @type {any} */ (window).showSection("item-forecast"));
  const section = page.locator("#item-forecast");
  for (const tab of ["Overview", "Reorder list", "All items", "Expiry risk"]) await expect(section.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  await expect(section.locator(".ui-kpi").first()).toContainText("Order now");
  await expect(section.locator(".ui-kpi").first()).toContainText("1");
  await expect(section).toContainText("Usage, last 6 months");
  await section.getByRole("tab", { name: /Reorder list/ }).click();
  await section.getByRole("button", { name: "CBC Diluent" }).first().click();
  const detail = section.locator(".ui-detail-head").locator("..");
  await expect(detail).toContainText("How it’s calculated");
  await expect(detail).toContainText("Order now");
  await expect(detail).toContainText("56"); // reorder point
  // Order up to = ceil(2 × (14 + 60) + 28) = 176; available 10 → suggest 166.
  await expect(detail).toContainText("166");
  await section.getByRole("button", { name: "Create PO from list" }).first().click();
  const form = page.locator("#demo-modal");
  await expect(form).toBeVisible();
  // Only one supplier has items to order, so the form opens straight away for it.
  await expect(form.locator("#supplier")).toHaveValue("Reagent Supply Co");
  await expect(form).toContainText("CBC Diluent");
  // Opening the form writes no purchase order (the app's own notification sync may still save).
  expect(JSON.stringify(saves)).not.toContain("inventoryPurchaseOrders");
  expect(problems).toEqual([]);
});

test("Item Forecast settings are only offered to Superadmin and CEO", async ({ page }) => {
  await watch(page);
  await logIn(page);
  await page.evaluate(() => /** @type {any} */ (window).showSection("item-forecast"));
  await expect(page.locator("#forecast-actions")).toContainText("Forecast settings");
  // currentUser is a top-level `let`, reachable by name from page scripts.
  const allowed = await page.evaluate(() => { const was = currentUser.role; currentUser.role = "Logistics"; const ok = forecastCanEditSettings(); currentUser.role = was; return ok; });
  expect(allowed).toBe(false);
});

test("the Dashboard task list and All tasks tab come from the module rules and open the record", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  const dash = page.locator("#dashboard");
  await expect(dash).toContainText("Cash: next 4 weeks");
  await expect(dash).toContainText("Modules at a glance");
  await expect(dash).toContainText("Coming up");
  const firstTask = dash.locator(".dash-tasks li").first();
  await expect(firstTask).toBeVisible();
  await dash.getByRole("tab", { name: /All tasks/ }).click();
  await expect(dash.locator("table thead")).toContainText("Owner");
  const rows = dash.locator("table tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  // Each task's action goes to the page where it's handled.
  await rows.first().locator("[data-dash-task]").click();
  await expect(page.locator("body")).not.toHaveAttribute("data-active-section", "dashboard");
  expect(problems).toEqual([]);
});

// Records every audio.play() call and the moment the Welcome intro class appears.
async function spyOnIntro(page, { blockAutoplay = false } = {}) {
  await page.addInitScript((block) => {
    const w = /** @type {any} */ (window);
    w.__plays = [];
    w.__introAt = null;
    w.__unmutedAt = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.__watchMute) { this.__watchMute = true; this.addEventListener("volumechange", () => { if (!this.muted && /welcome-glass-arpeggio/.test(decodeURIComponent(this.src))) w.__unmutedAt.push(performance.now()); }); }
      w.__plays.push({ src: decodeURIComponent(this.src), at: performance.now(), muted: this.muted, el: this, intro: document.getElementById("welcome-screen")?.classList.contains("wl-intro") || false });
      return block ? Promise.reject(new DOMException("blocked", "NotAllowedError")) : play.call(this).catch(() => null);
    };
    new MutationObserver(() => { const s = document.getElementById("welcome-screen"); if (s?.classList.contains("wl-intro") && w.__introAt === null) w.__introAt = performance.now(); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }, blockAutoplay);
}
// Audible plays of the Welcome sound (the muted play during Sign in only unlocks it for Safari).
const startupPlays = (page) => page.evaluate(() => /** @type {any} */ (window).__plays.filter((p) => /\/sounds\/welcome-glass-arpeggio\.(webm|mp3)$/.test(p.src) && !p.muted).map(({ el, ...p }) => p));

test("the Welcome intro starts with the sign-in sound, counts up to the exact numbers and plays once", async ({ page }) => {
  const { problems } = await watch(page);
  await spyOnIntro(page);
  await logIn(page, "superadmin@medlane.test", { stayOnWelcome: true });
  const screen = page.locator("#welcome-screen");
  await expect(screen).toHaveClass(/wl-intro/);
  // The Safari unlock on "Sign in" stays muted: it's only unmuted when the intro starts (an earlier
  // unmute raced the pause in Safari and played the sound twice).
  const timing = await page.evaluate(() => ({ unmuted: /** @type {any} */ (window).__unmutedAt, intro: /** @type {any} */ (window).__introAt }));
  for (const at of timing.unmuted) expect(at).toBeGreaterThanOrEqual(timing.intro);
  // The sound starts in the same call that adds the intro class.
  const plays = await startupPlays(page);
  expect(plays.length).toBe(1);
  expect(plays[0].intro).toBe(true);
  expect(Math.abs(plays[0].at - await page.evaluate(() => /** @type {any} */ (window).__introAt))).toBeLessThan(20);
  // Screen readers get the whole greeting as one sentence.
  await expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("aria-label", /^Good (morning|afternoon|evening), \S+\.$/);
  // Mid-count the numbers are moving; by the end each one is exactly its real value.
  await page.waitForTimeout(2300);
  const counts = await page.evaluate(() => [...document.querySelectorAll("[data-wl-count]")].map((el) => [el.textContent, el.nextElementSibling?.textContent]));
  expect(counts.length).toBeGreaterThan(0);
  for (const [shown, exact] of counts) expect(shown).toBe(exact);
  // The class comes off once the sequence ends, and nothing replays it.
  await expect(screen).not.toHaveClass(/wl-intro/, { timeout: 3000 });
  expect((await startupPlays(page)).length).toBe(1);
  expect(problems).toEqual([]);
});

test("Continue works mid-animation, and the sound fades out instead of playing on", async ({ page }) => {
  await watch(page);
  await spyOnIntro(page);
  await logIn(page, "accounting@medlane.test", { stayOnWelcome: true });
  await expect(page.locator("#welcome-screen")).toHaveClass(/wl-intro/);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await expect(page.locator("#welcome-screen")).toBeHidden();
  // Chrome gets the WebM; it's stopped (after a 150ms fade) and rewound, never left playing.
  const sound = () => page.evaluate(() => { const p = /** @type {any} */ (window).__plays.filter((x) => !x.muted && /welcome-glass-arpeggio/.test(x.src)).pop(); return p ? { src: p.src, paused: p.el.paused, time: p.el.currentTime, loop: p.el.loop } : null; });
  expect((await sound())?.src).toMatch(/welcome-glass-arpeggio\.webm$/);
  await expect.poll(async () => (await sound())?.paused, { timeout: 1000 }).toBe(true);
  expect((await sound())?.time).toBe(0);
  expect((await sound())?.loop).toBe(false);
});

test("with Sound effects off the Welcome intro runs silently and the sound file is never downloaded", async ({ page }) => {
  const { problems } = await watch(page);
  await spyOnIntro(page);
  // Turn Sound effects off on Account settings, then sign out and back in.
  await logIn(page, "sales@medlane.test");
  await page.goto("/dashboard?section=user-settings&tab=preferences");
  await page.getByRole("switch", { name: "Sound effects" }).click();
  await expect(page.getByRole("switch", { name: "Sound effects" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#account-flash")).toContainText("Saved");
  await page.click("#user-menu-toggle");
  await page.click("#logout-top-button");
  await page.waitForURL("**/login*");
  const fetched = [];
  page.on("request", (request) => { if (/welcome-glass-arpeggio/.test(request.url())) fetched.push(request.url()); });
  await page.evaluate(() => { /** @type {any} */ (window).__plays = []; });
  await logIn(page, "sales@medlane.test", { stayOnWelcome: true });
  await expect(page.locator("#welcome-screen")).toHaveClass(/wl-intro/);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => /** @type {any} */ (window).__plays.filter((p) => /arpeggio/.test(p.src)).length)).toBe(0);
  expect(fetched).toEqual([]);
  expect(problems).toEqual([]);
});

test("with autoplay blocked the Welcome intro still runs and the sound isn't retried", async ({ page }) => {
  const { problems } = await watch(page);
  await spyOnIntro(page, { blockAutoplay: true });
  await logIn(page, "logistics@medlane.test", { stayOnWelcome: true });
  await expect(page.locator("#welcome-screen")).toHaveClass(/wl-intro/);
  await expect(page.locator("#welcome-screen")).not.toHaveClass(/wl-intro/, { timeout: 5000 });
  expect((await startupPlays(page)).length).toBe(1);
  expect(problems).toEqual([]);
});

test("with reduced motion the Welcome screen shows final values at once, still with the sound", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await watch(page);
  await spyOnIntro(page);
  await logIn(page, "superadmin@medlane.test", { stayOnWelcome: true });
  const screen = page.locator("#welcome-screen");
  await expect(screen.locator(".wl-row").first()).toBeVisible();
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    cls: document.getElementById("welcome-screen")?.className,
    animations: [".wl-row", ".wl-tasks", ".wl-continue", ".wl-wi", ".wl-stats"].map((sel) => getComputedStyle(/** @type {Element} */ (document.querySelector(sel))).animationName),
    counts: [...document.querySelectorAll("[data-wl-count]")].map((el) => el.textContent === el.nextElementSibling?.textContent),
  }));
  expect(state.cls).not.toMatch(/wl-intro|wl-pending/);
  expect(state.animations).toEqual(["none", "none", "none", "none", "none"]);
  expect(state.counts.every(Boolean)).toBe(true);
  expect((await startupPlays(page)).length).toBe(1);
  await context.close();
});

test("Add Collection: the bank field reads Bank Cheque Name for Multiple Cheques and lists the company banks", async ({ page }) => {
  const { problems } = await watch(page);
  await page.route("**/api/modules/state", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.banks = [{ name: "BDO", account: "0012-3456-78" }, { name: "Metrobank", account: "777-1" }];
    await route.fulfill({ response, json: body });
  });
  await logIn(page);
  await page.evaluate(() => openModal("paymentRequest"));
  const label = page.locator("label[for='bank']");
  await page.locator("#paymentType").selectOption("Multiple Cheques");
  await expect(label).toHaveText("Bank Cheque Name");
  await expect(page.locator("#bank option")).toContainText(["BDO", "Metrobank"]);
  await page.locator("#paymentType").selectOption("Check");
  await expect(label).toHaveText("Bank Name");
  expect(problems).toEqual([]);
});

test("Collections: saved without approval; only Admin bounces or cancels; Accounting redeposits", async ({ browser }) => {
  const seed = async (page) => page.route("**/api/modules/state", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.sales.push({ id: "SI-COLL", documentNo: "SI-COLL", type: "SI", client: "Naga City Lab", date: "2026-11-01", terms: 30, lines: [], amount: 10000, discount: 0, net: 10000, paid: 0, status: "Active" });
    body.data.paymentRequests.push({ cvNo: "CR-BNC", employee: "Naga City Lab", invoice: "SI-COLL", invoices: ["SI-COLL"], paymentType: "Check", bank: "BDO", cheque: "111", total: 1000, requestStatus: "Approved", status: "Approved", date: "2026-11-10", items: [{ invoice: "SI-COLL", amount: 1000, netAmount: 1000 }] });
    body.data.payments.push({ id: "CR-BNC|SI-COLL", receiptNo: "CR-BNC", paymentRequestCvNo: "CR-BNC", invoice: "SI-COLL", client: "Naga City Lab", method: "Check", amount: 1000, collectionStatus: "Bounced", appliedToInvoice: false, date: "2026-11-10" });
    await route.fulfill({ response, json: body });
  });
  const actionsFor = (page, cv) => page.evaluate((id) => [].concat(collectionReceiptActions(collectionReceipts().find((r) => r.id === id))).join(""), cv);

  const accounting = await browser.newPage();
  await seed(accounting);
  await logIn(accounting, "accounting@medlane.test");
  // A new collection is applied straight away: no Pending, payment For Deposit, invoice paid.
  const saved = await accounting.evaluate(() => {
    const request = { cvNo: "CR-NEW", employee: "Naga City Lab", invoice: "SI-COLL", invoices: ["SI-COLL"], paymentType: "Cash", total: 4000, requestStatus: "Pending", items: [{ invoice: "SI-COLL", amount: 4000, netAmount: 4000 }] };
    const plan = collectionApplyPlan(request);
    if (plan.error !== undefined) return plan.error;
    const { newPayments } = collectionApply(request, plan);
    return { status: request.requestStatus, payment: newPayments.map((p) => p.collectionStatus), paid: data.sales.find((s) => s.id === "SI-COLL").paid };
  });
  expect(saved).toEqual({ status: "Approved", payment: ["For Deposit"], paid: 4000 });
  const bouncedActions = await actionsFor(accounting, "CR-BNC");
  expect(bouncedActions).toContain("data-collection-redeposit");
  expect(bouncedActions).not.toContain("data-payment-request-cancel");
  expect(bouncedActions).not.toContain(":Bounced");
  await accounting.close();

  const admin = await browser.newPage();
  await seed(admin);
  await logIn(admin, "admin@medlane.test");
  await admin.evaluate(() => { data.payments.find((p) => p.id === "CR-BNC|SI-COLL").collectionStatus = "For Deposit"; });
  const adminActions = await actionsFor(admin, "CR-BNC");
  expect(adminActions).toContain(":Bounced");
  expect(adminActions).toContain("data-payment-request-cancel");
  // Deposited is not final: Admin can still mark it Bounced or cancel the collection.
  await admin.evaluate(() => { data.payments.find((p) => p.id === "CR-BNC|SI-COLL").collectionStatus = "Deposited"; const r = data.paymentRequests.find((x) => x.cvNo === "CR-BNC"); r.requestStatus = r.status = "Completed"; });
  const depositedActions = await actionsFor(admin, "CR-BNC");
  expect(depositedActions).toContain("CR-BNC:Bounced");
  expect(depositedActions).toContain("data-payment-request-cancel");
  await admin.close();
});

test("Notifications: tabs with counts, day groups, mark read, mark all read for the tab, and the bell follows", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=notifications");
  const panel = page.locator("#ntf-panel");
  await expect(panel.locator(".ntf-row").first()).toBeVisible();
  await expect(panel.locator(".ntf-group-title").first()).toHaveText("Today");
  const tabs = page.locator("#ntf-tabs");
  await expect(tabs.getByRole("tab", { name: /^All/ })).toBeVisible();
  for (const name of ["Unread", "Approvals", "Stock", "Money", "Service", "Security"]) await expect(tabs.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();
  const bell = page.locator("#notification-count");
  const unreadBefore = Number(await bell.textContent().then((t) => (t === "9+" ? 99 : t)));
  // Mark one read: its dot goes, and the Unread tab count drops by one.
  const unreadTab = tabs.getByRole("tab", { name: /^Unread/ });
  const countOf = async () => Number(await unreadTab.locator(".ui-count").textContent());
  const before = await countOf();
  const firstUnread = panel.locator(".ntf-row.unread").first();
  const id = await firstUnread.getAttribute("data-ntf-id");
  await firstUnread.getByRole("button", { name: /^Mark read/ }).click();
  await expect(panel.locator(`.ntf-row[data-ntf-id="${id}"]`)).not.toHaveClass(/unread/);
  await expect.poll(countOf).toBe(before - 1);
  // Security tab, then "Mark all security read" clears just that tab.
  await tabs.getByRole("tab", { name: /^Security/ }).click();
  await expect(page).toHaveURL(/tab=security/);
  await page.getByRole("button", { name: "Mark all security read" }).click();
  await expect(panel.locator(".ntf-row.unread")).toHaveCount(0);
  await tabs.getByRole("tab", { name: /^All/ }).click();
  await expect(panel.locator(".ntf-row.unread").first()).toBeVisible();
  if (unreadBefore < 99) await expect.poll(async () => Number(await bell.textContent())).toBeLessThan(unreadBefore);
  // Rows per page changes the server page size.
  await page.locator('[data-ntf-size="25"]').click();
  await expect(page.locator('[data-ntf-size="25"]')).toHaveAttribute("aria-pressed", "true");
  expect(problems).toEqual([]);
});

test("the bell opens Notifications", async ({ page }) => {
  await watch(page);
  await logIn(page, "accounting@medlane.test");
  await page.click("#notification-toggle");
  await expect(page.locator("#notifications.active")).toBeVisible();
  await expect(page.locator("#ntf-panel .ntf-row").first()).toBeVisible();
});

test("Activity log: Superadmin sees everyone, tabs filter, detail shows before → after, Filter by user", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=users");
  await page.locator("#users").getByRole("button", { name: "Activity log" }).click();
  await expect(page.locator("#activity-log.active")).toBeVisible();
  const panel = page.locator("#act-panel");
  await expect(panel.locator("tbody tr").first()).toBeVisible();
  for (const name of ["All activity", "Changes", "Approvals", "Sign-ins", "Exports & access", "Flagged"]) await expect(page.locator("#act-tabs").getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(page.locator("#act-stats")).toContainText("Flagged · last 7 days");
  // Flagged: the new-device sign-in, the void, the reason-less stock change, the client export.
  await page.locator("#act-tabs").getByRole("tab", { name: /^Flagged/ }).click();
  await expect(page).toHaveURL(/tab=flagged/);
  await expect(panel).toContainText("Exported clients CSV");
  await expect(panel).toContainText("Voided invoice");
  // Detail: before → after, then narrow to one person.
  await page.locator("#act-tabs").getByRole("tab", { name: /^All activity/ }).click();
  await panel.getByRole("row").filter({ hasText: "OR-77310" }).locator("[data-act-select]").click();
  const detail = page.locator("#activity-detail");
  await expect(detail).toContainText("₱48,000.00");
  await expect(detail).toContainText("₱84,000.00");
  await detail.getByRole("button", { name: /^Filter by Joy/ }).click();
  await expect(page).toHaveURL(/user=Joy/);
  await expect(panel.locator("tbody tr")).not.toHaveCount(0);
  for (const name of await panel.locator("tbody tr td:nth-child(2) .ui-strong").allTextContents()) expect(name).toBe("Joy Santos");
  // Search runs on the server.
  await panel.getByRole("button", { name: /Stop filtering/ }).click();
  await page.fill("#act-search", "SI-0004812");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("Activity log: other roles see only their own, from Account settings → View my activity", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "sales@medlane.test");
  await page.goto("/dashboard?section=user-settings");
  await page.getByRole("button", { name: "View my activity" }).click();
  await expect(page.locator("#activity-log.active")).toBeVisible();
  const panel = page.locator("#act-panel");
  await expect(panel.locator("tbody tr").first()).toBeVisible();
  for (const name of await panel.locator("tbody tr td:nth-child(2) .ui-strong").allTextContents()) expect(name).toBe("Ana Cruz");
  await expect(page.locator("#act-desc")).toContainText("Your own");
  expect(problems).toEqual([]);
});

// Support Tracker: records saved through POST /api/modules/records, captured from the page.
function captureSaves(page) {
  const saves = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/modules/records") saves.push(JSON.parse(request.postData() || "{}").records || {});
  });
  return saves;
}
const savedTicket = (saves, id) => saves.map((records) => (records.productIssues || []).find((r) => r.id === id)).filter(Boolean).pop();

test("Support Tracker: overview, the breached ticket first, assign the branch engineer, a reply stops the clock", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=product-issues");
  const panel = page.locator("#support-tab-panel");
  await expect(panel.locator(".ui-kpi").first()).toContainText("Open tickets");
  for (const label of ["Analyzers down", "Response time met", "Fixed on first visit"]) await expect(panel).toContainText(label);
  await expect(panel).toContainText("Needs action now");
  await expect(panel).toContainText("TSR-0146 · Sample Clinic B");
  await expect(panel).toContainText("Repeat problems");
  await expect(page.locator(".workflow-assist")).toHaveCount(0);
  for (const name of ["Overview", "Open tickets", "Engineers", "Resolved"]) await expect(page.locator("#support-tabs").getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();

  await page.locator("#support-tabs").getByRole("tab", { name: /^Open tickets/ }).click();
  await expect(page).toHaveURL(/tab=open/);
  const first = panel.locator("tbody tr").first();
  await expect(first).toContainText("TSR-0146");
  await expect(first).toContainText("Breached");
  await first.locator("[data-support-select]").click();
  const detail = page.locator("#support-detail");
  await expect(detail).toContainText("No response yet");

  // Assign: the branch engineer is suggested.
  await detail.getByRole("button", { name: "Assign engineer" }).click();
  const dialog = page.locator("dialog.sup-dialog");
  await expect(dialog.locator("#sup-engineer option:checked")).toContainText("Engineer 1 · Las Piñas");
  await expect(dialog.locator("#sup-engineer option:checked")).toContainText("(suggested)");
  await dialog.getByRole("button", { name: "Assign" }).click();
  await expect.poll(() => savedTicket(saves, "TSR-0146")?.engineerEmail).toBe("engineering@medlane.test");
  expect(savedTicket(saves, "TSR-0146")).toMatchObject({ ticketStatus: "Assigned", currentActor: "Engineering" });
  await expect(detail).toContainText("Assigned to Engineer 1");

  // A reply stops the response clock.
  await detail.getByRole("button", { name: "Log reply / update" }).click();
  await expect(dialog.locator('input[name="reply"]')).toBeChecked();
  await dialog.locator("#sup-note").fill("Called the clinic; cleaning the barcode reader window.");
  await dialog.getByRole("button", { name: "Save update" }).click();
  await expect.poll(() => savedTicket(saves, "TSR-0146")?.firstResponseAt).toBeTruthy();
  await expect(detail).toContainText("Replied: Called the clinic");
  await expect(panel.locator("tbody tr", { hasText: "TSR-0146" })).not.toContainText("Breached");
  expect(problems).toEqual([]);
});

test("Support Tracker: scheduling a visit puts it on the Calendar; resolved tickets show where a problem came back", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=product-issues&tab=open");
  const panel = page.locator("#support-tab-panel");
  await panel.locator("tbody tr", { hasText: "TSR-0145" }).locator("[data-support-select]").click();
  await page.locator("#support-detail").getByRole("button", { name: "Schedule visit" }).click();
  const dialog = page.locator("dialog.sup-dialog");
  await dialog.locator("#sup-time").fill("10:30");
  await dialog.getByRole("button", { name: "Schedule visit" }).click();
  await expect.poll(() => saves.find((records) => records.calendarEvents?.length)?.calendarEvents[0]?.title).toContain("Visit: Sample Hospital A");
  const ticket = saves.find((records) => records.calendarEvents?.length).productIssues[0];
  expect(ticket.ticketStatus).toBe("On-site visit set");
  expect(ticket.visitEventIds).toHaveLength(1);

  await page.locator("#support-tabs").getByRole("tab", { name: /^Engineers/ }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel).toContainText("Engineer 2");
  await page.locator("#support-tabs").getByRole("tab", { name: /^Resolved/ }).click();
  await expect(panel.locator("tbody tr", { hasText: "TSR-0136" })).toContainText("Came back as TSR-0142");
  expect(problems).toEqual([]);
});

test("Support Tracker: a new ticket gets a priority, a type and the client's branch engineer", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=product-issues&tab=engineers");
  await expect(page.locator("#support-tab-panel tbody tr")).toHaveCount(2); // engineers loaded
  await page.locator("#support-actions").getByRole("button", { name: "New ticket" }).click();
  const form = page.locator("#demo-modal");
  await expect(form.locator("#priority option:checked")).toHaveText(/^Medium/);
  await form.locator("#companyName").fill("Naga City Lab");
  await form.locator("#companyName").dispatchEvent("change");
  await expect(form.locator("#engineerPick option:checked")).toHaveText("Engineer 2 · Naga");
  await form.locator("#priority").selectOption({ index: 0 });
  await form.locator("#issueType").selectOption("Hardware");
  await form.locator("#address").fill("Naga City");
  await form.locator("#equipment").fill("Zybio Z5");
  await form.locator("#serialNo").fill("Z5-NEW-1");
  await form.locator("#typeOfSupport").selectOption("Technical Support");
  await form.locator("#concerns").fill("Analyzer won't start");
  await form.locator("#remarks").fill("Client called at 9:05");
  await form.locator("#modal-submit").click();
  await page.getByRole("button", { name: "Yes, Save" }).click();
  await expect.poll(() => saves.flatMap((records) => records.productIssues || []).find((r) => r.companyName === "Naga City Lab")).toBeTruthy();
  const created = saves.flatMap((records) => records.productIssues || []).find((r) => r.companyName === "Naga City Lab");
  expect(created).toMatchObject({ priority: "critical", issueType: "Hardware", engineer: "Engineer 2", engineerEmail: "engineer2@medlane.test", ticketStatus: "Assigned", branch: "Naga" });
  expect(created.engineerPick).toBeUndefined();
  expect(Date.parse(created.openedAt)).toBeGreaterThan(Date.now() - 60_000);
  expect(problems).toEqual([]);
});

test("Support Tracker: an engineer works their own ticket", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page, "engineering@medlane.test");
  await page.goto("/dashboard?section=product-issues&tab=open");
  const panel = page.locator("#support-tab-panel");
  await panel.locator("tbody tr", { hasText: "TSR-0145" }).locator("[data-support-select]").click();
  const detail = page.locator("#support-detail");
  for (const name of ["Log reply / update", "Schedule visit", "Resolve"]) await expect(detail.getByRole("button", { name })).toBeVisible();
  await expect(page.locator("#support-actions").getByRole("button", { name: "New ticket" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Response targets" })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("Warranty: overview, a unit's history, scheduling a PM books the branch engineer on the Calendar", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=warranty");
  const panel = page.locator("#warranty-tab-panel");
  for (const label of ["Units installed", "Under warranty", "PM due or overdue", "Claims to recover"]) await expect(panel).toContainText(label);
  await expect(panel).toContainText("₱60,500.00");
  await expect(panel).toContainText("Act before it costs us");
  await expect(panel).toContainText("Warranty ending · Zybio Z5 · Sample Lab C");
  await expect(panel).toContainText("Issues per model");
  await expect(page.locator(".workflow-assist")).toHaveCount(0);

  await page.locator("#warranty-tabs").getByRole("tab", { name: /^Preventive maintenance/ }).click();
  await expect(page).toHaveURL(/tab=pm/);
  await expect(panel.locator("tbody tr").first()).toContainText("Z5-2306-00418");
  await expect(panel.locator("tbody tr").first()).toContainText("Overdue");
  await panel.locator("tbody tr", { hasText: "Z5-2411-00873" }).locator("[data-warranty-select]").click();
  const detail = panel.locator(".ui-detail");
  await expect(detail).toContainText("Service history · last 90 days");
  await expect(detail).toContainText("TSR-0142");
  await expect(detail).toContainText("WC-2026-004");
  await detail.getByRole("button", { name: "Schedule PM" }).click();
  const dialog = page.locator("dialog.sup-dialog");
  await expect(dialog.locator("#sup-engineer option:checked")).toContainText("Engineer 2 · Naga (suggested)");
  await dialog.getByRole("button", { name: "Schedule PM" }).click();
  await expect.poll(() => saves.find((records) => records.calendarEvents?.length)?.calendarEvents[0]).toMatchObject({ assigneeEmail: "engineer2@medlane.test", assigneeName: "Engineer 2" });
  const saved = saves.find((records) => records.calendarEvents?.length);
  expect(saved.calendarEvents[0].title).toContain("PM: Sample Lab C · Zybio Z5 (Z5-2411-00873)");
  expect(saved.warranties[0]).toMatchObject({ serial: "Z5-2411-00873", pmEngineer: "Engineer 2", status: "Expiring Soon" });
  expect(saved.warranties[0].pmEventIds).toEqual([saved.calendarEvents[0].id]);
  expect(problems).toEqual([]);
});

test("Warranty: a hardware ticket opens a claim, which moves to part received and is still to recover", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=product-issues&tab=open");
  await page.locator("#support-tab-panel tbody tr", { hasText: "TSR-0146" }).locator("[data-support-select]").click();
  await page.locator("#support-detail").getByRole("button", { name: "Open warranty claim" }).click();
  const dialog = page.locator("dialog.sup-dialog");
  await expect(dialog).toContainText("From TSR-0146");
  await expect(dialog.locator("#sup-serial option:checked")).toContainText("1230104910203");
  await expect(dialog.locator("#sup-issue")).toHaveValue("Reader won't read cassette barcodes");
  await dialog.locator("#sup-part").fill("Barcode reader");
  await dialog.locator("#sup-partCost").fill("7500");
  await dialog.getByRole("button", { name: "Open claim" }).click();
  await expect.poll(() => saves.flatMap((r) => r.warrantyClaims || []).find((c) => c.ticketId === "TSR-0146")).toMatchObject({ id: "WC-2026-006", status: "Open", partCost: 7500, serial: "1230104910203" });
  await expect(page).toHaveURL(/section=warranty.*tab=claims/);
  const detail = page.locator("#warranty-tab-panel .ui-detail");
  await expect(detail).toContainText("Barcode reader");
  await detail.getByRole("button", { name: "Mark part received" }).click();
  await dialog.getByRole("button", { name: "Mark part received" }).click();
  await expect.poll(() => saves.flatMap((r) => r.warrantyClaims || []).filter((c) => c.id === "WC-2026-006").pop()?.status).toBe("Part received");
  await expect(page.locator("#warranty-tab-panel")).toContainText("₱68,000.00");
  expect(problems).toEqual([]);
});

test("Warranty: adding a unit, and a duplicate serial is refused", async ({ page }) => {
  const { problems } = await watch(page);
  const saves = captureSaves(page);
  await logIn(page, "superadmin@medlane.test");
  await page.goto("/dashboard?section=warranty&tab=units");
  const add = async (serial) => {
    await page.locator("#warranty-actions").getByRole("button", { name: "Add unit" }).click();
    const dialog = page.locator("dialog.sup-dialog");
    await dialog.locator("#sup-model").fill("Zybio Z3");
    await dialog.locator("#sup-serial").fill(serial);
    await dialog.locator("#sup-installDate").fill("2026-11-01");
    await dialog.locator("#sup-warrantyEnd").fill("2027-11-01");
    await dialog.getByRole("button", { name: "Add unit" }).click();
  };
  await add("Z3-NEW-1");
  await expect.poll(() => saves.flatMap((r) => r.warranties || []).find((u) => u.serial === "Z3-NEW-1")).toMatchObject({ model: "Zybio Z3", equipment: "Zybio Z3", client: "Naga City Lab", status: "Active" });
  await expect(page.locator("#warranty-tab-panel tbody")).toContainText("Z3-NEW-1");
  await add("z3-new-1");
  await expect(page.locator(".toast, #toast").last()).toContainText("already listed");
  expect(saves.flatMap((r) => r.warranties || []).filter((u) => /z3-new-1/i.test(u.serial))).toHaveLength(1);
  expect(problems).toEqual([]);
});

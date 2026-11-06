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

test("landing page makes no API calls and has no errors", async ({ page }) => {
  const { problems, api } = await watch(page);
  await page.goto("/");
  await page.waitForTimeout(1500);
  expect(api).toEqual([]);
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

test("logging in draws the whole app", async ({ page }) => {
  const { problems } = await watch(page);
  await logIn(page);
  await expect(page.locator("#logout-top-button").locator("..")).toContainText("Fake Superadmin");
  await expect(page.locator("#page-title")).toHaveText("Dashboard");
  // Not on screen yet, so only a full first render would have filled these in.
  await expect(page.locator("#inventory-table")).toContainText("Glucose Reagent", { useInnerText: false });
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

// Screenshots of the redesigned pages for review (screens/implementation/). Skipped unless
// SCREENS=1:  SCREENS=1 npx playwright test tests/smoke/screens.spec.mjs
import { test, expect } from "@playwright/test";

const OUT = new URL("../../screens/implementation/", import.meta.url).pathname;
const ONLY = process.env.SCREENS_ONLY;
const PAGES = [
  { section: "user-settings", tabs: ["profile", "security", "notifications", "preferences"], name: "account" },
  { section: "notifications", tabs: ["all", "unread", "approvals", "stock", "money", "service", "security"], name: "notifications" },
  { section: "activity-log", tabs: ["all", "changes", "approvals", "signins", "exports", "flagged"], name: "activity" },
  { section: "product-issues", tabs: ["overview", "open", "engineers", "resolved"], name: "support" },
  { section: "warranty", tabs: ["overview", "units", "pm", "claims"], name: "warranty" },
];

test.skip(!process.env.SCREENS, "Set SCREENS=1 to capture screenshots");

async function logIn(page) {
  await page.context().route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
  await page.routeWebSocket(/\/api\/live/, () => {});
  await page.goto("/login");
  await page.fill("#login-email", "superadmin@medlane.test");
  await page.fill("#login-password", "x");
  await page.locator("#login-form").evaluate((form) => { if (!form.dataset.submitting) form.requestSubmit(); });
  await page.waitForURL("**/dashboard*");
  await page.getByRole("button", { name: /^Continue to/ }).click();
}

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    test(`screens ${theme} ${width}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await logIn(page);
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      for (const { section, tabs, name } of PAGES.filter((p) => !ONLY || p.name === ONLY)) {
        for (const tab of tabs) {
          await page.goto(`/dashboard?section=${section}&tab=${tab}`);
          await expect(page.locator(`#${section}.active`)).toBeVisible();
          await expect(page.locator("#loading-overlay")).toBeHidden();
          await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${OUT}${name}-${tab}-${theme}-${width}.png`, fullPage: true });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

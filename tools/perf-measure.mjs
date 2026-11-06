#!/usr/bin/env node
// Measures load performance of the landing page and the dashboard, in Chrome against the fake backend
// (tests/smoke/fake-backend.mjs), with a slowed CPU and network so differences show up.
//   node tools/perf-measure.mjs [--label before] [--runs 5] [--scale 1] [--url https://site/ (landing only)]
// Prints medians and writes them to the path in --out, if given.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const RUNS = Number(arg("runs", 5));
const SCALE = Number(arg("scale", 1));
const LABEL = arg("label", "run");
const OUT = arg("out", "");
const LIVE_URL = arg("url", "");
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

const observers = () => {
  window.__perf = { longTasks: [], lcp: 0 };
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
};
const collect = (page) => page.evaluate(() => {
  const resources = performance.getEntriesByType("resource");
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0;
  const scripts = resources.filter((entry) => /\.js(\?|$)/.test(entry.name));
  const api = resources.filter((entry) => new URL(entry.name).pathname.startsWith("/api/"));
  return {
    fcp, lcp: window.__perf.lcp,
    blockingMs: window.__perf.longTasks.reduce((sum, task) => sum + Math.max(0, task - 50), 0),
    longestTaskMs: Math.max(0, ...window.__perf.longTasks),
    jsFiles: scripts.length,
    jsKB: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0) / 1024,
    totalKB: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0) / 1024,
    apiCalls: api.length,
    domNodes: document.getElementsByTagName("*").length,
  };
});

async function newPage(browser, { throttle }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  if (!LIVE_URL) await context.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
  await page.routeWebSocket(/\/api\/live/, () => {});
  await page.addInitScript(observers);
  const cdp = await context.newCDPSession(page);
  if (throttle) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  return { context, page, cdp };
}

async function landing(browser) {
  const { context, page } = await newPage(browser, { throttle: true });
  const started = Date.now();
  await page.goto(LIVE_URL || `${BASE}/`, { waitUntil: "load" });
  const loadMs = Date.now() - started;
  await page.waitForTimeout(1500);
  const result = { loadMs, ...(await collect(page)) };
  await context.close();
  return result;
}

// A returning logged-in user opening /dashboard: from navigation to the dashboard drawn and quiet.
async function dashboard(browser) {
  const { context, page, cdp } = await newPage(browser, { throttle: false });
  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", "superadmin@medlane.test");
  await page.fill("#login-password", "fake-backend-accepts-anything");
  await page.locator("#login-form").evaluate((form) => { if (!form.dataset.submitting) form.requestSubmit(); });
  await page.waitForURL("**/dashboard*");
  await page.waitForTimeout(500);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const started = Date.now();
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.body.classList.contains("app-route") && document.querySelector("#alerts-list")?.children.length > 0, null, { timeout: 120000 });
  const readyMs = Date.now() - started;
  await page.waitForTimeout(2000);
  const result = { readyMs, ...(await collect(page)) };
  await context.close();
  return result;
}

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const summarize = (runs) => Object.fromEntries(Object.keys(runs[0]).map((key) => [key, Math.round(median(runs.map((run) => run[key])))]));

const server = LIVE_URL ? null : spawn(process.execPath, [fileURLToPath(new URL("../tests/smoke/fake-backend.mjs", import.meta.url)), String(PORT), String(SCALE)], { stdio: "ignore" });
try {
  if (server) for (let i = 0; i < 40; i += 1) { try { await fetch(`${BASE}/login`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); } }
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
  const results = { label: LABEL, runs: RUNS, scale: SCALE };
  const landingRuns = []; for (let i = 0; i < RUNS; i += 1) landingRuns.push(await landing(browser));
  results.landing = summarize(landingRuns);
  if (!LIVE_URL) {
    const dashboardRuns = []; for (let i = 0; i < RUNS; i += 1) dashboardRuns.push(await dashboard(browser));
    results.dashboard = summarize(dashboardRuns);
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
} finally {
  server?.kill();
}

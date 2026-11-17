// Shared pager (public/scripts/ui-kit.js): page-number collapsing, window clamping, click targets
// and the rendered markup. Runs the real browser script in a sandbox.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/ui-kit.js", import.meta.url), "utf8");
const sandbox = { escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) };
vm.createContext(sandbox);
vm.runInContext(`${source}\n;globalThis.kit = { uiPageNumbers, uiPageWindow, uiPager, uiPagerTarget, uiPageSizeFrom, uiDefaultPageSize };`, sandbox);
const K = sandbox.kit;
const arr = (value) => JSON.parse(JSON.stringify(value));

test("seven pages or fewer: every page, no gaps", () => {
  assert.deepEqual(arr(K.uiPageNumbers(1, 1)), [1]);
  assert.deepEqual(arr(K.uiPageNumbers(4, 7)), [1, 2, 3, 4, 5, 6, 7]);
});

test("many pages collapse the middle and never exceed 7 buttons", () => {
  assert.deepEqual(arr(K.uiPageNumbers(5, 12)), [1, "…", 4, 5, 6, "…", 12]);
  assert.deepEqual(arr(K.uiPageNumbers(1, 12)), [1, 2, 3, 4, 5, "…", 12]);
  assert.deepEqual(arr(K.uiPageNumbers(12, 12)), [1, "…", 8, 9, 10, 11, 12]);
  for (let pages = 1; pages <= 40; pages++) {
    for (let page = 1; page <= pages; page++) {
      const nums = K.uiPageNumbers(page, pages);
      assert.ok(nums.length <= 7, `${page}/${pages} → ${nums.length} buttons`);
      assert.ok(nums.includes(page), `${page}/${pages} shows the current page`);
      assert.equal(nums[0], 1);
      assert.equal(nums[nums.length - 1], pages);
    }
  }
});

test("last page shows the remaining rows only", () => {
  const w = K.uiPageWindow(23, 3, 10);
  assert.equal(w.page, 3);
  assert.equal(w.pages, 3);
  assert.equal(w.from, 21);
  assert.equal(w.to, 23);
  assert.equal(w.offset, 20);
});

test("a page past the end clamps to the last page (e.g. after rows were removed)", () => {
  const w = K.uiPageWindow(12, 9, 10);
  assert.equal(w.page, 2);
  assert.equal(w.from, 11);
});

test("changing the page size from page 3 of 10s to 50s lands on a valid page", () => {
  // Callers reset to page 1 on a size change; even if they don't, the window clamps.
  const w = K.uiPageWindow(45, 3, 50);
  assert.equal(w.pages, 1);
  assert.equal(w.page, 1);
  assert.equal(w.to, 45);
});

test("no rows: 'Nothing to show', one page, both arrows disabled", () => {
  const html = K.uiPager({ total: 0, page: 1, size: 10, attr: "data-x-page", sizeAttr: "data-x-size" });
  assert.match(html, /Nothing to show/);
  assert.equal((html.match(/ disabled/g) || []).length, 2);
});

test("rendered pager: label, aria-current, disabled ends, pressed size", () => {
  const first = K.uiPager({ total: 120, page: 1, size: 10, attr: "data-x-page", sizeAttr: "data-x-size" });
  assert.match(first, /Showing 1–10 of 120/);
  assert.match(first, /data-x-page="1" aria-current="page"/);
  assert.match(first, /data-x-page="prev" aria-label="Previous page" disabled/);
  assert.doesNotMatch(first, /data-x-page="next"[^>]*disabled/);
  assert.match(first, /data-x-size="10" aria-pressed="true"/);
  assert.match(first, /data-x-size="25" aria-pressed="false"/);
  const last = K.uiPager({ total: 120, page: 12, size: 10, attr: "data-x-page", sizeAttr: "data-x-size" });
  assert.match(last, /Showing 111–120 of 120/);
  assert.match(last, /data-x-page="next" aria-label="Next page" disabled/);
  assert.equal((last.match(/aria-current="page"/g) || []).length, 1);
});

test("click targets: prev/next stop at the ends, numbers clamp, junk is ignored", () => {
  assert.equal(K.uiPagerTarget("prev", 1, 5), 1);
  assert.equal(K.uiPagerTarget("next", 5, 5), 5);
  assert.equal(K.uiPagerTarget("next", 2, 5), 3);
  assert.equal(K.uiPagerTarget("4", 1, 5), 4);
  assert.equal(K.uiPagerTarget("9", 1, 5), 5);
  assert.equal(K.uiPagerTarget("…", 1, 5), null);
});

test("page size: URL value wins when valid, else the user's preference, else 10", () => {
  assert.equal(K.uiDefaultPageSize(), 10);
  assert.equal(K.uiPageSizeFrom("25"), 25);
  assert.equal(K.uiPageSizeFrom("13"), 10);
  sandbox.medlanePrefs = { rowsPerPage: 50 };
  assert.equal(K.uiDefaultPageSize(), 50);
  assert.equal(K.uiPageSizeFrom(null), 50);
  assert.equal(K.uiPageSizeFrom("25"), 25);
  sandbox.medlanePrefs = { rowsPerPage: 7 };
  assert.equal(K.uiDefaultPageSize(), 10);
  delete sandbox.medlanePrefs;
});

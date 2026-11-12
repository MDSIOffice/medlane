// Concurrency guards added for 50-100 simultaneous users: stock rebasing + the stock lock, and
// the per-account login throttle.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { worker, env, STATE, mockSupabase, row, stored } from "./helpers/load-worker.mjs";

const { takeStockBases, rebaseStockRows, withStockBase, savedStockQty, withStockLock, loginThrottle, LiveHub } = worker;

globalThis.WebSocketRequestResponsePair ||= class { constructor() {} };

// One LiveHub per idFromName, with an in-memory storage, standing in for Durable Objects.
function fakeHubNamespace() {
  const hubs = new Map();
  return {
    idFromName: (name) => name,
    get(name) {
      if (!hubs.has(name)) {
        const store = new Map();
        const ctx = {
          setWebSocketAutoResponse() {},
          getWebSockets: () => [],
          storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } },
        };
        hubs.set(name, new LiveHub(ctx, {}));
      }
      const hub = hubs.get(name);
      return { fetch: (url, init) => hub.fetch(new Request(url, init)) };
    },
  };
}

const stockRow = (qty, base, key = "A|LP|L1") => row("inventory", key, { code: "A", item: "Reagent A", branch: "LP", lot: "L1", qty, ...(base === undefined ? {} : { _stockBase: { key, qty: base } }) });

describe("stock rebase", () => {
  beforeEach(() => mockSupabase({ inventory: [stored("A|LP|L1", { code: "A", branch: "LP", lot: "L1", qty: 90 })] }));

  test("applies this save's change on top of what is stored now", async () => {
    // Loaded at 100, deducted 10 locally -> 90; meanwhile someone else took 10 (stored 90).
    const rows = [stockRow(90, 100)];
    const bases = takeStockBases(rows);
    await rebaseStockRows(env, STATE, rows, bases);
    assert.equal(rows[0].data.qty, 80);
    assert.equal("_stockBase" in rows[0].data, false);
  });

  test("leaves the qty alone when nothing changed in between", async () => {
    const rows = [stockRow(85, 90)];
    await rebaseStockRows(env, STATE, rows, takeStockBases(rows));
    assert.equal(rows[0].data.qty, 85);
  });

  test("an unchanged row in a whole-module save follows the stored qty", async () => {
    const rows = [stockRow(100, 100)];
    await rebaseStockRows(env, STATE, rows, takeStockBases(rows));
    assert.equal(rows[0].data.qty, 90);
  });

  test("a row without a base (older tab) is saved as sent", async () => {
    const rows = [stockRow(70)];
    await rebaseStockRows(env, STATE, rows, takeStockBases(rows));
    assert.equal(rows[0].data.qty, 70);
  });

  test("a base copied from another stock row is ignored and stripped", async () => {
    const rows = [row("inventory", "A|LP|L1", { code: "A", branch: "LP", lot: "L1", qty: 5, _stockBase: { key: "A|QC|L1", qty: 50 } })];
    await rebaseStockRows(env, STATE, rows, takeStockBases(rows));
    assert.equal(rows[0].data.qty, 5);
    assert.equal("_stockBase" in rows[0].data, false);
  });

  test("refuses when there is no longer enough stock", async () => {
    // Loaded at 100, wants to take 95; only 90 left now.
    const rows = [stockRow(5, 100)];
    await assert.rejects(rebaseStockRows(env, STATE, rows, takeStockBases(rows)), /^Error: Stock changed: .*only 90 left/);
  });

  test("withStockBase / savedStockQty", () => {
    assert.deepEqual(withStockBase("inventory", "K", { qty: 3 })._stockBase, { key: "K", qty: 3 });
    assert.deepEqual(withStockBase("sales", "K", { qty: 3 }), { qty: 3 });
    assert.deepEqual(savedStockQty([row("inventory", "K", { qty: 4 }), row("sales", "S", { qty: 1 })]), { K: 4 });
  });
});

describe("stock lock", () => {
  test("concurrent stock saves run one at a time", async () => {
    const lockEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    let qty = 100;
    let inside = 0;
    let maxInside = 0;
    const deduct = () => withStockLock(lockEnv, STATE, async () => {
      inside += 1; maxInside = Math.max(maxInside, inside);
      const read = qty;
      await new Promise((resolve) => setTimeout(resolve, 5));
      qty = read - 1;
      inside -= 1;
    });
    await Promise.all(Array.from({ length: 30 }, deduct));
    assert.equal(maxInside, 1);
    assert.equal(qty, 70);
  });

  test("the lock is released when the save throws", async () => {
    const lockEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    await assert.rejects(withStockLock(lockEnv, STATE, async () => { throw new Error("boom"); }), /boom/);
    assert.equal(await withStockLock(lockEnv, STATE, async () => "ok"), "ok");
  });

  test("runs unlocked when the lock service is unavailable", async () => {
    const brokenEnv = { ...env, LIVE_HUB: { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) } };
    assert.equal(await withStockLock(brokenEnv, STATE, async () => "ok"), "ok");
  });
});

describe("login throttle", () => {
  const office = (email) => new Request("https://app.test/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.7" } });

  test("10 wrong passwords lock only that account, not the whole office IP", async () => {
    const throttleEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    for (let i = 0; i < 10; i++) await loginThrottle(throttleEnv, office(), "fail", "typo@medlane.test");
    assert.equal((await loginThrottle(throttleEnv, office(), "check", "typo@medlane.test")).blocked, true);
    assert.equal((await loginThrottle(throttleEnv, office(), "check", "colleague@medlane.test")).blocked, false);
  });

  test("account names are matched case-insensitively", async () => {
    const throttleEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    for (let i = 0; i < 10; i++) await loginThrottle(throttleEnv, office(), "fail", i % 2 ? "Typo@Medlane.test" : "typo@medlane.test ");
    assert.equal((await loginThrottle(throttleEnv, office(), "check", "TYPO@medlane.test")).blocked, true);
  });

  test("a successful sign-in clears that account's count but not the IP's", async () => {
    const throttleEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    for (let i = 0; i < 9; i++) await loginThrottle(throttleEnv, office(), "fail", "a@medlane.test");
    await loginThrottle(throttleEnv, office(), "reset", "a@medlane.test");
    await loginThrottle(throttleEnv, office(), "fail", "a@medlane.test");
    assert.equal((await loginThrottle(throttleEnv, office(), "check", "a@medlane.test")).blocked, false);
  });

  test("one IP guessing across many accounts is still stopped", async () => {
    const throttleEnv = { ...env, LIVE_HUB: fakeHubNamespace() };
    for (let i = 0; i < 100; i++) await loginThrottle(throttleEnv, office(), "fail", `user${i}@medlane.test`);
    assert.equal((await loginThrottle(throttleEnv, office(), "check", "fresh@medlane.test")).blocked, true);
  });
});

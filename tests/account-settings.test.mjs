// Account settings rules (src/account.js): notification settings defaults, role filtering,
// security always on, quiet hours, preference validation, PH mobile numbers, password age and
// when the Welcome screen shows.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveNotificationSettings, notificationSettingPatch, alertTypesFor, deliveryFor, inQuietHours,
  preferencesFromRow, preferencePatchColumns, PREFERENCE_DEFAULTS, normalizePhMobile, profilePatch,
  passwordAge, welcomeShowsNow,
} from "../src/account.js";

const ALL = ["purchase-orders", "inventory", "collections", "product-issues", "reconciliation"];
// 12:00 UTC = 20:00 Manila; 23:00 UTC = 07:00 Manila; 04:00 UTC = 12:00 Manila.
const manila = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(Date.UTC(2026, 10, 18, (h - 8 + 24) % 24, m)); };

describe("notification settings", () => {
  test("new users: everything in-app; email only for approvals, money and security", () => {
    const settings = resolveNotificationSettings([], ALL);
    const by = Object.fromEntries(settings.map((s) => [s.type, s]));
    for (const s of settings) assert.equal(s.inApp, true, s.type);
    assert.equal(by.approvals.email, true);
    assert.equal(by.money.email, true);
    assert.equal(by.security.email, true);
    assert.equal(by.stock.email, false);
    assert.equal(by.service.email, false);
    assert.equal(by.recon.email, false);
  });

  test("only alert types for modules the role can view (security always)", () => {
    assert.deepEqual(alertTypesFor(["product-issues"]), ["service", "security"]);
    assert.deepEqual(alertTypesFor([]), ["security"]);
    const sales = resolveNotificationSettings([], ["sales", "purchase-orders"]).map((s) => s.type);
    assert.deepEqual(sales, ["approvals", "security"]);
  });

  test("saved rows override the defaults", () => {
    const [stock] = resolveNotificationSettings([{ alert_type: "stock", in_app: false, email: true }], ["inventory"]).filter((s) => s.type === "stock");
    assert.equal(stock.inApp, false);
    assert.equal(stock.email, true);
  });

  test("security stays on even if a row somehow says off, and can't be switched off", () => {
    const security = resolveNotificationSettings([{ alert_type: "security", in_app: false, email: false }], []).find((s) => s.type === "security");
    assert.equal(security.inApp, true);
    assert.equal(security.email, true);
    assert.equal(security.locked, true);
    assert.throws(() => notificationSettingPatch({ type: "security", channel: "email", value: false }, ALL), /always on/);
  });

  test("a toggle for a module the role can't see is refused", () => {
    assert.throws(() => notificationSettingPatch({ type: "recon", channel: "inApp", value: false }, ["sales"]), /doesn't receive/);
    assert.throws(() => notificationSettingPatch({ type: "stock", channel: "sms", value: false }, ALL), /Channel/);
    assert.throws(() => notificationSettingPatch({ type: "stock", channel: "email", value: "yes" }, ALL), /true or false/);
    assert.deepEqual(notificationSettingPatch({ type: "stock", channel: "email", value: true }, ALL), { type: "stock", channel: "email", value: true });
  });
});

describe("delivery respects the settings and quiet hours", () => {
  const prefs = { quietHoursEnabled: true, quietStart: "20:00", quietEnd: "07:00" };
  const settings = resolveNotificationSettings([{ alert_type: "stock", in_app: false, email: false }], ALL);

  test("quiet window crosses midnight", () => {
    assert.equal(inQuietHours(manila("19:59"), "20:00", "07:00"), false);
    assert.equal(inQuietHours(manila("20:00"), "20:00", "07:00"), true);
    assert.equal(inQuietHours(manila("02:30"), "20:00", "07:00"), true);
    assert.equal(inQuietHours(manila("07:00"), "20:00", "07:00"), false);
    assert.equal(inQuietHours(manila("13:00"), "12:00", "14:00"), true);
    assert.equal(inQuietHours(manila("13:00"), "12:00", "12:00"), false);
  });

  test("in-app off / email off → nothing delivered", () => {
    assert.deepEqual(deliveryFor({ type: "stock" }, { settings, prefs }, manila("10:00")), { inApp: false, email: false, emailHeldForQuietHours: false });
  });

  test("email waits during quiet hours, in-app still arrives", () => {
    const d = deliveryFor({ type: "approvals" }, { settings, prefs }, manila("22:00"));
    assert.equal(d.inApp, true);
    assert.equal(d.email, false);
    assert.equal(d.emailHeldForQuietHours, true);
    assert.equal(deliveryFor({ type: "approvals" }, { settings, prefs }, manila("09:00")).email, true);
  });

  test("urgent alerts email through quiet hours", () => {
    assert.equal(deliveryFor({ type: "money", urgent: true }, { settings, prefs }, manila("23:00")).email, true);
  });

  test("security alerts always go out, on both channels, at any hour", () => {
    const off = resolveNotificationSettings([], []);
    assert.deepEqual(deliveryFor({ type: "security" }, { settings: off, prefs }, manila("03:00")), { inApp: true, email: true, emailHeldForQuietHours: false });
  });

  test("quiet hours switched off → email any time", () => {
    assert.equal(deliveryFor({ type: "approvals" }, { settings, prefs: { ...prefs, quietHoursEnabled: false } }, manila("22:00")).email, true);
  });

  test("a type the user can't receive is never delivered", () => {
    const salesOnly = resolveNotificationSettings([], ["sales"]);
    assert.deepEqual(deliveryFor({ type: "recon" }, { settings: salesOnly, prefs }, manila("10:00")), { inApp: false, email: false, emailHeldForQuietHours: false });
  });
});

describe("preferences", () => {
  test("no row → defaults", () => {
    assert.deepEqual(preferencesFromRow(null), { ...PREFERENCE_DEFAULTS });
  });

  test("row values map to camelCase; bad stored values fall back", () => {
    const p = preferencesFromRow({ display_name: "Geo", sound_enabled: false, welcome_mode: "weird", start_page: "sales", rows_per_page: 50, default_branch: "Naga", quiet_start: "21:30:00", quiet_end: "06:00:00" });
    assert.equal(p.displayName, "Geo");
    assert.equal(p.sound, false);
    assert.equal(p.welcome, "daily");
    assert.equal(p.startPage, "sales");
    assert.equal(p.rowsPerPage, 50);
    assert.equal(p.defaultBranch, "Naga");
    assert.equal(p.quietStart, "21:30");
    assert.equal(p.quietEnd, "06:00");
  });

  test("valid changes become columns", () => {
    assert.deepEqual(preferencePatchColumns({ rowsPerPage: 25, welcome: "off", sound: false, quietStart: "21:00" }, { branches: ["Las Pinas", "Naga"] }),
      { rows_per_page: 25, welcome_mode: "off", sound_enabled: false, quiet_start: "21:00" });
    assert.deepEqual(preferencePatchColumns({ defaultBranch: "Naga" }, { branches: ["Las Pinas", "Naga"] }), { default_branch: "Naga" });
  });

  test("invalid changes are refused", () => {
    const ctx = { branches: ["Las Pinas", "Naga"] };
    assert.throws(() => preferencePatchColumns({ rowsPerPage: 30 }, ctx), /10, 25 or 50/);
    assert.throws(() => preferencePatchColumns({ welcome: "sometimes" }, ctx), /Welcome/);
    assert.throws(() => preferencePatchColumns({ startPage: "payables" }, ctx), /start page/);
    assert.throws(() => preferencePatchColumns({ defaultBranch: "Cebu" }, ctx), /branch/);
    assert.throws(() => preferencePatchColumns({ quietEnd: "25:00" }, ctx), /time/);
    assert.throws(() => preferencePatchColumns({ sound: "on" }, ctx), /true or false/);
    assert.throws(() => preferencePatchColumns({ theme: "dark" }, ctx), /Unknown preference/);
    assert.throws(() => preferencePatchColumns({}, ctx), /Nothing/);
    assert.throws(() => preferencePatchColumns({ avatar: "javascript:alert(1)" }, ctx), /Photo/);
    assert.throws(() => preferencePatchColumns({ avatar: `data:image/jpeg;base64,${"A".repeat(130000)}` }, ctx), /Photo/);
    assert.deepEqual(preferencePatchColumns({ avatar: "data:image/png;base64,iVBORw0KGgo=" }, ctx), { avatar_data: "data:image/png;base64,iVBORw0KGgo=" });
    assert.deepEqual(preferencePatchColumns({ avatar: "" }, ctx), { avatar_data: null });
  });
});

describe("profile", () => {
  test("PH mobile numbers in any common format normalise to +63 9XX XXX XXXX", () => {
    for (const input of ["09171234567", "0917 123 4567", "+63 917 123 4567", "639171234567", "9171234567", "(0917) 123-4567"]) {
      assert.equal(normalizePhMobile(input), "+63 917 123 4567", input);
    }
    assert.equal(normalizePhMobile(""), "");
  });

  test("landlines, short numbers and letters are rejected", () => {
    for (const input of ["028123456", "0917123456", "091712345678", "+1 917 123 4567", "0917-ABC-4567", "0817 123 4567"]) {
      assert.equal(normalizePhMobile(input), null, input);
    }
    assert.throws(() => profilePatch({ fullName: "Ana Cruz", phone: "12345" }), /Philippine mobile/);
    assert.throws(() => profilePatch({ fullName: "  ", phone: "" }), /Full name/);
    assert.deepEqual(profilePatch({ fullName: " Ana   Cruz ", displayName: " Ana ", phone: "09171234567" }), { fullName: "Ana Cruz", displayName: "Ana", phone: "+63 917 123 4567" });
  });
});

describe("password age", () => {
  const now = new Date("2026-11-18T04:00:00Z");
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  test("ok, due soon within 8 days of 90, overdue past 90", () => {
    assert.equal(passwordAge(daysAgo(10), null, now).status, "ok");
    assert.equal(passwordAge(daysAgo(81), null, now).status, "ok");
    const soon = passwordAge(daysAgo(82), null, now);
    assert.equal(soon.status, "due-soon");
    assert.equal(soon.dueInDays, 8);
    assert.equal(passwordAge(daysAgo(90), null, now).status, "overdue");
  });
  test("never changed in the app → counts from the account's creation", () => {
    assert.equal(passwordAge("", daysAgo(100), now).days, 100);
    assert.equal(passwordAge(null, null, now).status, "unknown");
  });
});

describe("Welcome screen", () => {
  const now = new Date("2026-11-18T02:00:00Z"); // 10:00 Manila
  test("every sign-in / off", () => {
    assert.equal(welcomeShowsNow("every", now.toISOString(), now), true);
    assert.equal(welcomeShowsNow("off", null, now), false);
  });
  test("once a day: skipped when the previous sign-in was earlier the same Manila day", () => {
    assert.equal(welcomeShowsNow("daily", "2026-11-18T00:30:00Z", now), false); // 08:30 Manila, same day
    assert.equal(welcomeShowsNow("daily", "2026-11-17T15:30:00Z", now), true); // 23:30 Manila the day before
    assert.equal(welcomeShowsNow("daily", "2026-11-17T16:30:00Z", now), false); // 00:30 Manila, same day (UTC says 17th)
    assert.equal(welcomeShowsNow("daily", null, now), true);
  });
});

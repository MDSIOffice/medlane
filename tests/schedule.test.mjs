import { test } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

const { boardMonitorsDue, dailyDigestHours, odometerReminderMessage } = worker;
const due = (weekday, hour, minute) => boardMonitorsDue({ weekday, hour, minute });

test("boards don't refresh at any time on Saturday or Sunday", () => {
  for (const weekday of ["Sat", "Sun"]) {
    for (let h = 0; h < 24; h += 1) {
      for (const minute of ["00", "15", "30", "45"]) assert.equal(due(weekday, String(h).padStart(2, "0"), minute), false);
    }
  }
});

test("boards refresh every 15 minutes in the day and hourly overnight", () => {
  for (const minute of ["00", "15", "30", "45"]) {
    assert.equal(due("Tue", "06", minute), true);
    assert.equal(due("Tue", "21", minute), true);
  }
  assert.equal(due("Tue", "10", "05"), false);
  for (const hour of ["22", "23", "00", "05"]) {
    assert.equal(due("Tue", hour, "00"), true);
    for (const minute of ["15", "30", "45"]) assert.equal(due("Tue", hour, minute), false);
  }
});

test("weekend changes reach the boards at 12:00 AM Monday", () => {
  assert.equal(due("Mon", "00", "00"), true);
});

test("boards stay out of the 6 PM digest hour", () => {
  for (const minute of ["00", "15", "30", "45"]) assert.equal(due("Wed", "18", minute), false);
});

test("Monday's digest covers back to Friday's, other days cover one day", () => {
  assert.equal(dailyDigestHours("Mon"), 72);
  for (const weekday of ["Tue", "Wed", "Thu", "Fri"]) assert.equal(dailyDigestHours(weekday), 24);
});

test("the odometer reminder still pings everyone, and uses the Manila date", () => {
  // 9:00 UTC is 5 PM Friday in Manila. Below, 4:30 PM UTC Sunday is already Monday in Manila.
  const friday = odometerReminderMessage("Fri", new Date("2026-11-06T09:00:00Z"));
  assert.equal(friday.content, "@everyone");
  assert.match(friday.embeds[0].title, /End-of-Week/);
  assert.match(friday.embeds[0].description, /closing/);
  assert.match(friday.embeds[0].footer.text, /Friday, Nov 6, 2026/);
  const lateUtc = odometerReminderMessage("Mon", new Date("2026-11-08T16:30:00Z"));
  assert.match(lateUtc.embeds[0].title, /Start-of-Week/);
  assert.match(lateUtc.embeds[0].footer.text, /Monday, Nov 9, 2026/);
});

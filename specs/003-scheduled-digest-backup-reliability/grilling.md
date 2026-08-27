# Grilling: 003-scheduled-digest-backup-reliability

Adversarial review of the plan before implementing. Q = challenge, A = resolution.

---

**Q1. Module-level `resendGate` / `resendLastAt` is global mutable state in a Worker. Isn't that
a race across concurrent invocations?**

A. Each Worker invocation runs on an isolate; a digest run is a single invocation, so all its
fan-out sends share one isolate and one gate — which is exactly what we want to serialise. A
second invocation (e.g. an invite email sent while a digest runs) may share the isolate or not.
If it shares, it's correctly paced too. If it doesn't, it's one extra call — still far under
10/s. No correctness risk, only a soft rate target. Accepted.

**Q2. `paceResend()` chains on `resendGate` which is reassigned to `next.catch(() => {})`. If
one link throws, does the chain wedge?**

A. `next` itself only ever `await sleep(...)` — it does not reject. The `.catch` on the stored
gate is belt-and-braces so a hypothetical rejection can't poison later links. The value chained
on is always a resolved promise. Fine.

**Q3. 5 retries × up to 5 s backoff = 25 s for one stuck email, × N recipients, serialised.
Could the digest blow the invocation wall-clock?**

A. Worst case is pathological (Resend fully rate-limiting us for 25 s straight). Realistic 429s
clear in <1 s. Scheduled handlers get generous wall-clock via `waitUntil`. If Resend is truly
down, the digest failing slowly vs. quickly doesn't matter — the retry ceiling (5) bounds it.
Kept at 5; `Retry-After` cap at 5 s prevents a malicious/huge header from parking us.

**Q4. Staggering pushes weekly-backup to 18:20. If Cloudflare skips every tick from 18:20 on
(deploy freeze, outage), the backup is missed for the week. Worse than before?**

A. Before, the backup shared 18:00 and was *more* likely to be killed by the pile-up, and a
kill meant permanent skip via the claim bug (Q6). Now it starts on a quiet tick and has 8
retry ticks (18:20–18:55). A total outage from 18:20–18:59 is far less likely than a single
killed tick. Net reliability up. Also: monthly/yearly backups are the real "can't miss" ones
and they cascade from later minutes with their own retry windows.

**Q5. Why minute floors instead of exact minutes (`minute === "20"`)?**

A. Exact-minute matching is the original bug this file's own comments warn about — one skipped
tick drops the job. `>=` keeps every later tick in the hour eligible, and the claim makes it
idempotent so "eligible on 8 ticks" still means "runs once".

**Q6. Two-phase claim: you now write `lastPeriod` only after success. If the success write
(`saveMonitoringState`) fails, the next tick re-runs the job → digest sent twice / backup made
twice. Acceptable?**

A. Backup twice: harmless (two objects, two `backup_runs` rows, storage reserve handles it).
Digest twice: annoying but not damaging, and only if the PostgREST upsert fails in the ~1 s
after a full digest succeeded — rare. The status quo it replaces is a *permanent* silent skip
of the whole week's backup, which is worse. If double-digest is ever observed, wrap the
completion write in a short retry. Documented as an accepted assumption.

**Q7. The 9-minute in-flight lock: two ticks 5 minutes apart. Tick A claims at 18:00:03. Tick
B at 18:05:03 sees `attemptAt` 5 min old (< 9) → skips. Good. But if tick A's job takes 4
minutes and finishes fine, tick B still skipped even though A is done. Is that a lost run?**

A. No — A completed and wrote `lastPeriod`, so B would skip on the `lastPeriod` check anyway.
The lock only matters when A hasn't finished (still running, or killed). If A is still running,
B skipping is correct (don't double-run). If A was killed, B skips once, then tick C at
18:10:03 sees `attemptAt` ~10 min old (> 9) and retries. One wasted tick, then recovery. Fine
inside a 55-minute window.

**Q8. Why 9 minutes specifically?**

A. Must be > one tick interval (5 min) so a still-running job isn't double-started by the very
next tick, and small enough that a killed job still gets several retries before 18:59. 9 min
= skip exactly one tick after a kill, retry on the second. Could be 6–12; 9 is comfortably in
range.

**Q9. Does anything else read `lastPeriod` / the `automation-once-*` monitoring rows?**

A. Grepped: only `claimAutomationPeriod` and `runOncePerPeriod`. The new `attemptPeriod` /
`attemptAt` / `completedAt` keys are additive. Old rows with only `lastPeriod` still satisfy
the completed check. No migration needed.

**Q10. The user also said "daily digest in logs still not working". Is the fix really just the
rate limit?**

A. The digest *runs* (it's the per-weekday job and its claim/period logic is sound). What
fails is delivery — every recipient past ~10 gets a 429, logged as `Email failed … Too many
requests` (the exact string the user pasted). Fixing pacing + retry fixes delivery. The
staggering + claim fix additionally protect it on Fridays when it shares the hour with the
backup. No evidence of a third, separate digest bug in the code.

**Q11. Could `emailsForRoles` itself be returning nothing (so no emails at all)?**

A. It reads `profiles` + `app_records` users and filters by role — unchanged and not implicated
by the user's error text, which shows a real recipient address hitting a real 429. Out of scope.

**Q12. Verification without a local env — how do we actually know it worked?**

A. `wrangler deploy --dry-run` + `node --check` pre-deploy; then the Logs page and
`wrangler tail` across one 18:00 Manila window (and one Friday) per SC-001..SC-004. Accepted
that first real confirmation is post-deploy in production, consistent with the rest of this
project.

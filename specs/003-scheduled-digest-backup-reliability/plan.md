# Implementation Plan: 003-scheduled-digest-backup-reliability

## Files touched

- `src/worker.js` only.

## Changes

### 1. Resend pacing + 429 retry (`sendResendEmail` area)

- Add module-level `paceResend()`: a single promise chain that enforces a `RESEND_MIN_GAP_MS`
  (160 ms ≈ 6/s) minimum gap between Resend calls. Every caller `await`s it before fetching.
- Add `resendEmailRequest(env, body)`: wraps the `fetch("https://api.resend.com/emails")` call,
  calls `paceResend()` each attempt, and on HTTP 429 sleeps (`Retry-After` seconds, capped at
  5 s, else `400 * (attempt+1)` ms) and retries — up to 5 retries, then returns the 429
  response so the existing error path logs it.
- `sendResendEmail` now calls `resendEmailRequest` instead of `fetch` directly. Its
  success/failure logging (`Email sent` / `Email failed`) is unchanged.
- The digest loop keeps `Promise.all(sends)` — the pace gate serialises them anyway, and the
  per-send `.catch` still isolates one failure from the rest.

### 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`)

Inside `if (scheduled.hour === "18")`, gate each job on a minute floor so consecutive jobs
land on different 5-minute invocations:

| Job            | Starts at | Retry ticks left in the hour |
|----------------|-----------|------------------------------|
| daily-digest   | 18:00     | 18:00–18:55                  |
| weekly-digest  | 18:10     | 18:10–18:55                  |
| weekly-backup  | 18:20     | 18:20–18:55                  |
| monthly-backup | 18:30     | 18:30–18:55                  |
| yearly-backup  | 18:40     | 18:40–18:55                  |

`minute = Number(scheduled.minute)` and each `tasks.push(...)` is guarded with `&& minute >= N`.

### 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`)

- `claimAutomationPeriod`: skip if `state.lastPeriod === periodKey` (completed). Otherwise, if
  `state.attemptPeriod === periodKey` and `state.attemptAt` is within 9 minutes, skip (in-flight
  lock). Otherwise write `{ ...state, attemptPeriod: periodKey, attemptAt: now }` and claim.
- `runOncePerPeriod` success: write `{ lastPeriod: periodKey, completedAt: now }` **after**
  `fn()` resolves, then log `Automation job completed`.
- `runOncePerPeriod` failure: write `{ ...state, attemptPeriod: null, attemptAt: null,
  lastAttemptAt: now, lastError }` (releases the lock immediately), then log
  `Automation job failed`, then rethrow.

Net effect: a hard-killed run leaves only `attemptAt`, which ages out in 9 minutes; the next
eligible tick re-claims and retries.

## Verification (no local env)

1. `node --check src/worker.js`.
2. `npx wrangler deploy --dry-run` reads from `public/` and validates config.
3. Post-deploy, watch the Logs page after 18:00 Manila:
   - digest recipients receive mail; no `Too many requests` lines;
   - Friday: `Automation job completed (weekly-backup …)` and a fresh Backup Status entry.
4. `wrangler tail` during the 18:00 hour to confirm no "Too many subrequests" / CPU-limit
   terminations on a single tick.

## Rollback

Single-commit revert. No schema or stored-state migration — the new
`attemptPeriod`/`attemptAt` keys are additive; old `lastPeriod`-only rows still read correctly.

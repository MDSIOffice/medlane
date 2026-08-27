# Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup

**Feature Branch**: `003-scheduled-digest-backup-reliability`

**Created**: 2026-08-27

**Status**: Implemented

**Input**: User report: "fix this email rate limited. janelleresuello.mdsi@gmail.com — Medlane
OS — Daily Digest: Too many requests. You can only make 10 requests per second. also i've
been trying to make you fix the daily digest in logs and auto back up every friday still not
working."

## Problem

Three linked failures in the Cloudflare Worker's scheduled automation (`src/worker.js`,
driven by the single `*/5 * * * *` cron):

1. **Resend rate limit.** `composeAndSendDigest()` builds one `sendResendEmail()` promise per
   recipient across every role and fires them all at once with `Promise.all`. Resend caps at
   10 requests/second and answers a burst with HTTP 429 ("Too many requests. You can only make
   10 requests per second."). Past a handful of recipients, every extra digest email 429s and
   never arrives. The recipient sees nothing; the Logs page fills with `Email failed … Too
   many requests` lines. This is why the **daily digest "doesn't work"** — it runs, but its
   emails silently fail.

2. **Friday pile-up.** At 18:00 Manila on a Friday the same 5-minute invocation runs the daily
   digest, the weekly digest, **and** `createBackup()` (a full-state fetch + gzip + R2 write),
   plus the API/analytics/pending/inventory monitors — all in one `Promise.allSettled`. That
   is enough subrequests and CPU to exhaust the invocation. When Cloudflare kills the run
   mid-flight, the `catch` in `runOncePerPeriod` never executes.

3. **A killed job is lost for the whole period.** `claimAutomationPeriod` wrote its
   "claimed this period" flag *before* running the job. A run killed between the claim and the
   success/failure handlers leaves the flag set with no completion and no release, so every
   later 5-minute tick that day/week sees the claim and skips — the **weekly backup never
   runs** even though there are ten more ticks left in the 18:00 hour.

## Requirements

### Functional Requirements

- **FR-001**: Every call to the Resend API MUST be paced so bursts stay well under Resend's
  10 req/s limit, regardless of how many recipients a digest fans out to.
- **FR-002**: A Resend response of HTTP 429 MUST be retried with backoff (honouring
  `Retry-After` when present), up to a small fixed number of attempts, before the send is
  treated as failed.
- **FR-003**: The pacing and retry MUST apply to all Resend callers (digests and invitation
  emails), not only the digest path.
- **FR-004**: The daily digest, weekly digest, weekly backup, monthly backup, and yearly
  backup MUST NOT all be attempted on the same 5-minute invocation. Each MUST start on a
  distinct minute offset within the 18:00 Manila hour, leaving at least 15 minutes of retry
  room after its start minute.
- **FR-005**: An automation job's "done for this period" flag MUST be written only after the
  job function returns successfully.
- **FR-006**: While a job is running, a short in-flight lock MUST prevent a second overlapping
  invocation from starting the same job. The lock MUST expire after longer than one 5-minute
  tick (~9 minutes) so a killed attempt is retried on a later tick in the same hour instead of
  being lost for the period.
- **FR-007**: A job that throws MUST release its in-flight lock immediately (unchanged from
  today) so the next tick retries without waiting out the lock.
- **FR-008**: Existing behaviour MUST be preserved: digest content, recipient roles, the
  Discord digest post, the "Automation job completed/failed" log lines, weekend exclusion for
  the daily digest, and the 18:00 Manila send time.

### Non-Functional / Constraints

- No local dev environment; verified against the deployed Worker and its Logs page.
- Module-level pacing state is per-isolate, which is sufficient because one digest run is one
  invocation on one isolate.
- No new cron entries (wrangler only ever registers the 5-minute cron; the internal hour check
  is the real driver).

## Success Criteria

- **SC-001**: A digest with 20+ recipients delivers to every recipient with no `Email failed …
  Too many requests` line in Logs.
- **SC-002**: On a Friday, the Logs page shows `Automation job completed (weekly-backup …)`
  and a new row appears in `backup_runs` / the Backup Status card.
- **SC-003**: If a Friday 18:00 invocation is killed, a later tick that hour still completes
  the missed digest/backup (verifiable from the completion log timestamp being > 18:05).
- **SC-004**: Invitation emails still send.

## Assumptions

- Resend's documented limit is 10 req/s account-wide; a ~6/s ceiling (160 ms min gap) leaves
  headroom for other Resend traffic in the same window.
- `saveMonitoringState` (a PostgREST upsert keyed by `record_key`) is reliable enough that the
  post-success completion write rarely fails; a double-send from a lost completion write is
  strictly better than today's permanent skip and is rare.
- Cloudflare may skip or kill any individual cron tick; the tolerant 18:00 window already
  assumes this.

## Out of Scope

- Sending digests as one Resend "batch" request (would remove per-recipient personalisation
  and error isolation).
- Moving backups off the Worker (e.g. to a queue or Durable Object).
- Any change to what the digest reports or who receives it.

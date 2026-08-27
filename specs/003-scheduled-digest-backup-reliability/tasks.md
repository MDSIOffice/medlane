# Tasks: 003-scheduled-digest-backup-reliability

- [x] T1. Add `paceResend()` + `RESEND_MIN_GAP_MS` module-level pace gate (`src/worker.js`).
- [x] T2. Add `resendEmailRequest(env, body)` with 429 backoff/retry (`Retry-After` aware).
- [x] T3. Route `sendResendEmail` through `resendEmailRequest`; keep existing sent/failed logs.
- [x] T4. `runFiveMinuteScheduledTasks`: compute `minute`, gate weekly-digest ≥10,
      weekly-backup ≥20, monthly-backup ≥30, yearly-backup ≥40.
- [x] T5. `claimAutomationPeriod`: completed-check on `lastPeriod`; 9-minute in-flight lock on
      `attemptPeriod`/`attemptAt`; claim writes the attempt keys.
- [x] T6. `runOncePerPeriod`: write `lastPeriod`/`completedAt` only after `fn()` succeeds;
      failure path releases the lock (`attemptPeriod`/`attemptAt` null) + records `lastError`.
- [x] T7. `node --check src/worker.js`.
- [ ] T8. `npx wrangler deploy --dry-run` (run before deploy).
- [ ] T9. Post-deploy: verify one 18:00 Manila digest window + one Friday backup via Logs /
      `wrangler tail` (SC-001..SC-004).

## Related, same session (not part of this spec)

- [x] Draft-aware close confirmation for the Receive Stock sheet and Stock Transfer sheet
      (`confirmCloseDialog({ keepsDraft })` in `public/scripts/ui-utils.js`; wiring in
      `public/scripts/events-bootstrap.js`). The old "will be lost if you close without saving"
      text was wrong now that both sheets autosave a local draft on the X / Escape path.

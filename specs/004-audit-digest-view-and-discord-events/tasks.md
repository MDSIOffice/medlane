# Tasks: 004-audit-digest-view-and-discord-events

## Part A — View digest message from Audit Logs
- [x] `recordSystemLog`: optional `extra` object merged into the log entry.
- [x] `saveDigestMessageSnapshot()` / `readDigestMessageSnapshot()` (R2, gzip, uuid-validated).
- [x] `sendResendEmail`: accept `digestMessageId`, thread it onto sent/failed log rows.
- [x] `composeAndSendDigest`: snapshot the HTML once per role, pass the id to each send.
- [x] `GET /api/logs/digest-message?id=` endpoint, gated like `/api/logs`.
- [x] `MedlaneAPI.getDigestMessage(id)` + export.
- [x] `showAuditLogDetail`: "View message sent" button; `showDigestMessagePreview()` iframe.

## Part B — Discord workflow events
- [x] `DISCORD_EVENT_MODULES` constant (adds `payments`); used in poster + both save endpoints.
- [x] `postWorkflowEventToDiscord()` helper.
- [x] `postNewRecordEventsToDiscord` → `postRecordEventsToDiscord`: create + status-transition
      diffing for PO / inventory PO / paymentRequests / pendingTransfers / payments.
- [x] State-PUT endpoint: dedicated `eventBeforeRows` via `supabaseFetchAll`.
- [x] Records endpoint: extended module list.
- [x] `/api/purchase-orders/:id/approve`: explicit "Inventory Purchase Order Approved" post.
- [x] `/api/stock-receipts/:id/approve`: explicit "Stock Receipt Approved" post.

## Verify
- [x] `node --check` (worker.js, api-client.js, modules.js).
- [x] `npx wrangler deploy --dry-run`.
- [ ] Post-deploy: SC-1..SC-5 (see spec).

## Follow-up (not done)
- [ ] Prune / lifecycle-rule the `digest-messages/` R2 prefix.
- [ ] Broadcast expense + demo-request approvals if wanted.

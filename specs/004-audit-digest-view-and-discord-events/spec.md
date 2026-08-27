# Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events

**Feature Branch**: `004-audit-digest-view-and-discord-events`

**Created**: 2026-08-27

**Status**: Implemented

**Input**: User: "for the audit log on email digest can you add a view message, so you can see
what message they get. also [these events] should also be posted on discord — status of stock
transfer, created collections, and approved [POs]. right now it's all new purchase order or
inventory PO only."

## Part A — View the digest email from Audit Logs

Digest emails are logged (`Email sent` / `Email failed`, module `Email`) but the rendered
message was never kept, so there was no way to see what a recipient actually received.

### Requirements

- **FR-A1**: When a digest email is sent, the exact rendered HTML MUST be stored (one snapshot
  per digest run per recipient role — all recipients of a role get the identical email).
- **FR-A2**: The matching audit-log rows (`Email sent` and `Email failed`) MUST carry a
  reference (`digestMessageId`) to that snapshot.
- **FR-A3**: The main Audit Logs "Details" modal MUST show a **View message sent** button when
  the row has a `digestMessageId`, opening the stored HTML in a sandboxed preview.
- **FR-A4**: Retrieval MUST require the same permission as viewing audit logs
  (Superadmin/CEO or the `logs` view permission).
- **FR-A5**: Storage failure MUST NOT stop the digest from sending.

### Design

- `saveDigestMessageSnapshot()` gzips the HTML into R2 at
  `digest-messages/<stateKey>/<uuid>.html.gz` with `customMetadata`
  (periodLabel, role, subject, createdAt); returns the uuid.
- `composeAndSendDigest()` calls it once per role, passes `digestMessageId` to
  `sendResendEmail()`, which forwards it via a new `extra` field on `recordSystemLog()`.
- `GET /api/logs/digest-message?id=<uuid>` → permission gate → `readDigestMessageSnapshot()`
  (uuid-shape validated, R2 get, gunzip) → JSON `{ html, subject, role, periodLabel, createdAt }`.
- Client: `MedlaneAPI.getDigestMessage(id)`; `showAuditLogDetail` renders the button;
  `showDigestMessagePreview()` shows the HTML in an `<iframe sandbox="" srcdoc>`.

## Part B — Broadcast workflow status changes / approvals to Discord

`postNewRecordEventsToDiscord` only fired on **record creation** for sales POs, inventory POs,
new collection-approval requests, and new pending transfers. Status changes and approvals were
invisible on Discord.

### Requirements

- **FR-B1**: Renamed to `postRecordEventsToDiscord`; it now diffs stored-vs-incoming for the
  event modules and posts on both creation and meaningful status transitions.
- **FR-B2**: **Stock transfers** — post on: created (existing), dispatched (`In Transit`),
  received (`Received` / `Partially Received`), cancelled.
- **FR-B3**: **Collections** — `payments` added as an event module. Post on: collection
  recorded (new payment row), collection status change (e.g. Deposited, Bounced).
- **FR-B4**: **Payment requests** — post on: approved (collection approved & payment recorded),
  cancelled/rejected.
- **FR-B5**: **Purchase orders** (sales + inventory) — post on: approved.
- **FR-B6**: The two approvals that run through dedicated endpoints (not the bulk save path) —
  **inventory PO approve** (`/api/purchase-orders/:id/approve`) and **stock receipt approve**
  (`/api/stock-receipts/:id/approve`) — post explicitly via `postWorkflowEventToDiscord()`.
- **FR-B7**: The before/after diff MUST read the *complete* stored set of the event modules
  (paged via `supabaseFetchAll`), so a truncated read never makes an existing record look new
  and double-post. The fresh pre-write read also prevents a dedicated-endpoint approval from
  being re-posted by a follow-up bulk save.
- **FR-B8**: A Discord post failure MUST be swallowed (logged as `Discord event post failed`)
  and never fail the underlying save/approval.

### Design

- `DISCORD_EVENT_MODULES = [purchaseOrders, inventoryPurchaseOrders, paymentRequests,
  pendingTransfers, payments]` — one constant, used by the poster and both save endpoints.
- `postWorkflowEventToDiscord(env, profile, { title, color, fields, label })` — thin wrapper
  over `sendDiscordWebhook` + `discordEventEmbed`, with the standard failure log.
- State PUT path: circuit-breaker `beforeRows` unchanged (single capped page, counts only); a
  separate `eventBeforeRows = supabaseFetchAll(eventModules, data)` feeds the poster.
- Records path: already paged; just uses the extended module list.

## Success Criteria

- **SC-1**: Opening a `Email sent — … Digest` row in Audit Logs → Details shows **View message
  sent** and the preview matches the delivered email.
- **SC-2**: Dispatching, receiving, or cancelling a stock transfer posts to Discord.
- **SC-3**: Approving a payment request / recording a collection / changing a collection's
  status posts to Discord.
- **SC-4**: Approving a sales PO, inventory PO, or stock receipt posts to Discord.
- **SC-5**: No duplicate Discord posts for a single approval; no post failure ever surfaces as
  a failed save.

## Assumptions / Out of scope

- Digest message snapshots are small (~15 KB gzipped × ~3/day) and are **not** pruned in this
  version — an R2 lifecycle rule or a scheduled sweep is a follow-up.
- Non-digest emails (invites) do not get a snapshot — only digests were asked for.
- Expense ("Approved expense") and demo-request approvals are not broadcast in this version.
- No change to what is written to the audit log itself (those entries already existed).

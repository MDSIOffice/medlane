# Feature Specification: Editable Inventory Stock Rows with Change History and Notes

**Feature Branch**: `002-inventory-stock-edit-history`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "in masterlist of items. allow edit of quantity, lot number, and expiry date. add a history button for each item to track changes, who made the change, date, and what was changed. also add another column notes so they can put a note on each item."

**Scope clarification**: Quantity, lot number, and expiry date do not exist on item masterlist
records (`data.items` = code / name / brand / UOM / supplier / classification). They live on
**inventory stock records** (`data.inventory`), one row per item + branch + lot, shown under
**Inventory → Stocks**. This feature makes those rows editable and adds per-row history + a notes
column there. The item masterlist tab is unchanged.

## Clarifications

### Session 2026-08-27

- Q: Which screen becomes editable? → A: Inventory → Stocks table (stock rows), not the item masterlist.
- Q: Who may edit stock quantity / expiry? → A: Admin, CEO, Superadmin only (Logistics, Sales, Product Specialist, Engineering stay view-only for these fields). Role-based; custom permissions do not grant it.
- Q: Reason required on a quantity change? → A: Yes, a typed reason is mandatory for any quantity adjustment. Expiry-only or note-only edits may add a reason but do not require one.
- Q: Do stock quantity edits accept decimals? → A: Yes for non-equipment items (e.g. 0.5); equipment stock stays whole-number.
- Q: How does a quantity edit work — set the total, or adjust by an amount? → A: **Adjust by an amount** (+N / −N) with a reason. The system applies the signed delta to the current quantity. This keeps the audit unambiguous and reduces lost-update risk against concurrent invoicing/transfers.
- Q: Is lot-number editing in this version? → A: **No — deferred to a follow-up.** Editing the lot changes the stock row's server identity (`code|branch|lot`) and needs a persistence-key change that cannot be verified without a local environment. v1 ships quantity + expiry + notes + history, none of which change the row key.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjust a stock row's quantity, or correct its expiry (Priority: P1)

An Admin, CEO, or Superadmin viewing **Inventory → Stocks** can open an Edit control on any stock
row. They can:

- **Adjust the quantity** by entering a signed amount (e.g. `+5`, `-3`) together with a required
  reason. The system re-reads the current server quantity, applies the delta, and saves the new
  quantity.
- **Correct the expiry date** (reason optional).

Saving overwrites the same stock row, appends a history entry (actor, Manila-time timestamp, each
field's before/after, the reason), persists to the server, and writes an activity-log line. Users
without the role see the row read-only with no Edit control, and a forged edit is rejected
server-side.

**Why this priority**: This is the core correction path and the only part that mutates stock
outside the controlled receipt/transfer/invoice flows. It must be correct, gated, and audited.

**Independent Test**: Log in as Superadmin, open Inventory → Stocks, click Edit on a row, enter
`+5` with reason "cycle count correction", save. Confirm the row quantity rose by 5, the History
button lists the change with your name, the delta, and the reason, and a reload from the server
keeps the change.

**Acceptance Scenarios**:

1. **Given** an Admin/CEO/Superadmin on Inventory → Stocks, **When** they click Edit on a stock
   row, **Then** a dialog opens showing the current quantity (read-only), an adjustment field, an
   expiry field pre-filled with the current value, a note field, and a reason field.
2. **Given** the edit dialog with a non-zero adjustment and no reason typed, **When** the user
   tries to save, **Then** the save is blocked with a message that a reason is required for a
   quantity adjustment.
3. **Given** the edit dialog with adjustment `+5` and a typed reason, **When** the user confirms
   the final save, **Then** the row's quantity becomes current + 5, a history entry is appended
   (actor, Manila timestamp, `Quantity: X → X+5`, reason), the row is persisted, and an
   activity-log line "Edited stock record" is written.
4. **Given** the edit dialog with an adjustment that would take the quantity below zero, **When**
   the user tries to save, **Then** the save is blocked with a message.
5. **Given** an equipment stock row, **When** the user enters a fractional adjustment, **Then**
   the save is blocked ("equipment quantity must be a whole number"); the expiry field is hidden
   for equipment (its expiry is "N/A").
6. **Given** a user changes only the expiry date, **When** they save without a reason, **Then**
   the save succeeds and the history entry records the expiry from→to with an empty reason.
7. **Given** a Logistics, Sales, Product Specialist, or Engineering user on Inventory → Stocks,
   **When** they view the table, **Then** no Edit control is shown on any row.
8. **Given** a forged `/api/modules/records` request from a non-Admin/CEO/Superadmin that changes
   a stored stock row's quantity or expiry, **When** the server processes it, **Then** it is
   rejected with a permission error and nothing is persisted.
9. **Given** two stock movements race (an invoice serves the same lot while the dialog is open),
   **When** the user saves a `+N` adjustment, **Then** the delta is applied on top of the
   server's current quantity as re-read at dialog open (residual race window limited to dialog
   open time; the audit still records the intended `+N` and reason).

### User Story 2 - View a stock row's change history (Priority: P2)

Any user who can view Inventory → Stocks sees a **History** button on each stock row. It opens a
read-only timeline of every change made to that row through the edit dialog: the actor, the
Manila-time timestamp, each field that changed with its old and new value, and the reason (when
one was given). Rows with no recorded changes show an empty-state message.

**Why this priority**: The audit trail is the point of the request, but it only has content once
Story 1 exists. Shipping both together is expected.

**Independent Test**: After editing a row twice (once quantity, once expiry), click History on
that row and confirm both entries appear newest-first with the correct actor, fields, values, and
reasons.

**Acceptance Scenarios**:

1. **Given** a stock row that has been edited, **When** any Inventory viewer clicks its History
   button, **Then** a dialog lists each change newest-first with actor, timestamp, changed fields
   (from→to), and reason.
2. **Given** a stock row that has never been edited through this feature, **When** a user clicks
   History, **Then** the dialog shows "No changes recorded for this stock record yet."
3. **Given** the History dialog is open, **When** the user closes it, **Then** no data is
   modified and focus returns to the inventory table.

### User Story 3 - Add a free-text note to a stock row (Priority: P3)

Editors can attach a short free-text **note** to any stock row (e.g. "quarantined pending QA",
"customer-reserved verbally"). The note shows as its own **Notes** column in the Inventory →
Stocks table and is edited in the same edit dialog. Clearing the note is allowed. A note-only
change does not require a reason but is still recorded in the row's history.

**Why this priority**: Independent of quantity/expiry correctness; useful but not urgent, and
safe to ship last or separately.

**Acceptance Scenarios**:

1. **Given** the edit dialog, **When** an editor types a note and saves, **Then** the note
   persists, appears in the Notes column for that row, and a history entry records the note
   from→to.
2. **Given** a row with an existing note, **When** an editor clears the field and saves, **Then**
   the Notes column shows the empty state and history records the removal.
3. **Given** a long note, **When** it is displayed in the table, **Then** the column stays
   readable (truncated with the full text available on hover or in the edit dialog).

### Edge Cases

- **Adjustment below zero**: rejected — quantity cannot go negative. Reaching exactly zero is
  allowed (a lot can be fully depleted).
- **Equipment stock**: adjustment must be a whole number; the expiry field is hidden (equipment
  expiry is "N/A").
- **Quantity below outstanding PO demand after adjustment**: the "Reserved" column reflects
  pending demand from open client POs and can already exceed stock in normal operation, so the
  save is allowed but the confirmation warns "resulting quantity (X) is below pending PO demand (Y)".
- **Expiry in the past**: allowed (existing stock genuinely expires; it becomes "For Disposal").
- **No effective change**: if the user opens Edit and saves with a zero adjustment, unchanged
  expiry, and unchanged note, no history entry is written and no save is issued.
- **Concurrent edit / stale row**: the dialog re-reads server state on open; the standard
  save-conflict/retry path applies as elsewhere. Residual race limited to dialog-open duration.
- **Archived item**: not reachable — an item cannot be archived while it has stock on hand, so no
  stock row exists for an archived item.
- **History growth**: each row keeps at most the 50 most recent history entries; older entries
  are dropped (matching the transfer-history cap pattern).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Inventory → Stocks table MUST show an **Edit** control on each stock row for
  users whose role is Admin, CEO, or Superadmin, and MUST NOT show it for any other role. The
  gate is role-based only — custom permissions do not grant it.
- **FR-002**: Opening the edit dialog MUST re-read current server state so the displayed
  quantity, expiry, and note reflect the latest values before the user edits.
- **FR-003**: The edit dialog MUST let the user change quantity only by entering a signed
  adjustment amount (e.g. +5, −3); it MUST NOT offer a direct "set total" field.
- **FR-004**: A quantity adjustment MUST be applied as `new quantity = current quantity + delta`,
  where `current quantity` is the server value re-read at dialog open (FR-002).
- **FR-005**: Adjustment amounts MUST accept decimals for non-equipment items and MUST be
  rejected for equipment items unless a whole number. Non-numeric input MUST be rejected.
- **FR-006**: A save whose adjustment is non-zero MUST require a non-empty typed reason; the save
  MUST be blocked with a clear message when the reason is missing.
- **FR-007**: A save that changes only the expiry, only the note, or both (adjustment zero) MUST
  NOT require a reason.
- **FR-008**: A save that would make the resulting quantity negative MUST be blocked.
- **FR-009**: On every save that changes at least one tracked field (quantity, expiry, note), the
  system MUST append a history entry to that stock row containing: actor name, a timestamp
  rendered in Asia/Manila, a list of `{field, from, to}` for each changed field, and the reason
  string (empty when none was required or given).
- **FR-010**: The system MUST persist the updated stock row and its history via the per-record
  save path and MUST write an activity-log entry naming the stock row and the actor.
- **FR-011**: The server MUST reject any request that changes a stored stock row's quantity or
  expiry when the acting user's role is not Admin, CEO, or Superadmin, by diffing the incoming
  record against the stored record (the UI gate alone is not sufficient). Requests that create a
  new stock row (no stored match — e.g. receiving, transfers) MUST be unaffected.
- **FR-012**: Every stock row MUST show a **History** button available to all Inventory viewers,
  opening a read-only, newest-first timeline of that row's history entries, with an empty-state
  message when there are none.
- **FR-013**: The Inventory → Stocks table MUST include a **Notes** column showing each row's
  note (empty-state when blank, truncated-with-full-text-on-hover when long).
- **FR-014**: The note MUST be editable (including clearing) in the edit dialog by Admin, CEO,
  and Superadmin users, and note changes MUST be recorded in row history.
- **FR-015**: The system MUST cap each stock row's stored history at the 50 most recent entries.
- **FR-016**: The final-save confirmation MUST warn when the resulting quantity is below the
  row's current pending-PO demand, but MUST NOT block the save on that basis.
- **FR-017**: The feature MUST NOT change how a stock row is keyed on the server; lot / serial /
  branch / item / code remain non-editable in this version.

### Key Entities *(include if feature involves data)*

- **Inventory stock record** (`data.inventory[]`): existing entity — branch, brand, code, item,
  serial, lot, expiry, qty, min, reserved. This feature adds two optional fields:
  - `note` (string): free-text note shown in the Notes column.
  - `history` (array): change entries, newest-first, capped at 50.
- **Stock history entry**: `{ at (Asia/Manila display string), by (actor name), changes: [{ field, from, to }], reason (string, may be empty) }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can correct a wrong stock quantity or expiry and see it
  reflected in the table in under 30 seconds, without going through a stock receipt or transfer.
- **SC-002**: 100% of stock-row edits made through this feature produce a history entry that
  names the actor, the time, every changed field with before/after values, and (for quantity
  adjustments) a reason.
- **SC-003**: A non-authorized role sees zero Edit controls on the Inventory → Stocks table, and
  a forged edit request is rejected by the server in 100% of attempts.
- **SC-004**: The stock-row count for any item + branch is unchanged by this feature — no row is
  created or orphaned by an edit (the server key is never touched).
- **SC-005**: Every stock row exposes a working History button and a Notes column.

## Assumptions

- The target is the existing **Inventory → Stocks** table (`renderInventory` / `#inventory-table`);
  the item masterlist tab is out of scope.
- History is **forward-only** — there is no reconstruction of changes made before this feature
  (prior stock movement remains visible only through receipts, transfers, and invoices).
- History entries are written client-side, matching every other `history` array in the app
  (payment requests, product issues); the server-side guard (FR-011) is the tamper boundary.
- The permission set for editing is exactly {Admin, CEO, Superadmin}, matching the masterlist-edit
  gate; the same server-side diff-enforcement approach used for masterlist archiving is reused.
- Stock rows are keyed by item + branch + lot on the server and none of those are editable in
  this version, so no persistence-key change is needed.
- No local development environment exists; changes are verified against the deployed app, so the
  feature is built to be small, self-contained, and reversible.
- "Reserved" in the Inventory table means pending demand from open client POs (advisory), not a
  hard commitment, so quantity edits are warned-on but not blocked by it.

## Deferred to a follow-up

- **Editing the lot / serial number** of an existing stock row. Requires either a stable
  synthetic key on inventory records plus dual-write-path row resolution in `src/worker.js`, or
  server-side delete support — neither verifiable without a local environment. Track as `003-*`.
- Editing `min` / reorder point, brand, code, item, or branch on a stock row.
- Bulk stock edits; an approval workflow for stock corrections; server-authoritative history.

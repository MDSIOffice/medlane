# Feature Specification: Masterlist Archive, Editable Submitted Client POs, Decimal PO Quantities, Login Preview Refresh

**Feature Branch**: `001-masterlist-archive-po-edits`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "medlane/login still have the old preview. update as well please. add an archive feature in masterlist. can only be done by CEO or superadmin with double confirmation and can be restored. allow edits in purchase order once submitted. allow in quantities in purchase to accept decimal if less than 1. example 0.5."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive and restore a masterlist record (Priority: P1)

A CEO or Superadmin viewing any masterlist tab (Clients, Items, Suppliers, Employees, Banks)
can archive a record they no longer want appearing in day-to-day pickers and tables, and can
later restore it. Archiving requires the user to type the record's exact name/code to confirm,
followed by the standard final-save confirmation. Archived records are hidden from the default
masterlist view and from datalists/selectors used when building transactions, but remain in the
database and on historical documents. A separate "Archived" filter reveals them with a Restore
action.

**Why this priority**: This is the core of the request and the only part introducing a new,
irreversible-looking state and a new permission gate. It must be correct and safe.

**Independent Test**: Log in as Superadmin, archive an unused item, confirm it disappears from
the Items tab and from the PO item datalist, switch to the Archived filter, restore it, confirm
it returns everywhere.

**Acceptance Scenarios**:

1. **Given** a Superadmin on the Items tab, **When** they click Archive on an item, type the
   item's exact code when prompted, and confirm the final save, **Then** the item is flagged
   archived, persisted to the server, written to the activity log, and removed from the active
   Items table.
2. **Given** a non-CEO/non-Superadmin user, **When** they view a masterlist tab, **Then** no
   Archive control is shown, and a forged archive request is rejected by the server.
3. **Given** an archived client, **When** any user builds a new PO, sales invoice, or other
   transaction, **Then** that client does not appear in the client datalist/select.
4. **Given** a Superadmin on the Archived filter, **When** they click Restore on a record and
   confirm, **Then** the record's archived flag is cleared, persisted, logged, and the record
   reappears in the active view and all pickers.
5. **Given** a user types the wrong name/code at the archive confirmation prompt, **When** they
   submit, **Then** the archive is aborted with a message and nothing is persisted.
6. **Given** an archived record, **When** historical documents or reports that already reference
   it are viewed, **Then** they still render the record's data unchanged.

---

### User Story 2 - Edit a client Purchase Order after it is submitted (Priority: P2)

A user who can create client POs can edit a submitted client PO (`PO-xxx`) that has **no invoices/DRs against it yet** —
correcting the client, date, or line items (item, quantity, unit, price). The edit
reuses the PO creation modal, pre-filled with the current PO. Saving overwrites the existing PO
record (same PO number), appends an audit-log entry, and re-runs PO validation. Once any quantity
on the PO has been served, the PO is locked and the Edit control disappears (use cancel/replace
downstream flows instead).

**Why this priority**: High-value correction path, but lower risk than archive because POs are
already mutable server-side through the same persistence route; the work is mostly UI plumbing
plus a guard.

**Independent Test**: Create a PO, then click Edit on it, change a line quantity and the date,
save, and confirm the PO row and any downstream invoice pickers reflect the change with the same
PO number and a new history entry.

**Acceptance Scenarios**:

1. **Given** a client PO in "For Invoicing" or "Pending Orders" status, **When** an authorized
   user clicks Edit, **Then** the PO modal opens pre-filled with the PO's client, date, and lines.
2. **Given** the pre-filled PO edit modal, **When** the user changes lines and confirms the final
   save, **Then** the PO record is replaced in place (same `id`), an audit-log entry is written,
   and the change is persisted to the server.
3. **Given** a PO line that has already been partially served, **When** the user tries to save an
   edit that sets that line's quantity below the served quantity, **Then** the save is rejected
   with a message naming the line and its served quantity.
4. **Given** a client PO whose ordered quantities are fully served (terminal status), **When** an
   authorized user views it, **Then** no Edit control is offered.
5. **Given** an unauthorized user, **When** they view POs, **Then** no Edit control is shown.

---

### User Story 3 - Enter decimal quantities on purchase order lines (Priority: P2)

When building or editing a client PO, a user can enter a fractional quantity such as `0.5` on a
line. The quantity field accepts any value greater than zero (decimals allowed, e.g. `0.5`,
`1.5`, `2.25`). Downstream quantity math (served/pending, invoice-against-PO limits, totals)
already operates on numbers and continues to work with fractional values. Invoice/DR line
quantities are likewise allowed to be fractional so a fractional PO line can be served.

**Why this priority**: Small, self-contained change, but it must land with Story 2 so the edit
modal and create modal behave identically.

**Independent Test**: Create a PO with a line quantity of `0.5`, save, and confirm the PO total,
pending quantity, and the invoice-against-PO flow all accept and display `0.5`.

**Acceptance Scenarios**:

1. **Given** the PO create or edit modal, **When** the user types `0.5` in a line quantity,
   **Then** the form accepts it and the PO saves with `qty: 0.5`.
2. **Given** a PO line of `0.5`, **When** a user creates an invoice against that PO, **Then** the
   invoice line quantity field accepts `0.5` and the pending-quantity check passes.
3. **Given** a quantity of `0` or a negative value, **When** the user tries to save, **Then**
   validation rejects it as before.

---

### User Story 4 - Login page shows the current social preview (Priority: P3)

The `/login/` page's social-preview / Open Graph metadata matches the current site metadata used
by the root page (same image version, canonical domain, and icons), so link unfurls and browser
tabs for the login URL show the up-to-date branding.

**Why this priority**: Cosmetic/metadata only, no logic, but explicitly requested.

**Independent Test**: View source of `public/login/index.html` and confirm the `og:image`,
`twitter:image`, `og:url`, canonical, `og:updated_time`, and icon links match the current values
in `public/index.html`.

**Acceptance Scenarios**:

1. **Given** the deployed login page, **When** its URL is shared or previewed, **Then** the
   preview image is the current `medlane-social-preview.jpg` version, not the stale `20260730b`
   version.
2. **Given** the login page, **When** it loads, **Then** its redirect behavior (session →
   `/dashboard`, otherwise `/?login=1`) is unchanged.

### Edge Cases

- Archiving a record that is still referenced by open transactions: allowed; the record stays
  usable on those existing transactions but cannot be picked for new ones. No cascade.
- Restoring a record whose unique key (name/code) now collides with a newer active record:
  restore is blocked with a message; user must rename one of them first.
- Editing a PO to remove a line that has already been served: blocked (same served-quantity
  guard as reducing quantity below served).
- Decimal quantity with many decimal places (e.g. `0.333333`): accepted as typed; display
  formatting is not changed by this feature.
- Two admins editing the same PO concurrently: last write wins, consistent with existing
  per-record save behavior.
- A user with masterlist edit permission but not CEO/Superadmin attempting archive via crafted
  API call: server rejects the archived-flag transition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a user whose role is CEO or Superadmin archive a record in any
  masterlist (clients, items, suppliers, employees, banks) by setting a persisted `archived`
  flag on that record.
- **FR-002**: The archive action MUST require two confirmations: (a) the user types the record's
  exact identifying value (item code, client/supplier/bank name, or employee email/name) and
  (b) the standard final-save confirmation dialog.
- **FR-003**: The system MUST let a CEO or Superadmin restore an archived record, clearing the
  `archived` flag, subject to a single final-save confirmation.
- **FR-004**: The system MUST hide archived records from the default masterlist tables and from
  all datalists/selects used to build new transactions (PO, invoice, inventory PO, payment
  request, demo request, etc.).
- **FR-005**: The system MUST provide a way to view archived records per masterlist tab (a filter
  or toggle) with a Restore action, visible only to CEO/Superadmin.
- **FR-006**: The server MUST reject any record save that adds or removes an `archived` flag on a
  masterlist record when the requesting profile's role is not CEO or Superadmin.
- **FR-007**: The system MUST write an activity-log entry for every archive and restore action,
  including the acting user and the record identity.
- **FR-008**: Archived records MUST remain intact in storage and MUST continue to render on
  historical documents, reports, and existing transactions that reference them.
- **FR-009**: The system MUST offer an Edit action on a client PO (`PO-xxx`) only while the PO is
  not cancelled/terminal AND has zero served quantity across all its lines (no non-cancelled
  invoice/DR references it); visible only to users who can create client POs.
- **FR-010**: Editing a client PO MUST reuse the PO creation modal pre-filled with the PO's
  current client, date, and line items, and MUST save back to the same PO `id`.
- **FR-011**: Saving a PO edit MUST re-run PO build validation. If any served quantity has
  appeared on the PO between opening and saving the edit, the save MUST be rejected.
- **FR-012**: Saving a PO edit MUST append a PO history entry recording the edit, the acting
  user, and a timestamp in Asia/Manila time, and MUST write an activity-log entry.
- **FR-013**: PO line quantity inputs (create and edit) MUST accept any value greater than zero,
  including decimals such as `0.5`; values `<= 0` MUST remain invalid.
- **FR-014**: Invoice / DR / TS line quantity inputs MUST also accept decimal values greater than
  zero so fractional PO lines can be served.
- **FR-015**: The `/login/` page metadata (`og:image`, `og:image:secure_url`, `twitter:image`,
  `og:url`, canonical link, `og:updated_time`, and icon/apple-touch-icon links) MUST be updated
  to match the current values in `public/index.html`.
- **FR-016**: The login page's existing redirect behavior MUST be unchanged.
- **FR-017**: The root-level stale copies (`/index.html`, `/login/index.html`, `/styles.css`,
  `/scripts/`) MUST NOT be edited; only files under `public/` are deployed.
- **FR-018**: A masterlist record MUST NOT be archivable while it has any open/incomplete
  activity: for a client — an unserved PO, an unpaid invoice, an open collection, or an active
  demo unit; for an item — an unserved PO, an open inventory PO, stock on hand, a pending stock
  transfer, or an active demo; for a supplier — an open inventory PO or an unpaid payable; for
  an employee — an open expense request or an active demo as sales agent; for a bank — an open
  collection or an unpaid cheque payable. The user must complete or cancel it first.
- **FR-019**: An archived item MUST be rejected by the PO/invoice/inventory-PO build validators
  for NEW lines. Exceptions: an item already on the client PO being served (invoicing), and an
  item already on the client PO being edited. An archived client MUST be rejected when building
  a new PO.
- **FR-020**: Editing a client PO MUST be rejected server-side when the stored PO already has a
  non-cancelled invoice/DR referencing it and the incoming lines/client/date differ (defends
  FR-011 against a stale client bypassing the client-side check).
- **FR-021**: Equipment-classified item lines MUST reject non-integer quantities even though
  decimals are allowed elsewhere.
- **FR-022**: The PO completion check MUST tolerate floating-point drift so fractional line
  quantities that sum to ~0 still mark the PO complete.

### Key Entities *(include if feature involves data)*

- **Masterlist record** (client, item, supplier, employee, bank): gains an optional `archived`
  boolean. Absent/false = active. Identity keys unchanged (item: code; client/supplier/bank:
  name; employee: email/name).
- **Client Purchase Order** (`purchaseOrders`): existing entity; `lines[].qty` may now be
  fractional; `history[]` gains "Edited" entries.
- **Invoice/DR/TS line** (`sales[].lines[]`): `qty` may now be fractional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A CEO/Superadmin can archive and then restore any masterlist record end-to-end
  without a page reload, and the record's visibility flips correctly in every table and picker.
- **SC-002**: 100% of archive/restore actions produce an activity-log entry and a server-persisted
  change; 0 archived records appear in new-transaction pickers.
- **SC-003**: A non-CEO/Superadmin cannot archive a record through the UI or a direct API call
  (server returns a permission error).
- **SC-004**: An authorized user can correct a submitted client PO (lines, date, client) in under
  a minute, keeping the same PO number, with the change reflected in downstream invoice pickers.
- **SC-005**: A PO and its serving invoice can both carry a `0.5` line quantity with correct
  pending/served math.
- **SC-006**: The login URL's link preview shows the same image version as the root URL.

## Assumptions

- "Masterlist" = the Masterlists module tabs: clients, items, suppliers, employees, banks.
  Platform branches are excluded (they already have their own used/unused lifecycle).
- "Purchase order" for the edit feature = the client-side PO (`PO-xxx`, sales module). Inventory
  POs (`IPO-xxx`) keep their existing approve/advance/cancel lifecycle and are out of scope.
- "Double confirmation" = type-the-name confirmation followed by the existing final-save
  confirmation, consistent with the app's backup-restore ("type RESTORE") idiom.
- Decimal quantities are allowed with no artificial upper bound and no forced rounding; only
  `qty > 0` is enforced.
- Server-side archive enforcement is added to the existing `/api/modules/records` route by
  comparing the incoming record's `archived` flag against the stored row.
- Archived records are excluded via a shared helper so all render paths and pickers stay
  consistent; historical documents read from stored transaction lines, not the live masterlist,
  so they are unaffected.
- No local dev environment exists; verification is by code review, existing test scripts, and
  targeted manual checks against the deployed app by the user.
- The user holds git push access; changes are committed locally for the user to push.

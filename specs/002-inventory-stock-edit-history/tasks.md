# Tasks: 002-inventory-stock-edit-history

Ordered by user story priority. `[P]` = parallelizable with the task above it.
No repo test suite / no local dev env — verification is `node --check`, `wrangler deploy
--dry-run`, and a live pass by the user.

## Foundational (blocks US1)

- T001 `state.js`: add `canEditStockRecord()` → `["Admin","Superadmin","CEO"].includes(currentUser?.role)`, near `canEditModule`.
- T002 `state.js` (or `events-bootstrap.js`): add `refreshInventoryFromServer()` — `loadAppState()`
  → merge `.inventory` back into `data` (scoped; fall back to full `data` refresh like
  `restoreBackupFromRef` if scoping is not clean). No-throw on network failure (return a flag).
- T003 `src/worker.js` (`grep -a`): field-level guard for stored `inventory` rows in
  `/api/modules/records` (~L2977, beside the archive guard) AND the `/api/modules/state` PUT
  (~L2726). Batch-fetch stored rows by `record_key in (...)`; if incoming `Number(qty)` or
  `expiry` differs from stored and `!["Admin","CEO","Superadmin"].includes(profile.role)` →
  `throw new Error("Only Admin, CEO, or Superadmin can edit stock quantity or expiry")`. Rows
  with no stored match pass through untouched.

## US1 — Adjust quantity / correct expiry (P1)

- T010 `modules.js` `renderInventory()`: add `"Notes"` and `"Actions"` to BOTH `inventoryHeaders`
  arrays (compact + full). Recompute the compact `fullCells.slice(3)` — after adding Notes +
  Actions, count the leading non-compact columns and adjust the slice so compact still starts at
  "Item Name" and still includes the trailing Notes + Actions.
- T011 `modules.js` `renderInventory()` row cells: append
  - Notes: `i.note ? \`<span class="inventory-note-cell" title="${escapeHtml(i.note)}">${escapeHtml(i.note)}</span>\` : '<span class="muted-cell">—</span>'`
  - Actions: `\`${canEditStockRecord() ? \`<button class="mini-button" data-stock-edit="${ref}">Edit</button> \` : ""}<button class="mini-button" data-stock-history="${ref}">History</button>\``
  where `ref = escapeHtml(\`${i.code}|${i.branch}|${i.lot || i.serial}\`)`.
- T012 `modules.js`: `stockRowByRef(ref)` → `data.inventory.find(i => \`${i.code}|${i.branch}|${i.lot||i.serial}\` === ref)`; returns the live object.
- T013 `modules.js`: `openStockEditDialog(ref)` —
  1. guard `canEditStockRecord()`.
  2. `const ok = await refreshInventoryFromServer();` (toast a soft warning if it failed but continue).
  3. `const row = stockRowByRef(ref); if (!row) return toast("Stock record no longer exists.");`
  4. `const equipment = isEquipmentItem(data.items.find(x => x.code === row.code) || {});`
  5. build `<dialog class="modal">` + wrapping `<form>`: current-qty (read-only), adjustment
     (`type=number step=${equipment ? '1' : 'any'}`), live new-qty (read-only), expiry
     (`type=date`, prefill, **omit when `row.expiry === "N/A"` or equipment**), note (textarea,
     prefill), reason (text). `input` listener recomputes new-qty and toggles `reason.required`
     when adjustment ≠ 0. Cancel + Save. `showModal()`; remove on close.
- T014 `modules.js`: `saveStockEdit(ref, form)` — steps exactly per plan.md decision 4:
  resolve row → capture `original` → parse `delta` (reject NaN; reject fractional for equipment)
  → `newQty = original.qty + delta` (reject `< -1e-9`) → build `changes[]` (Quantity/Expiry/Note)
  → empty ⇒ close no-op → `delta !== 0 && !reason.trim()` ⇒ toast+abort →
  `confirmFinalSave(msg + belowDemandNote)` → apply qty/expiry/note → prepend history entry,
  `.slice(0,50)` → `persistRecords({ inventory: [row] })` → on `res.ok`:
  `log("Edited stock record","Inventory", …, {save:false})` → close → `renderInventory()` → toast.
- T015 `events-bootstrap.js`: delegated click handlers for `[data-stock-edit]` →
  `openStockEditDialog(...)` and `[data-stock-history]` → `showStockHistory(...)`, wired the same
  way `[data-transfer-timeline]` is.
- T016 `modules.js`: exclude `history` from `includesSearch` for inventory rows (filter values or
  drop the key before `Object.values` in the inventory `.filter(...)`).
- T017 Verify US1: as Superadmin `+5` with reason → qty +5, status recomputes, reload persists;
  `-9999` → blocked (negative); equipment fractional → blocked, no expiry field shown; expiry to
  a past date → row flips to For Disposal / Near Expiry; as Logistics → no Edit button and a
  hand-crafted `/api/modules/records` qty change is 403'd; a Logistics stock receipt still posts
  new stock fine.

## US2 — Stock row history view (P2)

- T020 `modules.js`: `showStockHistory(ref)` — `row = stockRowByRef(ref)`; read-only
  `<dialog class="modal audit-detail-modal">` (reuse `showTransferTimeline` markup) titled
  `${row.item} · ${row.branch} · ${row.lot||row.serial}`; `(row.history||[])` newest-first, each:
  `by`, `at`, one line per change `${label}: ${from} → ${to}`, `reason` when non-empty. Empty →
  "No changes recorded for this stock record yet."
- T021 Verify US2: History button visible to a view-only role; two edits show newest-first with
  correct actor / fields / values / reason; closing mutates nothing.

## US3 — Notes column (P3)

- T030 Covered by T010/T011 (display) + T013/T014 (editing). Confirm: note-only edit saves with
  no reason, shows in the column, recorded in history; clearing works and is recorded; long note
  truncates with `title`.
- T031 `styles.css`: `.inventory-note-cell { display:inline-block; max-width:14rem; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }` — only if nothing existing fits.

## Cross-cutting

- T040 `graphify update .` after implementation.
- T041 `node --check` on `state.js`, `modules.js`, `events-bootstrap.js`;
  `npx wrangler deploy --dry-run` green.
- T042 Commit locally only when the user asks; deploy target is `MDSIOffice/medlane`
  (memory `project-git-push-access`).

## Grilling follow-ups (2026-08-27, resolved)

- G1 **Lot-key drift / orphan rows** → removed from scope. Lot editing deferred to `003-*`. v1
  edits nothing that is part of the server key, so SC-004 is trivially satisfied and no
  `recordKeyFor` / `saveRecordKeyFor` change is made.
- G2 **`/api/modules/state` bulk PUT duplicating id-keyed rows** → moot (no id, no key change).
- G3 **Lost-update race on quantity** → quantity is edited as a **signed delta**, not an absolute,
  and the dialog does a fresh `loadAppState()` on open (T002/T013). Residual race = dialog-open
  window only; audit still records the intended `+N` + reason (spec US1 scenario 9).
- G4 **Equipment rows** → adjustment is integer-only for equipment; expiry field omitted when
  `expiry === "N/A"` (T013). Lot/serial not editable so no serial-vs-lot write ambiguity.
- G5 **Role gate ignores custom permissions** → intentional and documented (FR-001); matches the
  role-only archive gate.
- G6 **`reserved` column** → it is advisory pending-PO demand and can exceed qty normally, so
  FR-016 is a confirm warning, never a block.
- G7 **Non-editor roles receiving stock** → server guard fires only on a *change to a stored
  row's* qty/expiry; new rows pass through (T003, T017).
- G8 **Compact-view column math** → T010 recomputes both header arrays and the slice together.
- G9 **`includesSearch` noise** → `history` stripped from searched values (T016).
- G10 **Modal padding bug** → edit dialog uses a real wrapping `<form>` (T013).
- G11 **Timezone** → all timestamps via `generatedNoticeDate()` (Asia/Manila explicit).
- G12 **Backup/restore** → unaffected; wholesale state replacement is self-consistent.

## Status (2026-08-27) — IMPLEMENTED, not yet verified live

All tasks done. Files changed:
- `public/scripts/state.js` — `canEditStockRecord()` (Superadmin/CEO always; Admin + inventory-edit),
  `refreshInventoryFromServer()`.
- `public/scripts/modules.js` — `renderInventory()` Notes + Actions columns + `history` stripped
  from search; `stockRowByRef`, `stockRecordIsEquipment`, `openStockEditDialog`, `saveStockEdit`,
  `showStockHistory`, `STOCK_EDIT_FIELD_LABELS`.
- `public/scripts/events-bootstrap.js` — `[data-stock-edit]` / `[data-stock-history]` click handlers.
- `src/worker.js` — Admin/CEO/Superadmin guard on qty/expiry changes to stored `inventory` rows,
  in `/api/modules/records` and the `/api/modules/state` PUT. **Skipped when the payload carries a
  stock-moving companion (`sales` = invoicing, `pendingTransfers` = transfers)** so those flows for
  Sales/Accounting/Logistics are unaffected. No key-function change.
- `public/styles.css` — `.inventory-note-cell` truncation.

Verified: `node --check` all 4 files, `wrangler deploy --dry-run` green, `graphify update` (2152 nodes).
**Live verification pending** (no local env) — SC-001..SC-005: edit as Superadmin (+N with reason,
past expiry, note), confirm history + reload persistence + row count unchanged; confirm Logistics
sees no Edit button and a forged qty change is 403'd; confirm invoicing + transfers still work for
non-admins.

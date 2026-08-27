# Tasks: 001-masterlist-archive-po-edits

Ordered by user story priority. `[P]` = parallelizable with the task above it.

## US4 — Login preview refresh (P3, smallest, do first)

- T001 Update `public/login/index.html` `<head>`: set `og:image`, `og:image:secure_url`,
  `twitter:image` to `https://medlanesolutions.com/medlane-social-preview.jpg?v=20260826a`;
  `og:url` + canonical to `https://medlanesolutions.com/login/`; `og:updated_time` to
  `2026-08-26T00:00:00+00:00`; add favicon-32/16 + apple-touch-icon links + `theme-color` to
  match `public/index.html`. Leave the redirect `<script>` and `<title>` unchanged.
- T002 Verify: diff head against `public/index.html`; confirm redirect logic byte-identical.

## US3 — Decimal PO quantities (P2)

- T010 `invoiceLineTemplate()` in `modules.js`: add `allowDecimalQty` option; qty input →
  `min="${allowDecimalQty ? '0' : '1'}" step="${allowDecimalQty ? 'any' : '1'}"`.
- T011 `renderInvoiceEditor()`: thread `allowDecimalQty` through to `invoiceLineTemplate`.
- T012 `openModal()`: pass `allowDecimalQty: true` for `purchaseOrder`, `invoice`,
  `cancelReplace`, `inventoryPurchaseOrder` editor renders.
- T013 `events-bootstrap.js` "Add Item" handler (~L1182): pass `allowDecimalQty` for the same types.
- T014 `parseInvoiceLines()`: confirm zero/negative still rejected (`!qty || qty <= 0`); no change
  expected. Add a comment noting decimals are intentional.
- T015 Verify: `poLineStatus`, `poServedQty`, `lineSubtotal`, `buildSale` pending check all use
  `Number(...)` — spot-check no `parseInt` on qty anywhere. `grep -n "parseInt" modules.js`.

## US1 — Masterlist archive / restore (P1)

- T020 `state.js`: add `isArchived(r)`, `activeRecords(list)`, and
  `activeClients/activeItems/activeSuppliers/activeEmployees/activeBanks`.
- T021 `modules.js` picker sweep — replace with `active*` at: item-master datalist (L638),
  inventory code/item options (L2122-2123), `#client-options` (L2191), payable vendor (L3545),
  `modalConfigs` datalist lambdas for item/supplier/purchaseOrder/invoice/cancelReplace/
  paymentRequest(client+bank)/payable/replenishment/warranty/productIssue/instrumentalServiceReport.
  Leave analytics/forecast/collection report filters untouched.
- T022 `renderMasterlists()`: add `data.masterShowArchived` toggle button (CEO/Superadmin only);
  filter each tab's rows by archived state; when showing archived, the row action is Restore.
- T023 `renderMasterlists()`: add Archive action button per active row (CEO/Superadmin only),
  `data-master-archive="${type}" data-index="${i}"`; Restore button `data-master-restore=...`.
- T024 `modules.js`: `archiveMasterlistRecord(type, index)` — identity via `masterlistRecordKey`;
  `prompt` type-to-confirm → `confirmFinalSave` → set `archived:true` → `persistRecords({key:[rec]},
  {key:[prevKey]})` → `log("Archived masterlist record", "Masterlists", ...)` → `renderAll()`.
- T025 `modules.js`: `restoreMasterlistRecord(type, index)` — identity-collision check against
  active records → `confirmFinalSave` → clear `archived` → persist → `log` → `renderAll()`.
- T026 `events-bootstrap.js`: click handlers for `[data-master-archive]`, `[data-master-restore]`,
  and the archived toggle.
- T027 `src/worker.js` `/api/modules/records`: after building `rows`, for rows whose
  `module_name` ∈ {clients,items,suppliers,employees,banks}, batch-fetch existing rows by
  record_key; if `!!row.data.archived !== !!existing.archived` and profile.role not CEO/Superadmin
  → throw permission error. Use `grep -a`; place near the existing sales-integrity block.
- T028 Verify: archived client absent from PO/invoice/payment pickers; historical PO/invoice
  printable still shows archived item name (`.find` path intact); non-admin archive rejected.

## US2 — Editable submitted client PO (P2)

- T030 `modules.js`: add `poHasAnyServed(po)` helper. `renderPurchaseOrders()`: add Edit button
  (table + card) when PO not terminal, `!poHasAnyServed(po)`, and `canEditModule("purchaseOrders")`;
  `data-po-edit="${po.id}"`.
- T031 `modules.js`: `editPurchaseOrder(id)` → find PO, re-check not served/terminal →
  `openModal("purchaseOrder", { poEdit: po })`.
- T032 `openModal()`: when `edit.poEdit`, render editor with `po.lines`, prefill `#id` (read-only),
  `#client`, `#date`; title "Edit PO"; store `editingPoId`.
- T033 `buildPurchaseOrder(values, opts)`: when `opts.editingId`, skip duplicate-id check, look up
  the existing PO, reject if `poHasAnyServed(existing)` or status terminal, keep original
  `status`/`salesperson`/`area` (recompute `area` only if client changed), append `history`
  "Edited by <user>" entry with `poHistoryTimestamp()`.
- T034 `submitModal()` `purchaseOrder` branch: if `editingPoId`, `confirmFinalSave` →
  `replacePoRecord(po)` → `persistRecords({purchaseOrders:[po]})` → `log("Edited purchase order",
  ...)` → close/reset/render; clear `editingPoId`.
- T035 Verify: edit keeps same PO number, appears in `poInvoiceable` pickers unchanged, a PO with
  any served qty shows no Edit button and is rejected server-of-record-side on save, terminal PO
  shows no Edit button, unauthorized user sees none.

## Cross-cutting

- T040 `graphify update .` — DONE (2106 nodes).
- T041 No repo test suite / package.json. `node --check` clean on all 4 modified JS files.
  `npx wrangler deploy --dry-run` passes (46 assets, worker validates).
- T042 Commit locally when the user asks (they hold push access).

## Grilling follow-ups (2026-08-27, round 2) — DONE

- G1 (FR-020) `src/worker.js` `/api/modules/records`: pure-PO-edit path (no `sales` in payload)
  rejects a lines/client/date change when the stored PO has a non-cancelled referencing sale.
- G2 (FR-019) `parseInvoiceLines` rejects archived items unless `options.allowArchivedItems`;
  `buildSale` and `buildPurchaseOrder`(edit) opt in, edit still blocks *newly added* archived
  lines; `buildPurchaseOrder` also blocks an archived client. `validateMasterRecord` ignores
  archived rows for name/code/TIN uniqueness so a freed name can be reused.
- G3 (FR-022) `poStatus`: `pending <= 1e-9`.
- G4 (FR-021) `parseInvoiceLines`: `equipment && !Number.isInteger(qty)` → error.
- G5 (FR-018) `masterlistRecordOpenActivity(type, record)` in `modules.js`, called from
  `archiveMasterlistRecord` before the confirm prompt. Client-side only (CEO/Superadmin are
  trusted; this is a workflow rule, not a privilege boundary).

## Status (2026-08-27)

All tasks implemented. Decimal support was made unconditional in `invoiceLineTemplate`
(`min=0 step=any`) rather than option-gated — every call site is a PO/invoice editor.
Server-side archive guard added to BOTH `/api/modules/records` and the `/api/modules/state`
PUT. Not yet verified against the live deployed app (no local env) — needs a manual pass by
the user per SC-001..SC-006.

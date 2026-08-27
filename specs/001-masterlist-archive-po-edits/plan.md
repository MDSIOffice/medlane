# Implementation Plan: 001-masterlist-archive-po-edits

**Spec**: ./spec.md
**Stack**: Vanilla JS front-end (`public/scripts/*.js`), Cloudflare Worker back-end (`src/worker.js`),
Supabase `app_records` per-record persistence. No build step. No local dev env.

## Architecture notes

- Masterlist records are plain objects in `data.clients|items|suppliers|employees|banks`, persisted
  per-record via `persistRecords({ key: [record] }, { key: [prevKey] })` →
  `MedlaneAPI.saveRecords` → `POST /api/modules/records`.
- The records route authorizes by *module* (`writableKeys(profile)` / `canAccessKey`), not by field.
  Archive needs an extra field-level guard there.
- Masterlist tables render in `renderMasterlists()` (`public/scripts/modules.js`). Masterlist edit
  flow: `openMasterEditModal()` → `openModal(type, {list,index,record})` → `submitModal()` edit branch.
- Client PO create: `modalConfigs.purchaseOrder` + `openModal("purchaseOrder")` +
  `renderInvoiceEditor([{}], {requireLot:false})`; submit → `buildPurchaseOrder()` → push + persist.
- Line quantity input is `invoiceLineTemplate()` `.invoice-qty-input` (`type=number min=1`).
  Parsing/collection: `collectInvoiceEditorLines()` → `parseInvoiceLines()` (already `Number()`-based,
  decimal-safe except the `!qty` zero-guard which is fine).
- Served qty per PO line: `poServedQty(po, code)` / `poLineStatus(po, line)`.

## Design decisions

1. **Archived flag, not deletion.** `record.archived === true` hides from active views + pickers.
   Never filter `.find()` identity lookups (history/printables must still resolve the label).
2. **Central helpers** in `state.js`: `isArchived(r)`, `activeRecords(list)` and thin wrappers
   `activeClients()/activeItems()/activeSuppliers()/activeEmployees()/activeBanks()`. Swap the
   transaction-builder picker/datalist sites to these. Report/analytics filters keep all records.
3. **Masterlist view toggle.** Add an "Archived" toggle (button in the masterlist toolbar,
   `data.masterShowArchived` boolean, not persisted). Active view = non-archived; Archived view =
   archived only, Restore action, CEO/Superadmin only.
4. **Double confirm.** New `archiveMasterlistRecord(type, index)`:
   `prompt("Type <identity> to archive")` must equal the record identity (case-insensitive trim) →
   then `confirmFinalSave(...)` → set `archived:true` → `persistRecords` → `log(...)` → `renderAll`.
   Restore: single `confirmFinalSave` (clearing a flag is low-risk), collision check on identity key.
5. **Server guard.** In `POST /api/modules/records`, for masterlist modules
   (`clients,items,suppliers,employees,banks`): fetch existing rows for the incoming record_keys,
   and if `!!incoming.archived !== !!existing.archived` and
   `!["Superadmin","CEO"].includes(profile.role)` → `throw new Error("Only CEO/Superadmin can archive or restore masterlist records")`.
6. **PO edit.** `poHasAnyServed(po)` = `(po.lines||[]).some(l => poServedQty(po, l.code) > 0)`.
   Add `data-po-edit="<id>"` button in `renderPurchaseOrders()` (table + card) when
   `canEditModule("purchaseOrders")`, `poStatus(po)` not terminal, and `!poHasAnyServed(po)`.
   `editPurchaseOrder(id)` → `openModal("purchaseOrder", { poEdit: po })`. In `openModal`, when
   `edit.poEdit`: render editor with existing lines + decimal option, prefill `#id/#client/#date`,
   keep `#id` visible but read-only. In `submitModal` `purchaseOrder` branch: if editing, call
   `buildPurchaseOrder(values, { editingId })` which skips the duplicate-id check, re-checks
   `!poHasAnyServed(existingPo)` (reject if served appeared), preserves `status`/`salesperson`/
   created metadata, and appends an "Edited by <user>" history entry; then replace in place via
   `replacePoRecord()` + `persistRecords`.
7. **Decimal qty.** `invoiceLineTemplate(line, {..., allowDecimalQty})` → qty input becomes
   `min="0" step="any"` + `oninput` guard rejecting `<= 0` on submit (already in `parseInvoiceLines`).
   Enable `allowDecimalQty` for `purchaseOrder` context and for `invoice`/`cancelReplace`
   (FR-014) and `inventoryPurchaseOrder`. Update the "Add Item" handler in `events-bootstrap.js`.
8. **Login preview.** Copy the current OG/twitter/canonical/icon block values from
   `public/index.html` into `public/login/index.html`; leave the redirect `<script>` untouched.
   Do not touch root `/login/index.html`.

## Files touched

- `public/login/index.html` — metadata refresh.
- `public/scripts/state.js` — `isArchived` + `active*` helpers.
- `public/scripts/modules.js` — `renderMasterlists` (toggle + filter + Archive/Restore actions),
  `archiveMasterlistRecord` / `restoreMasterlistRecord`, `renderPurchaseOrders` (Edit button),
  `editPurchaseOrder`, `buildPurchaseOrder` (edit mode + served floor), `openModal` (PO edit prefill),
  `invoiceLineTemplate` / `renderInvoiceEditor` (decimal qty), picker call sites → `active*`.
- `public/scripts/events-bootstrap.js` — `submitModal` PO branch (edit path), Archive/Restore
  click handlers, "Add Item" decimal option.
- `src/worker.js` — field-level archive guard in `/api/modules/records`.

## Risks / mitigations

- **Picker call-site sweep incomplete** → archived record still selectable. Mitigation: grep sweep
  of `data.(clients|items|suppliers|employees|banks).map` and review each; report/analytics stay.
- **Server guard N+1 fetch** → one batched `record_key=in.(...)` query per save, masterlist only.
- **PO edit lowering qty below served** → explicit per-line guard using `poServedQty`.
- **`includesSearch(Object.values(record))` matching "true"** → exclude `archived` from the searched
  values or store as `archived: true` only (acceptable; document).
- **worker.js edits**: use `grep -a`; do not touch approval/segregation gates.

## Out of scope

Inventory PO editing, bulk archive, archive of platform branches, cascade archiving, changing
number/quantity display formatting, retention/purge of archived records.

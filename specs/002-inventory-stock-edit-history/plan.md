# Implementation Plan: 002-inventory-stock-edit-history

**Spec**: ./spec.md
**Stack**: Vanilla JS front-end (`public/scripts/*.js`), Cloudflare Worker back-end (`src/worker.js`),
Supabase `app_records` per-record persistence. No build step. No local dev env.

## Architecture notes

- **Stock rows** are plain objects in `data.inventory[]`: `{ branch, brand, code, item, serial,
  lot, expiry, qty, min, reserved }`. Rendered by `renderInventory()` (`public/scripts/modules.js`
  ~L2030) into `#inventory-table` via `table(target, headers, rows)` where each row is
  `{ focus, cells: [...] }`. There is **no Actions column today** and **no edit path** — stock
  only moves through stock receipts (`stockReceipts`, approved), transfers (`pendingTransfers`,
  authorized), invoicing (served qty), and disposal. The table filters to the active branch tab
  (`inventoryBranchTab`) and has a compact-view mode that slices leading columns
  (`fullCells.slice(3)`).
- **Persistence**: `persistRecords({ inventory: [row] })` → `MedlaneAPI.saveRecords` →
  `POST /api/modules/records`. That route authorizes by **module** (`writableKeys(profile)` via
  `canAccessKey(profile, "inventory", "edit")`), never by field. The masterlist-archive feature
  added the precedent for a field-level guard there (and in the `/api/modules/state` PUT).
- **Server record key**: `recordKeyFor("inventory", value)` =
  `` `${value.code||value.item}|${value.branch}|${value.lot||value.serial}` ``. **This feature
  edits none of code / item / branch / lot / serial, so the key never changes** and no key
  machinery is required. (Lot editing — which would change the key — is deferred; see spec.)
- **Role gates**: client `roleEditableModules` gives `inventory` edit to Superadmin, CEO, Admin,
  Logistics, Product Specialist, Engineering. This feature is stricter and role-only — stock-field
  edits are **{Admin, CEO, Superadmin}**, via a dedicated `canEditStockRecord()`, ignoring custom
  permissions (same shape as the CEO/Superadmin archive gate).
- **Fresh-read on open**: `MedlaneAPI.loadAppState()` returns the full server state; the app
  already re-hydrates via `data = normalizeData({ ...emptyProductionData(), ...fresh.data })`
  (see `restoreBackupFromRef`, `events-bootstrap.js` L1483). Reuse that to refresh before the
  dialog opens so the quantity delta is applied to a current base.
- **History precedents**: `record.history` array on payment requests / product issues; global
  `data.transferHistory` capped at 80 via `recordTransferHistory()`; `showTransferTimeline()`
  builds a `<dialog class="modal audit-detail-modal">` timeline on the fly.
- **Manila timestamp**: reuse `generatedNoticeDate()` (`ui-utils.js`).
- **Equipment**: `isEquipmentItem(item)` — equipment stock has `serial` set, `expiry: "N/A"`, and
  whole-unit quantities (`parseInvoiceLines` rejects `equipment && !Number.isInteger(qty)`).
- **Decimals**: line-qty inputs are already `min="0" step="any"`; reuse for the adjustment input
  on non-equipment rows.
- **Pending PO demand**: `pendingPoDemandForItem(code, branch)` already exists in `modules.js`.

## Design decisions

1. **Scope = `data.inventory` stock rows; editable fields = quantity (via signed delta), expiry,
   note.** No new fields on `data.items`. Item masterlist tab untouched. Lot/serial editing
   deferred. **No `src/worker.js` key change, no `saveRecordKeyFor` change.**

2. **New optional fields on the stock record**:
   - `note: string` — free text, shown in a new **Notes** column, edited in the dialog.
   - `history: [{ at, by, changes: [{field, from, to}], reason }]` — newest-first, capped 50.

3. **Edit UI** — a dedicated `<dialog class="modal">` built on demand (like `showTransferTimeline`),
   with a real wrapping `<form>` (modal-padding-noform bug). Not a `modalConfigs` entry.
   - Trigger: `data-stock-edit="<ref>"` mini-button in a new **Actions** cell, rendered only when
     `canEditStockRecord()`. `ref` = the row's `code|branch|lot||serial` identity string
     (html-escaped) — used to re-resolve the row after the fresh read.
   - On click: `await refreshInventoryFromServer()` → `row = stockRowByRef(ref)` (abort with a
     toast if the row vanished) → build dialog.
   - Fields:
     - **Current quantity** — read-only display of `row.qty`.
     - **Adjustment** — `<input type="number" step="${equipment ? '1' : 'any'}">`, placeholder
       "+ / − amount", may be left 0/blank.
     - **New quantity** — read-only, live `row.qty + Number(adjustment || 0)`, updates on input.
     - **Expiry** — `<input type="date">` prefilled `row.expiry` (no `min`); **hidden** when
       `row.expiry === "N/A"` / equipment.
     - **Note** — `<textarea>` prefilled `row.note || ""`.
     - **Reason** — `<input type="text">`; JS toggles `required` when the adjustment is non-zero
       and shows a hint.
   - Buttons: Cancel, Save changes.

4. **Save** — `saveStockEdit(ref, form)`:
   1. `row = stockRowByRef(ref)`; capture `original = { qty: Number(row.qty), expiry: row.expiry,
      note: row.note || "" }`.
   2. `delta = Number(form.adjustment || 0)`; reject `NaN`; reject `equipment && !Number.isInteger(delta)`.
   3. `newQty = original.qty + delta`; reject `newQty < 0` (`< -1e-9` tolerance for float drift).
   4. build `changes[]`: `Quantity` if `delta !== 0` (`from original.qty`, `to newQty`);
      `Expiry` if `form.expiry !== original.expiry`; `Note` if `form.note !== original.note`.
   5. `changes` empty → close, no-op.
   6. `delta !== 0 && !reason.trim()` → toast + abort.
   7. `demand = pendingPoDemandForItem(row.code, row.branch)`; msg = "Save changes to this stock
      record?" + (`delta !== 0 && newQty < demand` ? `\n\nNote: resulting quantity (${newQty}) is
      below pending PO demand (${demand}).` : "").
   8. `if (!(await confirmFinalSave(msg))) return;`
   9. apply: `row.qty = newQty; row.expiry = form.expiry; row.note = form.note;`
      `row.history = [{ at: generatedNoticeDate(), by: currentUser?.name || "System User",
      changes, reason: reason.trim() }, ...(row.history || [])].slice(0, 50);`
   10. `const res = await persistRecords({ inventory: [row] });` — no `recordKeys` arg needed
       (key unchanged). `if (!res?.ok) return;`
   11. `log("Edited stock record", "Inventory", \`${row.item} · ${row.branch} · lot ${row.lot || row.serial}\`, { save:false });`
       close dialog; `renderInventory()`; `toast("Stock record updated.")`.

5. **History view** (US2, FR-012): `data-stock-history="<ref>"` mini-button, visible to **all**
   inventory viewers. `showStockHistory(ref)` → read-only `<dialog class="modal audit-detail-modal">`
   (reuse `showTransferTimeline` markup) titled `${row.item} · ${row.branch} · ${row.lot||row.serial}`,
   entries newest-first: `by`, `at`, one line per change as `${label}: ${from} → ${to}`, reason
   when non-empty. Empty → "No changes recorded for this stock record yet." Field labels:
   `Quantity`, `Expiry`, `Note`.

6. **Notes column** (US3, FR-013): add `"Notes"` + `"Actions"` to BOTH `inventoryHeaders` arrays
   (compact + full). Notes cell: `row.note ? <span class="inventory-note-cell" title>…</span> : "—"`.
   Actions cell (last column, survives the compact slice): Edit (gated) + History buttons.
   Recompute the compact `fullCells.slice(3)` offset — count the leading columns after adding two.

7. **Server field-level guard** (FR-011): in `/api/modules/records` (and, defensively, the
   `/api/modules/state` PUT — same as the archive guard), for incoming `inventory` rows, batch
   fetch stored rows by `record_key in (...)`; if for any row `Number(qty)` or `expiry` differs
   from stored **and** `!["Admin","CEO","Superadmin"].includes(profile.role)` →
   `throw new Error("Only Admin, CEO, or Superadmin can edit stock quantity or expiry")`. A
   brand-new inventory row (no stored match) is untouched — receiving/transfer flows for Logistics
   et al. keep working.

8. **Client role helper**: `canEditStockRecord()` →
   `["Admin","Superadmin","CEO"].includes(currentUser?.role)` in `state.js` near `canEditModule`.

9. **`refreshInventoryFromServer()`** helper (`state.js` or `events-bootstrap.js`): `const fresh =
   await MedlaneAPI.loadAppState().catch(() => null); if (fresh?.data?.inventory) data.inventory =
   normalizeData({ ...emptyProductionData(), ...fresh.data }).inventory;` — narrow to `inventory`
   to avoid stomping unsaved edits elsewhere. (If `normalizeData` can't be scoped cleanly, refresh
   the whole `data` as `restoreBackupFromRef` does — acceptable, it is what a manual reload does.)

10. **Search noise**: exclude `history` (and any future `id`) from the values `includesSearch`
    sees for inventory rows.

## Files touched

- `public/scripts/state.js` — `canEditStockRecord()`; `refreshInventoryFromServer()` (or reuse an
  existing reload path).
- `public/scripts/modules.js` — `renderInventory()` (Notes + Actions columns, compact slice
  math), `stockRowByRef()`, `openStockEditDialog()`, `saveStockEdit()`, `showStockHistory()`,
  history helpers; `includesSearch` value filtering for inventory.
- `public/scripts/events-bootstrap.js` — delegated click handlers for `[data-stock-edit]` and
  `[data-stock-history]` (wired like `[data-transfer-timeline]`).
- `src/worker.js` — field-level {Admin,CEO,Superadmin} guard for qty/expiry changes to stored
  `inventory` rows, in `/api/modules/records` and the `/api/modules/state` PUT. Use `grep -a`.
  Do not touch approval / segregation-of-duties gates. **No key-function change.**
- `public/styles.css` — `.inventory-note-cell` truncation rule only if no existing class fits.

## Risks / mitigations

- **Lost-update race on the quantity delta** → FR-002 fresh read on dialog open shrinks the
  window to dialog-open time; the delta (not an absolute) means the audit still reflects intent.
  Documented residual (spec US1 scenario 9). Not eliminable without server-applied deltas, which
  are out of scope.
- **Compact-view header/cell slice math** → adding two columns shifts `slice(3)`; recompute both
  header arrays and the slice together, eyeball compact + full after.
- **`includesSearch(Object.values(item))` matching stringified `history`** → strip `history` from
  the searched values for inventory rows.
- **`inventoryStatus(item)`** keys off `qty` + `expiry` — an edit re-derives status on the next
  `renderInventory()` automatically; confirm "For Disposal" / "Near Expiry" recompute.
- **`refreshInventoryFromServer` stomping other unsaved state** → scope the merge to
  `data.inventory` only; if not cleanly possible, a full refresh is equivalent to the user hitting
  reload and is acceptable for an admin correction action.
- **Server guard N+1** → one batched `record_key=in.(...)` query per save, inventory rows only.
- **worker.js**: plain `grep` finds nothing — always `grep -a`. UTC runtime — timestamps are
  client-side via `generatedNoticeDate()`; the guard does no timestamping.
- **No test suite / no local env** → `node --check` on every touched JS file;
  `npx wrangler deploy --dry-run`; user does the live verification pass.

## Out of scope

Lot / serial / brand / code / item / branch / min editing on a stock row; bulk stock edits;
reconstructing pre-feature history; inventory-record deletion; notes/history on the item
masterlist tab; per-field permissions beyond the single {Admin,CEO,Superadmin} gate; approval
workflow for stock corrections; server-authoritative history; server-applied quantity deltas.

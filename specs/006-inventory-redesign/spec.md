# Feature Spec 006 — Inventory page redesign

**Source of truth:** `inventory-redesign.html` (repo root; React prototype, spec only).
**Scope:** Inventory page *content area* only (`#inventory` in `public/index.html`). Sidebar, top bar,
auth and the Live/Sales/Warehouse/Accounting switcher are untouched. No schema or API changes.

## Requirements
1. **Header** — "Inventory" H1 + "All changes saved" pill (bound to `setGlobalSaveStatus`), one-line
   description, Area select (mirrors global `#branch-filter`), secondary New PO / Request demo /
   Transfer stock, primary Receive stock. Button IDs and handlers are reused.
2. **One tab bar** — Stocks, Receiving POs, Pending receipts, Completed POs, Transfers, Demo requests,
   Receiving history, Transfer history; live count badges; active = bold + 2px accent underline;
   horizontal scroll; active tab in URL (`tab=`). History tabs open the existing history modals.
3. **Warehouse task queue** — slim one-row state when 0 recommendations; existing card list otherwise.
4. **Cards** — `repeat(auto-fit,minmax(280px,1fr))`: Stock health (segmented bar + clickable legend),
   Low & critical, Near expiry, For disposal (top 5, "View all"). Legend/View-all sets status filter + Stocks tab.
5. **Stock table** — branch segmented (All/each branch), search (item, code, brand, lot/serial), Compact
   toggle, Export (CSV), status chips with counts, columns Item / Lot-Serial / Branch / Expiry / Qty /
   Status / Actions; sortable (default expiry asc, none last); pagination footer; empty state with
   Clear filters; branch/status/search/sort/compact/page persisted in URL.
6. **Detail panel** — right-hand `aside`, wraps under table < ~1000px; fields, recent movements (from
   `item.history`), Transfer / Edit / History actions, close button.
7. **Tokens/quality** — design tokens scoped to `#inventory` (with dark-theme overrides), Manrope + IBM Plex
   Mono, 44/40/36px control heights, aria-labels on icon buttons, 2px accent focus rings, no page-level
   horizontal scroll at 390px.

## Out of scope / data gaps (reported, not invented)
- No per-lot "minimum level" gap: `item.min` exists, so it is shown; blank/0 → "—".
- Old per-column filters (brand/code/lot/expiry/qty range/notes) and Reserved/Notes columns are folded
  into search + detail panel.

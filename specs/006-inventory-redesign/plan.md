# Plan 006 — Inventory redesign

Vanilla-JS app (no React). `renderInventory()` in `public/scripts/modules.js` is rewritten to emit the
new markup; state lives in `public/scripts/state.js` (`inventoryView`); markup in `public/index.html`;
styles appended to `src/styles.css` (then `npm run build:css` → `public/styles.css`).

- Hidden `<select id="inventory-status">` kept as status source of truth so `handleWorkflowAction`
  / `prepareFocusedSection` deep-links keep working.
- `inventoryWorkflowTab` gains `stocks` (default), `rhist`, `thist`; URL via `inventoryQueryString()`
  also used by `showSection()` so params survive section restore.
- Pagination: client-side over the already-loaded `data.inventory` (no server pagination exists for stock).
- Deep-link focus: `inventoryFocusQuery` jumps to the page containing the focused lot.
- Grill notes: (a) don't hide stock from demo-only roles' gating — reuse `.inventory-action-row` and
  `[data-inventory-workflow]`; (b) keep IDs of buttons; (c) escape every interpolated value;
  (d) dark theme must not regress → tokens overridden under `:root[data-theme="dark"]`.

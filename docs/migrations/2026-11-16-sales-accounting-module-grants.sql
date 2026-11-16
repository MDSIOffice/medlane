-- Sales / Accounting access update (16 Nov 2026).
-- New role defaults (src/worker.js roleModules) only apply to users with NO module_permissions
-- rows. Users who were ever customised on the Users page keep their saved rows, so they would
-- not get the new access. This adds the new grants to those users. It never removes access.
--
--   Sales:      Inventory (view; edit is limited server-side to demo requests), Analytics,
--               Item Forecast, Purchase Orders (view + edit, so they can raise supplier POs)
--   Accounting: Inventory (view), Purchase Orders (view + edit)
--
-- Safe to re-run.

with customised as (
  select distinct p.id, p.role::text as role
  from profiles p
  join module_permissions mp on mp.user_id = p.id
  where p.role in ('Sales', 'Accounting')
),
grants(role, module_key, can_view, can_edit) as (
  values
    ('Sales', 'inventory', true, true),
    ('Sales', 'analytics', true, false),
    ('Sales', 'item-forecast', true, false),
    ('Sales', 'purchase-orders', true, true),
    ('Accounting', 'inventory', true, false),
    ('Accounting', 'purchase-orders', true, true)
)
insert into module_permissions (user_id, module_key, can_view, can_edit)
select c.id, g.module_key, g.can_view, g.can_edit
from customised c
join grants g on g.role = c.role
on conflict (user_id, module_key) do update
  set can_view = true,
      can_edit = module_permissions.can_edit or excluded.can_edit;

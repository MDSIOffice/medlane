-- Trimmed app-state load (16 Nov 2026).
--
-- The app's first load used to read EVERY app_records row (all invoices, POs, payments, notices
-- ever saved) into the Worker, which then threw most of them away (trimPaginatedModuleRows). That
-- cost grows forever. This function does the throwing-away inside Postgres, so the Worker only
-- downloads what a screen can show:
--   * every row of the small "always loaded" modules (clients, items, inventory, …)
--   * for the history modules: rows still open + the newest ones (a little more than the app
--     keeps; the Worker applies its exact rules on top, so results are identical)
--   * notifications / contact history: generated alerts, undated legacy rows, and the newest ones,
--     never cleared notices
-- It also returns per-module totals (for "Load previous") and the live-sync cursor.
--
-- Safe to run before or after deploying: the Worker falls back to the old full read if this
-- function is missing. Safe to re-run.

create index if not exists app_records_state_module_updated_idx on app_records (state_key, module_name, updated_at);

create or replace function app_state_load(
  p_state_key text,
  p_exclude text[],
  p_page_size int default 50,
  p_margin int default 25,
  p_notice_limit int default 150,
  p_history_limit int default 100
)
returns jsonb
language sql
stable
set search_path = public
as $$
with base as (
  select r.module_name, r.record_key, r.data, r.updated_at
  from app_records r
  where r.state_key = p_state_key and not (r.module_name = any (p_exclude))
),
-- Quantity already invoiced per client PO line code, by non-cancelled sales (buildServedQtyByPo).
served as (
  select s.data->>'po' as po, l->>'code' as code,
         sum(case when (l->>'qty') ~ '^\s*-?\d+(\.\d+)?\s*$' then (l->>'qty')::numeric else 0 end) as qty
  from base s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.data->'lines') = 'array' then s.data->'lines' else '[]'::jsonb end) l
  where s.module_name = 'sales'
    and coalesce(s.data->>'po', '') <> ''
    and coalesce(s.data->>'status', '') <> 'Cancelled'
    and coalesce(l->>'code', '') <> ''
  group by 1, 2
),
-- Client POs with any quantity still to invoice (purchaseOrderIsOpen). Unparseable quantities
-- count as open, so this can only keep MORE than the Worker's rule, never less.
po_open as (
  select p.record_key
  from base p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.data->'lines') = 'array' then p.data->'lines' else '[]'::jsonb end) l
  left join served sv on sv.po = p.data->>'id' and sv.code = l->>'code'
  where p.module_name = 'purchaseOrders'
  group by p.record_key
  having bool_or(coalesce(l->>'qty', '') <> '' and (l->>'qty') !~ '^\s*-?\d+(\.\d+)?\s*$')
      or sum(greatest(case when (l->>'qty') ~ '^\s*-?\d+(\.\d+)?\s*$' then (l->>'qty')::numeric else 0 end - coalesce(sv.qty, 0), 0)) > 0.000000001
),
paginated as (
  select b.*,
    case b.module_name
      when 'payments' then coalesce(nullif(b.data->>'dateRecorded', ''), nullif(b.data->>'date', ''), b.data->>'postedDate', '')
      when 'paymentRequests' then coalesce(nullif(b.data->>'date', ''), b.data->>'createdAt', '')
      when 'pendingTransfers' then to_json(b.updated_at)#>>'{}'
      else coalesce(b.data->>'date', '')
    end as sort_value,
    case b.module_name
      when 'sales' then coalesce(b.data->>'status', '') <> 'Cancelled'
        and not (coalesce(b.data->>'net', '0') ~ '^\s*-?\d+(\.\d+)?\s*$' and coalesce(b.data->>'paid', '0') ~ '^\s*-?\d+(\.\d+)?\s*$'
                 and coalesce(nullif(b.data->>'net', ''), '0')::numeric - coalesce(nullif(b.data->>'paid', ''), '0')::numeric <= 0)
      when 'purchaseOrders' then b.record_key in (select record_key from po_open)
      when 'inventoryPurchaseOrders' then coalesce(b.data->>'status', '') not in ('Fully Received', 'Cancelled')
      when 'pendingTransfers' then coalesce(b.data->>'status', '') not in ('Received', 'Cancelled')
      when 'payables' then coalesce(b.data->>'requestStatus', '') <> 'Cancelled'
        and not (coalesce(b.data->>'requestStatus', '') = 'Approved' and (b.data->'paymentConfirmed') is not distinct from 'true'::jsonb)
      when 'payments' then coalesce(b.data->>'collectionStatus', '') <> 'Deposited'
      when 'paymentRequests' then coalesce(b.data->>'requestStatus', '') not in ('Completed', 'Cancelled')
    end as is_open
  from base b
  where b.module_name in ('sales', 'purchaseOrders', 'inventoryPurchaseOrders', 'pendingTransfers', 'payables', 'payments', 'paymentRequests')
),
paginated_ranked as (
  select p.*, row_number() over (partition by p.module_name order by p.sort_value collate "C" desc) as rn
  from paginated p
),
logs as (
  select b.*,
         row_number() over (partition by b.module_name order by b.data->>'createdAt' collate "C" desc nulls last) as rn
  from base b
  where b.module_name in ('notifications', 'collectionContactHistory')
    and coalesce(b.data->'cleared', 'false'::jsonb) <> 'true'::jsonb
),
kept as (
  select module_name, record_key, data, updated_at from base
  where module_name not in ('sales', 'purchaseOrders', 'inventoryPurchaseOrders', 'pendingTransfers', 'payables', 'payments', 'paymentRequests', 'notifications', 'collectionContactHistory')
  union all
  select module_name, record_key, data, updated_at from paginated_ranked
  -- An undecidable open-check (NULL) keeps the row: this function may only ever send MORE.
  where coalesce(is_open, true) or rn <= p_page_size + p_margin
  union all
  select module_name, record_key, data, updated_at from logs
  where data->'generated' = 'true'::jsonb
     or coalesce(data->>'createdAt', '') = ''
     or rn <= case module_name when 'notifications' then p_notice_limit else p_history_limit end + p_margin
)
select jsonb_build_object(
  'rows', coalesce((select jsonb_agg(jsonb_build_object('module_name', k.module_name, 'record_key', k.record_key, 'data', k.data, 'updated_at', k.updated_at) order by k.updated_at, k.module_name, k.record_key) from kept k), '[]'::jsonb),
  'totals', coalesce((select jsonb_object_agg(t.module_name, t.n) from (select module_name, count(*) as n from base group by module_name) t), '{}'::jsonb),
  'cursor', (select to_json(max(updated_at))#>>'{}' from base)
);
$$;

-- Only the Worker (service role) may call it; browsers with the anon key cannot.
revoke execute on function app_state_load(text, text[], int, int, int, int) from public, anon, authenticated;
grant execute on function app_state_load(text, text[], int, int, int, int) to service_role;

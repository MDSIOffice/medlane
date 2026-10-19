-- Safe production migration: adds a single-round-trip RPC for a client's outstanding
-- (non-cancelled, net minus paid) sales balance. validateNewSaleRows() in the Worker
-- previously fetched every sales record ever created -- across every client, paged --
-- just to recompute one client's running balance for a credit-limit check on a new
-- invoice. That full-table pull only got slower as the sales history grew. This folds
-- the same sum into one indexed Postgres aggregate, scoped to the one client being
-- checked, so the Worker gets back a single number instead of the whole sales table.
-- Mirrors validateNewSaleRows()'s JS math exactly: sum(greatest(net - paid, 0)) over
-- sales rows for that client whose status isn't "Cancelled" (a missing status counts
-- as not cancelled, same as the JS `existing.status === "Cancelled"` check does).
-- Do not run the full schema file for this fix on an existing production database.

begin;

create or replace function client_sales_balance(p_state_key text, p_client text)
returns table(balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    greatest(
      case when data->>'net' ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'net')::numeric else 0 end
      - case when data->>'paid' ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'paid')::numeric else 0 end,
      0
    )
  ), 0) as balance
  from app_records
  where state_key = p_state_key
    and module_name = 'sales'
    and data->>'client' = p_client
    and coalesce(data->>'status', '') <> 'Cancelled';
$$;

grant execute on function client_sales_balance(text, text) to service_role;

-- Lets the RPC above (and anything else filtering sales by client) use an index instead
-- of scanning every sales row for the state_key.
create index if not exists app_records_sales_client_balance_idx
  on app_records (state_key, (data->>'client'))
  where module_name = 'sales';

commit;

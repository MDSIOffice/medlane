-- Recon stock movement log retention.
--
-- app_records deletes stay blocked (2026-08-05-app-records-delete-guard.sql). This adds ONE
-- narrow exception: a function that can delete only `stockMovements` rows older than a cutoff,
-- and never anything from the last 90 days, whatever cutoff it is given.
--
-- The Worker calls it once a day after the 6 PM Recon run, with the oldest movement anything still
-- needs (the k1 baseline, the 90-day window, and any open "stock changed with no document"
-- difference). Until this is applied the Worker's call is a no-op and nothing else changes.
--
-- Movement record keys are `MV-<ISO time>-<id>`, so the key comparison uses the
-- (state_key, module_name, record_key) unique index.

begin;

create or replace function prune_stock_movements(p_state_key text, p_before timestamptz, p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Never inside the last 90 days, even if the caller asks for more.
  v_cut timestamptz := least(p_before, now() - interval '90 days');
  v_key text := 'MV-' || to_char(v_cut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_count integer;
begin
  -- Lifts the delete guard for this transaction only; the delete below can touch nothing but
  -- old stockMovements rows of the given state.
  perform set_config('medlane.allow_app_records_delete', 'on', true);
  with doomed as (
    select state_key, module_name, record_key
    from app_records
    where state_key = p_state_key
      and module_name = 'stockMovements'
      and record_key < v_key
    order by record_key
    limit greatest(1, least(coalesce(p_limit, 5000), 20000))
  )
  delete from app_records a
  using doomed d
  where a.state_key = d.state_key and a.module_name = d.module_name and a.record_key = d.record_key;
  get diagnostics v_count = row_count;
  perform set_config('medlane.allow_app_records_delete', 'off', true);
  return v_count;
end;
$$;

revoke all on function prune_stock_movements(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function prune_stock_movements(text, timestamptz, integer) to service_role;

commit;

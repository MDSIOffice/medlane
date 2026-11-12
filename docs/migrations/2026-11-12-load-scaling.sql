-- 12 Nov 2026 — scaling to 50-100 simultaneous users.
-- Safe to run more than once. Run in the Supabase SQL editor (production), then deploy.
--
-- 1. Live updates: every open tab asks "what changed since <time>?" after each save
--    (/api/modules/changes → state_key = ? and updated_at >= ?). Without this index Postgres
--    scans the whole app_records table for each of those requests (100 tabs = 100 scans per save).
create index if not exists app_records_state_updated_idx on app_records (state_key, updated_at);

-- 2. Make sure an edited record's updated_at moves forward. The Worker's upserts don't send
--    updated_at, and live updates only find records whose updated_at changed. If production
--    already has an equivalent trigger this one is harmless (both set the same value).
create or replace function app_records_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_records_touch_updated_at on app_records;
create trigger app_records_touch_updated_at
before update on app_records
for each row execute function app_records_touch_updated_at();

-- Check afterwards:
--   select indexname from pg_indexes where tablename = 'app_records';
--   select tgname from pg_trigger where tgrelid = 'app_records'::regclass and not tgisinternal;

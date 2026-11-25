-- Close direct table reads from browsers (security audit, 25 Nov 2026).
--
-- Every table read and write in Medlane goes through the Worker, which uses the service_role key
-- (bypasses RLS) and applies the per-role / per-module / branch / memo-audience view rules in
-- src/worker.js (canAccessKey, filterRecordsForProfile). The browser never talks to PostgREST.
--
-- Until now, any signed-in staff member could take their own Supabase access token plus the
-- public anon key and query /rest/v1/app_records directly, reading every module (payables,
-- payroll-related expenses, client KYC, audit trail...) regardless of the Worker's role filters.
-- This removes those direct paths. Module view permissions keep working exactly as before,
-- because they are enforced by the Worker, which is unaffected (service_role ignores RLS and
-- these grants).
--
-- Run AFTER these (they create tables this locks down; each is safe to re-run):
--   2026-11-18-account-preferences-notification-settings.sql
--   2026-11-18-activity-log.sql
--   2026-11-18-user-notifications.sql
-- A table that doesn't exist yet is skipped with a notice. Safe to re-run; re-run it after
-- running any of those migrations later, since each one re-creates its browser read policy.
-- Apply in the Supabase SQL editor.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'profiles', 'module_permissions', 'app_state', 'file_objects', 'app_records', 'branches',
    'storage_usage', 'app_sessions', 'backup_runs', 'activity_log', 'user_preferences',
    'notification_settings', 'user_notifications'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipped % (table does not exist)', t;
      continue;
    end if;
    -- 1. Drop every policy that let a browser session read or write rows directly.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    -- 2. RLS stays on (no policy = no rows for anon/authenticated) ...
    execute format('alter table public.%I enable row level security', t);
    -- 3. ... and the browser roles lose table privileges too, so a future permissive policy
    --    can't silently reopen them.
    execute format('revoke all on table public.%I from anon, authenticated', t);
    -- 4. The Worker keeps its access. activity_log is append-only (2026-11-18-activity-log.sql):
    --    the Worker may only read and insert there, never update or delete.
    if t = 'activity_log' then
      execute 'grant select, insert on table public.activity_log to service_role';
    else
      execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    end if;
    raise notice 'locked %', t;
  end loop;
end
$$;

-- Check (both should return no rows for these tables):
--   select tablename, policyname from pg_policies where schemaname = 'public';
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated');

-- Fixes for the Supabase Performance/Security advisor findings of 1 Nov 2026.
-- Safe to re-run. All of these functions are only ever called by the Worker with the
-- service_role key, so closing them to anon/authenticated changes nothing for the app.

begin;

-- 1. SECURITY DEFINER functions were callable by anon/authenticated through /rest/v1/rpc/*
--    (Postgres grants EXECUTE to PUBLIC by default). Restrict to service_role only.
revoke execute on function update_app_state(bigint, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function reserve_file_storage(text, bigint, bigint) from public, anon, authenticated;
revoke execute on function release_file_storage(text, bigint) from public, anon, authenticated;
revoke execute on function acknowledge_memo(text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function client_sales_balance(text, text) from public, anon, authenticated;
revoke execute on function prevent_app_records_delete() from public, anon, authenticated;
grant execute on function update_app_state(bigint, jsonb, uuid, text) to service_role;
grant execute on function reserve_file_storage(text, bigint, bigint) to service_role;
grant execute on function release_file_storage(text, bigint) to service_role;
grant execute on function acknowledge_memo(text, text, text, text, text, text, uuid) to service_role;
grant execute on function client_sales_balance(text, text) to service_role;
grant execute on function prevent_app_records_delete() to service_role;

-- 2. Mutable search_path on the delete-guard trigger function.
alter function prevent_app_records_delete() set search_path = public;

-- 3. RLS policies re-evaluated auth.*() per row: wrap in (select ...) so it runs once per query.
drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile" on profiles for select using ((select auth.uid()) = id);
drop policy if exists "Users can read own module permissions" on module_permissions;
create policy "Users can read own module permissions" on module_permissions for select using ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users can read branches" on branches;
create policy "Authenticated users can read branches" on branches for select using ((select auth.role()) = 'authenticated');
drop policy if exists "Authenticated users can read app state" on app_state;
create policy "Authenticated users can read app state" on app_state for select using ((select auth.role()) = 'authenticated');
drop policy if exists "Authenticated users can read active files" on file_objects;
create policy "Authenticated users can read active files" on file_objects for select using ((select auth.role()) = 'authenticated' and deleted_at is null);
drop policy if exists "Authenticated users can read app records" on app_records;
create policy "Authenticated users can read app records" on app_records for select using ((select auth.role()) = 'authenticated');
drop policy if exists "Authenticated users can read storage usage" on storage_usage;
create policy "Authenticated users can read storage usage" on storage_usage for select using ((select auth.role()) = 'authenticated');
drop policy if exists "Users can read own app sessions" on app_sessions;
create policy "Users can read own app sessions" on app_sessions for select using ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users can read backup metadata" on backup_runs;
create policy "Authenticated users can read backup metadata" on backup_runs for select using ((select auth.role()) = 'authenticated');

-- 4. Covering indexes for foreign keys (speeds up profile deletes/cascades and joins).
create index if not exists app_records_updated_by_idx on app_records(updated_by);
create index if not exists app_sessions_revoked_by_idx on app_sessions(revoked_by);
create index if not exists app_state_updated_by_idx on app_state(updated_by);
create index if not exists backup_runs_created_by_idx on backup_runs(created_by);
create index if not exists file_objects_uploaded_by_idx on file_objects(uploaded_by);
create index if not exists profiles_branch_id_idx on profiles(branch_id);

commit;

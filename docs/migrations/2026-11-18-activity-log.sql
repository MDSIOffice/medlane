-- User activity log (18 Nov 2026): one shared, append-only table that both the Audit Logs page and
-- the User activity log read.
--
-- activity_log  every audit entry the app writes (sign-ins, edits, approvals, voids, exports …), with
--               who, what, the record, the device and before → after values (data.changes), plus the
--               kind of action and, when flagged, why. The Worker appends to it whenever it writes an
--               audit entry, and copies the older entries in once (from app_records "logs") the first
--               time its scheduled job finds this table.
--
-- Append-only, enforced here: nobody — not the app, not the service role — can UPDATE, DELETE or
-- TRUNCATE a row. The privileges are revoked AND a trigger rejects the statement, so even a future
-- grant can't quietly allow it. (A full data wipe must therefore skip this table, or drop the
-- triggers first, deliberately.)
-- Safe to re-run.

begin;

create table if not exists activity_log (
  id bigint generated always as identity primary key,
  source_key text not null unique,            -- the app_records "logs" record_key it came from
  state_key text not null,
  created_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  user_id uuid,                               -- no foreign key: history outlives deleted accounts
  actor text not null default '',
  role text not null default '',
  email text not null default '',
  action text not null default '',
  module text not null default '',
  record text not null default '',
  kind text not null check (kind in ('signin', 'created', 'edited', 'approved', 'voided', 'stock', 'exported', 'access', 'other')),
  flag_reason text,
  device text not null default '',
  browser text not null default '',
  location text not null default '',
  ip_address text not null default '',
  data jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_state_created on activity_log (state_key, created_at desc, id desc);
create index if not exists activity_log_user_created on activity_log (user_id, created_at desc);
create index if not exists activity_log_kind_created on activity_log (kind, created_at desc);
create index if not exists activity_log_flagged on activity_log (created_at desc) where flag_reason is not null;
create index if not exists activity_log_signin_email on activity_log (email, created_at desc) where kind = 'signin';

create or replace function activity_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'activity_log is append-only: % is not allowed', tg_op using errcode = '42501';
end;
$$;

drop trigger if exists activity_log_no_update_delete on activity_log;
create trigger activity_log_no_update_delete before update or delete on activity_log
  for each row execute function activity_log_is_append_only();
drop trigger if exists activity_log_no_truncate on activity_log;
create trigger activity_log_no_truncate before truncate on activity_log
  for each statement execute function activity_log_is_append_only();

alter table activity_log enable row level security;
drop policy if exists "Users can read own activity" on activity_log;
create policy "Users can read own activity" on activity_log for select using ((select auth.uid()) = user_id);

revoke all on table activity_log from public, anon, authenticated, service_role;
grant select, insert on table activity_log to service_role;
grant select on table activity_log to authenticated;
grant usage, select on sequence activity_log_id_seq to service_role;

commit;

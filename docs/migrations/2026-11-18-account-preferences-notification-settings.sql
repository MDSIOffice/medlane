-- Account settings (18 Nov 2026): per-user preferences and notification settings.
--
-- user_preferences       one row per user: display name, avatar, Welcome screen / sound / start page,
--                        rows per page, default branch view, daily summary, quiet hours, and when the
--                        password was last actually changed (password_confirmed_at on profiles also
--                        moves when someone keeps their password at the annual check, so it isn't
--                        a password age).
-- notification_settings  one row per user and alert type with in-app / email switches. A missing row
--                        means "use the default", so existing users need no backfill.
--
-- The Worker (service role) is the only writer; signed-in users can read their own rows.
-- The app keeps working before this runs: preferences fall back to the defaults.
-- Safe to re-run.

begin;

create table if not exists user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  display_name text not null default '',
  avatar_data text,
  sound_enabled boolean not null default true,
  welcome_mode text not null default 'daily' check (welcome_mode in ('daily', 'every', 'off')),
  start_page text not null default 'dashboard' check (start_page in ('dashboard', 'inventory', 'sales', 'last')),
  rows_per_page integer not null default 10 check (rows_per_page in (10, 25, 50)),
  default_branch text not null default 'all',
  daily_summary boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '20:00',
  quiet_end time not null default '07:00',
  password_changed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Avatars are resized in the browser to a small JPEG; this keeps a bad client from storing megabytes.
  constraint user_preferences_avatar_size check (avatar_data is null or length(avatar_data) <= 120000)
);

create table if not exists notification_settings (
  user_id uuid not null references profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('approvals', 'stock', 'money', 'service', 'recon', 'security')),
  in_app boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, alert_type),
  -- Security alerts are always on, on both channels.
  constraint notification_settings_security_locked check (alert_type <> 'security' or (in_app and email))
);

alter table user_preferences enable row level security;
alter table notification_settings enable row level security;

drop policy if exists "Users can read own preferences" on user_preferences;
create policy "Users can read own preferences" on user_preferences for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can read own notification settings" on notification_settings;
create policy "Users can read own notification settings" on notification_settings for select using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table user_preferences to service_role;
grant select, insert, update, delete on table notification_settings to service_role;
grant select on table user_preferences to authenticated;
grant select on table notification_settings to authenticated;

commit;

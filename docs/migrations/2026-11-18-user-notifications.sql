-- Notifications (18 Nov 2026): one row per person who receives a notification.
--
-- user_notifications  a copy of each notice for each person allowed to see it, with that person's
--                     own read state (read_at) and email status. Notices come from the shared
--                     "notifications" records people's actions create (NTF-…) and from the standing
--                     alerts the Worker generates every 15 minutes (GEN-…). Rows older than 90 days
--                     are archived (the Worker deletes them).
--
-- The Worker (service role) is the only writer; signed-in users can read their own rows.
-- Until this runs the Notifications page shows an error and the bell stays at 0; nothing else breaks.
-- Safe to re-run.

begin;

create table if not exists user_notifications (
  user_id uuid not null references profiles(id) on delete cascade,
  notice_id text not null,
  alert_type text not null check (alert_type in ('approvals', 'stock', 'money', 'service', 'recon', 'security', 'general')),
  title text not null default '',
  message text not null default '',
  section text not null default 'notifications',
  record text not null default '',
  urgent boolean not null default false,
  in_app boolean not null default true,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status text not null default 'none' check (email_status in ('none', 'pending', 'held', 'sent', 'failed', 'skipped')),
  emailed_at timestamptz,
  primary key (user_id, notice_id)
);

-- The page (newest first per person), the unread bell count, and the email sender.
create index if not exists user_notifications_user_created on user_notifications (user_id, created_at desc);
create index if not exists user_notifications_unread on user_notifications (user_id) where read_at is null and in_app;
create index if not exists user_notifications_email_due on user_notifications (email_status) where email_status in ('pending', 'held');

alter table user_notifications enable row level security;
drop policy if exists "Users can read own notifications" on user_notifications;
create policy "Users can read own notifications" on user_notifications for select using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table user_notifications to service_role;
grant select on table user_notifications to authenticated;

commit;

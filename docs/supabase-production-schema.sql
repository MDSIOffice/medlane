create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('Superadmin', 'Admin', 'Accounting', 'Sales', 'Logistics', 'HR', 'CEO', 'Product Specialist', 'Engineering');
exception when duplicate_object then null;
end $$;

-- Run this against an existing database whose app_role enum was created before
-- Product Specialist / Engineering existed as roles in the app (added later than
-- Superadmin/Admin/Accounting/Sales/Logistics/HR/CEO) — otherwise inviting or
-- saving a user with either role fails with "invalid input value for enum app_role".
-- alter type app_role add value if not exists 'Product Specialist';
-- alter type app_role add value if not exists 'Engineering';

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role app_role not null default 'Sales',
  base_role app_role,
  branch_id uuid references branches(id),
  branch text not null default 'all',
  is_superadmin boolean not null default false,
  phone text,
  password_confirmed_at timestamptz not null default now(),
  theme_preference text not null default 'light',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Run this against an existing database that already has a profiles table:
-- alter table profiles add column if not exists password_confirmed_at timestamptz not null default now();
-- alter table profiles add column if not exists theme_preference text not null default 'light';

-- Run this against an existing database so deleting a user doesn't fail with
-- "violates foreign key constraint ... app_records_updated_by_fkey" (or the
-- app_state/file_objects equivalents) once other rows reference their profile id.
-- The Worker also nulls these out itself before deleting, but fixing the
-- constraint here means that safety step is no longer strictly required.
-- alter table app_state drop constraint if exists app_state_updated_by_fkey;
-- alter table app_state add constraint app_state_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
-- alter table app_records drop constraint if exists app_records_updated_by_fkey;
-- alter table app_records add constraint app_records_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
-- alter table file_objects drop constraint if exists file_objects_uploaded_by_fkey;
-- alter table file_objects add constraint file_objects_uploaded_by_fkey foreign key (uploaded_by) references profiles(id) on delete set null;

create table if not exists module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  unique (user_id, module_key)
);

create table if not exists app_state (
  key text primary key default 'production',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id) on delete set null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table app_state add column if not exists revision bigint not null default 1;

create table if not exists file_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_key text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  record_type text not null default 'general',
  record_id text,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Note: rows with module_name = 'logs' are written one-at-a-time via POST /api/logs
-- (record_key = "logs-<uuid>") and are never deleted or replaced, unlike every other
-- module_name which the generic PUT /api/modules/state save fully replaces on each write.
-- This keeps the audit trail complete; GET /api/logs paginates over it by date range.
create table if not exists app_records (
  id uuid primary key default gen_random_uuid(),
  state_key text not null default 'production',
  module_name text not null,
  record_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (state_key, module_name, record_key)
);

create table if not exists storage_usage (
  bucket text primary key,
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  max_bytes bigint not null default 536870912000 check (max_bytes > 0),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  device_name text not null default 'Unknown device',
  browser text not null default 'Unknown browser',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references profiles(id)
);

create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  state_key text not null default 'production',
  backup_type text not null check (backup_type in ('manual', 'weekly', 'monthly', 'yearly')),
  mode text not null default 'incremental',
  object_key text not null unique,
  records_count integer not null default 0,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  since_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists file_objects_record_idx on file_objects(record_type, record_id);
create index if not exists file_objects_active_size_idx on file_objects(deleted_at, size_bytes);
create index if not exists app_records_module_idx on app_records(state_key, module_name);
create index if not exists app_sessions_user_idx on app_sessions(user_id, revoked_at, last_seen_at desc);
create index if not exists backup_runs_type_idx on backup_runs(state_key, backup_type, created_at desc);

alter table profiles enable row level security;
alter table module_permissions enable row level security;
alter table app_state enable row level security;
alter table file_objects enable row level security;
alter table app_records enable row level security;
alter table branches enable row level security;
alter table storage_usage enable row level security;
alter table app_sessions enable row level security;
alter table backup_runs enable row level security;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);

drop policy if exists "Users can read own module permissions" on module_permissions;
create policy "Users can read own module permissions" on module_permissions for select using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read branches" on branches;
create policy "Authenticated users can read branches" on branches for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read app state" on app_state;
create policy "Authenticated users can read app state" on app_state for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read active files" on file_objects;
create policy "Authenticated users can read active files" on file_objects for select using (auth.role() = 'authenticated' and deleted_at is null);

drop policy if exists "Authenticated users can read app records" on app_records;
create policy "Authenticated users can read app records" on app_records for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read storage usage" on storage_usage;
create policy "Authenticated users can read storage usage" on storage_usage for select using (auth.role() = 'authenticated');

drop policy if exists "Users can read own app sessions" on app_sessions;
create policy "Users can read own app sessions" on app_sessions for select using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read backup metadata" on backup_runs;
create policy "Authenticated users can read backup metadata" on backup_runs for select using (auth.role() = 'authenticated');

create or replace function update_app_state(expected_revision bigint, next_data jsonb, actor uuid, state_key text default 'production')
returns table(key text, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from app_state where app_state.key = state_key) then
    if expected_revision <> 0 then
      raise exception 'APP_STATE_CONFLICT';
    end if;

    insert into app_state (key, data, updated_by, revision, updated_at)
    values (state_key, next_data, actor, 1, now());

    return query select s.key, s.revision, s.updated_at from app_state s where s.key = state_key;
    return;
  end if;

  update app_state s
  set data = next_data,
      updated_by = actor,
      revision = s.revision + 1,
      updated_at = now()
  where s.key = state_key
    and s.revision = expected_revision;

  if not found then
    raise exception 'APP_STATE_CONFLICT';
  end if;

  return query select s.key, s.revision, s.updated_at from app_state s where s.key = state_key;
end;
$$;

create or replace function reserve_file_storage(bucket_name text, bytes_to_add bigint, max_allowed bigint)
returns table(bucket text, used_bytes bigint, max_bytes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if bytes_to_add <= 0 then
    raise exception 'INVALID_FILE_SIZE';
  end if;

  insert into storage_usage (bucket, used_bytes, max_bytes)
  values (bucket_name, 0, max_allowed)
  on conflict (bucket) do update set max_bytes = excluded.max_bytes;

  update storage_usage s
  set used_bytes = s.used_bytes + bytes_to_add,
      max_bytes = max_allowed,
      updated_at = now()
  where s.bucket = bucket_name
    and s.used_bytes + bytes_to_add <= max_allowed;

  if not found then
    raise exception 'STORAGE_LIMIT_REACHED';
  end if;

  return query select s.bucket, s.used_bytes, s.max_bytes from storage_usage s where s.bucket = bucket_name;
end;
$$;

create or replace function release_file_storage(bucket_name text, bytes_to_remove bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update storage_usage
  set used_bytes = greatest(used_bytes - greatest(bytes_to_remove, 0), 0),
      updated_at = now()
  where bucket = bucket_name;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table branches to service_role;
grant select, insert, update, delete on table profiles to service_role;
grant select, insert, update, delete on table module_permissions to service_role;
grant select, insert, update, delete on table app_state to service_role;
grant select, insert, update, delete on table app_records to service_role;
grant select, insert, update, delete on table file_objects to service_role;
grant select, insert, update, delete on table storage_usage to service_role;
grant select, insert, update, delete on table app_sessions to service_role;
grant select, insert, update, delete on table backup_runs to service_role;
grant select on table branches to authenticated;
grant select on table profiles to authenticated;
grant select on table module_permissions to authenticated;
grant select on table app_state to authenticated;
grant select on table app_records to authenticated;
grant select on table file_objects to authenticated;
grant select on table storage_usage to authenticated;
grant select on table app_sessions to authenticated;
grant select on table backup_runs to authenticated;
grant execute on function update_app_state(bigint, jsonb, uuid, text) to service_role;
grant execute on function reserve_file_storage(text, bigint, bigint) to service_role;
grant execute on function release_file_storage(text, bigint) to service_role;

insert into branches (name, address) values
  ('Las Pinas', '13 Gumamela St, Pilar Village, Las Pinas, Metro Manila 1740, PH'),
  ('Naga', 'Narra St., Mariano Village, Balatas, Naga City, Camarines Sur 4400, PH')
on conflict (name) do update set address = excluded.address;

insert into storage_usage (bucket, used_bytes, max_bytes)
values ('medlane-documents', 0, 536870912000)
on conflict (bucket) do update set max_bytes = excluded.max_bytes;

insert into storage_usage (bucket, used_bytes, max_bytes)
values ('medlane-documents-preview', 0, 536870912000)
on conflict (bucket) do update set max_bytes = excluded.max_bytes;

-- After creating your first Supabase Auth user, insert its profile with that auth.users.id.
-- Example:
-- insert into profiles (id, email, full_name, role, branch, is_superadmin)
-- values ('AUTH_USER_UUID', 'admin@yourdomain.com', 'Admin User', 'Superadmin', 'all', true);

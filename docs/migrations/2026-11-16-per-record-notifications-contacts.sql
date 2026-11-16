-- Per-record notifications and collection follow-ups (16 Nov 2026).
--
-- These three modules used to be stored by list POSITION (record_key "notifications-0",
-- "collectionContacts-3", "collectionContactHistory-7") and saved as whole lists, so two people
-- saving at the same moment overwrote each other. The app now gives every entry its own key:
--   notifications             -> data.id   ("NTF-…", generated alerts "GEN-<key>")
--   collectionContactHistory  -> data.id   ("CCH-…")
--   collectionContacts        -> the client name
-- This re-keys the existing rows in place (UPDATE only; the app_records delete guard stays on).
-- Duplicates are kept but hidden: notifications get "cleared": true, contacts "superseded": true.
--
-- Run it right AFTER deploying the new code. Safe to re-run (it only touches rows still on the
-- old position keys).

begin;

-- Position-era timestamps: "Nov 16, 2026, 10:05 AM" (Manila) -> ISO UTC. Unparseable dates fall
-- back to updated_at. Position n (0 = newest) is subtracted in milliseconds to keep the order.
create or replace function pg_temp.legacy_created_at(date_text text, updated timestamptz, n int)
returns text language sql immutable as $$
  select to_char(
    (case
      when translate(coalesce(date_text, ''), E'  ', '  ') ~ '^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM)$'
        then (to_timestamp(translate(date_text, E'  ', '  '), 'Mon DD, YYYY, HH12:MI AM')::timestamp at time zone 'Asia/Manila')
      else updated
    end - make_interval(secs => n / 1000.0)) at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- 1. Notifications ------------------------------------------------------------------------------
with legacy as (
  select r.id,
         r.state_key,
         (regexp_replace(r.record_key, '^notifications-', ''))::int as n,
         r.updated_at,
         case when (r.data->>'generated') = 'true' and coalesce(r.data->>'key', '') <> '' then 'GEN-' || (r.data->>'key') end as gen_key
  from app_records r
  where r.module_name = 'notifications' and r.record_key ~ '^notifications-\d+$'
),
numbered as (
  select l.*, row_number() over (partition by l.state_key, l.gen_key order by l.n) as gen_rank
  from legacy l
),
ranked as (
  select l.*,
         -- one row per generated alert keeps the GEN- key (the newest position), and only if the
         -- new code hasn't already written that GEN- row itself
         case when l.gen_key is not null
                and l.gen_rank = 1
                and not exists (select 1 from app_records e where e.module_name = 'notifications' and e.state_key = l.state_key and e.record_key = l.gen_key)
              then l.gen_key end as keep_gen_key
  from numbered l
)
update app_records r
set record_key = coalesce(k.keep_gen_key, 'NTF-legacy-' || r.id::text),
    data = r.data
      || jsonb_build_object('id', coalesce(k.keep_gen_key, 'NTF-legacy-' || r.id::text))
      || case when r.data ? 'createdAt' then '{}'::jsonb else jsonb_build_object('createdAt', pg_temp.legacy_created_at(r.data->>'date', k.updated_at, k.n)) end
      || case when k.gen_key is not null and k.keep_gen_key is null then jsonb_build_object('cleared', true) else '{}'::jsonb end
from ranked k
where r.id = k.id;

-- 2. Collection contact history -----------------------------------------------------------------
update app_records r
set record_key = 'CCH-legacy-' || r.id::text,
    data = r.data
      || jsonb_build_object('id', 'CCH-legacy-' || r.id::text)
      || case when r.data ? 'createdAt' then '{}'::jsonb
              else jsonb_build_object('createdAt', pg_temp.legacy_created_at(r.data->>'date', r.updated_at, (regexp_replace(r.record_key, '^collectionContactHistory-', ''))::int)) end
where r.module_name = 'collectionContactHistory' and r.record_key ~ '^collectionContactHistory-\d+$';

-- 3. Collection contacts (one per client) -------------------------------------------------------
-- The most recently saved row per client takes the client key, unless the new code already
-- wrote one; every other copy is marked superseded and parked on a unique key.
with legacy as (
  select r.id, r.state_key, r.data->>'client' as client,
         row_number() over (partition by r.state_key, r.data->>'client' order by r.updated_at desc) as rn
  from app_records r
  where r.module_name = 'collectionContacts' and r.record_key ~ '^collectionContacts-\d+$'
),
decided as (
  select l.id,
         case when coalesce(l.client, '') <> '' and l.rn = 1
                and not exists (select 1 from app_records e where e.module_name = 'collectionContacts' and e.state_key = l.state_key and e.record_key = l.client)
              then l.client end as new_key
  from legacy l
)
update app_records r
set record_key = coalesce(d.new_key, 'superseded-' || r.id::text),
    data = case when d.new_key is null then r.data || jsonb_build_object('superseded', true) else r.data end
from decided d
where r.id = d.id;

commit;

-- Check (should return 0 rows):
-- select module_name, record_key from app_records
-- where record_key ~ '^(notifications|collectionContacts|collectionContactHistory)-\d+$';

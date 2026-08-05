-- Safe production migration: fixes ambiguous storage RPC column names only.
-- Do not run the full schema file for this fix on an existing production database.

begin;

drop function if exists reserve_file_storage(text, bigint, bigint);
create or replace function reserve_file_storage(bucket_name text, bytes_to_add bigint, max_allowed bigint)
returns table(storage_bucket text, used_bytes bigint, max_bytes bigint)
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
  on conflict on constraint storage_usage_pkey do update set max_bytes = excluded.max_bytes;

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

drop function if exists release_file_storage(text, bigint);
create or replace function release_file_storage(bucket_name text, bytes_to_remove bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update storage_usage s
  set used_bytes = greatest(s.used_bytes - greatest(bytes_to_remove, 0), 0),
      updated_at = now()
  where s.bucket = bucket_name;
end;
$$;

grant execute on function reserve_file_storage(text, bigint, bigint) to service_role;
grant execute on function release_file_storage(text, bigint) to service_role;

commit;

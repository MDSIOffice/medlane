-- Safe production migration: adds a single-round-trip RPC for memo acknowledgment.
-- The worker previously did a SELECT (fetch the memo row) followed by a separate
-- POST (upsert the updated row) for every acknowledge click -- two sequential
-- Supabase round trips on top of the auth/session/profile lookups every request
-- already pays. This folds the read-check-write into one atomic DB call (with a
-- row lock, so two people acknowledging at the same instant can't clobber each
-- other's entry) to cut real latency, not just perceived latency.
-- Do not run the full schema file for this fix on an existing production database.

begin;

create or replace function acknowledge_memo(
  p_state_key text,
  p_record_key text,
  p_email text,
  p_name text,
  p_role text,
  p_at text,
  p_actor uuid
)
returns table(data jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  select r.data into v_data
  from app_records r
  where r.state_key = p_state_key and r.module_name = 'memos' and r.record_key = p_record_key
  for update;

  if v_data is null then
    raise exception 'MEMO_NOT_FOUND';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_data->'acknowledgments', '[]'::jsonb)) entry
    where lower(entry->>'email') = lower(p_email)
  ) then
    v_data := jsonb_set(
      v_data,
      '{acknowledgments}',
      coalesce(v_data->'acknowledgments', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'name', p_name,
        'email', p_email,
        'role', p_role,
        'at', p_at
      ))
    );

    update app_records
    set data = v_data, updated_by = p_actor
    where state_key = p_state_key and module_name = 'memos' and record_key = p_record_key;
  end if;

  return query select v_data;
end;
$$;

grant execute on function acknowledge_memo(text, text, text, text, text, text, uuid) to service_role;

commit;

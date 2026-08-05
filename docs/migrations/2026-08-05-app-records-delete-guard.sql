-- Safety migration: prevent accidental app_records wipes from stale clients,
-- future Worker regressions, or broad maintenance scripts.
-- Normal app saves must upsert records, not delete/reinsert modules.

begin;

create or replace function prevent_app_records_delete()
returns trigger
language plpgsql
as $$
begin
  if current_setting('medlane.allow_app_records_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'APP_RECORDS_DELETE_BLOCKED: app_records deletes are disabled to prevent data wipes. Use a reviewed maintenance transaction with set local medlane.allow_app_records_delete = ''on'' only for intentional restores.';
end;
$$;

drop trigger if exists app_records_delete_guard on app_records;
create trigger app_records_delete_guard
before delete on app_records
for each row execute function prevent_app_records_delete();

revoke delete, truncate on table app_records from service_role;
grant select, insert, update on table app_records to service_role;
grant execute on function prevent_app_records_delete() to service_role;

commit;

-- If an approved restore truly must delete app_records rows, wrap that restore in:
-- begin;
-- set local medlane.allow_app_records_delete = 'on';
-- -- reviewed delete/restore statements here
-- commit;

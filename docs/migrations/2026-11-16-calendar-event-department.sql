-- Calendar department colors (16 Nov 2026): new events get createdByRole stamped by the server.
-- This fills it in on events added before that, from the creator's current role in profiles.
-- Events whose creator no longer has a profile stay uncolored ("Other"). Safe to re-run.
update app_records r
set data = r.data || jsonb_build_object('createdByRole', p.role::text)
from profiles p
where r.module_name = 'calendarEvents'
  and not (r.data ? 'createdByRole')
  and lower(p.email) = lower(r.data->>'createdByUser');

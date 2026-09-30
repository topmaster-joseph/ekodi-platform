-- Restore the production-recorded canonical event-key migration.
-- Production migration history already contains version 20260917132138.
-- Fresh environments migrate the former 260925 record and applications to 260926.

do $$
declare
  old_event public.mission_events%rowtype;
begin
  select * into old_event
  from public.mission_events
  where event_key='260925-chuseok-open-table';

  if found then
    insert into public.mission_events(
      event_key,workspace_key,title,starts_at,ends_at,venue,status,applications_open,created_at,updated_at
    )
    values (
      '260926-chuseok-open-table',
      old_event.workspace_key,
      old_event.title,
      '2026-09-26 15:00:00+09'::timestamptz,
      '2026-09-26 17:00:00+09'::timestamptz,
      old_event.venue,
      'published',
      true,
      old_event.created_at,
      now()
    )
    on conflict (event_key) do update set
      title=excluded.title,
      starts_at=excluded.starts_at,
      ends_at=excluded.ends_at,
      venue=excluded.venue,
      status='published',
      applications_open=true,
      updated_at=now();

    delete from public.mission_event_applications old_app
    using public.mission_event_applications new_app
    where old_app.event_key='260925-chuseok-open-table'
      and new_app.event_key='260926-chuseok-open-table'
      and old_app.phone_normalized=new_app.phone_normalized;

    update public.mission_event_applications
    set event_key='260926-chuseok-open-table', updated_at=now()
    where event_key='260925-chuseok-open-table';

    delete from public.mission_events
    where event_key='260925-chuseok-open-table';
  else
    update public.mission_events
    set starts_at='2026-09-26 15:00:00+09'::timestamptz,
        ends_at='2026-09-26 17:00:00+09'::timestamptz,
        status='published',
        applications_open=true,
        updated_at=now()
    where event_key='260926-chuseok-open-table';
  end if;
end
$$;

-- Keep the existing application record key stable so already-submitted applications remain linked.
-- The public event URL uses the corrected date slug 260926-chuseok-open-table.
do $$
begin
  update public.mission_events
  set starts_at='2026-09-26 15:00:00+09'::timestamptz,
      ends_at='2026-09-26 17:00:00+09'::timestamptz,
      status='published',
      applications_open=true,
      updated_at=now()
  where event_key='260925-chuseok-open-table';
  if not found then
    raise exception 'MISSION_OPEN_TABLE_EVENT_NOT_FOUND';
  end if;
end
$$;

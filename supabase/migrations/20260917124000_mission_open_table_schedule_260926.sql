update public.mission_events
set starts_at = '2026-09-26 15:00:00+09'::timestamptz,
    ends_at = '2026-09-26 17:00:00+09'::timestamptz,
    updated_at = now()
where event_key = '260925-chuseok-open-table';

-- Canonicalize the 2026 Chuseok Open Table after the schedule correction
-- 2026-09-26 (Sat) 15:00-17:00, preserving applications submitted under the former key.

insert into public.mission_events(
  event_key,workspace_key,title,starts_at,ends_at,venue,status,applications_open
)
values (
  '260926-chuseok-open-table',
  'ekodimission',
  '2026 에코디 추석 열린식탁',
  '2026-09-26 15:00:00+09',
  '2026-09-26 17:00:00+09',
  '자담치킨&피자마루 · 목포대 후문',
  'published',
  true
)
on conflict (event_key) do update set
  title=excluded.title,
  starts_at=excluded.starts_at,
  ends_at=excluded.ends_at,
  venue=excluded.venue,
  status=excluded.status,
  applications_open=excluded.applications_open,
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
where event_key='260925-chuseok-open-table'
  and not exists (
    select 1 from public.mission_event_applications
    where event_key='260925-chuseok-open-table'
  );

-- 에코디교회 관리자 '일정'(church.events)에 등록한 일정을 공개 주요일정에 노출한다.
-- 공개 가능한 필드(제목·날짜·시간·장소)만, 예정(scheduled) 상태이고 오늘(KST) 이후인 일정만 돌려준다.
-- 돌봄(care) 구분은 목회 돌봄 일정이므로 공개하지 않는다.
create or replace function public.church_public_events(p_church_slug text, p_limit integer default 30)
returns table(event_date date, event_time time, title text, location text, category text)
language sql
stable
security definer
set search_path to 'pg_catalog', 'church'
as $$
  select e.event_date, e.event_time, e.title, e.location, e.category
  from church.events e
  where e.church_slug = p_church_slug
    and e.status = 'scheduled'
    and e.category <> 'care'
    and e.event_date >= (now() at time zone 'Asia/Seoul')::date
  order by e.event_date, e.event_time nulls first
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

revoke all on function public.church_public_events(text, integer) from public;
grant execute on function public.church_public_events(text, integer) to anon, authenticated, service_role;

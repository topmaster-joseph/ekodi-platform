-- Per-user write rate limits for EKODI 동행 social actions (interest, report,
-- block, message). Counting and recording happen atomically under a per-user,
-- per-action transaction advisory lock, so concurrent Edge isolates cannot
-- exceed the limit. Events hold only user id, action and time (no content).
create table if not exists public.singles_rate_events(
 user_id uuid not null,
 action text not null check (action in ('interest','report','block','message')),
 created_at timestamptz not null default now()
);
create index if not exists singles_rate_events_user_action_time
 on public.singles_rate_events(user_id,action,created_at desc);
alter table public.singles_rate_events enable row level security;
revoke all on table public.singles_rate_events from public,anon,authenticated;
grant select,insert,delete on table public.singles_rate_events to service_role;

-- Returns 0 and records the event when allowed; otherwise returns the seconds
-- until the oldest counted event leaves the window (>=1) and records nothing.
create or replace function public.singles_rate_take(p_user uuid,p_action text,p_limit int,p_window_seconds int)
 returns int language plpgsql security definer set search_path=pg_catalog,public as $$
declare n int; oldest timestamptz; win interval;
begin
 if p_user is null or p_action not in ('interest','report','block','message')
  or p_limit<1 or p_limit>1000 or p_window_seconds<1 or p_window_seconds>604800
 then raise exception 'invalid_rate_limit' using errcode='22023'; end if;
 win:=make_interval(secs=>p_window_seconds);
 perform pg_advisory_xact_lock(hashtextextended('singles_rate:'||p_user::text||':'||p_action,0));
 delete from public.singles_rate_events where user_id=p_user and action=p_action and created_at<now()-greatest(win,interval '1 day');
 select count(*),min(created_at) into n,oldest from public.singles_rate_events
  where user_id=p_user and action=p_action and created_at>now()-win;
 if n>=p_limit then
  return greatest(1,ceil(extract(epoch from (oldest+win-now())))::int);
 end if;
 insert into public.singles_rate_events(user_id,action) values(p_user,p_action);
 return 0;
end $$;
revoke all on function public.singles_rate_take(uuid,text,int,int) from public,anon,authenticated;
grant execute on function public.singles_rate_take(uuid,text,int,int) to service_role;

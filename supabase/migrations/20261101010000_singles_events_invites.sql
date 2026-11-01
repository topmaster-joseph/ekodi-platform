-- 에코디 동행(2026-11-01): 행사·모임 화면과 초대 단계(C7 2단계, 초대 10명).
-- 행사(event)는 날짜가 정해진 한 번의 만남, 모임(group)은 정기 소그룹. 둘 다 운영자(설정 권한)가 만들고 공개한다.
-- 참가비가 있는 행사는 입금 확인 절차가 따로 준비될 때까지 신청을 받지 않는다(무료만).
-- 초대 명단은 소유자(설정 권한 운영자)만 고치며, 단계별 상한(기본 10명)을 넘을 수 없다. 누구를 초대할지는 소유자가 정한다.

alter table public.singles_events add column if not exists kind text not null default 'event';
alter table public.singles_events drop constraint if exists singles_events_kind_check;
alter table public.singles_events add constraint singles_events_kind_check check (kind in ('event','group'));
alter table public.singles_events add column if not exists schedule_note text not null default '';
alter table public.singles_events drop constraint if exists singles_events_schedule_note_check;
alter table public.singles_events add constraint singles_events_schedule_note_check check (char_length(schedule_note)<=80);
alter table public.singles_events add column if not exists updated_at timestamptz not null default now();
create index if not exists singles_events_listing on public.singles_events(state,kind,starts_at);

-- 시범 운영 단계와 초대 상한.
create table if not exists public.singles_launch_stage(
 id integer primary key check (id=1),
 stage integer not null check (stage between 1 and 4),
 invite_cap integer not null check (invite_cap between 0 and 1000),
 updated_at timestamptz not null default now(),
 updated_by uuid
);
insert into public.singles_launch_stage(id,stage,invite_cap) values(1,2,10) on conflict (id) do nothing;
alter table public.singles_launch_stage enable row level security;
revoke all on table public.singles_launch_stage from public;
revoke all on table public.singles_launch_stage from anon;
revoke all on table public.singles_launch_stage from authenticated;
grant select,update on table public.singles_launch_stage to service_role;

alter table public.singles_pilot_users add column if not exists kind text not null default 'invite';
alter table public.singles_pilot_users drop constraint if exists singles_pilot_users_kind_check;
alter table public.singles_pilot_users add constraint singles_pilot_users_kind_check check (kind in ('pilot','invite'));
alter table public.singles_pilot_users add column if not exists invited_by uuid;
-- 기존 시범 3계정은 초대 상한에 포함하지 않는다.
update public.singles_pilot_users set kind='pilot'
 where email in ('joseph@ekodi.kr','topmaster.joseph@gmail.com','ekodibiz@gmail.com') and kind<>'pilot';

-- 시범 기간에 초대 명단 밖 계정이 이용을 시도한 기록(소유자가 보고 초대할 수 있도록).
alter table public.singles_signup_attempts drop constraint if exists singles_signup_attempts_action_check;
alter table public.singles_signup_attempts add constraint singles_signup_attempts_action_check
 check (action in ('enroll','enroll_failed','join_order','withdraw','subscribe_order','pilot_denied'));

create or replace function public.singles_invite_add(p_owner uuid,p_email text,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e text:=lower(btrim(coalesce(p_email,''))); u uuid; cap integer; used integer;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_owner and enabled=true and can_configure=true) then
  raise exception 'owner_capability_required' using errcode='42501';
 end if;
 if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(e)>320 then raise exception 'invalid_email' using errcode='22023'; end if;
 if char_length(coalesce(p_note,''))>60 then raise exception 'note_too_long' using errcode='22023'; end if;
 select id into u from auth.users where lower(email)=e and coalesce(is_anonymous,false)=false order by created_at limit 1;
 if u is null then raise exception 'account_not_found' using errcode='P0002'; end if;
 if exists(select 1 from public.singles_pilot_users where user_id=u) then
  return jsonb_build_object('status','already_invited','user_id',u);
 end if;
 select invite_cap into cap from public.singles_launch_stage where id=1 for update;
 select count(*) into used from public.singles_pilot_users where kind='invite';
 if used>=coalesce(cap,0) then raise exception 'invite_cap_reached' using errcode='23514'; end if;
 insert into public.singles_pilot_users(user_id,email,note,kind,invited_by) values(u,e,coalesce(btrim(p_note),''),'invite',p_owner);
 return jsonb_build_object('status','invited','user_id',u,'used',used+1,'cap',cap);
end $$;
revoke all on function public.singles_invite_add(uuid,text,text) from public;
revoke all on function public.singles_invite_add(uuid,text,text) from anon;
revoke all on function public.singles_invite_add(uuid,text,text) from authenticated;
grant execute on function public.singles_invite_add(uuid,text,text) to service_role;

create or replace function public.singles_invite_remove(p_owner uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_owner and enabled=true and can_configure=true) then
  raise exception 'owner_capability_required' using errcode='42501';
 end if;
 select kind into k from public.singles_pilot_users where user_id=p_user for update;
 if k is null then raise exception 'invite_not_found' using errcode='P0002'; end if;
 if k<>'invite' then raise exception 'pilot_account_locked' using errcode='42501'; end if;
 delete from public.singles_pilot_users where user_id=p_user;
 return jsonb_build_object('status','removed','user_id',p_user);
end $$;
revoke all on function public.singles_invite_remove(uuid,uuid) from public;
revoke all on function public.singles_invite_remove(uuid,uuid) from anon;
revoke all on function public.singles_invite_remove(uuid,uuid) from authenticated;
grant execute on function public.singles_invite_remove(uuid,uuid) to service_role;

-- 행사·모임 참가 신청: 행 잠금으로 정원 초과를 막는다. 무료 행사만, 시작 전만.
create or replace function public.singles_event_rsvp(p_user uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ev public.singles_events%rowtype; taken integer; cur text;
begin
 select * into ev from public.singles_events where id=p_event for update;
 if not found or ev.state<>'published' then raise exception 'event_not_available' using errcode='P0002'; end if;
 if ev.kind='event' and ev.starts_at<=now() then raise exception 'event_not_available' using errcode='P0002'; end if;
 if ev.fee_krw>0 then raise exception 'event_fee_verification_not_configured' using errcode='0A000'; end if;
 select status into cur from public.singles_event_rsvps where event_id=p_event and user_id=p_user;
 if cur in ('requested','approved') then
  return jsonb_build_object('status',cur,'already',true);
 end if;
 select count(*) into taken from public.singles_event_rsvps where event_id=p_event and status in ('requested','approved');
 if ev.capacity is not null and taken>=ev.capacity then raise exception 'event_full' using errcode='23514'; end if;
 insert into public.singles_event_rsvps(event_id,user_id,status) values(p_event,p_user,'requested')
  on conflict (event_id,user_id) do update set status='requested',created_at=now();
 return jsonb_build_object('status','requested','taken',taken+1,'capacity',ev.capacity);
end $$;
revoke all on function public.singles_event_rsvp(uuid,uuid) from public;
revoke all on function public.singles_event_rsvp(uuid,uuid) from anon;
revoke all on function public.singles_event_rsvp(uuid,uuid) from authenticated;
grant execute on function public.singles_event_rsvp(uuid,uuid) to service_role;

create or replace function public.singles_event_rsvp_cancel(p_user uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.singles_event_rsvps set status='cancelled' where event_id=p_event and user_id=p_user and status in ('requested','approved');
 if not found then raise exception 'rsvp_not_found' using errcode='P0002'; end if;
 return jsonb_build_object('status','cancelled');
end $$;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from public;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from anon;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from authenticated;
grant execute on function public.singles_event_rsvp_cancel(uuid,uuid) to service_role;

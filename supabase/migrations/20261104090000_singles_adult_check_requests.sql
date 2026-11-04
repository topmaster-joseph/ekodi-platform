-- 에코디 동행(2026-11-04): 자체 성인 확인 요청(본인확인기관 연동 전 공개 개통용).
-- 회원이 앱에서 "성인 확인 요청"을 남기면 운영자가 연락해 신분증을 영상통화·대면으로 확인한다.
-- 신분증 사본·생년월일·주민번호는 받지 않는다. 확인이 끝나면 연락처는 즉시 지운다(요청 기록만 남김).

create table if not exists public.singles_adult_check_requests(
 user_id uuid primary key,
 method text not null check (method in ('id_document_video','id_document_in_person')),
 contact text check (contact is null or char_length(contact) between 4 and 100),
 preferred_time text not null default '' check (char_length(preferred_time)<=60),
 status text not null default 'requested' check (status in ('requested','done','cancelled')),
 created_at timestamptz not null default now(),
 done_at timestamptz,
 done_by uuid,
 constraint singles_adult_check_contact_cleared check (status='requested' or contact is null)
);
create index if not exists singles_adult_check_requests_open on public.singles_adult_check_requests(status,created_at);
alter table public.singles_adult_check_requests enable row level security;
revoke all on table public.singles_adult_check_requests from public;
revoke all on table public.singles_adult_check_requests from anon;
revoke all on table public.singles_adult_check_requests from authenticated;
grant select,insert,update on table public.singles_adult_check_requests to service_role;

create or replace function public.singles_adult_check_request(p_user uuid,p_method text,p_contact text,p_time text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c text:=btrim(coalesce(p_contact,'')); t text:=btrim(coalesce(p_time,''));
begin
 if not exists(select 1 from public.singles_memberships where user_id=p_user and status='active' and age_19_confirmed=true) then
  raise exception 'membership_required' using errcode='42501';
 end if;
 if exists(select 1 from public.singles_memberships where user_id=p_user and adult_verified_at is not null) then
  return jsonb_build_object('status','verified');
 end if;
 if p_method not in ('id_document_video','id_document_in_person') then raise exception 'invalid_method' using errcode='22023'; end if;
 if char_length(c) not between 4 and 100 then raise exception 'contact_required' using errcode='22023'; end if;
 if char_length(t)>60 then raise exception 'preferred_time_too_long' using errcode='22023'; end if;
 insert into public.singles_adult_check_requests(user_id,method,contact,preferred_time,status,created_at,done_at,done_by)
  values(p_user,p_method,c,t,'requested',now(),null,null)
  on conflict (user_id) do update set method=excluded.method,contact=excluded.contact,preferred_time=excluded.preferred_time,
   status='requested',created_at=now(),done_at=null,done_by=null;
 return jsonb_build_object('status','requested');
end $$;
revoke all on function public.singles_adult_check_request(uuid,text,text,text) from public;
revoke all on function public.singles_adult_check_request(uuid,text,text,text) from anon;
revoke all on function public.singles_adult_check_request(uuid,text,text,text) from authenticated;
grant execute on function public.singles_adult_check_request(uuid,text,text,text) to service_role;

create or replace function public.singles_adult_check_cancel(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.singles_adult_check_requests set status='cancelled',contact=null where user_id=p_user and status='requested';
 if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
 return jsonb_build_object('status','cancelled');
end $$;
revoke all on function public.singles_adult_check_cancel(uuid) from public;
revoke all on function public.singles_adult_check_cancel(uuid) from anon;
revoke all on function public.singles_adult_check_cancel(uuid) from authenticated;
grant execute on function public.singles_adult_check_cancel(uuid) to service_role;

-- 운영자 성인 확인: 기존 규칙(입금 확인 권한, 본인 처리 금지, 방법 기록)에 더해 요청을 완료하고 연락처를 지운다.
create or replace function public.singles_operator_verify_adult(p_operator uuid,p_user uuid,p_method text,p_note text)
 returns timestamptz language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_at timestamptz;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_operator=p_user then raise exception 'operator_self_verification_forbidden' using errcode='42501'; end if;
 if p_method not in ('id_document_in_person','id_document_video','certified_provider') then raise exception 'invalid_method' using errcode='22023'; end if;
 update public.singles_memberships set adult_verified_at=coalesce(adult_verified_at,now()),updated_at=now()
  where user_id=p_user and status='active' and age_19_confirmed=true returning adult_verified_at into v_at;
 if v_at is null then raise exception 'member_not_found' using errcode='P0002'; end if;
 insert into public.singles_adult_verifications(user_id,operator_id,method,note) values(p_user,p_operator,p_method,left(coalesce(p_note,''),200));
 update public.singles_adult_check_requests set status='done',contact=null,done_at=now(),done_by=p_operator
  where user_id=p_user and status='requested';
 return v_at;
end $$;
revoke all on function public.singles_operator_verify_adult(uuid,uuid,text,text) from public;
revoke all on function public.singles_operator_verify_adult(uuid,uuid,text,text) from anon;
revoke all on function public.singles_operator_verify_adult(uuid,uuid,text,text) from authenticated;
grant execute on function public.singles_operator_verify_adult(uuid,uuid,text,text) to service_role;

-- 탈퇴·참여 중단 시 남은 요청의 연락처를 지운다.
create or replace function public.singles_adult_check_on_membership_end()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status<>'active' and old.status='active' then
  update public.singles_adult_check_requests set status='cancelled',contact=null where user_id=new.user_id and status='requested';
 end if;
 return new;
end $$;
revoke all on function public.singles_adult_check_on_membership_end() from public;
revoke all on function public.singles_adult_check_on_membership_end() from anon;
revoke all on function public.singles_adult_check_on_membership_end() from authenticated;
drop trigger if exists singles_adult_check_on_membership_end on public.singles_memberships;
create trigger singles_adult_check_on_membership_end after update of status on public.singles_memberships
 for each row execute function public.singles_adult_check_on_membership_end();
alter table public.singles_memberships enable always trigger singles_adult_check_on_membership_end;

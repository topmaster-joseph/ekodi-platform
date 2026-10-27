-- EKODI 동행 본인확인기관 연동(포트원 V2 본인인증, 2026-10-28).
-- 저장 원칙: 이름·생년월일·전화번호는 저장하지 않는다. 결과(성인 여부)와 중복 가입 방지용 CI 해시만 남긴다.
create table if not exists public.singles_identity_verifications(
 id text primary key check (id ~ '^ekodi-sgl-[0-9a-f]{32}$'),
 user_id uuid not null,
 provider text not null default 'portone' check (provider in ('portone')),
 status text not null default 'pending' check (status in ('pending','verified','rejected_minor','duplicate','failed')),
 ci_hash text check (ci_hash is null or ci_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists singles_identity_verifications_user on public.singles_identity_verifications(user_id,created_at desc);
-- 한 사람(CI)은 한 계정에서만 인증된다.
create unique index if not exists singles_identity_one_account_per_person
 on public.singles_identity_verifications(ci_hash) where status='verified';
alter table public.singles_identity_verifications enable row level security;
revoke all on table public.singles_identity_verifications from public,anon,authenticated;
grant select,insert,update on table public.singles_identity_verifications to service_role;

create or replace function public.singles_identity_start(p_user uuid,p_id text)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.singles_memberships where user_id=p_user and status='active' and age_19_confirmed=true)
 then raise exception 'membership_required' using errcode='42501'; end if;
 if (select count(*) from public.singles_identity_verifications where user_id=p_user and created_at>now()-interval '1 day')>=10
 then raise exception 'identity_rate_limited' using errcode='P0001'; end if;
 insert into public.singles_identity_verifications(id,user_id) values(p_id,p_user);
 return p_id;
end $$;

-- 서버가 본인확인기관 결과를 확인한 뒤 호출. 성인이면 adult_verified_at 기록.
create or replace function public.singles_identity_complete(p_user uuid,p_id text,p_adult boolean,p_ci_hash text)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.singles_identity_verifications%rowtype;
begin
 select * into v from public.singles_identity_verifications where id=p_id for update;
 if not found or v.user_id<>p_user then raise exception 'identity_not_found' using errcode='P0002'; end if;
 if v.status<>'pending' then raise exception 'identity_already_completed' using errcode='23514'; end if;
 if p_ci_hash is null or p_ci_hash !~ '^[0-9a-f]{64}$' then
  update public.singles_identity_verifications set status='failed',completed_at=now() where id=p_id;
  return 'failed';
 end if;
 if not p_adult then
  update public.singles_identity_verifications set status='rejected_minor',completed_at=now() where id=p_id;
  return 'rejected_minor';
 end if;
 if exists(select 1 from public.singles_identity_verifications where ci_hash=p_ci_hash and status='verified' and user_id<>p_user) then
  update public.singles_identity_verifications set status='duplicate',completed_at=now() where id=p_id;
  return 'duplicate';
 end if;
 -- 같은 계정의 이전 인증은 그대로 두고(재인증), 새 건만 verified로 기록한다.
 if exists(select 1 from public.singles_identity_verifications where ci_hash=p_ci_hash and status='verified' and user_id=p_user) then
  update public.singles_identity_verifications set status='failed',completed_at=now() where id=p_id;
 else
  update public.singles_identity_verifications set status='verified',ci_hash=p_ci_hash,completed_at=now() where id=p_id;
 end if;
 update public.singles_memberships set adult_verified_at=coalesce(adult_verified_at,now()),updated_at=now()
  where user_id=p_user and status='active';
 return 'verified';
end $$;

revoke all on function public.singles_identity_start(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_identity_start(uuid,text) to service_role;
revoke all on function public.singles_identity_complete(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.singles_identity_complete(uuid,text,boolean,text) to service_role;

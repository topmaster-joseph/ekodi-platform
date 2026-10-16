-- Private preparation workspace only. No license, brokerage mode, or payments activated.
create table if not exists public.singles_brokerage_readiness (
 regime text not null check (regime in ('domestic','international')),
 code text not null check (code ~ '^[a-z][a-z0-9_]{2,48}$'),
 requirement text not null check (char_length(requirement) between 3 and 160),
 progress text not null default 'not_started'
   check (progress in ('not_started','collecting','ready_for_review','submitted')),
 evidence_ref text check (evidence_ref is null or char_length(evidence_ref)<=240),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key (regime,code)
);
create table if not exists public.singles_brokerage_readiness_audit (
 id bigint generated always as identity primary key,
 regime text not null,
 code text not null,
 actor_id uuid not null references auth.users(id),
 previous_progress text not null,
 new_progress text not null,
 previous_evidence_ref text,
 new_evidence_ref text,
 created_at timestamptz not null default now()
);
alter table public.singles_brokerage_readiness enable row level security;
alter table public.singles_brokerage_readiness_audit enable row level security;
revoke all on public.singles_brokerage_readiness, public.singles_brokerage_readiness_audit
 from public, anon, authenticated;
grant select,update on public.singles_brokerage_readiness to service_role;
grant select,insert on public.singles_brokerage_readiness_audit to service_role;
insert into public.singles_brokerage_readiness(regime,code,requirement) values
 ('domestic','jurisdiction','관할 시·군·구 및 신고 수리 담당 부서 확인'),
 ('domestic','business_registration','사업자등록 및 사업 형태 확인'),
 ('domestic','premises','중개사무소 확보 및 소재지·사용권원 증빙'),
 ('domestic','eligibility','대표·종사자 결격사유와 종사자 명부 확인'),
 ('domestic','insurance','보증보험 가입 및 유효 증빙 확인'),
 ('domestic','contracts','서면계약·수수료·광고·환불 약관 법률 검토'),
 ('domestic','privacy','개인정보·민감정보·기록 보존·접근기록 검토'),
 ('domestic','filing','정부24 또는 관할 지자체에 정식 신고 접수'),
 ('domestic','receipt','국내결혼중개업 신고필증 수령 후 진위 확인'),
 ('international','jurisdiction','관할 시·군·구 등록 수리 담당 부서 확인'),
 ('international','business_registration','사업자등록 및 사업 형태 확인'),
 ('international','premises','중개사무소 확보 및 사용권원 증빙'),
 ('international','education','관련 법정 교육 수료·증빙 확인'),
 ('international','assets','법정 자본금 또는 자산 요건 증빙 확인'),
 ('international','eligibility','대표·종사자 결격사유 및 종사자 명부 확인'),
 ('international','insurance','보증보험 가입 및 유효 증빙 확인'),
 ('international','contracts','국제결혼중개 서면계약·번역·정보제공 의무 법률 검토'),
 ('international','foreign_law','상대국 법률·출입국·신원확인·통역·인권보호 검토'),
 ('international','filing','정부24 또는 관할 지자체에 정식 등록 신청'),
 ('international','certificate','국제결혼중개업 등록증 수령 후 진위 확인')
 on conflict (regime,code) do nothing;
comment on table public.singles_brokerage_readiness is
 'Documents preparation only. Do not infer a marriage brokerage licence from progress entries.';

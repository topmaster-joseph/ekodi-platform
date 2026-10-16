-- Paperwork tracking ONLY; never authorizes marriage brokerage or activates paid actions.
create table if not exists public.singles_brokerage_application_checklist (
 regime text not null check(regime in ('domestic','international')),
 requirement text not null check(char_length(requirement) between 3 and 110),
 completed boolean not null default false,
 evidence_reference text check(evidence_reference is null or char_length(evidence_reference)<=500),
 checked_by uuid references auth.users(id),
 checked_at timestamptz,
 primary key(regime,requirement)
);
alter table public.singles_brokerage_application_checklist enable row level security;
revoke all on public.singles_brokerage_application_checklist from public,anon,authenticated;
grant select,insert,update on public.singles_brokerage_application_checklist to service_role;
insert into public.singles_brokerage_application_checklist(regime,requirement) values
('domestic','관할 시군구 신고서 및 제출서류 확인'),
('domestic','사무소 사용권원과 시설 요건 확인'),
('domestic','결격사유 및 관련 종사자 교육 해당 여부 확인'),
('domestic','보증보험 또는 관계 법령상 손해배상 보장 확인'),
('domestic','이용약관·수수료·환불 정책 법률 검토'),
('domestic','관할 관청 신고 수리 및 신고증 확인'),
('international','관할 지자체 등록 요건 및 제출서류 확인'),
('international','사무소·자본금 등 요건 관련 증빙 확인'),
('international','종사자 교육 및 결격사유 확인'),
('international','보증보험 및 손해배상 보장 확인'),
('international','국제결혼 서면계약·개인정보·번역 의무 법률 검토'),
('international','국제결혼중개업 등록 완료 및 등록증 확인')
on conflict(regime,requirement) do nothing;

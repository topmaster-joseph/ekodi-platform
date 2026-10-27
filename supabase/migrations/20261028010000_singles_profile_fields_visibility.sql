-- EKODI 동행 프로필 항목·항목별 공개 선택(2026-10-28).
-- details: 정해진 항목만 서버가 검증해 저장(성별·나이대·직업 분야·학력·취미·바라는 동행, 신앙 항목은 민감정보 동의 회원만).
-- visibility: 항목별 공개 여부. 표시 이름은 항상 공개, 나머지는 회원이 직접 선택.
alter table public.singles_profiles
 add column if not exists details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(details)='object' and pg_column_size(details)<=4096),
 add column if not exists visibility jsonb not null default '{}'::jsonb
  check (jsonb_typeof(visibility)='object' and pg_column_size(visibility)<=1024);

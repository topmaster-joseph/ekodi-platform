-- EKODI-FUNDING-004 — 에코디 펀딩 직접후원(A) 모드 + 외부 사이트 임베드. Additive only.
-- 회원·외부 단체 펀딩은 후원금을 개설자가 직접 받는다(정산대행 B·증권형/대출형 C는 제공하지 않음).
-- 이 파일의 열(direct_pledge_url, reported_amount, reported_backers, reported_at)은 운영 DB에
-- 마이그레이션 이전에 이미 반영되어 있었다(배포 시 direct_pledge_url·reported_amount 순서로 duplicate column 확인).
-- 스테이징·개발 DB는 원본 내용으로 이미 적용되었다. 완전히 새 DB를 만들 때는 아래 열을 수동으로 추가한다:
--   ALTER TABLE funding_campaigns ADD COLUMN direct_pledge_url TEXT NOT NULL DEFAULT '';
--   ALTER TABLE funding_campaigns ADD COLUMN reported_amount INTEGER NOT NULL DEFAULT 0 CHECK (reported_amount >= 0 AND reported_amount < 10000000);
--   ALTER TABLE funding_campaigns ADD COLUMN reported_backers INTEGER NOT NULL DEFAULT 0 CHECK (reported_backers >= 0);
--   ALTER TABLE funding_campaigns ADD COLUMN reported_at TEXT NOT NULL DEFAULT '';
SELECT 1;

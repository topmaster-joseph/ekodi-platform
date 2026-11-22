-- EKODI-FUNDING-004 — 에코디 펀딩 직접후원(A) 모드 + 외부 사이트 임베드. Additive only.
-- 회원·외부 단체 펀딩은 후원금을 개설자가 직접 받는다(정산대행 B·증권형/대출형 C는 제공하지 않음).
-- direct_pledge_url: 개설자의 결제·후원 안내 페이지(https). reported_*: 개설자가 보고한 모금 현황(공개 한도 1천만원 미만).
-- direct_pledge_url는 운영 DB에 이 마이그레이션 이전에 이미 추가되어 있어(배포 시 duplicate column) 여기서는 건너뛴다.
-- 스테이징·개발 DB는 원본으로 이미 적용되어 영향 없음. 완전히 새 DB를 만들 때는 이 열을 수동 추가해야 한다.
ALTER TABLE funding_campaigns ADD COLUMN reported_amount INTEGER NOT NULL DEFAULT 0 CHECK (reported_amount >= 0 AND reported_amount < 10000000);
ALTER TABLE funding_campaigns ADD COLUMN reported_backers INTEGER NOT NULL DEFAULT 0 CHECK (reported_backers >= 0);
ALTER TABLE funding_campaigns ADD COLUMN reported_at TEXT NOT NULL DEFAULT '';

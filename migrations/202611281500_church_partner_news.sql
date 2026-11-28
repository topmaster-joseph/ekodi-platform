-- 에코디교회 '함께 걷는 이들의 소식'(협력소식) 저장소.
--
-- 2026-11-12 운영 측정(교회 역량증명 실행 43225492451 의 liveRequests):
--   {"status": 404, "url": "/api/partner-news/public"}
-- 교회 홈 06 구역은 그 주소를 부르는데 구현이 없었고, 캐시 없는 방문자는
-- "잠시 후 다시 확인해 주세요" 를 봤다. 되지 않을 일을 기다리라는 안내였다.
--
-- 구역이 스스로 약속한 경계를 그대로 담는다 — "확인·승인된 내용만 나눕니다".
--   * 초안(draft)은 공개 응답에 절대 섞이지 않는다.
--   * 자동 초안은 이미 공개 승인된 출처에서만 만들고, 스스로 공개하지 않는다.
--   * 공개는 사이트관리자와 최고관리자가 누른다.
CREATE TABLE IF NOT EXISTS church_partner_news (
  id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  org_key TEXT NOT NULL,
  org_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  image_url TEXT,
  news_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  origin TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto','manual')),
  -- 자동 초안의 출처. 같은 출처로 초안이 두 번 생기지 않게 하고, 관리자가 고친
  -- 뒤에도 자동 갱신이 덮어쓰지 않도록 판단 근거로 쓴다.
  source_ref TEXT,
  edited_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (edited_by_admin IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  published_by TEXT NOT NULL DEFAULT ''
);
-- 공개 조회 경로: 테넌트 + 공개 상태 + 날짜 내림차순.
CREATE INDEX IF NOT EXISTS idx_church_partner_news_public
  ON church_partner_news (tenant, status, news_date DESC);
-- 관리 화면: 초안이 먼저 보이도록 갱신순.
CREATE INDEX IF NOT EXISTS idx_church_partner_news_admin
  ON church_partner_news (tenant, updated_at DESC);
-- 같은 출처에서 초안이 중복 생성되지 않게 한다. source_ref 가 NULL 인 수동 작성은
-- SQLite 규칙에 따라 이 제약에 걸리지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_church_partner_news_source
  ON church_partner_news (tenant, source_ref);

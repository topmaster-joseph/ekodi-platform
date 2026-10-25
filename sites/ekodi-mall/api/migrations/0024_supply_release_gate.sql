-- EKODI-MALL-SUPPLY-RELEASE-001: 에코디언 소싱 상품은 도매꾹 구매 API 승인(자동발주 가능) 후에만
-- 판매·검색노출·홍보를 시작한다. 승인 전에는 'staged'(비공개)로 대기.
ALTER TABLE products ADD COLUMN supply_release TEXT NOT NULL DEFAULT '';
-- 시간별 선정 기준 상향(ratchet)과 키워드 성과 가중치 학습.
ALTER TABLE supply_curation_keywords ADD COLUMN weight_adj REAL NOT NULL DEFAULT 1.0;
CREATE TABLE IF NOT EXISTS supply_curation_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

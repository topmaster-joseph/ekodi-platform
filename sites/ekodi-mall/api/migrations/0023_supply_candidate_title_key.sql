-- EKODI-MALL-DOMEGGOOK-CURATION-002: 모델코드만 다른 중복 상품 방지용 정규화 제목 키.
ALTER TABLE supply_candidates ADD COLUMN title_key TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_supply_candidates_title_key ON supply_candidates(status, title_key);

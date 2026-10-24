-- EKODI-MALL-DOMEGGOOK-CURATION-001: 판매가능성 기반 위탁상품 자동 선별(목표 100개) 후보·키워드 상태.
CREATE TABLE IF NOT EXISTS supply_candidates (
  item_no TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  price INTEGER,
  rank_pos INTEGER,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','imported','rejected')),
  reason TEXT NOT NULL DEFAULT '',
  product_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supply_candidates_pick ON supply_candidates(status, score DESC);
CREATE TABLE IF NOT EXISTS supply_curation_keywords (
  keyword TEXT PRIMARY KEY,
  scanned_at TEXT,
  found INTEGER NOT NULL DEFAULT 0
);

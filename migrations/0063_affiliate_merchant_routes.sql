CREATE TABLE IF NOT EXISTS affiliate_merchant_routes (
  route_key TEXT PRIMARY KEY,
  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  market_country TEXT NOT NULL DEFAULT 'KR',
  settlement_currency TEXT NOT NULL DEFAULT 'KRW',
  affiliate_mode TEXT NOT NULL DEFAULT 'direct',
  network_key TEXT NOT NULL DEFAULT '',
  network_name TEXT NOT NULL DEFAULT '',
  affiliate_status TEXT NOT NULL DEFAULT 'candidate',
  recommendation_enabled INTEGER NOT NULL DEFAULT 0,
  program_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(merchant_key, affiliate_mode, network_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_merchant_routes_recommend
  ON affiliate_merchant_routes(affiliate_status, recommendation_enabled, merchant_key);

INSERT OR IGNORE INTO affiliate_merchant_routes
  (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode,
   network_key, network_name, affiliate_status, recommendation_enabled, created_at, updated_at)
VALUES
  ('coupang-partners-direct', 'coupang_partners', '쿠팡', 'KR', 'KRW', 'direct',
   '', '', 'active', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO affiliate_merchant_routes
  (route_key, merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode,
   network_key, network_name, affiliate_status, recommendation_enabled, notes, created_at, updated_at)
VALUES
  ('elevenst-network-linkprice', 'elevenst', '11번가', 'KR', 'KRW', 'network',
   'linkprice', 'LinkPrice', 'pending', 0,
   'LinkPrice 회원 계정은 보유. 11번가 머천트 승인 및 딥링크/API 활성 상태 확인 후 active로 전환.',
   datetime('now'), datetime('now'));
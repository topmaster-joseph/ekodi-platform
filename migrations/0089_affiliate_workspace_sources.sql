CREATE TABLE IF NOT EXISTS affiliate_workspace_sources (
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  route_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id TEXT NOT NULL DEFAULT '',
  updated_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, route_key)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_workspace_sources_slug
  ON affiliate_workspace_sources(workspace_slug, enabled, route_key);

CREATE TABLE IF NOT EXISTS affiliate_workspace_source_audit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  route_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affiliate_workspace_source_audit_time
  ON affiliate_workspace_source_audit(workspace_id, created_at DESC);
INSERT OR IGNORE INTO affiliate_partner_programs
(program_key,program_name,program_kind,region,home_country,coverage_summary,application_status,integration_status,api_capable,deeplink_capable,product_feed_capable,reporting_capable,external_action_required,priority,program_url,notes,created_at,updated_at)
VALUES
('atomy_official_reference','Atomy Official Mall','reference','KR','KR','공식몰 참조 전용 · 외부 재판매·자동주문 금지','prepared','manual',0,0,0,0,1,70,'https://kr.atomy.com/','공식몰 참조만 허용',datetime('now'),datetime('now'));

INSERT OR IGNORE INTO affiliate_merchant_routes
(route_key,merchant_key,merchant_name,market_country,settlement_currency,affiliate_mode,network_key,network_name,affiliate_status,tracking_status,catalog_status,recommendation_enabled,program_url,notes,created_at,updated_at)
VALUES
('amazon-direct-associates','amazon','Amazon','US','USD','direct','','Amazon Associates','candidate','not_ready','not_ready',0,'https://affiliate-program.amazon.com/','국가별 승인·추적·상품 Feed 확인 전 추천 금지.',datetime('now'),datetime('now')),
('atomy-official-reference','atomy_official','애터미 공식몰','KR','KRW','direct','','공식몰 참조','candidate','not_ready','not_ready',0,'https://kr.atomy.com/','공식몰 참조 전용. 외부 재판매·자동주문·무단 상품정보 복제 금지.',datetime('now'),datetime('now')),
('trip-network-linkprice','trip_com','Trip.com','KR','KRW','network','linkprice','LinkPrice','candidate','not_ready','not_ready',0,'https://www.linkprice.com/affiliate/2022_index.html','머천트 승인 확인 전 추천 금지.',datetime('now'),datetime('now')),
('hotels-network-linkprice','hotels_com','Hotels.com','US','USD','network','linkprice','LinkPrice','candidate','not_ready','not_ready',0,'https://www.linkprice.com/affiliate/2022_index.html','머천트 승인 확인 전 추천 금지.',datetime('now'),datetime('now')),
('agoda-network-linkprice','agoda','Agoda','SG','USD','network','linkprice','LinkPrice','candidate','not_ready','not_ready',0,'https://www.linkprice.com/affiliate/2022_index.html','머천트 승인 확인 전 추천 금지.',datetime('now'),datetime('now')),
('expedia-network-linkprice','expedia','Expedia','US','USD','network','linkprice','LinkPrice','candidate','not_ready','not_ready',0,'https://www.linkprice.com/affiliate/2022_index.html','머천트 승인 확인 전 추천 금지.',datetime('now'),datetime('now')),
('shein-network-adpick','shein','SHEIN','SG','USD','network','adpick','ADPICK Biz','candidate','not_ready','not_ready',0,'https://biz.adpick.co.kr/','머천트 승인 확인 전 추천 금지.',datetime('now'),datetime('now'));

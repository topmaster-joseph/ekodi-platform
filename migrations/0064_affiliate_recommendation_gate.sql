ALTER TABLE affiliate_merchant_routes ADD COLUMN tracking_status TEXT NOT NULL DEFAULT 'not_ready';
ALTER TABLE affiliate_merchant_routes ADD COLUMN catalog_status TEXT NOT NULL DEFAULT 'not_ready';
ALTER TABLE affiliate_merchant_routes ADD COLUMN recommendation_verified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_affiliate_merchant_routes_readiness
  ON affiliate_merchant_routes(affiliate_status, tracking_status, catalog_status, recommendation_enabled, merchant_key);

UPDATE affiliate_merchant_routes
SET tracking_status = 'ready',
    catalog_status = 'feed_ready',
    recommendation_verified_at = COALESCE(recommendation_verified_at, datetime('now')),
    updated_at = datetime('now')
WHERE merchant_key = 'coupang_partners'
  AND affiliate_status = 'active'
  AND recommendation_enabled = 1;

UPDATE affiliate_merchant_routes
SET tracking_status = 'not_ready',
    catalog_status = 'not_ready',
    recommendation_enabled = 0,
    recommendation_verified_at = NULL,
    updated_at = datetime('now')
WHERE merchant_key = 'elevenst'
  AND network_key = 'linkprice'
  AND affiliate_status <> 'active';
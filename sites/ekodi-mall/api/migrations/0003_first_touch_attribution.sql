PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS attribution_visits (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  attribution_token TEXT NOT NULL REFERENCES attribution_tokens(token) ON DELETE RESTRICT,
  share_link_code TEXT REFERENCES share_links(code) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct','marketplace','ai')),
  channel TEXT NOT NULL DEFAULT 'mall',
  fee_rate_percent INTEGER NOT NULL CHECK (fee_rate_percent IN (7,8,9,10)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(product_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_mall_attribution_visits_product ON attribution_visits(product_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_visits_expiry ON attribution_visits(expires_at);

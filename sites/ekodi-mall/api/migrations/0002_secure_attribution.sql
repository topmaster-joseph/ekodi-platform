PRAGMA foreign_keys = ON;

-- Seller/AI issued share links are distinct from the public product identifier.
-- A public visitor cannot mint a direct-sale attribution token.
CREATE TABLE IF NOT EXISTS share_links (
  token TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct','ai')),
  channel TEXT NOT NULL DEFAULT 'copy',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mall_share_links_product ON share_links(product_id, source_type, active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_share_links_seller ON share_links(seller_id, created_at DESC);

-- First-touch attribution is stored server-side for seven days.
-- visitor_id is an anonymous browser identifier, not an email/user id.
CREATE TABLE IF NOT EXISTS attribution_visits (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  share_token TEXT REFERENCES share_links(token) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct','marketplace','ai')),
  channel TEXT NOT NULL DEFAULT 'unknown',
  fee_percent INTEGER NOT NULL CHECK (fee_percent IN (7,8,9,10)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(product_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_visits_expiry ON attribution_visits(expires_at);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_visits_product ON attribution_visits(product_id, first_seen_at DESC);

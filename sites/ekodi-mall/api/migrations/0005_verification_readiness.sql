PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('seller','store')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','verified','rejected','cancelled')),
  request_note TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_verification_seller ON verification_requests(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_verification_queue ON verification_requests(status, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mall_verification_one_open
  ON verification_requests(entity_type, entity_id)
  WHERE status IN ('submitted','under_review');

CREATE TABLE IF NOT EXISTS mall_ops_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  seller_id TEXT,
  store_id TEXT,
  product_id TEXT,
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_ops_audit_time ON mall_ops_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_ops_audit_seller ON mall_ops_audit(seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mall_partner_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'direct_partner',
  feed_url TEXT NOT NULL,
  query_param TEXT NOT NULL DEFAULT 'q',
  limit_param TEXT NOT NULL DEFAULT 'limit',
  item_path TEXT NOT NULL DEFAULT '',
  auth_mode TEXT NOT NULL DEFAULT 'none',
  auth_header_name TEXT NOT NULL DEFAULT '',
  credential_ciphertext TEXT NOT NULL DEFAULT '',
  credential_iv TEXT NOT NULL DEFAULT '',
  mapping_json TEXT NOT NULL DEFAULT '{}',
  disclosure_text TEXT NOT NULL DEFAULT '',
  commercial_terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inactive',
  last_test_at TEXT NOT NULL DEFAULT '',
  last_test_status TEXT NOT NULL DEFAULT 'never',
  last_test_count INTEGER NOT NULL DEFAULT 0,
  last_test_latency_ms INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  test_fingerprint TEXT NOT NULL DEFAULT '',
  current_fingerprint TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_partner_status
  ON mall_partner_providers(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS affiliate_partner_subid_discovery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  candidate_sub_id TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  clicks_rows INTEGER NOT NULL DEFAULT 0,
  orders_rows INTEGER NOT NULL DEFAULT 0,
  cancels_rows INTEGER NOT NULL DEFAULT 0,
  commission_rows INTEGER NOT NULL DEFAULT 0,
  first_seen_date TEXT NOT NULL DEFAULT '',
  last_seen_date TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, candidate_sub_id)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_partner_subid_discovery_account
  ON affiliate_partner_subid_discovery(account_id, updated_at DESC);
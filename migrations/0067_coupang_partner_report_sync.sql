-- Coupang Partners daily reporting sync state.
-- Stores only operational counts and timestamps. No buyer PII is persisted.

CREATE TABLE IF NOT EXISTS affiliate_partner_report_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  sync_date TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  orders_rows INTEGER NOT NULL DEFAULT 0,
  cancels_rows INTEGER NOT NULL DEFAULT 0,
  commission_rows INTEGER NOT NULL DEFAULT 0,
  matched_product_rows INTEGER NOT NULL DEFAULT 0,
  unmatched_product_rows INTEGER NOT NULL DEFAULT 0,
  error_text TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(account_id, sync_date)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_partner_report_runs_account
  ON affiliate_partner_report_runs(account_id, sync_date DESC);

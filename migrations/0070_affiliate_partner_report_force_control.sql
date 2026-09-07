CREATE TABLE IF NOT EXISTS affiliate_partner_report_control (
  account_id TEXT PRIMARY KEY,
  force_requested_at TEXT,
  force_reason TEXT NOT NULL DEFAULT '',
  force_consumed_at TEXT,
  updated_at TEXT NOT NULL
);

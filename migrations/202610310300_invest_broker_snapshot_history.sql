-- EKODI Invest read-only broker balance history (owner only).
-- Additive only. Stores already-validated normalized snapshots (opaque account
-- reference, minor-unit amounts, symbols, quantities) - never account numbers,
-- credentials or tokens. Mock and real data modes are kept apart by data_mode.
CREATE TABLE IF NOT EXISTS investment_broker_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,
  data_mode TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_broker_snapshots_lookup
  ON investment_broker_snapshots(subject_key, data_mode, account_ref, captured_at);

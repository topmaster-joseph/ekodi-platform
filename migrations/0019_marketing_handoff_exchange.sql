CREATE TABLE IF NOT EXISTS marketing_handoff_exchanges (
  exchange_hash TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'email',
  workspace_json TEXT NOT NULL DEFAULT 'null',
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_handoff_exchanges_expires
  ON marketing_handoff_exchanges(expires_at);

CREATE INDEX IF NOT EXISTS idx_marketing_handoff_exchanges_consumed
  ON marketing_handoff_exchanges(consumed_at);

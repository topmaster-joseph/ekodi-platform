-- EKODI GitHub App read-only measurement canary. Additive and OFF until owner secrets/flag.
-- Atomic once-per-6-hour gate across Control API instances; includes no actor, token or private key.
CREATE TABLE IF NOT EXISTS github_app_probe_attempts (
  slot_key TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL CHECK(installation_id > 0),
  state TEXT NOT NULL CHECK(state IN ('claimed','verified','denied')),
  reason TEXT NOT NULL DEFAULT '',
  github_api_calls INTEGER NOT NULL DEFAULT 0 CHECK(github_api_calls BETWEEN 0 AND 2),
  claimed_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS github_app_probe_attempts_recent_idx
  ON github_app_probe_attempts(claimed_at DESC);

CREATE TABLE IF NOT EXISTS capability_sandbox_runs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL,
  test_count INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  promotion TEXT NOT NULL DEFAULT 'blocked',
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capability_sandbox_candidate
  ON capability_sandbox_runs(candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capability_sandbox_status
  ON capability_sandbox_runs(status, created_at DESC);

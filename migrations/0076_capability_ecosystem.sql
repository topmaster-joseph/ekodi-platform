-- EKODI 10G Capability Ecosystem: append-only experience ledger and automation candidates.
-- Additive only. No existing production data is rewritten or deleted.
CREATE TABLE IF NOT EXISTS capability_experiences (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  pattern_key TEXT NOT NULL,
  goal_fingerprint TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ekodi-core',
  risk TEXT NOT NULL DEFAULT 'normal' CHECK (risk IN ('low','normal','high','critical')),
  capability_ids_json TEXT NOT NULL DEFAULT '[]',
  result_state TEXT NOT NULL DEFAULT 'unknown',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  cost_class TEXT NOT NULL DEFAULT 'unknown',
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capability_experiences_pattern_time
  ON capability_experiences(pattern_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_experiences_verified_time
  ON capability_experiences(verified, occurred_at DESC);
CREATE TABLE IF NOT EXISTS capability_automation_candidates (
  id TEXT PRIMARY KEY,
  pattern_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('observed','pattern_found','candidate','sandboxed','verified','staged','active','quarantined')),
  occurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (occurrence_count >= 0),
  success_rate REAL NOT NULL DEFAULT 0 CHECK (success_rate >= 0 AND success_rate <= 1),
  risk TEXT NOT NULL DEFAULT 'normal' CHECK (risk IN ('low','normal','high','critical')),
  spec_json TEXT NOT NULL,
  evaluation_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capability_candidates_status_time
  ON capability_automation_candidates(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_candidates_pattern
  ON capability_automation_candidates(pattern_key);

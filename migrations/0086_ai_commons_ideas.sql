CREATE TABLE IF NOT EXISTS ai_commons_ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  fingerprint TEXT NOT NULL,
  problem TEXT NOT NULL,
  outcome TEXT NOT NULL,
  audience TEXT NOT NULL,
  current_way TEXT NOT NULL DEFAULT '',
  source_service_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reuse_suggested','triaged','candidate','sandboxed','verified','staged','shared','rejected')),
  matched_capability_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_commons_ideas_user_fingerprint
  ON ai_commons_ideas(user_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_ai_commons_ideas_user_created
  ON ai_commons_ideas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_commons_ideas_status_updated
  ON ai_commons_ideas(status, updated_at DESC);

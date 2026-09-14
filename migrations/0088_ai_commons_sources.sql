CREATE TABLE IF NOT EXISTS ai_commons_idea_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source_service_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_commons_sources_unique
  ON ai_commons_idea_sources(user_id, fingerprint, source_service_id);
CREATE INDEX IF NOT EXISTS idx_ai_commons_sources_fingerprint
  ON ai_commons_idea_sources(fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_commons_sources_service
  ON ai_commons_idea_sources(source_service_id, created_at DESC);

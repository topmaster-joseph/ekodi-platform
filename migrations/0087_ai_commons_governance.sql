ALTER TABLE ai_commons_ideas ADD COLUMN development_task_id TEXT;
ALTER TABLE ai_commons_ideas ADD COLUMN review_decision TEXT;
ALTER TABLE ai_commons_ideas ADD COLUMN reviewed_by TEXT;
ALTER TABLE ai_commons_ideas ADD COLUMN reviewed_at TEXT;
ALTER TABLE ai_commons_ideas ADD COLUMN published_service_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_commons_ideas_fingerprint_status
  ON ai_commons_ideas(fingerprint, status);
CREATE INDEX IF NOT EXISTS idx_ai_commons_ideas_development_task
  ON ai_commons_ideas(development_task_id);

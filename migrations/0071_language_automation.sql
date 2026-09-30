CREATE TABLE IF NOT EXISTS language_site_state (
  service_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'queued',
  source_hash TEXT NOT NULL DEFAULT '',
  catalog_hash TEXT NOT NULL DEFAULT '',
  source_checked_at TEXT,
  translated_at TEXT,
  validated_at TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(service_id, locale)
);

CREATE INDEX IF NOT EXISTS language_site_state_stage_idx
  ON language_site_state(stage, updated_at);
CREATE INDEX IF NOT EXISTS language_site_state_service_idx
  ON language_site_state(service_id, stage);

CREATE TABLE IF NOT EXISTS language_catalogs (
  service_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  catalog_hash TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(service_id, locale)
);

CREATE TABLE IF NOT EXISTS language_automation_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at)
VALUES
  ('translation', 'openai', '["gemini","anthropic"]', 'gpt-5.6-terra', datetime('now'));

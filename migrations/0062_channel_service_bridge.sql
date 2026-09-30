CREATE TABLE IF NOT EXISTS channel_provider_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('tenant')),
  subject_key TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  content_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  external_post_id TEXT NOT NULL DEFAULT '',
  external_post_url TEXT NOT NULL DEFAULT '',
  publish_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','published','cancelled','failed')),
  provider_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(service_id, subject_type, subject_key, idempotency_key),
  FOREIGN KEY(content_id) REFERENCES marketing_content_items(id),
  FOREIGN KEY(channel_id) REFERENCES marketing_publish_channels(id)
);

CREATE INDEX IF NOT EXISTS idx_channel_provider_schedules_subject
  ON channel_provider_schedules(subject_type, subject_key, publish_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_provider_schedules_channel
  ON channel_provider_schedules(channel_id, publish_at DESC);

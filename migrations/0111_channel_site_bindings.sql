-- Central channel registry: bind reusable publishing channels to one or more EKODI sites.
-- Additive only. Existing channel ownership and OAuth credentials remain authoritative.

CREATE TABLE IF NOT EXISTS channel_site_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  channel_id INTEGER NOT NULL,
  service_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','secondary','archive_only')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  auto_archive INTEGER NOT NULL DEFAULT 0 CHECK(auto_archive IN (0,1)),
  archive_category TEXT NOT NULL DEFAULT 'past-event',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 100,
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(channel_id) REFERENCES marketing_publish_channels(id) ON DELETE CASCADE,
  UNIQUE(subject_type, subject_key, channel_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_site_bindings_subject
  ON channel_site_bindings(subject_type, subject_key, service_id, enabled, priority);

CREATE INDEX IF NOT EXISTS idx_channel_site_bindings_channel
  ON channel_site_bindings(channel_id, enabled, priority);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_site_bindings_default
  ON channel_site_bindings(subject_type, subject_key, service_id)
  WHERE is_default = 1 AND enabled = 1;

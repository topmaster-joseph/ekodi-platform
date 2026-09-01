CREATE TABLE IF NOT EXISTS devotion_batches (
  workspace_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  render_status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, batch_key)
);

CREATE TABLE IF NOT EXISTS devotion_items (
  workspace_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  item_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  passage TEXT NOT NULL,
  script TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id, batch_key, item_id)
);

CREATE INDEX IF NOT EXISTS idx_devotion_items_batch
  ON devotion_items(workspace_id, batch_key, position);

CREATE TABLE IF NOT EXISTS devotion_targets (
  workspace_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  config_ref TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id, batch_key, target_id)
);

CREATE TABLE IF NOT EXISTS devotion_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devotion_jobs_batch
  ON devotion_jobs(workspace_id, batch_key, created_at);

CREATE TABLE IF NOT EXISTS devotion_publications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  target_id TEXT NOT NULL,
  publish_at TEXT NOT NULL,
  item_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  external_ref TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devotion_publications_batch
  ON devotion_publications(workspace_id, batch_key, target_id, publish_at);

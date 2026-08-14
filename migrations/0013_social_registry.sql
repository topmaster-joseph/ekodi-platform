-- EKODI Social channel registry
-- Keeps public channel metadata centralized while preserving revision history.

CREATE TABLE IF NOT EXISTS social_registry_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registry_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS social_registry_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  registry_json TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_social_registry_history_revision
  ON social_registry_history(revision DESC);

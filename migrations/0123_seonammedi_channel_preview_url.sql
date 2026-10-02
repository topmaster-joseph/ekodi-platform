-- Deterministic channel preview overrides are stored separately from the canonical channel row.
-- CREATE TABLE IF NOT EXISTS keeps reused staging D1 and production migration runs idempotent.
CREATE TABLE IF NOT EXISTS seonammedi_channel_previews (
  channel_id INTEGER PRIMARY KEY,
  preview_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (channel_id) REFERENCES seonammedi_channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seonammedi_channel_previews_updated
  ON seonammedi_channel_previews(updated_at);

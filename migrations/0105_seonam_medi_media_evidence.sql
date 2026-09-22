ALTER TABLE seonam_medi_monitor_items ADD COLUMN resolved_url TEXT NOT NULL DEFAULT '';
ALTER TABLE seonam_medi_monitor_items ADD COLUMN media_type TEXT NOT NULL DEFAULT '';
ALTER TABLE seonam_medi_monitor_items ADD COLUMN media_url TEXT NOT NULL DEFAULT '';
ALTER TABLE seonam_medi_monitor_items ADD COLUMN media_source TEXT NOT NULL DEFAULT '';
ALTER TABLE seonam_medi_monitor_items ADD COLUMN media_published_at TEXT NOT NULL DEFAULT '';
ALTER TABLE seonam_medi_monitor_items ADD COLUMN media_state TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_seonam_medi_monitor_media
  ON seonam_medi_monitor_items(media_state, media_type, last_seen_at DESC);

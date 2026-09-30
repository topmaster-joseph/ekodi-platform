ALTER TABLE community_ministry_reports ADD COLUMN source_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE community_ministry_reports ADD COLUMN source_refreshed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE community_ministry_reports ADD COLUMN source_status TEXT NOT NULL DEFAULT 'not_loaded';
ALTER TABLE community_ministry_reports ADD COLUMN source_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_ministry_reports ADD COLUMN source_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_community_reports_source_status
  ON community_ministry_reports(source_status, source_refreshed_at DESC);

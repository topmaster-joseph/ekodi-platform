ALTER TABLE language_site_state ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'hidden';
ALTER TABLE language_site_state ADD COLUMN publication_updated_at TEXT;
ALTER TABLE language_site_state ADD COLUMN publication_updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE language_site_state ADD COLUMN publication_source TEXT NOT NULL DEFAULT 'migration';

UPDATE language_site_state
SET publication_status = CASE WHEN locale = 'ko-KR' OR stage = 'published' THEN 'published' ELSE 'hidden' END,
    publication_updated_at = COALESCE(publication_updated_at, updated_at),
    publication_source = CASE WHEN locale = 'ko-KR' OR stage = 'published' THEN 'registry-backfill' ELSE 'migration' END;

CREATE INDEX IF NOT EXISTS language_site_state_publication_idx
  ON language_site_state(service_id, publication_status, locale);

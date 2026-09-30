CREATE TABLE IF NOT EXISTS language_publication_state (
  service_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  publication_status TEXT NOT NULL DEFAULT 'hidden',
  publication_updated_at TEXT,
  publication_updated_by TEXT NOT NULL DEFAULT '',
  publication_source TEXT NOT NULL DEFAULT 'migration',
  PRIMARY KEY(service_id, locale)
);

INSERT OR IGNORE INTO language_publication_state
  (service_id, locale, publication_status, publication_updated_at, publication_updated_by, publication_source)
SELECT service_id,
       locale,
       CASE WHEN locale = 'ko-KR' OR stage = 'published' THEN 'published' ELSE 'hidden' END,
       COALESCE(published_at, updated_at),
       '',
       CASE WHEN locale = 'ko-KR' OR stage = 'published' THEN 'registry-backfill' ELSE 'migration' END
FROM language_site_state;

CREATE INDEX IF NOT EXISTS language_publication_state_status_idx
  ON language_publication_state(service_id, publication_status, locale);

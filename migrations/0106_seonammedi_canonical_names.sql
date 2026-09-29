CREATE TABLE IF NOT EXISTS seonammedi_monitor_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  sources_checked INTEGER NOT NULL DEFAULT 0,
  items_seen INTEGER NOT NULL DEFAULT 0,
  new_items INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seonammedi_monitor_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  publisher TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  query_key TEXT NOT NULL,
  query_label TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'source_only' CHECK (review_state IN ('source_only','verified','rejected','archived')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_url TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  media_source TEXT NOT NULL DEFAULT '',
  media_published_at TEXT NOT NULL DEFAULT '',
  media_state TEXT NOT NULL DEFAULT 'none'
);

INSERT OR IGNORE INTO seonammedi_monitor_runs
  (id,started_at,completed_at,status,sources_checked,items_seen,new_items,error_summary)
SELECT id,started_at,completed_at,status,sources_checked,items_seen,new_items,error_summary
FROM seonam_medi_monitor_runs;

INSERT OR IGNORE INTO seonammedi_monitor_items
  (id,fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,resolved_url,media_type,media_url,media_source,media_published_at,media_state)
SELECT id,fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,resolved_url,media_type,media_url,media_source,media_published_at,media_state
FROM seonam_medi_monitor_items;

CREATE INDEX IF NOT EXISTS idx_seonammedi_monitor_runs_time
  ON seonammedi_monitor_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_seonammedi_monitor_items_recent
  ON seonammedi_monitor_items(last_seen_at DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_seonammedi_monitor_items_review
  ON seonammedi_monitor_items(review_state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_seonammedi_monitor_media
  ON seonammedi_monitor_items(media_state, media_type, last_seen_at DESC);

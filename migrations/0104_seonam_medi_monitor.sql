CREATE TABLE IF NOT EXISTS seonam_medi_monitor_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  sources_checked INTEGER NOT NULL DEFAULT 0,
  items_seen INTEGER NOT NULL DEFAULT 0,
  new_items INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seonam_medi_monitor_items (
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
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seonam_medi_monitor_runs_time
  ON seonam_medi_monitor_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_seonam_medi_monitor_items_recent
  ON seonam_medi_monitor_items(last_seen_at DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_seonam_medi_monitor_items_review
  ON seonam_medi_monitor_items(review_state, last_seen_at DESC);

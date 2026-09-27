ALTER TABLE traffic_human_sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE traffic_human_sessions ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 1;

UPDATE traffic_human_sessions
SET last_seen_at = first_seen_at
WHERE last_seen_at = '';

CREATE INDEX IF NOT EXISTS idx_traffic_human_sessions_last_seen
  ON traffic_human_sessions(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS ekodi_site_improvement_state (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  cursor_index INTEGER NOT NULL DEFAULT 0,
  last_site_id TEXT NOT NULL DEFAULT '',
  last_task_id TEXT NOT NULL DEFAULT '',
  last_completed_at TEXT NOT NULL DEFAULT '',
  last_evaluated_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ekodi_site_improvement_state
  (id,cursor_index,last_site_id,last_task_id,last_completed_at,last_evaluated_at,updated_at)
VALUES ('singleton',0,'','','','','');

CREATE TABLE IF NOT EXISTS ekodi_site_improvement_runs (
  run_day TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  site_index INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed',
  attempts INTEGER NOT NULL DEFAULT 1,
  recent_sessions INTEGER NOT NULL DEFAULT 0,
  recent_visits INTEGER NOT NULL DEFAULT 0,
  quiet_window_minutes INTEGER NOT NULL DEFAULT 30,
  quiet_threshold INTEGER NOT NULL DEFAULT 2,
  task_id TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  pull_request_number INTEGER,
  head_sha TEXT NOT NULL DEFAULT '',
  merge_sha TEXT NOT NULL DEFAULT '',
  deployment_state TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  evaluated_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ekodi_site_improvement_runs_state
  ON ekodi_site_improvement_runs(state, updated_at DESC);

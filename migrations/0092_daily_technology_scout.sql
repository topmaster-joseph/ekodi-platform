-- EKODI Daily Technology Scout
-- EKODI owns collection, evaluation and decision state. External AI/search providers are sources only.
CREATE TABLE IF NOT EXISTS ekodi_technology_scout_runs (
  run_id TEXT PRIMARY KEY,
  trigger_source TEXT NOT NULL DEFAULT 'ekodi-cron',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','degraded','failed')),
  source_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  error_summary TEXT
);
CREATE TABLE IF NOT EXISTS ekodi_technology_scout_candidates (
  candidate_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  source_publisher TEXT,
  published_at TEXT,
  finding TEXT NOT NULL,
  ekodi_target TEXT NOT NULL,
  expected_benefit TEXT,
  implementation_difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(implementation_difficulty IN ('low','medium','high')),
  cost_impact TEXT,
  security_risk TEXT,
  vendor_lockin_risk TEXT,
  operations_risk TEXT,
  recommendation TEXT NOT NULL DEFAULT 'review' CHECK(recommendation IN ('apply','review','hold','reject')),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','apply','hold','reject')),
  decision_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES ekodi_technology_scout_runs(run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tech_scout_candidates_decision ON ekodi_technology_scout_candidates(decision,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_scout_candidates_run ON ekodi_technology_scout_candidates(run_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ekodi_owner_reports (
  id TEXT PRIMARY KEY,
  report_author TEXT NOT NULL DEFAULT 'EKODI Orchestrator',
  report_owner TEXT NOT NULL DEFAULT 'ekodi-orchestrator',
  category TEXT NOT NULL,
  importance TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  required_action TEXT NOT NULL DEFAULT '',
  decision_required INTEGER NOT NULL DEFAULT 0 CHECK (decision_required IN (0,1)),
  reason TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ekodi_owner_reports_generated
  ON ekodi_owner_reports(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ekodi_owner_reports_category
  ON ekodi_owner_reports(category, generated_at DESC);

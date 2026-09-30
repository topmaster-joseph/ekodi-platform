-- EKODI External Account Daily Health Snapshots
-- Evidence-only summaries. No provider credentials or secrets are stored here.
CREATE TABLE IF NOT EXISTS external_account_health_runs (
  id TEXT PRIMARY KEY,
  run_day TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  healthy INTEGER NOT NULL DEFAULT 0,
  attention INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  reconnect_required INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(run_day, workspace_slug)
);

CREATE INDEX IF NOT EXISTS idx_external_account_health_runs_recent
  ON external_account_health_runs(workspace_slug, created_at DESC);

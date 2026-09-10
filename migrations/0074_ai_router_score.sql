ALTER TABLE ai_control_runs ADD COLUMN router_score REAL NOT NULL DEFAULT 0;
ALTER TABLE ai_control_runs ADD COLUMN router_score_breakdown TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_control_runs ADD COLUMN router_score_policy_version TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ai_control_runs_provider_started
  ON ai_control_runs(provider_id, started_at DESC);

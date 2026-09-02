ALTER TABLE ai_control_tasks ADD COLUMN governance_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_control_tasks ADD COLUMN mission_policy_version TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_control_tasks ADD COLUMN mission_tier TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_control_tasks ADD COLUMN mission_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_control_tasks ADD COLUMN mission_explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_control_tasks ADD COLUMN analysis_only INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_ai_control_tasks_mission_tier
  ON ai_control_tasks(mission_tier, updated_at DESC);

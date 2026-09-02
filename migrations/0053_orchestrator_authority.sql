ALTER TABLE ai_control_tasks ADD COLUMN entry_ai TEXT NOT NULL DEFAULT 'ekodi-control-plane';
ALTER TABLE ai_control_tasks ADD COLUMN task_owner TEXT NOT NULL DEFAULT 'ekodi_orchestrator';
ALTER TABLE ai_control_tasks ADD COLUMN approval_authority TEXT NOT NULL DEFAULT 'authorized_human_within_delegated_scope';
ALTER TABLE ai_control_tasks ADD COLUMN approved_by TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_control_tasks ADD COLUMN approved_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ai_control_tasks_approval_authority
  ON ai_control_tasks(approval_authority, approval_state, updated_at DESC);
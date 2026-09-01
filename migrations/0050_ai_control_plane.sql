CREATE TABLE IF NOT EXISTS ai_control_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'primary-review',
  state TEXT NOT NULL DEFAULT 'queued',
  requested_providers TEXT NOT NULL DEFAULT '[]',
  needs_code_branch INTEGER NOT NULL DEFAULT 0,
  branch TEXT NOT NULL DEFAULT '',
  governance_json TEXT NOT NULL DEFAULT '{}',
  mission_policy_version TEXT NOT NULL DEFAULT '',
  mission_tier TEXT NOT NULL DEFAULT '',
  mission_reason TEXT NOT NULL DEFAULT '',
  mission_explanation TEXT NOT NULL DEFAULT '',
  analysis_only INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approval_state TEXT NOT NULL DEFAULT 'pending',
  result_summary TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ai_control_tasks_created_at ON ai_control_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_control_tasks_state ON ai_control_tasks(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_control_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(task_id) REFERENCES ai_control_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_control_runs_task ON ai_control_runs(task_id, started_at ASC);

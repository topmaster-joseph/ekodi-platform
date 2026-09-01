CREATE TABLE IF NOT EXISTS ai_control_node_pairings (
  code_hash TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ai_node_pairings_expiry ON ai_control_node_pairings(expires_at, used_at);

CREATE TABLE IF NOT EXISTS ai_control_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  providers TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'online',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_nodes_seen ON ai_control_nodes(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS ai_control_jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  role TEXT NOT NULL,
  prompt TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  repository TEXT NOT NULL DEFAULT '',
  needs_code_branch INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'queued',
  lease_owner TEXT NOT NULL DEFAULT '',
  lease_until TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(task_id) REFERENCES ai_control_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES ai_control_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue ON ai_control_jobs(state, provider_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_task ON ai_control_jobs(task_id, created_at ASC);

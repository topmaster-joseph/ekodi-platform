CREATE TABLE IF NOT EXISTS ai_pulse_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  change_class TEXT NOT NULL DEFAULT 'green',
  risk TEXT NOT NULL DEFAULT 'normal',
  actionable INTEGER NOT NULL DEFAULT 1,
  requires_human INTEGER NOT NULL DEFAULT 0,
  event_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'observed',
  task_id TEXT,
  observed_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_events_state ON ai_pulse_events(state, observed_at);

CREATE TABLE IF NOT EXISTS ai_command_tasks (
  id TEXT PRIMARY KEY,
  pulse_event_id TEXT UNIQUE,
  goal TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'normal',
  target_json TEXT NOT NULL DEFAULT '{}',
  delegation_json TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  next_attempt_at TEXT,
  lease_until TEXT,
  plan_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_command_tasks_due ON ai_command_tasks(state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS ai_command_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  state TEXT NOT NULL,
  provider_diversity INTEGER NOT NULL DEFAULT 0,
  sentinel_independent INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_command_runs_task ON ai_command_runs(task_id, id DESC);

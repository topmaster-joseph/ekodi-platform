CREATE TABLE IF NOT EXISTS ai_core_learning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  capability TEXT,
  outcome TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_core_learning_events_capability_created
  ON ai_core_learning_events(capability, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_core_learning_events_task
  ON ai_core_learning_events(task_id);

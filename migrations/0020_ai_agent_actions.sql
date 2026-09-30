CREATE TABLE IF NOT EXISTS ai_agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  area TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  decision_tier TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_created
  ON ai_agent_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_status
  ON ai_agent_actions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_agent
  ON ai_agent_actions(agent_id, created_at DESC);

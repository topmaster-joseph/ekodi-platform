CREATE TABLE IF NOT EXISTS ai_collaboration_settings (
  scope TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ai_collaboration_settings_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_collaboration_settings_audit_scope_created
  ON ai_collaboration_settings_audit(scope, created_at DESC);

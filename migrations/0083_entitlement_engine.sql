CREATE TABLE IF NOT EXISTS entitlement_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_key TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL CHECK(subject_type IN ('default','person','tier')),
  subject_key TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_key,subject_type,subject_key,service,capability_id)
);
CREATE INDEX IF NOT EXISTS idx_entitlement_override_lookup ON entitlement_overrides(service,workspace_key,subject_type,subject_key,enabled);
CREATE TABLE IF NOT EXISTS entitlement_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  workspace_key TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entitlement_audit_lookup ON entitlement_audit_logs(service,workspace_key,id DESC);

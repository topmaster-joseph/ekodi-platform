CREATE TABLE IF NOT EXISTS storage_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  storage_route TEXT NOT NULL DEFAULT '',
  record_type TEXT NOT NULL,
  retention_class TEXT NOT NULL,
  source_module_id TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_storage_audit_time ON storage_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_audit_space_service ON storage_audit_logs(space_id, service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_audit_drive_file ON storage_audit_logs(drive_file_id);

CREATE TABLE IF NOT EXISTS ai_module_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  space_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  caller_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_module_audit_time ON ai_module_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_module_audit_module ON ai_module_audit_logs(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_module_audit_space ON ai_module_audit_logs(space_id, service_id, created_at DESC);

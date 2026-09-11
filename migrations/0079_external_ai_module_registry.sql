CREATE TABLE IF NOT EXISTS external_ai_module_registry (
  module_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  module_version TEXT NOT NULL DEFAULT '1.0.0',
  endpoint TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  secret_binding TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 12000,
  retry_safe INTEGER NOT NULL DEFAULT 0,
  retry_max_attempts INTEGER NOT NULL DEFAULT 1,
  retry_backoff_ms INTEGER NOT NULL DEFAULT 250,
  response_max_bytes INTEGER NOT NULL DEFAULT 1048576,
  circuit_breaker_threshold INTEGER NOT NULL DEFAULT 3,
  circuit_breaker_cooldown_ms INTEGER NOT NULL DEFAULT 30000,
  status TEXT NOT NULL DEFAULT 'draft',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  reference_module INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_external_ai_module_status
  ON external_ai_module_registry(status, health_status, updated_at DESC);
CREATE TABLE IF NOT EXISTS external_ai_module_registry_audit (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  module_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_external_ai_module_registry_audit
  ON external_ai_module_registry_audit(module_id, created_at DESC);

INSERT OR IGNORE INTO external_ai_module_registry
  (module_id,display_name,vendor_name,module_version,endpoint,capabilities_json,secret_binding,
   timeout_ms,retry_safe,retry_max_attempts,retry_backoff_ms,response_max_bytes,
   circuit_breaker_threshold,circuit_breaker_cooldown_ms,status,health_status,last_checked_at,
   last_error,reference_module,created_at,created_by,updated_at,updated_by)
VALUES
  ('ekodi.reference-module','EKODI Reference Module','EKODI','1.0.0','https://reference.invalid',
   '["reference.contract"]','',4000,1,2,0,65536,2,5000,'staging','healthy','2026-09-10T00:00:00.000Z','',1,
   '2026-09-10T00:00:00.000Z','system:migration','2026-09-10T00:00:00.000Z','system:migration');

-- EKODIBIZ seasonal workers office: tenant-scoped operational metadata only.
-- Worker PII and original documents must use a separately approved protected vault.
CREATE TABLE IF NOT EXISTS seasonal_office_records (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  reference_url TEXT NOT NULL DEFAULT '',
  target_date TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seasonal_office_records_workspace_updated
  ON seasonal_office_records(workspace_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS seasonal_office_audit (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seasonal_office_audit_workspace_created
  ON seasonal_office_audit(workspace_id, created_at DESC);

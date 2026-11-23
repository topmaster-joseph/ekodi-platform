-- EKODI mail documents: durable per-tenant Gmail continuation without OAuth credentials in D1.
-- No old document or approval rows are modified.
CREATE TABLE IF NOT EXISTS mail_document_scan_cursors (
  workspace_id TEXT NOT NULL,
  rule_id INTEGER NOT NULL,
  page_token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,rule_id)
);

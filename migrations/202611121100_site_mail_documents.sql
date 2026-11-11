-- EKODI site mail document workflow: additive, tenant-isolated, no privileged default grants.
CREATE TABLE IF NOT EXISTS mail_document_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL, account_id INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('tax_invoice','sales_certificate')),
  search_query TEXT NOT NULL, day_from INTEGER NOT NULL DEFAULT 20, day_to INTEGER NOT NULL DEFAULT 25,
  active INTEGER NOT NULL DEFAULT 1, last_checked_at TEXT, last_checked_kst_day TEXT,
  last_error TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(workspace_id,account_id,document_type,search_query)
);
CREATE TABLE IF NOT EXISTS mail_document_cases (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, account_id INTEGER, rule_id INTEGER,
  document_type TEXT NOT NULL CHECK(document_type IN ('tax_invoice','sales_certificate')),
  source_type TEXT NOT NULL CHECK(source_type IN ('mail','manual')), source_message_id TEXT NOT NULL,
  source_from TEXT NOT NULL DEFAULT '', source_subject TEXT NOT NULL DEFAULT '', source_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(status IN ('REVIEW','APPROVED','ISSUED')),
  counterparty TEXT NOT NULL DEFAULT '', issuer_name TEXT NOT NULL DEFAULT '', sale_period TEXT NOT NULL DEFAULT '',
  sale_amount INTEGER NOT NULL DEFAULT 0, tax_amount INTEGER NOT NULL DEFAULT 0, evidence_reference TEXT NOT NULL DEFAULT '',
  document_no TEXT UNIQUE, approved_by TEXT, approved_at TEXT, issued_by TEXT, issued_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(workspace_id,account_id,source_message_id,document_type)
);
CREATE TABLE IF NOT EXISTS mail_document_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  action TEXT NOT NULL, actor_email TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_docs_scope ON mail_document_cases(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_rules_window ON mail_document_rules(active,day_from,day_to);

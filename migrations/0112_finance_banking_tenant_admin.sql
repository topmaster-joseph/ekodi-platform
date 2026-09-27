PRAGMA foreign_keys = ON;

-- Tenant-scoped banking control plane. Full bank account numbers, passwords,
-- certificates and provider secrets are intentionally NOT stored in D1.

INSERT OR IGNORE INTO finance_organizations
  (id,name,legal_name,kind,active,created_at,updated_at)
VALUES
  ('EKODIMISSION','에코디선교회','에코디선교회','mission',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO finance_business_units
  (id,organization_id,name,source_domain,kind,active,created_at,updated_at)
VALUES
  ('MISSION','EKODIMISSION','선교회 사역','ekodi.kr/ekodimission','ministry',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS finance_workspace_organization_links (
  workspace_key TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_workspace_org_links_org
  ON finance_workspace_organization_links(organization_id,active);

INSERT OR IGNORE INTO finance_workspace_organization_links
  (workspace_key,organization_id,active,created_at,updated_at)
VALUES
  ('ekodibiz','EKODIBIZ',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodi-biz','EKODIBIZ',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodimall','EKODIBIZ',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekoditrade','EKODIBIZ',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodi-trade','EKODIBIZ',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodichurch','EKODICHURCH',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodi-church','EKODICHURCH',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodimission','EKODIMISSION',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodi-lab','EKODILAB',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ekodilab','EKODILAB',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cgma','CGMA',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cheonggye','CGMA',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS finance_bank_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  institution_code TEXT NOT NULL DEFAULT '',
  institution_name TEXT NOT NULL DEFAULT '',
  account_alias TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'checking',
  account_ref TEXT NOT NULL DEFAULT '',
  account_last4 TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'KRW',
  current_balance INTEGER,
  available_balance INTEGER,
  balance_as_of TEXT,
  connection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(connection_status IN ('pending','active','disconnected','error')),
  read_enabled INTEGER NOT NULL DEFAULT 1 CHECK(read_enabled IN (0,1)),
  transfer_enabled INTEGER NOT NULL DEFAULT 0 CHECK(transfer_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_bank_connection_ref
  ON finance_bank_connections(organization_id,provider,account_ref)
  WHERE account_ref <> '';
CREATE INDEX IF NOT EXISTS idx_finance_bank_connections_scope
  ON finance_bank_connections(organization_id,connection_status);

CREATE TABLE IF NOT EXISTS finance_bank_transactions (
  id TEXT PRIMARY KEY,
  bank_connection_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  booked_at TEXT NOT NULL,
  value_date TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  amount INTEGER NOT NULL CHECK(amount >= 0),
  balance_after INTEGER,
  description TEXT NOT NULL DEFAULT '',
  counterparty_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'provider'
    CHECK(source_type IN ('provider','import','manual')),
  accounting_entry_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(bank_connection_id) REFERENCES finance_bank_connections(id),
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  UNIQUE(bank_connection_id,external_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bank_transactions_scope_time
  ON finance_bank_transactions(organization_id,booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_bank_transactions_account_time
  ON finance_bank_transactions(bank_connection_id,booked_at DESC);

CREATE TABLE IF NOT EXISTS finance_transfer_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL DEFAULT '',
  bank_connection_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_subject_id TEXT NOT NULL DEFAULT '',
  requester_role TEXT NOT NULL DEFAULT '',
  recipient_bank_name TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL,
  recipient_account_ref TEXT NOT NULL DEFAULT '',
  recipient_account_last4 TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('draft','requested','approved','rejected','executing','completed','failed','cancelled')),
  required_approvals INTEGER NOT NULL DEFAULT 1 CHECK(required_approvals >= 1),
  approval_count INTEGER NOT NULL DEFAULT 0 CHECK(approval_count >= 0),
  idempotency_key TEXT,
  provider_transfer_ref TEXT NOT NULL DEFAULT '',
  failure_code TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  approved_at TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(bank_connection_id) REFERENCES finance_bank_connections(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transfer_idempotency
  ON finance_transfer_requests(organization_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_finance_transfer_scope_status
  ON finance_transfer_requests(organization_id,status,requested_at DESC);

CREATE TABLE IF NOT EXISTS finance_transfer_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_request_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('approve','reject')),
  actor_email TEXT NOT NULL,
  actor_subject_id TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(transfer_request_id) REFERENCES finance_transfer_requests(id),
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  UNIQUE(transfer_request_id,actor_email)
);
CREATE INDEX IF NOT EXISTS idx_finance_transfer_approvals_request
  ON finance_transfer_approvals(transfer_request_id,created_at);

CREATE TABLE IF NOT EXISTS finance_bank_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT,
  workspace_key TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL CHECK(actor_type IN ('platform_admin','tenant_admin','system')),
  actor_email TEXT NOT NULL DEFAULT '',
  actor_subject_id TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bank_audit_scope_time
  ON finance_bank_audit_log(organization_id,created_at DESC);

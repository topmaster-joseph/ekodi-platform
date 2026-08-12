PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'organization',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS business_units (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_domain TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'business',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_business_units_org ON business_units(organization_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects(organization_id, business_unit_id);

CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT NOT NULL,
  project_id TEXT,
  source_domain TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_scope ON payment_orders(organization_id, business_unit_id, project_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'TOSS',
  payment_key TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT NOT NULL,
  project_id TEXT,
  source_domain TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'KRW',
  gross_amount INTEGER NOT NULL DEFAULT 0,
  vat_amount INTEGER,
  fee_amount INTEGER,
  net_amount INTEGER,
  requested_at TEXT,
  approved_at TEXT,
  last_verified_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_approved ON payments(approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_scope ON payments(organization_id, business_unit_id, project_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS accounting_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT,
  project_id TEXT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('revenue','expense','asset','liability','equity','tax','transfer')),
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
  amount INTEGER NOT NULL CHECK(amount >= 0),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by INTEGER,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(created_by) REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_date ON accounting_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_scope ON accounting_entries(organization_id, business_unit_id, project_id);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  UNIQUE(provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_events_time ON integration_events(received_at DESC);

INSERT OR IGNORE INTO organizations (id,name,legal_name,kind,active,created_at,updated_at) VALUES
('EKODIBIZ','에코디비즈','에코디비즈','business',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EKODICHURCH','에코디교회','에코디교회','church',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('EKODILAB','에코디연구소','에코디연구소','research',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('CGMA','청계면상인회','청계면상인회','association',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO business_units (id,organization_id,name,source_domain,kind,active,created_at,updated_at) VALUES
('BIZ','EKODIBIZ','에코디비즈 본부','biz.ekodi.kr','business',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('PAY','EKODIBIZ','결제 허브','pay.ekodi.kr','payment',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('MALL','EKODIBIZ','에코디몰','mall.ekodi.kr','commerce',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('TRADE','EKODIBIZ','글로벌 무역','trade.ekodi.kr','trade',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('BOOKS','EKODIBIZ','에코디북스','books.ekodi.kr','publishing',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('MARKETING','EKODIBIZ','마케팅 AI','marketing.ekodi.kr','marketing',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('CHURCH','EKODICHURCH','교회 사역','church.ekodi.kr','ministry',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('LAB','EKODILAB','연구·교육','lab.ekodi.kr','research',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('CGMA','CGMA','상권 운영','cgma.ekodi.kr','community',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

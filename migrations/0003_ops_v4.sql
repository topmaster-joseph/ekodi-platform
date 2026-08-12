PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'organization',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_units (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_domain TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'business',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS business_units_org_idx ON business_units(organization_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id)
);
CREATE INDEX IF NOT EXISTS projects_org_unit_idx ON projects(organization_id, business_unit_id);

CREATE TABLE IF NOT EXISTS service_registry_v4 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  organization_id TEXT,
  business_unit_id TEXT,
  criticality TEXT NOT NULL DEFAULT 'normal',
  monitor_enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT NOT NULL,
  project_id TEXT,
  source_domain TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS payment_orders_route_idx ON payment_orders(organization_id, business_unit_id, project_id);

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(approved_at DESC);
CREATE INDEX IF NOT EXISTS payments_route_idx ON payments(organization_id, business_unit_id, project_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES business_units(id),
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(created_by) REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS accounting_entry_date_idx ON accounting_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS accounting_route_idx ON accounting_entries(organization_id, business_unit_id, project_id);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  UNIQUE(provider, external_id)
);
CREATE INDEX IF NOT EXISTS integration_events_received_idx ON integration_events(received_at DESC);

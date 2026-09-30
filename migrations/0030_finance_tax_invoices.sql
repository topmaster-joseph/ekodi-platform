PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS finance_tax_profiles (
  organization_id TEXT PRIMARY KEY,
  corp_num TEXT NOT NULL DEFAULT '',
  tax_reg_id TEXT NOT NULL DEFAULT '',
  corp_name TEXT NOT NULL DEFAULT '',
  ceo_name TEXT NOT NULL DEFAULT '',
  addr TEXT NOT NULL DEFAULT '',
  biz_type TEXT NOT NULL DEFAULT '',
  biz_class TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(updated_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS finance_tax_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  corp_num TEXT NOT NULL,
  tax_reg_id TEXT NOT NULL DEFAULT '',
  corp_name TEXT NOT NULL,
  ceo_name TEXT NOT NULL DEFAULT '',
  addr TEXT NOT NULL DEFAULT '',
  biz_type TEXT NOT NULL DEFAULT '',
  biz_class TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  hp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, corp_num, tax_reg_id),
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_customers_org_name
  ON finance_tax_customers(organization_id, corp_name);

CREATE TABLE IF NOT EXISTS finance_tax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT,
  project_id TEXT,
  document_no TEXT NOT NULL UNIQUE,
  write_date TEXT NOT NULL,
  purpose_type TEXT NOT NULL CHECK(purpose_type IN ('영수','청구','없음')),
  tax_type TEXT NOT NULL CHECK(tax_type IN ('과세','영세','면세')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','ISSUING','ISSUED','NTS_CONFIRMED','FAILED','CANCELED')),
  provider TEXT NOT NULL DEFAULT 'POPBILL',
  customer_id INTEGER,
  supply_amount INTEGER NOT NULL CHECK(supply_amount >= 0),
  tax_amount INTEGER NOT NULL CHECK(tax_amount >= 0),
  total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
  invoicer_json TEXT NOT NULL,
  invoicee_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  email_subject TEXT NOT NULL DEFAULT '',
  nts_confirm_num TEXT NOT NULL DEFAULT '',
  provider_state_code TEXT NOT NULL DEFAULT '',
  provider_issue_dt TEXT NOT NULL DEFAULT '',
  provider_response_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  approved_by INTEGER,
  issued_at TEXT,
  issued_by INTEGER,
  created_at TEXT NOT NULL,
  created_by INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(business_unit_id) REFERENCES finance_business_units(id),
  FOREIGN KEY(project_id) REFERENCES finance_projects(id),
  FOREIGN KEY(customer_id) REFERENCES finance_tax_customers(id),
  FOREIGN KEY(approved_by) REFERENCES admins(id),
  FOREIGN KEY(issued_by) REFERENCES admins(id),
  FOREIGN KEY(created_by) REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_invoices_date
  ON finance_tax_invoices(write_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tax_invoices_scope
  ON finance_tax_invoices(organization_id, business_unit_id, project_id);
CREATE INDEX IF NOT EXISTS idx_finance_tax_invoices_status
  ON finance_tax_invoices(status, write_date DESC);

CREATE TABLE IF NOT EXISTS finance_tax_invoice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  admin_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES finance_tax_invoices(id),
  FOREIGN KEY(admin_id) REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_invoice_events_invoice
  ON finance_tax_invoice_events(invoice_id, created_at DESC);

INSERT OR IGNORE INTO finance_tax_profiles
  (organization_id, corp_name, updated_at)
VALUES
  ('EKODIBIZ', '에코디비즈', CURRENT_TIMESTAMP);

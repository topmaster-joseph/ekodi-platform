CREATE TABLE IF NOT EXISTS finance_tax_member_businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  corp_num TEXT NOT NULL,
  ceo_name TEXT NOT NULL,
  addr TEXT NOT NULL DEFAULT '',
  biz_type TEXT NOT NULL DEFAULT '',
  biz_class TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id,corp_num)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_member_business_owner ON finance_tax_member_businesses(owner_user_id,active);

CREATE TABLE IF NOT EXISTS finance_tax_member_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL,
  corp_num TEXT NOT NULL,
  corp_name TEXT NOT NULL,
  ceo_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id,corp_num)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_member_customer_owner ON finance_tax_member_customers(owner_user_id);

CREATE TABLE IF NOT EXISTS finance_tax_member_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL,
  business_id INTEGER NOT NULL,
  customer_id INTEGER,
  document_no TEXT NOT NULL,
  write_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_amount INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'HOMETAX_MANUAL',
  nts_confirm_num TEXT NOT NULL DEFAULT '',
  issued_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id,document_no),
  FOREIGN KEY(business_id) REFERENCES finance_tax_member_businesses(id),
  FOREIGN KEY(customer_id) REFERENCES finance_tax_member_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_member_invoice_owner ON finance_tax_member_invoices(owner_user_id,created_at);

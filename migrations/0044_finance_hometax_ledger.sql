PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS finance_tax_hometax_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  source_format TEXT NOT NULL DEFAULT 'UNKNOWN',
  row_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  imported_by INTEGER,
  imported_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(imported_by) REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_hometax_batches_org_date
  ON finance_tax_hometax_import_batches(organization_id, imported_at DESC);

CREATE TABLE IF NOT EXISTS finance_tax_hometax_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  approval_no TEXT NOT NULL DEFAULT '',
  write_date TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  transmit_date TEXT NOT NULL DEFAULT '',
  supplier_corp_num TEXT NOT NULL DEFAULT '',
  supplier_tax_reg_id TEXT NOT NULL DEFAULT '',
  supplier_corp_name TEXT NOT NULL DEFAULT '',
  customer_corp_num TEXT NOT NULL DEFAULT '',
  customer_tax_reg_id TEXT NOT NULL DEFAULT '',
  customer_corp_name TEXT NOT NULL DEFAULT '',
  customer_ceo_name TEXT NOT NULL DEFAULT '',
  supply_amount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  invoice_type TEXT NOT NULL DEFAULT '',
  source_format TEXT NOT NULL DEFAULT 'UNKNOWN',
  source_file TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  raw_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(organization_id, source_key),
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tax_hometax_approval
  ON finance_tax_hometax_ledger(organization_id, approval_no)
  WHERE approval_no <> '';
CREATE INDEX IF NOT EXISTS idx_finance_tax_hometax_org_date
  ON finance_tax_hometax_ledger(organization_id, write_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tax_hometax_supplier
  ON finance_tax_hometax_ledger(organization_id, supplier_corp_num, supplier_tax_reg_id, write_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tax_hometax_customer
  ON finance_tax_hometax_ledger(organization_id, customer_corp_num, write_date DESC);

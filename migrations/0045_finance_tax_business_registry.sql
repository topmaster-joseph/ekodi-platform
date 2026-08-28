CREATE TABLE IF NOT EXISTS finance_tax_business_registry_status (
  organization_id TEXT NOT NULL,
  corp_num TEXT NOT NULL,
  business_status TEXT NOT NULL DEFAULT '',
  business_status_code TEXT NOT NULL DEFAULT '',
  tax_type TEXT NOT NULL DEFAULT '',
  tax_type_code TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  utcc_yn TEXT NOT NULL DEFAULT '',
  tax_type_change_date TEXT NOT NULL DEFAULT '',
  invoice_apply_date TEXT NOT NULL DEFAULT '',
  previous_tax_type TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'NTS_PUBLIC_DATA',
  checked_at TEXT NOT NULL,
  raw_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (organization_id, corp_num)
);

CREATE INDEX IF NOT EXISTS idx_finance_tax_business_registry_checked
  ON finance_tax_business_registry_status (organization_id, checked_at DESC);

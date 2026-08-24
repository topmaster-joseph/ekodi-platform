PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS finance_tax_supplier_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  corp_num TEXT NOT NULL,
  tax_reg_id TEXT NOT NULL DEFAULT '',
  corp_name TEXT NOT NULL,
  ceo_name TEXT NOT NULL DEFAULT '',
  addr TEXT NOT NULL DEFAULT '',
  biz_type TEXT NOT NULL DEFAULT '',
  biz_class TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  UNIQUE(organization_id, corp_num, tax_reg_id),
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_tax_supplier_profiles_org
  ON finance_tax_supplier_profiles(organization_id, active, is_default DESC, profile_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tax_supplier_profiles_one_default
  ON finance_tax_supplier_profiles(organization_id)
  WHERE active=1 AND is_default=1;

INSERT OR IGNORE INTO finance_tax_supplier_profiles
  (organization_id, profile_name, corp_num, tax_reg_id, corp_name, ceo_name, addr, biz_type, biz_class,
   contact_name, tel, email, is_default, active, created_at, updated_at, updated_by)
SELECT
  organization_id,
  CASE WHEN TRIM(corp_name) <> '' THEN corp_name ELSE '기본 공급자' END,
  corp_num,
  tax_reg_id,
  corp_name,
  ceo_name,
  addr,
  biz_type,
  biz_class,
  contact_name,
  tel,
  email,
  1,
  1,
  COALESCE(updated_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP),
  updated_by
FROM finance_tax_profiles;

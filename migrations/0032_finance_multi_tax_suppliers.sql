PRAGMA foreign_keys = OFF;

CREATE TABLE finance_tax_profiles_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  profile_name TEXT NOT NULL DEFAULT '',
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
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),
  FOREIGN KEY(updated_by) REFERENCES admins(id),
  UNIQUE(organization_id, corp_num, tax_reg_id)
);

INSERT INTO finance_tax_profiles_v2
  (organization_id,profile_name,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,email,is_default,active,created_at,updated_at,updated_by)
SELECT
  organization_id,
  CASE WHEN corp_name <> '' THEN corp_name ELSE '기본 공급자' END,
  corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,email,
  1,1,updated_at,updated_at,updated_by
FROM finance_tax_profiles;

DROP TABLE finance_tax_profiles;
ALTER TABLE finance_tax_profiles_v2 RENAME TO finance_tax_profiles;

CREATE INDEX IF NOT EXISTS idx_finance_tax_profiles_org_active
  ON finance_tax_profiles(organization_id, active, is_default DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tax_profiles_one_default
  ON finance_tax_profiles(organization_id)
  WHERE is_default = 1 AND active = 1;

PRAGMA foreign_keys = ON;

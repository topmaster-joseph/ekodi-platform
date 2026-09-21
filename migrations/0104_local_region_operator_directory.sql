-- EKODI local-region operator directory
-- Additive registry for transferable/co-operative regional operating rights.

CREATE TABLE IF NOT EXISTS local_region_operators (
  region_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'organization',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','retired')),
  public_path TEXT NOT NULL DEFAULT '',
  admin_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (region_id, operator_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_region_operators_region_tenant
  ON local_region_operators(region_id, tenant_slug);

CREATE INDEX IF NOT EXISTS idx_local_region_operators_region_status
  ON local_region_operators(region_id, status);

INSERT OR IGNORE INTO local_region_operators
(region_id,operator_id,tenant_slug,name,kind,status,public_path,admin_path,created_at,updated_at)
VALUES
('local:cheonggye','cgma','cgma','청계면상인회','merchant-association','active','/cgma','/cgma/admin','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z');

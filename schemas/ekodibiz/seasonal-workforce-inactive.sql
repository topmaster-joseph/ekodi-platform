-- INACTIVE DESIGN ONLY. Never migrate without a lawful municipal operator, retention plan, D1 review
-- and an EKODI Orchestrator-authorized release. The current Worker flag must remain OFF.
-- No worker identity, travel document, pay, visa, placement or immigration information.
CREATE TABLE IF NOT EXISTS seasonal_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 2 AND 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  activated INTEGER NOT NULL DEFAULT 0 CHECK(activated IN (0,1)),
  operator_evidence_ref TEXT NOT NULL DEFAULT '' CHECK(length(operator_evidence_ref)<=240),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seasonal_operator_roles (
  tenant_id TEXT NOT NULL REFERENCES seasonal_tenants(id),
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  role TEXT NOT NULL CHECK(role IN ('municipal_operator','auditor')),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  authorized_by_admin_id INTEGER NOT NULL REFERENCES admins(id),
  authorization_evidence_ref TEXT NOT NULL CHECK(length(authorization_evidence_ref) BETWEEN 1 AND 240),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,admin_id)
);
CREATE INDEX IF NOT EXISTS idx_seasonal_operator_roles_admin ON seasonal_operator_roles(admin_id,active);
CREATE TABLE IF NOT EXISTS seasonal_farm_demands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES seasonal_tenants(id),
  request_id TEXT NOT NULL,
  created_by_admin_id INTEGER NOT NULL REFERENCES admins(id),
  crop TEXT NOT NULL CHECK(crop IN ('onion','garlic','sweet_potato','greenhouse','other')),
  workers INTEGER NOT NULL CHECK(workers BETWEEN 1 AND 1000),
  start_month TEXT NOT NULL CHECK(length(start_month)=7),
  duration_months INTEGER NOT NULL CHECK(duration_months BETWEEN 1 AND 8),
  housing_status TEXT NOT NULL CHECK(housing_status IN ('ready','preparing','support_needed')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','approved','rejected','cancelled')),
  reviewed_by_admin_id INTEGER REFERENCES admins(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_seasonal_demands_tenant_date ON seasonal_farm_demands(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seasonal_demands_tenant_status ON seasonal_farm_demands(tenant_id,status);
CREATE TABLE IF NOT EXISTS seasonal_demand_audit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES seasonal_tenants(id),
  demand_id TEXT NOT NULL REFERENCES seasonal_farm_demands(id),
  actor_admin_id INTEGER NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL CHECK(action IN ('submitted','under_review','approved','rejected')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seasonal_audit_tenant_time ON seasonal_demand_audit(tenant_id,occurred_at DESC);
-- Explicitly no seed rows, no tenant bootstrap, no access provisioning, no auto-migration.
-- Deletion/retention must be approved before production activation. No direct public DB access.

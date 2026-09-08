CREATE TABLE IF NOT EXISTS site_membership_benefit_profiles (
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  service_id TEXT NOT NULL DEFAULT '',
  free_benefits_json TEXT NOT NULL,
  paid_packages_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY(workspace_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_site_membership_benefit_slug
  ON site_membership_benefit_profiles(workspace_slug, service_id);

CREATE TABLE IF NOT EXISTS site_membership_benefit_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  service_id TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_membership_benefit_audit_scope
  ON site_membership_benefit_audit(workspace_id, service_id, created_at DESC);

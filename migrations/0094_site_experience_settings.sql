PRAGMA foreign_keys = ON;

-- Tenant-owned site experience settings extend shared header/footer presentation
-- without changing the existing site_chrome_settings contract.
CREATE TABLE IF NOT EXISTS site_experience_settings (
  tenant_id INTEGER PRIMARY KEY,
  subject_key TEXT NOT NULL UNIQUE,
  draft_json TEXT NOT NULL DEFAULT '{}',
  published_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  published_by TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS site_experience_settings_updated_idx
  ON site_experience_settings(updated_at DESC);

PRAGMA foreign_keys = ON;

-- Site header/footer settings are tenant-owned presentation data.
-- CGMA is only the English abbreviation of 청계면상인회 and must not form a second tenant identity.
CREATE TABLE IF NOT EXISTS site_chrome_settings (
  tenant_id INTEGER PRIMARY KEY,
  subject_key TEXT NOT NULL UNIQUE,
  header_json TEXT NOT NULL DEFAULT '{}',
  footer_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS site_chrome_settings_updated_idx
  ON site_chrome_settings(updated_at DESC);

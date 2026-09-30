CREATE TABLE IF NOT EXISTS site_design_profiles (
  subject_type TEXT NOT NULL DEFAULT 'tenant',
  subject_key TEXT NOT NULL,
  service_id TEXT NOT NULL,
  profile_json TEXT NOT NULL DEFAULT '{}',
  profile_version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_type, subject_key, service_id)
);
CREATE INDEX IF NOT EXISTS idx_site_design_profiles_updated_at ON site_design_profiles(updated_at DESC);

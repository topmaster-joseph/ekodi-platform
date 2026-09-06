PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS insurance_advisor_profiles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  insurer_name TEXT NOT NULL DEFAULT '롯데손해보험',
  role_label TEXT NOT NULL DEFAULT '보험설계사',
  intro TEXT NOT NULL DEFAULT '',
  registration_reference TEXT NOT NULL DEFAULT '',
  verification_url TEXT NOT NULL DEFAULT 'https://www.lotteins.co.kr/web/C/D/C/cdc033re.jsp',
  official_company_url TEXT NOT NULL DEFAULT 'https://www.lotteins.co.kr/',
  advertising_review_ref TEXT NOT NULL DEFAULT '',
  advertising_review_expires_at TEXT,
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO insurance_advisor_profiles
  (id,slug,created_at,updated_at)
VALUES
  ('adv_primary','advisor',datetime('now'),datetime('now'));

CREATE TABLE IF NOT EXISTS insurance_advisor_consultation_links (
  consultation_id TEXT PRIMARY KEY,
  advisor_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultation_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (advisor_profile_id) REFERENCES insurance_advisor_profiles(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_advisor_consultation_profile
  ON insurance_advisor_consultation_links(advisor_profile_id,created_at DESC);

-- EKODI shared age verification (D1). No names, DOB, phone numbers, CI, DI or raw provider records.
-- Authenticated user id is scoped to an individual service. All grants have a bounded lifetime.
CREATE TABLE IF NOT EXISTS age_verification_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  site TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy IN ('civil_adult_19','youth_protection_19')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','denied')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_age_verify_attempt_subject_created
  ON age_verification_attempts (subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_age_verify_attempt_expiry
  ON age_verification_attempts (created_at);
CREATE TABLE IF NOT EXISTS age_verification_grants (
  subject_id TEXT NOT NULL,
  site TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy IN ('civil_adult_19','youth_protection_19')),
  verified_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  PRIMARY KEY (subject_id, site, policy)
);
CREATE INDEX IF NOT EXISTS idx_age_verify_grant_expiry
  ON age_verification_grants (expires_at);

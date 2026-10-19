-- 2026 제2회 전남폴리텍 모터페스티벌 — 청계면상인회(cgma) 상가 참여 신청.
-- Additive and private: no existing CGMA membership, commerce or access tables are modified.
-- Personal fields (contact name, phone, free-text notes) are stored only as AES-GCM ciphertext
-- produced by the Control API with the Worker secret MOTOR_FESTIVAL_PII_KEY.
-- Every row carries expires_at = 2026-11-23T15:00:00Z (2026-11-24 00:00 KST, within 30 days of event end);
-- the Control API ten-minute schedule deletes expired rows (purgeExpiredMotorFestivalApplications).
CREATE TABLE IF NOT EXISTS cgma_motor_festival_2026_applications (
  id TEXT PRIMARY KEY,
  receipt_code TEXT NOT NULL UNIQUE,
  submission_key TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  membership TEXT NOT NULL CHECK (membership IN ('regular','join','info','none')),
  intent TEXT NOT NULL CHECK (intent IN ('yes','maybe','no')),
  activity_json TEXT NOT NULL DEFAULT '[]',
  items TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL CHECK (hours IN ('all','am','pm','discuss')),
  support_json TEXT NOT NULL DEFAULT '[]',
  staff TEXT NOT NULL CHECK (staff IN ('1','2','3+')),
  contact_name_enc TEXT NOT NULL,
  phone_enc TEXT NOT NULL,
  notes_enc TEXT NOT NULL DEFAULT '',
  phone_hash TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgma_mf2026_created
  ON cgma_motor_festival_2026_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgma_mf2026_expiry
  ON cgma_motor_festival_2026_applications (expires_at);
CREATE INDEX IF NOT EXISTS idx_cgma_mf2026_phone_window
  ON cgma_motor_festival_2026_applications (phone_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_cgma_mf2026_client_window
  ON cgma_motor_festival_2026_applications (client_hash, created_at);

-- Administrator access audit. Holds the administrator identity and counts only, never applicant data.
CREATE TABLE IF NOT EXISTS cgma_motor_festival_2026_access_audit (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_scope TEXT NOT NULL,
  action TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgma_mf2026_audit_date
  ON cgma_motor_festival_2026_access_audit (created_at DESC);

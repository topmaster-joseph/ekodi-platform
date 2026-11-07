-- 목포노회 선교부 — 제111회기 총회 국내선교부 정책협의회(2026-12-10) 참석자 명단 접수.
-- Additive and private: no existing tenant, organization or access tables are modified.
-- One row per person; rows from one submission share submission_key and receipt_code.
-- Name and phone are stored only as AES-GCM ciphertext produced by the Control API with the
-- isolated Worker secret MOKPO_MISSION_PII_KEY.
-- Every row carries expires_at = 2027-01-09T15:00:00Z (2027-01-10 00:00 KST, 30 days after the council);
-- the Control API schedule deletes expired rows (purgeExpiredMokpoMissionRegistrations).
CREATE TABLE IF NOT EXISTS mokpo_mission_policy_council_2026_registrations (
  id TEXT PRIMARY KEY,
  receipt_code TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  submission_hash TEXT NOT NULL,
  dept TEXT NOT NULL CHECK (dept IN ('선교부','국내선교부','전도부')),
  role TEXT NOT NULL CHECK (role IN ('부장','서기','회계','총무','부원','기타')),
  clergy TEXT NOT NULL CHECK (clergy IN ('목사','장로')),
  church TEXT NOT NULL,
  attend TEXT NOT NULL CHECK (attend IN ('O','X')),
  name_enc TEXT NOT NULL,
  phone_enc TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mokpo_policy2026_submission_seq
  ON mokpo_mission_policy_council_2026_registrations (submission_key, seq);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mokpo_policy2026_receipt_seq
  ON mokpo_mission_policy_council_2026_registrations (receipt_code, seq);
CREATE INDEX IF NOT EXISTS idx_mokpo_policy2026_created
  ON mokpo_mission_policy_council_2026_registrations (created_at);
CREATE INDEX IF NOT EXISTS idx_mokpo_policy2026_expiry
  ON mokpo_mission_policy_council_2026_registrations (expires_at);
CREATE INDEX IF NOT EXISTS idx_mokpo_policy2026_phone_window
  ON mokpo_mission_policy_council_2026_registrations (phone_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_mokpo_policy2026_client_window
  ON mokpo_mission_policy_council_2026_registrations (client_hash, created_at);

-- Administrator access audit. Holds the administrator identity and counts only, never registrant data.
CREATE TABLE IF NOT EXISTS mokpo_mission_policy_council_2026_access_audit (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_scope TEXT NOT NULL,
  action TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mokpo_policy2026_audit_date
  ON mokpo_mission_policy_council_2026_access_audit (created_at DESC);

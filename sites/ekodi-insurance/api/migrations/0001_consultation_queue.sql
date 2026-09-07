PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consultation_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  contact_name TEXT NOT NULL,
  contact_ciphertext TEXT NOT NULL,
  contact_hint TEXT NOT NULL,
  preferred_time TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL,
  transcript_ciphertext TEXT,
  transcript_shared INTEGER NOT NULL DEFAULT 0 CHECK (transcript_shared IN (0,1)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','contacted','closed','revoked')),
  access_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_consultation_status_created
  ON consultation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_user_created
  ON consultation_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consultation_audit_events (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','admin','system')),
  actor_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultation_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_consultation_audit_case
  ON consultation_audit_events(consultation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS request_rate_limits (
  fingerprint TEXT NOT NULL,
  bucket TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (fingerprint, bucket)
);

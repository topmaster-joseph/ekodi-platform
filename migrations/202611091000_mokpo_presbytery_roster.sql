-- 목포노회 회원명부(관리자 전용, 2중확인). Schema only: roster rows are loaded out-of-band and never committed.
-- Rollback: DROP the five tables below.
CREATE TABLE IF NOT EXISTS mokpo_presbytery_roster_entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'church' CHECK (kind IN ('church','organization','person')),
  church TEXT NOT NULL DEFAULT '',
  ministers TEXT NOT NULL DEFAULT '[]',
  elders TEXT NOT NULL DEFAULT '[]',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'session-135',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mokpo_presbytery_roster_entries_section ON mokpo_presbytery_roster_entries(section,seq);
CREATE TABLE IF NOT EXISTS mokpo_presbytery_roster_admins(
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mokpo_presbytery_roster_codes(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mokpo_presbytery_roster_codes_email ON mokpo_presbytery_roster_codes(email,created_at);
CREATE TABLE IF NOT EXISTS mokpo_presbytery_roster_grants(
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mokpo_presbytery_roster_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

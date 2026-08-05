PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  birth_hash TEXT NOT NULL,
  birth_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx ON login_attempts(ip_hash, attempted_at);

CREATE TABLE IF NOT EXISTS domain_registry (
  domain TEXT PRIMARY KEY,
  registrar TEXT NOT NULL DEFAULT '도메인클럽',
  registered_at TEXT,
  expires_at TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  transfer_lock INTEGER NOT NULL DEFAULT 1,
  whois_privacy INTEGER NOT NULL DEFAULT 1,
  reminder_days INTEGER NOT NULL DEFAULT 60,
  memo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

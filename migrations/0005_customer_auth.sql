CREATE TABLE IF NOT EXISTS customer_tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 310000,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS customer_memberships (
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id),
  FOREIGN KEY(user_id) REFERENCES customer_users(id)
);

CREATE TABLE IF NOT EXISTS customer_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES customer_users(id),
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
);

CREATE TABLE IF NOT EXISTS customer_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  ip_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id),
  FOREIGN KEY(user_id) REFERENCES customer_users(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_memberships_user ON customer_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_invites_tenant ON customer_invites(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_login_attempts_time ON customer_login_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_customer_audit_tenant_time ON customer_audit_logs(tenant_id, created_at DESC);

INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at) VALUES
  ('cgma', '청계면상인회', 'cgma.ekodi.kr', 'active', datetime('now')),
  ('jadam', '자담치킨 목포대점', 'jadam.ekodi.kr', 'active', datetime('now')),
  ('pizzamaru', '피자마루 목포대점', 'pizzamaru.ekodi.kr', 'active', datetime('now')),
  ('yogurt', '요거트퍼플 목포대점', 'yogurt.ekodi.kr', 'active', datetime('now'));

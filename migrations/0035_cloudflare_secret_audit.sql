CREATE TABLE IF NOT EXISTS cloudflare_secret_audit (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  script_name TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  secret_type TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  fingerprint TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloudflare_secret_audit_created
  ON cloudflare_secret_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cloudflare_secret_audit_target
  ON cloudflare_secret_audit(script_name, secret_name, created_at DESC);

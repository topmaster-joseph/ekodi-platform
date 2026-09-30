CREATE TABLE IF NOT EXISTS marketing_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  tenant_slug TEXT,
  workspace_slug TEXT NOT NULL UNIQUE,
  canonical_domain TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'cloudflare-pages',
  provider_project TEXT NOT NULL,
  landing_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type, subject_key)
);

CREATE TABLE IF NOT EXISTS marketing_custom_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_dns',
  provider_status TEXT NOT NULL DEFAULT '',
  provider_domain_id TEXT,
  dns_type TEXT NOT NULL DEFAULT 'CNAME',
  dns_name TEXT NOT NULL,
  dns_target TEXT NOT NULL,
  validation_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  disabled_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES marketing_workspaces(id)
);

CREATE TABLE IF NOT EXISTS marketing_domain_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  hostname TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_subject
  ON marketing_custom_domains(subject_type, subject_key, status);
CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_workspace
  ON marketing_custom_domains(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_domain_audit_subject
  ON marketing_domain_audit(subject_type, subject_key, created_at DESC);

INSERT OR IGNORE INTO marketing_workspaces
  (subject_type, subject_key, tenant_slug, workspace_slug, canonical_domain, provider, provider_project, landing_path, status, created_at, updated_at)
VALUES
  ('tenant', 'jadam', 'jadam', 'jadam', 'jadam.ai.ekodi.kr', 'cloudflare-pages', 'marketing-ai-jadam', '/', 'active', datetime('now'), datetime('now')),
  ('tenant', 'pizzamaru', 'pizzamaru', 'pizzamaru', 'pizzamaru.ai.ekodi.kr', 'cloudflare-pages', 'marketing-ai-pizzamaru', '/', 'active', datetime('now'), datetime('now')),
  ('tenant', 'yogurt', 'yogurt', 'yogurt', 'yogurt.ai.ekodi.kr', 'cloudflare-pages', 'marketing-ai-yogurtpurple', '/', 'active', datetime('now'), datetime('now')),
  ('tenant', 'cgma', 'cgma', 'cgma', 'cgma.ai.ekodi.kr', 'cloudflare-pages', 'cheonggye-market', '/market-ai', 'active', datetime('now'), datetime('now'));

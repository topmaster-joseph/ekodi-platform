-- Store-scoped Marketing AI lives beside the legacy person/tenant domain tables.
-- This keeps the rollout strictly additive while using the immutable Supabase store UUID
-- as the billing and workspace subject key.

CREATE TABLE IF NOT EXISTS marketing_store_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL UNIQUE,
  tenant_slug TEXT,
  workspace_slug TEXT NOT NULL UNIQUE,
  canonical_domain TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'cloudflare-pages',
  provider_project TEXT NOT NULL DEFAULT 'marketing-ai',
  landing_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_store_custom_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  store_id TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_dns' CHECK(status IN ('pending_dns','verifying','active','disconnect_pending','disabled')),
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
  FOREIGN KEY(workspace_id) REFERENCES marketing_store_workspaces(id)
);

CREATE TABLE IF NOT EXISTS marketing_store_domain_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_store_custom_domains_store
  ON marketing_store_custom_domains(store_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_store_custom_domains_workspace
  ON marketing_store_custom_domains(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_store_domain_audit_store
  ON marketing_store_domain_audit(store_id, created_at DESC);

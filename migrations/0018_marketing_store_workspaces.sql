-- Store-scoped Marketing AI subscriptions use the immutable Supabase store UUID as
-- subject_key. Rebuild the two domain tables to extend the existing subject guard
-- without weakening uniqueness or foreign-key boundaries.

CREATE TABLE marketing_workspaces_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
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

INSERT INTO marketing_workspaces_v2
  (id,subject_type,subject_key,tenant_slug,workspace_slug,canonical_domain,provider,provider_project,landing_path,status,created_at,updated_at)
SELECT id,subject_type,subject_key,tenant_slug,workspace_slug,canonical_domain,provider,provider_project,landing_path,status,created_at,updated_at
  FROM marketing_workspaces;

CREATE TABLE marketing_custom_domains_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
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
  FOREIGN KEY(workspace_id) REFERENCES marketing_workspaces_v2(id)
);

INSERT INTO marketing_custom_domains_v2
  (id,workspace_id,subject_type,subject_key,hostname,status,provider_status,provider_domain_id,dns_type,dns_name,dns_target,
   validation_json,error,created_by_email,created_at,verified_at,updated_at,disabled_at)
SELECT id,workspace_id,subject_type,subject_key,hostname,status,provider_status,provider_domain_id,dns_type,dns_name,dns_target,
       validation_json,error,created_by_email,created_at,verified_at,updated_at,disabled_at
  FROM marketing_custom_domains;

DROP TABLE marketing_custom_domains;
DROP TABLE marketing_workspaces;
ALTER TABLE marketing_workspaces_v2 RENAME TO marketing_workspaces;
ALTER TABLE marketing_custom_domains_v2 RENAME TO marketing_custom_domains;

CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_subject
  ON marketing_custom_domains(subject_type, subject_key, status);
CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_workspace
  ON marketing_custom_domains(workspace_id, status);

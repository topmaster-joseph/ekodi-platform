-- Tenant-scoped EKODI Mail control. Configuration is provider-neutral and auditable.
-- Actual DNS/provider activation remains an explicit external operation.
CREATE TABLE IF NOT EXISTS mail_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  delivery_mode TEXT NOT NULL DEFAULT 'forward_to_external_inbox',
  routing_provider TEXT NOT NULL DEFAULT 'cloudflare-email-routing',
  routing_status TEXT NOT NULL DEFAULT 'pending_dns',
  outbound_provider TEXT NOT NULL DEFAULT 'unconfigured',
  outbound_status TEXT NOT NULL DEFAULT 'not_configured',
  default_destination TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, hostname)
);

CREATE TABLE IF NOT EXISTS mail_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  domain_id INTEGER NOT NULL,
  local_part TEXT NOT NULL,
  destination_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  send_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_id, local_part),
  FOREIGN KEY(domain_id) REFERENCES mail_domains(id)
);

CREATE TABLE IF NOT EXISTS mail_control_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_domains_workspace ON mail_domains(workspace_id, hostname);
CREATE INDEX IF NOT EXISTS idx_mail_routes_workspace ON mail_routes(workspace_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mail_audit_workspace_time ON mail_control_audit(workspace_id, created_at DESC);

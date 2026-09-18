-- Partner News Engine: reusable tenant/service scoped collaboration news.
-- Private-first: every new item starts as DRAFT and only explicit publish transitions become public.
CREATE TABLE IF NOT EXISTS partner_news_items (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  service_key TEXT NOT NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  partner_type TEXT NOT NULL DEFAULT 'organization',
  title TEXT NOT NULL DEFAULT '',
  summary_text TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  published_on TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','PUBLISHED','ARCHIVED')),
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  published_by TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_partner_news_public
  ON partner_news_items(tenant_slug, service_key, status, featured DESC, published_on DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_news_admin
  ON partner_news_items(tenant_slug, service_key, updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_news_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_slug TEXT NOT NULL,
  service_key TEXT NOT NULL,
  item_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_news_audit_scope
  ON partner_news_audit_logs(tenant_slug, service_key, created_at DESC);

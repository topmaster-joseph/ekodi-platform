-- Seonam MEDI site-scoped content administration.
-- Additional administrator is limited to notice/channel management; platform authority is not granted.

INSERT OR IGNORE INTO customer_tenants (slug,name,domain,status,created_at)
VALUES ('seonam-medi','서남권 국립의대 시민소통센터','ekodi.kr/seonam-medi','active','2026-09-29T08:35:00.000Z');

ALTER TABLE seonam_medi_monitor_items ADD COLUMN publish_category TEXT NOT NULL DEFAULT 'news';

CREATE TABLE IF NOT EXISTS seonam_med_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','draft')),
  pinned INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_seonam_med_notices_public
  ON seonam_med_notices(status,pinned,published_at,created_at);

CREATE TABLE IF NOT EXISTS seonam_med_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  official INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_seonam_med_channels_public
  ON seonam_med_channels(visible,sort_order,id);

CREATE TABLE IF NOT EXISTS seonam_med_content_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonam_med_content_audit_time
  ON seonam_med_content_audit(created_at DESC);

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,'ohwon69@gmail.com','staff',1,'2026-09-29T08:35:00.000Z',NULL,NULL,'member','',
       '["seonam.board.manage","seonam.channel.manage"]','[]',NULL,
       'seonam-medi notice/channel administrator','2026-09-29T08:35:00.000Z',NULL
FROM customer_tenants WHERE slug='seonam-medi'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='staff',
  enabled=1,
  capabilities_json='["seonam.board.manage","seonam.channel.manage"]',
  denied_capabilities_json='[]',
  expires_at=NULL,
  note='seonam-medi notice/channel administrator',
  updated_at='2026-09-29T08:35:00.000Z';

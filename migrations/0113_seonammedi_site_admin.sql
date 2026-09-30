-- Seonam National Medical School communication center site-local administrator.
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('seonammedi','서남권 국립의대 소통센터','ekodi.kr/seonammedi','active',CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS seonammedi_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  pinned INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_public
  ON seonammedi_notices(status,pinned,published_at,updated_at);

CREATE TABLE IF NOT EXISTS seonammedi_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  official INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_channels_public
  ON seonammedi_channels(visible,sort_order,id);

CREATE TABLE IF NOT EXISTS seonammedi_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_admin_audit_created
  ON seonammedi_admin_audit(created_at);

INSERT INTO customer_access_grants(
  tenant_id,email,role,enabled,created_at,created_by,last_verified_at,
  principal_type,github_username,capabilities_json,denied_capabilities_json,
  expires_at,note,updated_at,updated_by
)
SELECT id,'ohwon69@gmail.com','board_admin',1,CURRENT_TIMESTAMP,NULL,NULL,
  'member','',
  '["seonammedi.notice.manage","seonammedi.channel.manage"]',
  '["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
  NULL,'display-name:서남권 국립의대 소통센터 게시판 관리자',CURRENT_TIMESTAMP,NULL
FROM customer_tenants
WHERE slug='seonammedi'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='board_admin',
  enabled=1,
  capabilities_json='["seonammedi.notice.manage","seonammedi.channel.manage"]',
  denied_capabilities_json='["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
  note='display-name:서남권 국립의대 소통센터 게시판 관리자',
  updated_at=CURRENT_TIMESTAMP;

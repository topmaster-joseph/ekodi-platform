-- Register the Seonam National Medical School civic communication center as a tenant-owned site.
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('seonam-medi','서남권 국립의대 시민소통센터','ekodi.kr/seonam-medi','active','2026-09-29T12:17:00.000Z');

INSERT INTO customer_access_grants(
  tenant_id,email,role,enabled,created_at,last_verified_at,principal_type,github_username,
  capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by
)
SELECT id,'ohwon69@gmail.com','staff',1,'2026-09-29T12:17:00.000Z',NULL,'member','',
  '["seonam.notice.manage","seonam.channel.manage"]',
  '["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
  NULL,'display-name:서남권 국립의대 시민소통센터 게시판 관리자','2026-09-29T12:17:00.000Z',NULL
FROM customer_tenants WHERE slug='seonam-medi'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='staff',
  enabled=1,
  capabilities_json='["seonam.notice.manage","seonam.channel.manage"]',
  denied_capabilities_json='["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
  note='display-name:서남권 국립의대 시민소통센터 게시판 관리자',
  updated_at='2026-09-29T12:17:00.000Z';

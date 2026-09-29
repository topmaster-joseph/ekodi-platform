-- 서남권 국립의대 시민소통센터 사이트 범위 관리자와 게시판/채널 관리 권한.
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('seonam-medi','서남권 국립의대 시민소통센터','ekodi.kr/seonam-medi','active','2026-09-29T06:40:00.000Z');

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,'ohwon69@gmail.com','board_admin',1,'2026-09-29T06:40:00.000Z',NULL,NULL,'member','',
       '["seonam.notice.manage","seonam.channel.manage"]','["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',NULL,
       'display-name:게시판 관리자','2026-09-29T06:40:00.000Z',NULL
  FROM customer_tenants WHERE slug='seonam-medi'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='board_admin',
  enabled=1,
  capabilities_json='["seonam.notice.manage","seonam.channel.manage"]',
  denied_capabilities_json='["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
  expires_at=NULL,
  note='display-name:게시판 관리자',
  updated_at='2026-09-29T06:40:00.000Z';

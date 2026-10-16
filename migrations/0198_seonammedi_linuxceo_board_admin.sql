-- EKODI 서남권 국립의대: independently authenticated, tenant-scoped board administrator.
-- Grant only notice and citizen-voice moderation, not finance, private records, tenant IAM or platform control.
INSERT INTO customer_access_grants (
  tenant_id,email,role,enabled,created_at,created_by,last_verified_at,
  principal_type,github_username,capabilities_json,denied_capabilities_json,
  expires_at,note,updated_at,updated_by
)
SELECT id,'linuxceo@gmail.com','board_admin',1,CURRENT_TIMESTAMP,NULL,NULL,
  'member','',
  '["seonammedi.notice.manage","seonammedi.voice.manage"]',
  '["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy","seonammedi.finance.manage","seonammedi.page.manage"]',
  NULL,'서남권 국립의대 소통센터 게시판 관리자',CURRENT_TIMESTAMP,NULL
FROM customer_tenants WHERE slug='seonammedi' AND status='active'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='board_admin',enabled=1,principal_type='member',
  capabilities_json='["seonammedi.notice.manage","seonammedi.voice.manage"]',
  denied_capabilities_json='["tenant.access.manage","tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy","seonammedi.finance.manage","seonammedi.page.manage"]',
  note='서남권 국립의대 소통센터 게시판 관리자',updated_at=CURRENT_TIMESTAMP;

-- 청계면 도시재생 주민협의체(cgmurrc) 사이트를 회원DB에 등록한다.
-- 협의체 회원 명단은 등록하지 않는다. 회원은 이후 가입 신청·승인 절차로만 들어온다.
-- 상인회(cgma) 명단을 복제하지 않는다(CHEONGGYE_MEMBERS_SCOPE.md).
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('cgmurrc','청계면 도시재생 주민협의체','ekodi.kr/cgmurrc','active','2026-10-22T15:00:00.000Z');

-- 협의체 사무국장(사이트 관리자) 1명만 사전 등록한다. 권한관리·재무·플랫폼 권한은 명시적으로 거부한다.
INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,'topmaster.joseph@gmail.com','admin',1,'2026-10-22T15:00:00.000Z',NULL,NULL,'member','','[]',
       '["tenant.finance.read","tenant.finance.manage","platform.admin","platform.production.deploy"]',
       NULL,'display-name:정찬균(사무국장)','2026-10-22T15:00:00.000Z',NULL
  FROM customer_tenants WHERE slug='cgmurrc'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='admin',enabled=1,note=excluded.note,
  denied_capabilities_json=excluded.denied_capabilities_json,
  updated_at='2026-10-22T15:00:00.000Z';

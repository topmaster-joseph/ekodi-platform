-- Shared site-member access registry rollout.
-- Tenant-local authority stays separate from platform super-admin authority.

INSERT OR IGNORE INTO customer_tenants (slug,name,domain,status,created_at) VALUES
  ('ekodibiz','에코디비즈','ekodi.kr/ekodibiz','active','2026-09-21T01:45:00.000Z'),
  ('ekodimall','에코디몰','ekodi.kr/ekodibiz/ekodimall','active','2026-09-21T01:45:00.000Z'),
  ('ekodibiz-trade','에코디비즈 무역','ekodi.kr/ekodibiz/trade','active','2026-09-21T01:45:00.000Z'),
  ('ekodichurch','에코디교회','ekodi.kr/ekodichurch','active','2026-09-21T01:45:00.000Z'),
  ('ekodimission','에코디선교회','ekodi.kr/ekodimission','active','2026-09-21T01:45:00.000Z'),
  ('cmpmyi','통합 매장 운영','ekodi.kr/cmpmyi','active','2026-09-21T01:45:00.000Z');

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,'cgma4989@gmail.com','owner',1,'2026-09-21T01:45:00.000Z',NULL,NULL,'member','','[]','[]',NULL,
       'display-name:공용 계정','2026-09-21T01:45:00.000Z',NULL
  FROM customer_tenants WHERE slug='cgma'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='owner',enabled=1,note='display-name:공용 계정',updated_at='2026-09-21T01:45:00.000Z';

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,'topmaster.joseph@gmail.com','admin',1,'2026-09-21T01:45:00.000Z',NULL,NULL,'member','','[]','[]',NULL,
       'display-name:정찬균','2026-09-21T01:45:00.000Z',NULL
  FROM customer_tenants WHERE slug='cgma'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='admin',enabled=1,note='display-name:정찬균',updated_at='2026-09-21T01:45:00.000Z';

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by)
SELECT id,v.email,'admin',1,'2026-09-21T01:45:00.000Z',NULL,NULL,'member','','[]','[]',NULL,
       'display-name:'||v.display_name,'2026-09-21T01:45:00.000Z',NULL
  FROM customer_tenants t
  CROSS JOIN (
    SELECT 'mijini0430@gmail.com' AS email,'정미진' AS display_name
    UNION ALL SELECT 'matrixism@gmail.com','김전일'
    UNION ALL SELECT 'rokmc895tak@gmail.com','정경탁'
    UNION ALL SELECT 'allforyou3957@gmail.com','김정윤'
  ) v
 WHERE t.slug='cgma'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='admin',enabled=1,note=excluded.note,updated_at='2026-09-21T01:45:00.000Z';

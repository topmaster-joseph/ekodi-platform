-- Register Brotherly Love Association in the shared EKODI site/access/chrome registry.
INSERT OR IGNORE INTO customer_tenants (slug,name,domain,status,created_at)
VALUES ('bnslove','형제사랑회','ekodi.kr/bnslove','active',datetime('now'));

UPDATE customer_tenants
SET name='형제사랑회',domain='ekodi.kr/bnslove',status='active'
WHERE slug='bnslove';

INSERT INTO customer_access_grants
  (tenant_id,email,role,enabled,created_at,created_by,last_verified_at,principal_type,github_username,
   capabilities_json,denied_capabilities_json,expires_at,note,visibility,updated_at,updated_by)
SELECT id,'bnslove6510@gmail.com','admin',1,datetime('now'),NULL,NULL,'member','','[]','[]',NULL,
       'display-name:형제사랑회 관리자','private',datetime('now'),NULL
FROM customer_tenants WHERE slug='bnslove'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='admin',
  enabled=1,
  note='display-name:형제사랑회 관리자',
  visibility='private',
  updated_at=datetime('now');

INSERT INTO site_chrome_settings (
  tenant_id,subject_key,header_json,footer_json,version,updated_by,updated_at
)
SELECT
  id,
  'bnslove',
  json_object(
    'siteName','형제사랑회',
    'tagline','서로 사랑하고, 함께 나누는 공동체',
    'homeLabel','홈',
    'homeUrl','https://ekodi.kr/bnslove'
  ),
  json('{}'),
  1,
  'ekodi-system',
  datetime('now')
FROM customer_tenants
WHERE slug='bnslove'
ON CONFLICT(tenant_id) DO UPDATE SET
  subject_key='bnslove',
  header_json=excluded.header_json,
  footer_json=excluded.footer_json,
  version=site_chrome_settings.version+1,
  updated_by='ekodi-system',
  updated_at=datetime('now');

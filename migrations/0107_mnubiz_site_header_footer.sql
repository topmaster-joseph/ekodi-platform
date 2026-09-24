-- Register the Mokpo National University Business Alumni workspace in the shared
-- site chrome registry so the common user header/footer settings are centrally managed.
INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at)
VALUES ('mnubiz', '국립목포대학교 경영동문회', 'ekodi.kr/mnubiz', 'active', datetime('now'));

UPDATE customer_tenants
SET name='국립목포대학교 경영동문회',
    domain='ekodi.kr/mnubiz',
    status='active'
WHERE slug='mnubiz';

INSERT INTO site_chrome_settings (
  tenant_id, subject_key, header_json, footer_json, version, updated_by, updated_at
)
SELECT
  id,
  'mnubiz',
  json_object(
    'siteName','국립목포대학교 경영동문회',
    'tagline','경영동문 네트워크',
    'homeLabel','홈',
    'homeUrl','https://ekodi.kr/mnubiz'
  ),
  json('{}'),
  1,
  'ekodi-system',
  datetime('now')
FROM customer_tenants
WHERE slug='mnubiz'
ON CONFLICT(tenant_id) DO UPDATE SET
  subject_key='mnubiz',
  header_json=excluded.header_json,
  footer_json=excluded.footer_json,
  version=site_chrome_settings.version+1,
  updated_by='ekodi-system',
  updated_at=datetime('now');

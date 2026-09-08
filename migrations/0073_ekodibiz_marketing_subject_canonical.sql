-- Canonicalize EKODIBIZ tenant identity for Marketing/Channel automation.
-- URL alias remains /ekodibiz; authorization/storage tenant key is ekodi-biz.

INSERT INTO service_subscriptions(
  subject_type,subject_key,site,plan_id,status,monthly_fee,provider,provider_customer_key,
  billing_key_cipher,billing_key_iv,current_period_start,current_period_end,next_billing_at,
  cancel_at_period_end,created_at,updated_at
)
SELECT subject_type,'ekodi-biz',site,plan_id,status,monthly_fee,provider,provider_customer_key,
  billing_key_cipher,billing_key_iv,current_period_start,current_period_end,next_billing_at,
  cancel_at_period_end,created_at,updated_at
FROM service_subscriptions
WHERE subject_type='tenant' AND subject_key='ekodibiz'
ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
  plan_id=excluded.plan_id,status=excluded.status,monthly_fee=excluded.monthly_fee,
  provider=excluded.provider,updated_at=excluded.updated_at;

INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,provider,created_at,updated_at)
SELECT 'tenant','ekodi-biz','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS(SELECT 1 FROM customer_tenants WHERE slug='ekodi-biz' AND status='active')
ON CONFLICT(subject_type,subject_key,site) DO NOTHING;
INSERT INTO marketing_publish_policies(subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at)
SELECT subject_type,'ekodi-biz',mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at
FROM marketing_publish_policies WHERE subject_type='tenant' AND subject_key='ekodibiz'
ON CONFLICT(subject_type,subject_key) DO UPDATE SET
  mode=excluded.mode,max_daily_posts=excluded.max_daily_posts,
  allowed_providers_json=excluded.allowed_providers_json,quiet_hours_json=excluded.quiet_hours_json,
  updated_at=excluded.updated_at;

INSERT INTO marketing_publish_policies(subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at)
SELECT 'tenant','ekodi-biz','autonomous',3,'["facebook","instagram","threads"]',
  '{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS(SELECT 1 FROM customer_tenants WHERE slug='ekodi-biz' AND status='active')
ON CONFLICT(subject_type,subject_key) DO NOTHING;

UPDATE marketing_oauth_states SET subject_key='ekodi-biz'
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE marketing_growth_campaigns SET subject_key='ekodi-biz'
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE marketing_content_items SET subject_key='ekodi-biz'
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE marketing_publication_jobs SET subject_key='ekodi-biz'
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE marketing_publication_audit SET subject_key='ekodi-biz'
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE marketing_oauth_connections AS legacy SET subject_key='ekodi-biz'
WHERE legacy.subject_type='tenant' AND legacy.subject_key='ekodibiz'
  AND NOT EXISTS(SELECT 1 FROM marketing_oauth_connections canonical
    WHERE canonical.subject_type='tenant' AND canonical.subject_key='ekodi-biz'
      AND canonical.provider=legacy.provider
      AND canonical.resource_type=legacy.resource_type
      AND canonical.external_id=legacy.external_id);

UPDATE marketing_publish_channels AS legacy SET subject_key='ekodi-biz'
WHERE legacy.subject_type='tenant' AND legacy.subject_key='ekodibiz'
  AND NOT EXISTS(SELECT 1 FROM marketing_publish_channels canonical
    WHERE canonical.subject_type='tenant' AND canonical.subject_key='ekodi-biz'
      AND canonical.provider=legacy.provider
      AND canonical.channel_type=legacy.channel_type
      AND canonical.external_account_id=legacy.external_account_id);

UPDATE marketing_channel_settings AS legacy SET subject_key='ekodi-biz'
WHERE legacy.subject_type='tenant' AND legacy.subject_key='ekodibiz'
  AND NOT EXISTS(SELECT 1 FROM marketing_channel_settings canonical
    WHERE canonical.subject_type='tenant' AND canonical.subject_key='ekodi-biz'
      AND canonical.provider=legacy.provider
      AND canonical.external_account_id=legacy.external_account_id);
INSERT INTO marketing_brand_profiles(subject_type,subject_key,brand_name,tagline,audience_summary,voice_json,created_at,updated_at)
SELECT subject_type,'ekodi-biz',brand_name,tagline,audience_summary,voice_json,created_at,updated_at
FROM marketing_brand_profiles WHERE subject_type='tenant' AND subject_key='ekodibiz'
ON CONFLICT(subject_type,subject_key) DO UPDATE SET
  brand_name=excluded.brand_name,tagline=excluded.tagline,audience_summary=excluded.audience_summary,
  voice_json=excluded.voice_json,updated_at=excluded.updated_at;

UPDATE marketing_store_workspaces SET tenant_slug='ekodi-biz' WHERE tenant_slug='ekodibiz';
UPDATE marketing_workspace_templates SET tenant_slug='ekodi-biz' WHERE tenant_slug='ekodibiz';
UPDATE marketing_campaigns SET tenant_slug='ekodi-biz' WHERE tenant_slug='ekodibiz';
UPDATE marketing_events SET tenant_slug='ekodi-biz' WHERE tenant_slug='ekodibiz';

UPDATE channel_automation_profiles AS legacy
SET owner_key='ekodi-biz',workspace_slug='ekodi-biz'
WHERE legacy.owner_type='workspace' AND legacy.owner_key='ekodibiz'
  AND NOT EXISTS(SELECT 1 FROM channel_automation_profiles canonical
    WHERE canonical.owner_type='workspace' AND canonical.owner_key='ekodi-biz'
      AND canonical.template_id=legacy.template_id);
UPDATE channel_oauth_connections
SET owner_key='ekodi-biz',workspace_slug='ekodi-biz'
WHERE owner_type='workspace' AND owner_key='ekodibiz';

INSERT INTO customer_access_grants(tenant_id,email,role,enabled,created_at,last_verified_at)
SELECT t.id,operator.email,'hq_manager',1,CURRENT_TIMESTAMP,NULL
FROM customer_tenants t
CROSS JOIN (
  SELECT 'ekodibiz@gmail.com' AS email
  UNION ALL SELECT 'topmaster.joseph@gmail.com'
  UNION ALL SELECT 'joseph@ekodi.kr'
) operator
WHERE t.slug='ekodi-biz' AND t.status='active'
ON CONFLICT(tenant_id,email) DO UPDATE SET role='hq_manager',enabled=1;

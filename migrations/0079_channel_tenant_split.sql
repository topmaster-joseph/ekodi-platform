-- Split EKODIBIZ company, Mall and Trade channel authorities.
-- Public URLs stay under /ekodibiz; internal tenant keys are independent.
UPDATE customer_tenants
SET slug='ekoditrade',name='에코디무역',domain='ekodi.kr/ekodibiz/trade'
WHERE slug='ekodi-trade'
  AND NOT EXISTS(SELECT 1 FROM customer_tenants WHERE slug='ekoditrade');
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('ekoditrade','에코디무역','ekodi.kr/ekodibiz/trade','active',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('ekodimall','에코디몰','ekodi.kr/ekodibiz/mall','active',CURRENT_TIMESTAMP);
UPDATE customer_tenants SET name='에코디비즈' WHERE slug='ekodi-biz';
UPDATE customer_tenants SET name='에코디몰',domain='ekodi.kr/ekodibiz/mall' WHERE slug='ekodimall';
UPDATE customer_tenants SET name='에코디무역',domain='ekodi.kr/ekodibiz/trade' WHERE slug='ekoditrade';

INSERT INTO customer_access_grants(tenant_id,email,role,enabled,created_at,last_verified_at)
SELECT t.id,o.email,'hq_manager',1,CURRENT_TIMESTAMP,NULL
FROM customer_tenants t CROSS JOIN (
 SELECT 'topmaster.joseph@gmail.com' email UNION ALL SELECT 'ekodibiz@gmail.com'
) o WHERE t.slug IN ('ekodimall','ekoditrade')
ON CONFLICT(tenant_id,email) DO UPDATE SET role='hq_manager',enabled=1;
INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,provider,created_at,updated_at)
VALUES
 ('tenant','ekodimall','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('tenant','ekodi-biz','marketing','standard','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('tenant','ekoditrade','marketing','standard','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
 plan_id=excluded.plan_id,status=excluded.status,provider=excluded.provider,updated_at=CURRENT_TIMESTAMP;

INSERT INTO marketing_publish_policies(subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at)
VALUES
 ('tenant','ekodimall','autonomous',3,'["youtube","facebook","instagram","threads"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('tenant','ekodi-biz','review',1,'["youtube","facebook","instagram","threads"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('tenant','ekoditrade','review',1,'["youtube","facebook","instagram","threads"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key) DO UPDATE SET
 mode=excluded.mode,max_daily_posts=excluded.max_daily_posts,
 allowed_providers_json=excluded.allowed_providers_json,quiet_hours_json=excluded.quiet_hours_json,
 updated_at=CURRENT_TIMESTAMP;
UPDATE marketing_publish_policies SET mode='review',max_daily_posts=1,updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant' AND subject_key='ekodibiz';
UPDATE service_subscriptions SET plan_id='standard',updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant' AND subject_key='ekodibiz' AND site='marketing';

-- The old ekodi-biz marketing execution subject belonged to Mall automation.
UPDATE marketing_oauth_states SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_growth_campaigns SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_content_items SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_publication_jobs SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_publication_audit SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_oauth_connections SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_publish_channels SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE marketing_channel_settings SET subject_key='ekodimall'
WHERE subject_type='tenant' AND subject_key='ekodi-biz';
UPDATE channel_automation_profiles SET owner_key='ekodimall',workspace_slug='ekodimall'
WHERE owner_type='workspace' AND owner_key='ekodi-biz';
UPDATE channel_oauth_connections SET owner_key='ekodimall',workspace_slug='ekodimall'
WHERE owner_type='workspace' AND owner_key='ekodi-biz';

INSERT INTO marketing_brand_profiles(subject_type,subject_key,brand_name,tagline,audience_summary,voice_json,created_at,updated_at)
VALUES('tenant','ekodimall','에코디몰','필요한 상품을 더 쉽게 발견하는 에코디몰','','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key) DO UPDATE SET brand_name=excluded.brand_name,updated_at=CURRENT_TIMESTAMP;

-- Company and Trade remain separately connectable, but auto publishing starts fail-safe.
UPDATE marketing_publish_channels
SET status='paused',updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant' AND subject_key IN ('ekodi-biz','ekoditrade') AND status='active';

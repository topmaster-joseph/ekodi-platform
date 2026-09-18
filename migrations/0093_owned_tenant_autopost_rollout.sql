-- Roll out the shared approved-content autopost system after EKODI Mall.
-- Order: EKODIBIZ -> Jadam Chicken -> Pizza Maru -> Yogurt Purple.
-- The runtime remains fail-closed: only approved/auto-approved content carrying
-- content_json.autopostEligible=true may be queued automatically.

INSERT INTO service_subscriptions(
  subject_type,subject_key,site,plan_id,status,monthly_fee,provider,created_at,updated_at
) VALUES
  ('tenant','ekodi-biz','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','jadam','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','pizzamaru','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','yogurt','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
  plan_id=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'auto' ELSE service_subscriptions.plan_id END,
  status=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'active' ELSE service_subscriptions.status END,
  provider=CASE WHEN service_subscriptions.provider='' THEN 'internal' ELSE service_subscriptions.provider END,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO marketing_publish_policies(
  subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at
) VALUES
  ('tenant','ekodi-biz','autonomous',1,'["facebook","instagram","threads","youtube"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','jadam','autonomous',1,'["facebook","instagram","threads","youtube"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','pizzamaru','autonomous',1,'["facebook","instagram","threads","youtube"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','yogurt','autonomous',1,'["facebook","instagram","threads","youtube"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key) DO UPDATE SET
  mode='autonomous',
  max_daily_posts=1,
  allowed_providers_json='["facebook","instagram","threads","youtube"]',
  quiet_hours_json='{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO marketing_brand_profiles(
  subject_type,subject_key,brand_name,tagline,audience_summary,voice_json,created_at,updated_at
) VALUES
  ('tenant','ekodi-biz','에코디비즈','','','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','jadam','자담치킨 목포대점','','','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','pizzamaru','피자마루 목포대점','','','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('tenant','yogurt','요거트퍼플 목포대점','','','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(subject_type,subject_key) DO NOTHING;

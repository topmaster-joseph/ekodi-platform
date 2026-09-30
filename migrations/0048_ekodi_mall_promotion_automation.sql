-- EKODI Mall organic promotion automation.
-- First-party EKODIBIZ only. Paid ad activation is intentionally excluded.

CREATE TABLE IF NOT EXISTS affiliate_promotion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  product_row_id INTEGER NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL CHECK(provider IN ('facebook','instagram','threads')),
  connection_id INTEGER NOT NULL,
  campaign_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','approval_required','connection_required','publishing','published','failed')),
  ai_mode TEXT NOT NULL DEFAULT 'rules' CHECK(ai_mode IN ('ai','rules')),
  ai_model TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  external_post_id TEXT NOT NULL DEFAULT '',
  external_post_url TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_date, product_row_id, provider, connection_id),
  UNIQUE(campaign_key),
  FOREIGN KEY(product_row_id) REFERENCES affiliate_storefront_products(id),
  FOREIGN KEY(connection_id) REFERENCES marketing_oauth_connections(id)
);

CREATE TABLE IF NOT EXISTS affiliate_promotion_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_key TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_key, visit_date),
  FOREIGN KEY(campaign_key) REFERENCES affiliate_promotion_runs(campaign_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_promotion_runs_date
  ON affiliate_promotion_runs(run_date DESC, status, provider);
CREATE INDEX IF NOT EXISTS idx_affiliate_promotion_visits_date
  ON affiliate_promotion_visits(visit_date DESC, campaign_key);

-- The user's explicit first-party operating decision is to let EKODIBIZ Marketing AI
-- execute reversible organic social publishing. Keep the entitlement local to EKODIBIZ;
-- do not relax the global publication triggers for customer workspaces.
INSERT INTO service_subscriptions (
  subject_type,subject_key,site,plan_id,status,monthly_fee,provider,
  current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at
)
SELECT 'tenant','ekodibiz','marketing','auto','active',0,'internal',CURRENT_TIMESTAMP,NULL,NULL,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM customer_tenants WHERE slug='ekodibiz' AND status='active')
ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
  plan_id=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'auto' ELSE service_subscriptions.plan_id END,
  status=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'active' ELSE service_subscriptions.status END,
  provider=CASE WHEN service_subscriptions.provider='' THEN 'internal' ELSE service_subscriptions.provider END,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO marketing_publish_policies (
  subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at
) VALUES (
  'tenant','ekodibiz','autonomous',3,'["facebook","instagram","threads"]','{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
)
ON CONFLICT(subject_type,subject_key) DO UPDATE SET
  mode='autonomous',
  max_daily_posts=MIN(marketing_publish_policies.max_daily_posts,3),
  allowed_providers_json='["facebook","instagram","threads"]',
  quiet_hours_json='{"timezone":"Asia/Seoul","start":"08:00","end":"22:00"}',
  updated_at=CURRENT_TIMESTAMP;

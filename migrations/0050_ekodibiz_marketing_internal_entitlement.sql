-- EKODIBIZ first-party autonomous Marketing entitlement.
-- Scope is deliberately limited to tenant:ekodibiz and never relaxes customer gates.
INSERT INTO service_subscriptions (
  subject_type,subject_key,site,plan_id,status,monthly_fee,provider,
  current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at
) VALUES (
  'tenant','ekodibiz','marketing','auto','active',0,'internal',
  CURRENT_TIMESTAMP,NULL,NULL,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
)
ON CONFLICT(subject_type,subject_key,site) DO UPDATE SET
  plan_id=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'auto' ELSE service_subscriptions.plan_id END,
  status=CASE WHEN service_subscriptions.provider IN ('','internal') THEN 'active' ELSE service_subscriptions.status END,
  provider=CASE WHEN service_subscriptions.provider='' THEN 'internal' ELSE service_subscriptions.provider END,
  updated_at=CURRENT_TIMESTAMP;

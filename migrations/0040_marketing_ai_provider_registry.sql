-- EKODI Marketing AI provider registry, entitlement policy and usage ledger.
-- Secrets/endpoints remain in server-side runtime bindings; this database stores governance metadata only.

CREATE TABLE IF NOT EXISTS marketing_ai_providers (
  provider_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  contract_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL CHECK(status IN ('draft','testing','certified','suspended','retired')),
  adapter_type TEXT NOT NULL CHECK(adapter_type IN ('http','internal')),
  adapter_version TEXT NOT NULL,
  endpoint_ref TEXT NOT NULL DEFAULT '',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  regions_json TEXT NOT NULL DEFAULT '[]',
  pricing_model_json TEXT NOT NULL DEFAULT '{}',
  healthcheck_json TEXT NOT NULL DEFAULT '{}',
  data_policy_json TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 100,
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_ai_providers_route
  ON marketing_ai_providers(status, enabled, priority, provider_id);

CREATE TABLE IF NOT EXISTS marketing_ai_entitlement_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_scope TEXT NOT NULL CHECK(subject_scope IN ('individual','institution','organization')),
  plan_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  provider_selector_json TEXT NOT NULL DEFAULT '"ekodi-default"',
  quota_period TEXT CHECK(quota_period IN ('day','month','billing-cycle')),
  quota_requests INTEGER,
  quota_units INTEGER,
  rate_limit_requests INTEGER,
  rate_limit_window_seconds INTEGER,
  features_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_scope, plan_id)
);

CREATE TABLE IF NOT EXISTS marketing_ai_subject_profiles (
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  subject_scope TEXT NOT NULL CHECK(subject_scope IN ('individual','institution','organization')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject_type, subject_key)
);

CREATE TABLE IF NOT EXISTS marketing_ai_usage_ledger (
  request_id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  subject_scope TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider_id TEXT,
  route_mode TEXT NOT NULL CHECK(route_mode IN ('provider','core-only')),
  funding_mode TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL CHECK(status IN ('success','failed','degraded','rejected')),
  units INTEGER NOT NULL DEFAULT 0,
  selection_reason TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_ai_usage_subject_time
  ON marketing_ai_usage_ledger(subject_type, subject_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_ai_usage_provider_time
  ON marketing_ai_usage_ledger(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_ai_usage_capability_time
  ON marketing_ai_usage_ledger(capability, created_at DESC);

INSERT OR IGNORE INTO marketing_ai_providers
(provider_id,display_name,contract_version,status,adapter_type,adapter_version,endpoint_ref,capabilities_json,regions_json,pricing_model_json,healthcheck_json,data_policy_json,priority,is_default,enabled,created_at,updated_at)
VALUES ('ekodi-core','EKODI Core Marketing','1.0','certified','internal','1','core:marketing',
'["content.generate","campaign.plan","audience.segment","channel.optimize","analytics.report"]','["KR"]','{"type":"free","currency":"KRW"}',
'{"supported":true,"timeout_ms":1000}','{"retention":"none","training_use":false,"persists_payload":false,"sensitive_data_allowed":false,"processing_regions":["KR"],"deletion_supported":true,"export_supported":true}',
900,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

WITH scopes(subject_scope) AS (
  VALUES ('individual'),('institution'),('organization')
), defaults(plan_id,capabilities_json,provider_selector_json,quota_period,quota_requests,quota_units,features_json) AS (
  VALUES
  ('free','["content.generate"]','"ekodi-default"','day',10,10,'["core-fallback"]'),
  ('basic','["content.generate","campaign.plan","analytics.report"]','"ekodi-default"','day',30,30,'["core-fallback","workspace-context"]'),
  ('flex','["content.generate","campaign.plan","audience.segment"]','"any_certified"','month',100,100,'["metered","core-fallback"]'),
  ('plus','["content.generate","campaign.plan","audience.segment","analytics.report"]','"any_certified"','month',200,200,'["workspace-context","core-fallback"]'),
  ('pro','["content.generate","campaign.plan","audience.segment","channel.optimize","analytics.report"]','"any_certified"','month',1000,1000,'["multi-channel","provider-failover","core-fallback"]'),
  ('auto','["content.generate","campaign.plan","audience.segment","channel.optimize","analytics.report","publish.execute"]','"any_certified"','month',3000,3000,'["automation","provider-failover","core-fallback"]'),
  ('enterprise','["content.generate","campaign.plan","audience.segment","channel.optimize","analytics.report","publish.execute"]','"any_certified"','billing-cycle',10000,10000,'["automation","provider-failover","custom-provider","core-fallback"]')
)
INSERT OR IGNORE INTO marketing_ai_entitlement_policies
(subject_scope,plan_id,enabled,capabilities_json,provider_selector_json,quota_period,quota_requests,quota_units,rate_limit_requests,rate_limit_window_seconds,features_json,constraints_json,created_at,updated_at)
SELECT subject_scope,plan_id,1,capabilities_json,provider_selector_json,quota_period,quota_requests,quota_units,30,60,features_json,
'{"training_use_allowed":false,"payload_persistence_allowed":false,"sensitive_data_allowed":false}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM scopes CROSS JOIN defaults;

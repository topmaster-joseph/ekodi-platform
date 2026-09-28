-- EKODI Mall Amazon/AWS free-first cost governance.
-- Additive only: policy, normalized usage snapshots and explicit paid-feature approvals.

CREATE TABLE IF NOT EXISTS amazon_cost_policy (
  scope TEXT PRIMARY KEY,
  free_first_enabled INTEGER NOT NULL DEFAULT 1 CHECK (free_first_enabled IN (0,1)),
  monthly_budget_usd REAL NOT NULL DEFAULT 0 CHECK (monthly_budget_usd >= 0),
  auto_stop_percent INTEGER NOT NULL DEFAULT 90 CHECK (auto_stop_percent BETWEEN 1 AND 100),
  approval_threshold_usd REAL NOT NULL DEFAULT 0 CHECK (approval_threshold_usd >= 0),
  paid_aws_enabled INTEGER NOT NULL DEFAULT 0 CHECK (paid_aws_enabled IN (0,1)),
  seller_paid_plan_enabled INTEGER NOT NULL DEFAULT 0 CHECK (seller_paid_plan_enabled IN (0,1)),
  fba_enabled INTEGER NOT NULL DEFAULT 0 CHECK (fba_enabled IN (0,1)),
  bedrock_paid_enabled INTEGER NOT NULL DEFAULT 0 CHECK (bedrock_paid_enabled IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO amazon_cost_policy
(scope,free_first_enabled,monthly_budget_usd,auto_stop_percent,approval_threshold_usd,paid_aws_enabled,seller_paid_plan_enabled,fba_enabled,bedrock_paid_enabled,updated_by,updated_at)
VALUES ('ekodimall',1,0,90,0,0,0,0,0,'migration',CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS amazon_usage_snapshots (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  service_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  usage_value REAL NOT NULL DEFAULT 0,
  usage_unit TEXT NOT NULL DEFAULT '',
  free_allowance_value REAL,
  free_remaining_percent REAL,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'normalized',
  recorded_by TEXT NOT NULL DEFAULT 'system',
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amazon_usage_scope_period
ON amazon_usage_snapshots(scope,period_key,recorded_at DESC);

CREATE TABLE IF NOT EXISTS amazon_cost_approvals (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved','revoked','expired')),
  amount_limit_usd REAL NOT NULL DEFAULT 0 CHECK (amount_limit_usd >= 0),
  approved_by TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amazon_cost_approvals_feature
ON amazon_cost_approvals(scope,feature_key,status,updated_at DESC);

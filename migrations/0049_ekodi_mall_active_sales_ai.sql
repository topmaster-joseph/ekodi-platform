-- EKODI Mall active sales intelligence.
-- Stores demand signals, opportunity scores and product-level performance aggregates.
-- No customer PII is stored in this layer.

CREATE TABLE IF NOT EXISTS affiliate_demand_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('internal','naver_search_trend','seasonal','manual')),
  signal_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  current_value REAL NOT NULL DEFAULT 0,
  previous_value REAL NOT NULL DEFAULT 0,
  momentum REAL NOT NULL DEFAULT 0,
  signal_score REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE(observed_date,source,signal_key)
);

CREATE TABLE IF NOT EXISTS affiliate_product_performance_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_row_id INTEGER NOT NULL,
  metric_date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  cancels INTEGER NOT NULL DEFAULT 0,
  gmv_krw INTEGER NOT NULL DEFAULT 0,
  commission_krw INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'coupang_api',
  updated_at TEXT NOT NULL,
  UNIQUE(product_row_id,metric_date,source),
  FOREIGN KEY(product_row_id) REFERENCES affiliate_storefront_products(id)
);

CREATE TABLE IF NOT EXISTS affiliate_growth_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  product_row_id INTEGER NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  opportunity_score REAL NOT NULL DEFAULT 0,
  demand_score REAL NOT NULL DEFAULT 0,
  momentum_score REAL NOT NULL DEFAULT 0,
  performance_score REAL NOT NULL DEFAULT 0,
  product_score REAL NOT NULL DEFAULT 0,
  season_score REAL NOT NULL DEFAULT 0,
  exploration_score REAL NOT NULL DEFAULT 0,
  recommended_action TEXT NOT NULL DEFAULT 'hold'
    CHECK(recommended_action IN ('scale','test','observe','hold')),
  campaign_angle TEXT NOT NULL DEFAULT '',
  signal_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_date,product_row_id),
  FOREIGN KEY(product_row_id) REFERENCES affiliate_storefront_products(id)
);

CREATE TABLE IF NOT EXISTS affiliate_growth_strategy_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT 'cron',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','degraded','failed')),
  source_status_json TEXT NOT NULL DEFAULT '{}',
  candidates INTEGER NOT NULL DEFAULT 0,
  scale_count INTEGER NOT NULL DEFAULT 0,
  test_count INTEGER NOT NULL DEFAULT 0,
  observe_count INTEGER NOT NULL DEFAULT 0,
  hold_count INTEGER NOT NULL DEFAULT 0,
  top_product_row_id INTEGER,
  top_opportunity_score REAL NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(top_product_row_id) REFERENCES affiliate_storefront_products(id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_demand_signals_date
  ON affiliate_demand_signals(observed_date DESC,source,signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_product_performance_date
  ON affiliate_product_performance_daily(metric_date DESC,product_row_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_growth_opportunities_rank
  ON affiliate_growth_opportunities(run_date DESC,opportunity_score DESC,recommended_action);
CREATE INDEX IF NOT EXISTS idx_affiliate_growth_strategy_runs_date
  ON affiliate_growth_strategy_runs(run_date DESC,status);

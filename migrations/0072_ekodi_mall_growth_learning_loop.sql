-- EKODI Mall closed-loop affiliate growth learning.
-- Keeps direct funnel observations separate from estimated revenue attribution.

CREATE TABLE IF NOT EXISTS affiliate_promotion_outbound_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_key TEXT NOT NULL,
  click_date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_key, click_date),
  FOREIGN KEY(campaign_key) REFERENCES affiliate_promotion_runs(campaign_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_promotion_outbound_clicks_date
  ON affiliate_promotion_outbound_clicks(click_date DESC, campaign_key);

CREATE TABLE IF NOT EXISTS affiliate_growth_policy_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  product_row_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','instagram','threads')),
  policy_score REAL NOT NULL DEFAULT 0,
  recommended_action TEXT NOT NULL DEFAULT 'hold'
    CHECK(recommended_action IN ('scale','test','observe','hold')),
  visits_30d INTEGER NOT NULL DEFAULT 0,
  outbound_clicks_30d INTEGER NOT NULL DEFAULT 0,
  funnel_rate REAL NOT NULL DEFAULT 0,
  product_clicks_30d INTEGER NOT NULL DEFAULT 0,
  orders_30d INTEGER NOT NULL DEFAULT 0,
  cancels_30d INTEGER NOT NULL DEFAULT 0,
  commission_30d_krw INTEGER NOT NULL DEFAULT 0,
  earnings_per_click_krw REAL NOT NULL DEFAULT 0,
  expected_commission_per_visit_krw REAL NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0,
  exploration_bonus REAL NOT NULL DEFAULT 0,
  fatigue_penalty REAL NOT NULL DEFAULT 0,
  reason_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_date, product_row_id, provider),
  FOREIGN KEY(product_row_id) REFERENCES affiliate_storefront_products(id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_growth_policy_rank
  ON affiliate_growth_policy_snapshots(run_date DESC, provider, policy_score DESC, recommended_action);

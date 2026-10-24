-- EKODI Mall direct-sale product promotion ledger (separate from affiliate runs; no affiliate FK).
CREATE TABLE IF NOT EXISTS mall_direct_promotion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  share_code TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL CHECK(provider IN ('facebook','instagram','threads')),
  connection_id INTEGER NOT NULL,
  campaign_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'publishing' CHECK(status IN ('publishing','published','failed')),
  content_json TEXT NOT NULL DEFAULT '{}',
  external_post_id TEXT NOT NULL DEFAULT '',
  external_post_url TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_date, provider, connection_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_direct_promotion_runs_share ON mall_direct_promotion_runs(share_code, run_date);

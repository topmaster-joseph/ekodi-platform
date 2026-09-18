CREATE TABLE IF NOT EXISTS ai_provider_daily_budget (
  provider_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_daily_budget_date
  ON ai_provider_daily_budget (usage_date, provider_id);

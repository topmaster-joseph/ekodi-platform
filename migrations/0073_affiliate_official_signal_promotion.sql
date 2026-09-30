-- EKODI Mall official-signal weekly promotion board.
-- Uses official platform rank and public market signals; EKODI performance is tie-break only.

CREATE TABLE IF NOT EXISTS affiliate_official_market_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_date TEXT NOT NULL,
  source TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  current_value REAL NOT NULL DEFAULT 0,
  previous_value REAL NOT NULL DEFAULT 0,
  momentum REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE(observed_date, source, signal_key)
);

CREATE TABLE IF NOT EXISTS affiliate_promotion_weekly_boards (
  week_key TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','degraded','failed')),
  selection_mode TEXT NOT NULL DEFAULT 'official_signal_v1',
  source_status_json TEXT NOT NULL DEFAULT '{}',
  primary_count INTEGER NOT NULL DEFAULT 0,
  backup_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_promotion_weekly_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('A','B')),
  slot INTEGER NOT NULL,
  product_row_id INTEGER NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  provider_rank INTEGER NOT NULL DEFAULT 0,
  signal_direction TEXT NOT NULL DEFAULT 'unknown',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  selected_at TEXT NOT NULL,
  UNIQUE(week_key, tier, slot),
  UNIQUE(week_key, product_row_id),
  FOREIGN KEY(week_key) REFERENCES affiliate_promotion_weekly_boards(week_key),
  FOREIGN KEY(product_row_id) REFERENCES affiliate_storefront_products(id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_official_market_signals_latest
  ON affiliate_official_market_signals(source, category, observed_date DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_promotion_weekly_products_lookup
  ON affiliate_promotion_weekly_products(week_key, tier, slot);

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mall_seller_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  seller_type TEXT NOT NULL DEFAULT 'individual' CHECK (seller_type IN ('individual','business')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected','suspended')),
  plan_id TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mall_memberships (
  seller_user_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','canceled','expired')),
  source TEXT NOT NULL DEFAULT 'signup',
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mall_stores (
  id TEXT PRIMARY KEY,
  seller_user_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  store_type TEXT NOT NULL DEFAULT 'personal' CHECK (store_type IN ('personal','business')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected','suspended')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mall_stores_seller ON mall_stores(seller_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mall_products (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  client_draft_id TEXT,
  seller_user_id TEXT NOT NULL,
  store_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'local',
  sale_type TEXT NOT NULL DEFAULT 'direct' CHECK (sale_type IN ('direct','affiliate','inquiry')),
  audience TEXT,
  one_line TEXT,
  price INTEGER CHECK (price IS NULL OR price >= 0),
  benefits_json TEXT NOT NULL DEFAULT '[]',
  specs_json TEXT NOT NULL DEFAULT '[]',
  story TEXT,
  fulfillment TEXT,
  contact TEXT,
  action_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  commerce_state TEXT NOT NULL DEFAULT 'listing_only' CHECK (commerce_state IN ('listing_only','payment_ready','paused')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES mall_stores(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_products_seller ON mall_products(seller_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_products_store ON mall_products(store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_products_public ON mall_products(public_id, status);

CREATE TABLE IF NOT EXISTS mall_share_links (
  token TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  seller_user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('copy','kakao','sms','qr','social','system')),
  source_type TEXT NOT NULL CHECK (source_type IN ('seller_direct','ai_campaign')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (product_id) REFERENCES mall_products(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mall_share_links_product ON mall_share_links(product_id, active, source_type);

CREATE TABLE IF NOT EXISTS mall_attribution_visits (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  share_token TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('seller_direct','marketplace','ai_campaign')),
  fee_percent INTEGER NOT NULL CHECK (fee_percent BETWEEN 0 AND 100),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES mall_products(id) ON DELETE CASCADE,
  FOREIGN KEY (share_token) REFERENCES mall_share_links(token) ON DELETE SET NULL,
  UNIQUE (product_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_expiry ON mall_attribution_visits(expires_at);

CREATE TABLE IF NOT EXISTS mall_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  seller_user_id TEXT NOT NULL,
  attribution_id TEXT,
  gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0),
  fee_percent INTEGER NOT NULL CHECK (fee_percent BETWEEN 0 AND 100),
  platform_fee_amount INTEGER NOT NULL CHECK (platform_fee_amount >= 0),
  seller_net_amount INTEGER NOT NULL CHECK (seller_net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','payment_pending','paid','canceled','refunded','settled')),
  payment_provider TEXT,
  payment_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES mall_products(id),
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id),
  FOREIGN KEY (attribution_id) REFERENCES mall_attribution_visits(id)
);
CREATE INDEX IF NOT EXISTS idx_mall_orders_seller ON mall_orders(seller_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mall_settlements (
  id TEXT PRIMARY KEY,
  seller_user_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_amount INTEGER NOT NULL DEFAULT 0,
  platform_fee_amount INTEGER NOT NULL DEFAULT 0,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  adjustment_amount INTEGER NOT NULL DEFAULT 0,
  payout_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','ready','paid','held')),
  payout_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (seller_user_id) REFERENCES mall_seller_profiles(user_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_settlements_seller ON mall_settlements(seller_user_id, period_start DESC);

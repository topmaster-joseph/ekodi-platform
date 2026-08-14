PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS seller_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  seller_type TEXT NOT NULL DEFAULT 'individual' CHECK (seller_type IN ('individual','business')),
  verification_status TEXT NOT NULL DEFAULT 'google_verified',
  direct_sale_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  seller_id TEXT PRIMARY KEY REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'google-signup',
  valid_from TEXT,
  valid_to TEXT,
  external_subscription_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended')),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_stores_seller ON stores(seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  share_code TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  seller_display_name TEXT NOT NULL,
  seller_type TEXT NOT NULL CHECK (seller_type IN ('individual','business')),
  sale_type TEXT NOT NULL CHECK (sale_type IN ('direct','affiliate','inquiry')),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  one_line TEXT NOT NULL DEFAULT '',
  price INTEGER,
  benefits_json TEXT NOT NULL DEFAULT '[]',
  specs_json TEXT NOT NULL DEFAULT '[]',
  story TEXT NOT NULL DEFAULT '',
  fulfillment TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','suspended')),
  checkout_ready INTEGER NOT NULL DEFAULT 0 CHECK (checkout_ready IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mall_products_seller ON products(seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_products_public ON products(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_products_store ON products(store_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS attribution_tokens (
  token TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct','marketplace','ai')),
  channel TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_product ON attribution_tokens(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_attribution_expiry ON attribution_tokens(expires_at);

CREATE TABLE IF NOT EXISTS product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view','share','outbound_affiliate')),
  attribution_type TEXT NOT NULL CHECK (attribution_type IN ('direct','marketplace','ai','unknown')),
  channel TEXT NOT NULL DEFAULT 'unknown',
  session_token TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_events_product_time ON product_events(product_id, occurred_at DESC);

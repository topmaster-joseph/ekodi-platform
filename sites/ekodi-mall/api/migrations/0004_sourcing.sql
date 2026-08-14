PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sourcing_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('retail_reference','affiliate','contract_supplier','supplier_api')),
  integration_mode TEXT NOT NULL CHECK (integration_mode IN ('manual','api','feed')),
  connection_status TEXT NOT NULL CHECK (connection_status IN ('available','setup_required','contract_required','api_pending','active','suspended')),
  catalog_policy TEXT NOT NULL CHECK (catalog_policy IN ('reference_only','external_only','licensed_cache','supplier_owned')),
  order_mode TEXT NOT NULL CHECK (order_mode IN ('none','external_checkout','manual_forward','api_order')),
  auto_order_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_order_enabled IN (0,1)),
  customer_pii_allowed INTEGER NOT NULL DEFAULT 0 CHECK (customer_pii_allowed IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sourcing_providers
  (id,display_name,provider_type,integration_mode,connection_status,catalog_policy,order_mode,auto_order_enabled,customer_pii_allowed,created_at,updated_at)
VALUES
  ('auction-reference','옥션','retail_reference','api','setup_required','reference_only','none',0,0,datetime('now'),datetime('now')),
  ('external-affiliate','외부 제휴몰','affiliate','manual','available','external_only','external_checkout',0,0,datetime('now'),datetime('now')),
  ('contract-supplier','계약 공급업체','contract_supplier','manual','contract_required','supplier_owned','manual_forward',0,0,datetime('now'),datetime('now')),
  ('supplier-api','승인된 공급업체 API','supplier_api','api','api_pending','supplier_owned','api_order',0,0,datetime('now'),datetime('now'));

CREATE TABLE IF NOT EXISTS sourcing_sources (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES sourcing_providers(id) ON DELETE RESTRICT,
  source_url TEXT NOT NULL,
  source_ref TEXT NOT NULL DEFAULT '',
  internal_label TEXT NOT NULL DEFAULT '',
  cost_amount INTEGER CHECK (cost_amount IS NULL OR cost_amount >= 0),
  shipping_amount INTEGER NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  stock_state TEXT NOT NULL DEFAULT 'unknown' CHECK (stock_state IN ('unknown','in_stock','out_of_stock')),
  fulfillment_mode TEXT NOT NULL CHECK (fulfillment_mode IN ('reference_only','external_affiliate','supplier_dropship')),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('reference_only','external_affiliate','contract_pending','contract_verified','licensed')),
  order_permission TEXT NOT NULL CHECK (order_permission IN ('none','external_checkout','manual_contract','api_approved')),
  pii_permission TEXT NOT NULL DEFAULT 'none' CHECK (pii_permission IN ('none','contracted_processor')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_sourcing_sources_seller ON sourcing_sources(seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_sourcing_sources_provider ON sourcing_sources(provider_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS product_source_links (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sourcing_sources(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  min_margin_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_margin_amount >= 0),
  min_margin_percent REAL NOT NULL DEFAULT 0 CHECK (min_margin_percent >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_product_sources_product ON product_source_links(product_id, active, priority);

CREATE TABLE IF NOT EXISTS procurement_decisions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE CASCADE,
  source_id TEXT REFERENCES sourcing_sources(id) ON DELETE SET NULL,
  fee_rate_percent INTEGER NOT NULL CHECK (fee_rate_percent IN (7,8,9,10)),
  sale_amount INTEGER NOT NULL CHECK (sale_amount >= 0),
  landed_cost INTEGER NOT NULL CHECK (landed_cost >= 0),
  platform_fee_amount INTEGER NOT NULL CHECK (platform_fee_amount >= 0),
  contribution_margin INTEGER NOT NULL,
  contribution_margin_percent REAL NOT NULL,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('blocked','external_checkout','manual_review','manual_forward','api_order')),
  decision_status TEXT NOT NULL CHECK (decision_status IN ('blocked','eligible','dry_run')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_procurement_product ON procurement_decisions(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_procurement_seller ON procurement_decisions(seller_id, created_at DESC);

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS supplier_partners (
  id TEXT PRIMARY KEY,
  partner_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  provider_type TEXT NOT NULL DEFAULT 'contract_supplier' CHECK (provider_type IN ('contract_supplier','supplier_api')),
  onboarding_status TEXT NOT NULL DEFAULT 'candidate' CHECK (onboarding_status IN (
    'candidate','due_diligence','contracted','pilot_ready','pilot_active','active','suspended','rejected'
  )),
  business_verification_ref TEXT NOT NULL DEFAULT '',
  master_contract_ref TEXT NOT NULL DEFAULT '',
  pii_processor_ref TEXT NOT NULL DEFAULT '',
  returns_policy_ref TEXT NOT NULL DEFAULT '',
  cs_policy_ref TEXT NOT NULL DEFAULT '',
  pilot_evidence_ref TEXT NOT NULL DEFAULT '',
  status_note TEXT NOT NULL DEFAULT '',
  auto_order_allowed INTEGER NOT NULL DEFAULT 0 CHECK (auto_order_allowed IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  activated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_partners_status ON supplier_partners(onboarding_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_partner_sources (
  partner_id TEXT NOT NULL REFERENCES supplier_partners(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL DEFAULT 'mapped' CHECK (mapping_status IN ('mapped','contract_verified','pilot','active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (partner_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_partner_sources_partner ON supplier_partner_sources(partner_id, mapping_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_partner_sources_seller ON supplier_partner_sources(seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_skus (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES supplier_partners(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  sku_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cost_amount INTEGER NOT NULL CHECK (cost_amount >= 0),
  shipping_amount INTEGER NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  stock_state TEXT NOT NULL DEFAULT 'unknown' CHECK (stock_state IN ('unknown','in_stock','out_of_stock')),
  checked_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (partner_id, sku_code)
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_skus_partner ON supplier_skus(partner_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_sku_product_links (
  supplier_sku_id TEXT NOT NULL REFERENCES supplier_skus(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL DEFAULT 'pilot' CHECK (mapping_status IN ('draft','pilot','active','suspended')),
  priority INTEGER NOT NULL DEFAULT 100,
  min_margin_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_margin_amount >= 0),
  min_margin_percent REAL NOT NULL DEFAULT 0 CHECK (min_margin_percent >= 0 AND min_margin_percent <= 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (supplier_sku_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_sku_products_product ON supplier_sku_product_links(product_id, mapping_status, priority);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_sku_products_seller ON supplier_sku_product_links(seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_partner_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id TEXT REFERENCES supplier_partners(id) ON DELETE RESTRICT,
  source_id TEXT REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  supplier_sku_id TEXT REFERENCES supplier_skus(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_partner_events_partner ON supplier_partner_events(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_partner_events_time ON supplier_partner_events(created_at DESC);

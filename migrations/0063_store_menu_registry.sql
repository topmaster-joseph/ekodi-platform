-- Store-scoped canonical menu snapshots for approved POS/delivery connectors.
-- Provider credentials are never stored here; connector authentication remains hashed in marketing_data_connectors.
CREATE TABLE IF NOT EXISTS store_menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_item_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  price_krw INTEGER NOT NULL DEFAULT 0 CHECK(price_krw >= 0),
  sale_price_krw INTEGER CHECK(sale_price_krw IS NULL OR sale_price_krw >= 0),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK(availability IN ('available','sold_out','hidden','unknown')),
  option_summary TEXT NOT NULL DEFAULT '',
  source_updated_at TEXT,
  imported_at TEXT NOT NULL,
  UNIQUE(store_id, provider, external_item_id)
);

CREATE INDEX IF NOT EXISTS idx_store_menu_items_store_provider
  ON store_menu_items(store_id, provider, availability);
CREATE INDEX IF NOT EXISTS idx_store_menu_items_canonical
  ON store_menu_items(store_id, canonical_key);

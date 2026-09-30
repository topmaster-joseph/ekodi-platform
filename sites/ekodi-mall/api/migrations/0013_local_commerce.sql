PRAGMA foreign_keys = ON;

-- Geography is orthogonal to product category. Seller-declared regions begin unverified.
ALTER TABLE products ADD COLUMN primary_region_id TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN region_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN region_label TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN local_relationship TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN region_verified INTEGER NOT NULL DEFAULT 0 CHECK (region_verified IN (0,1));

CREATE INDEX IF NOT EXISTS idx_mall_products_region
  ON products(primary_region_id, status, published_at DESC);

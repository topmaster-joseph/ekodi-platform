-- EKODI-MALL-DOMEGGOOK-IMPORT-001: 위탁배송(도매꾹·도매매) 상품의 공급처 연결 정보.
-- 선발주 없이 상품만 등록하고, 주문 발생 시 이 값으로 공급처 발주를 만든다.
ALTER TABLE products ADD COLUMN supply_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN supply_item_no TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN supply_market TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN supply_cost INTEGER;
ALTER TABLE products ADD COLUMN supply_shipping INTEGER;
ALTER TABLE products ADD COLUMN supply_synced_at TEXT;
CREATE INDEX IF NOT EXISTS idx_mall_products_supply ON products(supply_provider, supply_synced_at);

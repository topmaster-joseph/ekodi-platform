PRAGMA foreign_keys = ON;

-- Supplier SKU 매핑은 SKU source, source seller, product seller가 모두 같은 경계여야 한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_sku_product_same_seller_insert
BEFORE INSERT ON supplier_sku_product_links
WHEN NOT EXISTS (
  SELECT 1
  FROM supplier_skus sk
  JOIN sourcing_sources ss ON ss.id = NEW.source_id
  JOIN products p ON p.id = NEW.product_id
  WHERE sk.id = NEW.supplier_sku_id
    AND sk.source_id = NEW.source_id
    AND ss.seller_id = NEW.seller_id
    AND p.seller_id = NEW.seller_id
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_SKU_PRODUCT_SELLER_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_sku_product_same_seller_update
BEFORE UPDATE OF supplier_sku_id, product_id, seller_id, source_id ON supplier_sku_product_links
WHEN NOT EXISTS (
  SELECT 1
  FROM supplier_skus sk
  JOIN sourcing_sources ss ON ss.id = NEW.source_id
  JOIN products p ON p.id = NEW.product_id
  WHERE sk.id = NEW.supplier_sku_id
    AND sk.source_id = NEW.source_id
    AND ss.seller_id = NEW.seller_id
    AND p.seller_id = NEW.seller_id
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_SKU_PRODUCT_SELLER_MISMATCH');
END;

-- 일반 product_source_links도 다른 판매자의 source를 상품에 꽂을 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_product_source_same_seller_insert
BEFORE INSERT ON product_source_links
WHEN (
  SELECT p.seller_id FROM products p WHERE p.id = NEW.product_id
) IS NOT (
  SELECT ss.seller_id FROM sourcing_sources ss WHERE ss.id = NEW.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_SOURCE_SELLER_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_product_source_same_seller_update
BEFORE UPDATE OF product_id, source_id ON product_source_links
WHEN (
  SELECT p.seller_id FROM products p WHERE p.id = NEW.product_id
) IS NOT (
  SELECT ss.seller_id FROM sourcing_sources ss WHERE ss.id = NEW.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_SOURCE_SELLER_MISMATCH');
END;

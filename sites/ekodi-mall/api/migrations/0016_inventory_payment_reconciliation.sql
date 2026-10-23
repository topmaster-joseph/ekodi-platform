-- EKODI-MALL-PAY-RECON-001 (2026-10-23)
-- 재고 예약과 결제 대사를 위한 컬럼.
-- products.stock_quantity: NULL = 재고 관리 안 함(기존 상품 호환), 0 이상 정수 = 판매 가능 수량.
-- orders.stock_reserved: 결제 대기 중 이 주문이 잡아 둔 수량(취소·만료 시 되돌림).
-- orders.reconciled_at / reconcile_attempts: 토스 재조회 대사 이력.
ALTER TABLE products ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE orders ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0);
ALTER TABLE orders ADD COLUMN reconciled_at TEXT;
ALTER TABLE orders ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_mall_orders_pending_created ON orders(status, created_at);

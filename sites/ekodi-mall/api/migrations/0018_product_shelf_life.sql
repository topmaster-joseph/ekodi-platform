-- EKODI-MALL-SHELF-LIFE-001 (2026-10-25)
-- 직접판매 소비기한 기준(남은 기간 3개월 이상) 및 자동 품절 기록.
-- expiry_date: 'YYYY-MM-DD'(KST). NULL = 소비기한 없는 상품.
-- expiry_sold_out_at: cron이 3개월 미만 구간 진입으로 품절 처리한 시각.
-- expiry_held_stock: 품절 처리 직전의 재고 수량(감사·재입고 판단용).
ALTER TABLE products ADD COLUMN expiry_date TEXT CHECK (expiry_date IS NULL OR length(expiry_date) = 10);
ALTER TABLE products ADD COLUMN expiry_sold_out_at TEXT;
ALTER TABLE products ADD COLUMN expiry_held_stock INTEGER;
CREATE INDEX IF NOT EXISTS idx_mall_products_expiry ON products(sale_type, expiry_date) WHERE expiry_date IS NOT NULL;

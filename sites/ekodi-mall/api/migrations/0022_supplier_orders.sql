-- EKODI-MALL-DOMEGGOOK-AUTOORDER-001: 에코디몰 결제 완료 → 도매꾹 자동 발주 원장.
-- order_id UNIQUE 가 멱등키: 같은 고객 주문은 공급처에 두 번 발주되지 않는다.
CREATE TABLE IF NOT EXISTS supplier_orders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  product_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  item_no TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  expected_cost INTEGER,
  status TEXT NOT NULL CHECK (status IN ('placing','placed','shipping','delivered','cancel_requested','cancelled','failed','unknown')),
  supplier_order_no TEXT,
  supplier_status TEXT NOT NULL DEFAULT '',
  tracking_company TEXT NOT NULL DEFAULT '',
  tracking_code TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders(status, checked_at);

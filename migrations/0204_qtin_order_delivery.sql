-- EKODI-QTIN-DELIVERY-005: 수령 방법(교회 수령 무료 / 택배 고정 배송비)과 택배 배송지.
-- 행이 없는 과거 신청은 교회 수령(pickup)으로 본다. 배송지는 택배 신청에만 저장한다.
CREATE TABLE IF NOT EXISTS qtin_order_delivery (
  order_id TEXT PRIMARY KEY REFERENCES qtin_orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('pickup', 'parcel')),
  shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  recipient_name TEXT,
  recipient_phone TEXT,
  postal_code TEXT,
  address1 TEXT,
  address2 TEXT,
  created_at TEXT NOT NULL
);

-- EKODI-MALL-TOSS-WIDGET-007
-- 직접판매 주문의 받는 분·배송 정보. 판매자 전달은 BUYER_PII_RELEASE_ENABLED 게이트를 따른다.
CREATE TABLE IF NOT EXISTS order_buyers (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL,
  address1 TEXT NOT NULL,
  address2 TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  privacy_consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- EKODI-QTIN-GROUP-ORDER-001
-- 큐티인(QTIN) 월간 공동구매 신청·결제·발주 기록 (에코디교회 · 에코디선교회 공용).
-- 매월 20일 다음달호 신청을 열고 25일에 마감한다. 결제(토스페이먼츠) 승인이 서버에서
-- 확인된 신청만 'paid'(완료)로 집계한다. Additive only: 기존 테이블·데이터를 바꾸지 않는다.

CREATE TABLE IF NOT EXISTS qtin_campaigns (
  id TEXT PRIMARY KEY,                       -- 대상 월호 'YYYY-MM'
  target_year INTEGER NOT NULL,
  target_month INTEGER NOT NULL,
  opens_at TEXT NOT NULL,                    -- ISO UTC (기본: 전월 20일 00:00 KST)
  closes_at TEXT NOT NULL,                   -- ISO UTC (기본: 전월 25일 23:59:59 KST)
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | open | closed | cancelled (표시용, 실제 판정은 시각 기준)
  manual_state TEXT NOT NULL DEFAULT '',     -- '' | force_open | force_closed
  last_sync_at TEXT NOT NULL DEFAULT '',
  last_sync_status TEXT NOT NULL DEFAULT '',
  last_sync_detail TEXT NOT NULL DEFAULT '',
  product_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qtin_products (
  id TEXT PRIMARY KEY,                       -- '<campaign>:<qtm item id>'
  campaign_id TEXT NOT NULL,
  qtm_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT '',
  sale_price INTEGER NOT NULL,               -- QTM 온라인 판매가격(원) 그대로
  list_price INTEGER NOT NULL DEFAULT 0,     -- 시중가격(참고)
  image_url TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'qtm-sync',   -- qtm-sync | manual
  fetched_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qtin_products_campaign ON qtin_products (campaign_id, active, sort_order);

CREATE TABLE IF NOT EXISTS qtin_orders (
  id TEXT PRIMARY KEY,                       -- 토스 orderId (영문·숫자·-_, 6~64자)
  campaign_id TEXT NOT NULL,
  org TEXT NOT NULL,                         -- church | mission
  applicant_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  total_amount INTEGER NOT NULL,
  total_quantity INTEGER NOT NULL,
  order_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'payment_pending', -- payment_pending | paid | expired | cancelled | payment_failed
  payment_key TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  receipt_url TEXT NOT NULL DEFAULT '',
  fulfillment_status TEXT NOT NULL DEFAULT 'waiting', -- waiting | ordered | received | distributed
  lookup_token_hash TEXT NOT NULL DEFAULT '',
  privacy_consent_at TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  anonymized_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qtin_orders_campaign ON qtin_orders (campaign_id, status, org);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qtin_orders_payment_key ON qtin_orders (payment_key) WHERE payment_key <> '';

CREATE TABLE IF NOT EXISTS qtin_order_items (
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qtm_item_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_amount INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_qtin_order_items_product ON qtin_order_items (product_id);

CREATE TABLE IF NOT EXISTS qtin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qtin_audit_target ON qtin_audit_logs (target_id, created_at);

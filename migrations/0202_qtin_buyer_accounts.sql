-- EKODI-QTIN-GOOGLE-CHECKOUT-004
-- 누구나 화면을 보고, 구글 로그인 후 연락처·이메일·추가정보를 입력해 결제한다.
-- 구매자 계정(중앙 EKODI Supabase 사용자)과 신청을 연결하고, 다음 신청 때 입력값을 다시 채운다.
-- Additive only (CREATE ... IF NOT EXISTS): 매 릴리스 재실행해도 안전하다.

CREATE TABLE IF NOT EXISTS qtin_buyer_profiles (
  user_id TEXT PRIMARY KEY,                -- 중앙 Supabase auth user id
  google_email TEXT NOT NULL DEFAULT '',   -- 로그인 계정 이메일
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',          -- 연락받을 이메일(로그인 이메일과 다를 수 있음)
  department TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qtin_order_buyers (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  google_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qtin_order_buyers_user ON qtin_order_buyers (user_id, created_at);

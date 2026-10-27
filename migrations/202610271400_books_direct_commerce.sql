-- BOOKS-DIRECT-COMMERCE-001: 에코디서점 자체 판매(전자책) · 회원등급별 가격 · 내 서재
-- Applied by .github/workflows/deploy-books.yml (d1 execute, idempotent).

CREATE TABLE IF NOT EXISTS books_orders (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  book_title TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  tier_id TEXT NOT NULL DEFAULT 'member',
  list_price INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'payment_pending',
  source TEXT NOT NULL DEFAULT 'bookstore',
  payment_key TEXT,
  payment_method TEXT,
  receipt_url TEXT,
  approved_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_orders_buyer ON books_orders(buyer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_books_orders_book ON books_orders(book_id, status);

CREATE TABLE IF NOT EXISTS books_entitlements (
  buyer_user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (buyer_user_id, book_id)
);

-- 회원등급: 관리자가 부여하거나 구독 결제가 열리면 자동으로 갱신된다.
CREATE TABLE IF NOT EXISTS books_member_tiers (
  buyer_email TEXT PRIMARY KEY,
  tier_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin',
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books_commerce_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_commerce_audit_order ON books_commerce_audit(order_id, created_at);

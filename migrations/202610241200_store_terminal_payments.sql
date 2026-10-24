-- Store table-side payment ledger (portable card terminal / QR / manual).
-- EKODI never stores card numbers or card data: the vendor terminal reads and
-- approves the card. Only amount, status, the vendor's short approval number,
-- and an opaque order reference are recorded. Additive only.

CREATE TABLE IF NOT EXISTS store_terminal_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_slug TEXT NOT NULL,
  order_ref TEXT NOT NULL DEFAULT 'walk_in',
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  method TEXT NOT NULL DEFAULT 'card_terminal'
    CHECK (method IN ('card_terminal','qr_link','cash','other')),
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual','kicc_easycheck','toss_payments')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','failed','cancelled')),
  request_key TEXT NOT NULL,
  approval_no TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_slug, request_key)
);

CREATE INDEX IF NOT EXISTS store_terminal_payments_store_created_idx
  ON store_terminal_payments(store_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS store_terminal_payments_store_order_idx
  ON store_terminal_payments(store_slug, order_ref);

CREATE TABLE IF NOT EXISTS books_sales_channels (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'KRW',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books_finance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_on TEXT NOT NULL,
  publication_id TEXT NOT NULL DEFAULT '',
  channel_code TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  amount_original REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW',
  fx_rate REAL NOT NULL DEFAULT 1,
  amount_krw INTEGER NOT NULL DEFAULT 0,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  settlement_period TEXT NOT NULL DEFAULT '',
  settlement_ref TEXT NOT NULL DEFAULT '',
  external_ref TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER,
  updated_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_books_finance_date ON books_finance_transactions(occurred_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_books_finance_channel ON books_finance_transactions(channel_code, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_books_finance_publication ON books_finance_transactions(publication_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_books_finance_settlement ON books_finance_transactions(settlement_status, settlement_period);

INSERT OR IGNORE INTO books_sales_channels (code, name, default_currency, enabled, sort_order, created_at, updated_at) VALUES
('amazon-kdp', 'Amazon KDP', 'USD', 1, 10, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('google-play', 'Google Play Books', 'KRW', 1, 20, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('kyobo', '교보문고', 'KRW', 1, 30, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('yes24', 'YES24', 'KRW', 1, 40, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('aladin', '알라딘', 'KRW', 1, 50, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('ridi', '리디', 'KRW', 1, 60, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('ekodi-direct', 'EKODI Direct', 'KRW', 1, 70, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
('other', '기타 채널', 'KRW', 1, 999, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
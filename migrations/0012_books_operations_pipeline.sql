ALTER TABLE books_distribution_status ADD COLUMN source_status TEXT NOT NULL DEFAULT '';
ALTER TABLE books_distribution_status ADD COLUMN assignee TEXT NOT NULL DEFAULT '';
ALTER TABLE books_distribution_status ADD COLUMN due_at TEXT NOT NULL DEFAULT '';
ALTER TABLE books_distribution_status ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE books_distribution_status ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE books_distribution_status ADD COLUMN synced_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_books_distribution_status_due ON books_distribution_status(due_at, status);

-- Normalize finance channel codes so distribution and finance use one canonical vocabulary.
UPDATE books_finance_transactions SET channel_code = 'google-play-books' WHERE channel_code = 'google-play';
UPDATE books_finance_transactions SET channel_code = 'ridibooks' WHERE channel_code = 'ridi';

INSERT INTO books_sales_channels (code, name, default_currency, enabled, sort_order, created_at, updated_at)
VALUES
  ('google-play-books', 'Google Play Books', 'KRW', 1, 20, '2026-08-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z'),
  ('ridibooks', '리디', 'KRW', 1, 60, '2026-08-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z')
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,
  default_currency=excluded.default_currency,
  enabled=excluded.enabled,
  sort_order=excluded.sort_order,
  updated_at=excluded.updated_at;

DELETE FROM books_sales_channels WHERE code IN ('google-play', 'ridi');

ALTER TABLE books_distribution_status ADD COLUMN platform_status TEXT NOT NULL DEFAULT '';
ALTER TABLE books_distribution_status ADD COLUMN sync_source TEXT NOT NULL DEFAULT '';
ALTER TABLE books_distribution_status ADD COLUMN sync_updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS books_distribution_sync_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_code TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual_csv',
  source_filename TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY (channel_code) REFERENCES books_distribution_channels(code),
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_distribution_sync_batches_channel
  ON books_distribution_sync_batches(channel_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_distribution_sync_updated
  ON books_distribution_status(sync_updated_at DESC);

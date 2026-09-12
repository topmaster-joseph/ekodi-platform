CREATE TABLE IF NOT EXISTS books_editions (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  edition_label TEXT NOT NULL DEFAULT '',
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  release_date TEXT NOT NULL DEFAULT '',
  isbn_ebook_snapshot TEXT NOT NULL DEFAULT '',
  isbn_print_snapshot TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  UNIQUE(publication_id, version_label),
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_editions_publication ON books_editions(publication_id, status, updated_at);

CREATE TABLE IF NOT EXISTS books_publication_assets (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  edition_id TEXT,
  asset_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  storage_ref TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  version_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'current',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (edition_id) REFERENCES books_editions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_assets_publication ON books_publication_assets(publication_id, status, asset_type);
CREATE INDEX IF NOT EXISTS idx_books_assets_edition ON books_publication_assets(edition_id, status, asset_type);
CREATE INDEX IF NOT EXISTS idx_books_assets_checksum ON books_publication_assets(checksum_sha256);

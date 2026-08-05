CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 0),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  created_by INTEGER,
  FOREIGN KEY(created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS media_assets_site_created_idx ON media_assets(site_id, created_at DESC);

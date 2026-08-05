CREATE TABLE IF NOT EXISTS cms_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  draft_content TEXT NOT NULL DEFAULT '',
  published_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
  version INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  UNIQUE(site_id, slug),
  FOREIGN KEY(updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS cms_pages_site_status_idx ON cms_pages(site_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cms_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL CHECK(event IN ('created', 'saved', 'published')),
  created_at TEXT NOT NULL,
  created_by INTEGER,
  FOREIGN KEY(page_id) REFERENCES cms_pages(id),
  FOREIGN KEY(created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS cms_revisions_page_version_idx ON cms_revisions(page_id, version DESC);

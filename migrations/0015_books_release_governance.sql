CREATE TABLE IF NOT EXISTS books_release_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  edition_id TEXT,
  action TEXT NOT NULL,
  public_state TEXT NOT NULL DEFAULT 'private',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (edition_id) REFERENCES books_editions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_release_events_publication ON books_release_events(publication_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_release_events_action ON books_release_events(action, created_at DESC);

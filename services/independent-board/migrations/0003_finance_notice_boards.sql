-- Finance and notice boards owned by the standalone board database.
CREATE TABLE IF NOT EXISTS finance_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense')),
  amount INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL,
  related_event TEXT NOT NULL DEFAULT '',
  evidence_status TEXT NOT NULL DEFAULT 'none' CHECK (evidence_status IN ('none','held','verified')),
  public_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_posts_public
  ON finance_posts(status,entry_date DESC,id DESC);

CREATE TABLE IF NOT EXISTS notice_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notice_posts_public
  ON notice_posts(status,pinned DESC,updated_at DESC,id DESC);

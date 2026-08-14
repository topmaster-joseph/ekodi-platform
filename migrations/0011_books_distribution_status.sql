CREATE TABLE IF NOT EXISTS books_distribution_channels (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'korea',
  portal_url TEXT NOT NULL DEFAULT '',
  onboarding_url TEXT NOT NULL DEFAULT '',
  help_url TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'unknown',
  account_note TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS books_distribution_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  channel_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  external_id TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  UNIQUE(publication_id, channel_code),
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_code) REFERENCES books_distribution_channels(code),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_distribution_status_publication ON books_distribution_status(publication_id);
CREATE INDEX IF NOT EXISTS idx_books_distribution_status_channel ON books_distribution_status(channel_code);
CREATE INDEX IF NOT EXISTS idx_books_distribution_status_status ON books_distribution_status(status);

INSERT INTO books_distribution_channels
  (code, name, scope, portal_url, onboarding_url, help_url, account_status, enabled, sort_order)
VALUES
  ('google-play-books', 'Google Play Books', 'global', 'https://play.google.com/books/publish/', 'https://play.google.com/books/publish/', 'https://support.google.com/books/partner/?hl=ko', 'unknown', 1, 10),
  ('amazon-kdp', 'Amazon KDP', 'global', 'https://kdp.amazon.com/en_US/bookshelf', 'https://kdp.amazon.com/', 'https://kdp.amazon.com/en_US/help', 'unknown', 1, 20),
  ('kyobo', '교보문고 eBook', 'korea', 'https://partner.kyobobook.co.kr/login', 'https://partner.kyobobook.co.kr/dpart/pcc/members', 'https://www.kyobobook.co.kr/partners/book-promotion', 'unknown', 1, 30),
  ('yes24', 'YES24 eBook', 'korea', '', 'https://www.yes24.com/company/faq.aspx', 'https://www.yes24.com/company/faq.aspx', 'unknown', 1, 40),
  ('aladin', '알라딘', 'korea', 'https://www.aladin.co.kr/supplier/wmain.aspx', 'https://www.aladin.co.kr/supplier/wfaq.aspx', 'https://www.aladin.co.kr/m/Supplier/mFaq.aspx', 'unknown', 1, 50),
  ('ridibooks', '리디', 'korea', 'https://cp.ridibooks.com/', 'https://ridihelp.ridibooks.com/support/solutions/folders/154000745770', 'https://ridihelp.ridibooks.com/support/solutions/articles/154000210043-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%A0%9C%EA%B3%B5-%EB%B0%A9%EB%B2%95', 'unknown', 1, 60),
  ('ekodi-direct', 'EKODI Direct', 'direct', 'https://books.ekodi.kr/', 'https://admin.ekodi.kr/books', 'https://books.ekodi.kr/publishing/', 'active', 1, 70)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,
  scope=excluded.scope,
  portal_url=excluded.portal_url,
  onboarding_url=excluded.onboarding_url,
  help_url=excluded.help_url,
  enabled=excluded.enabled,
  sort_order=excluded.sort_order;

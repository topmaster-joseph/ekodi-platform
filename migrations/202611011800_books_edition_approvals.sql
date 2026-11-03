-- BOOKS-EDITION-APPROVAL-001: 출판 최종 확정(판권·판본) 기록. Additive only.
-- 운영자가 판매 파일을 화면에서 검토한 뒤 확정하면 한 줄이 생긴다. 파일이 바뀌면(etag·크기 불일치) 확정은 자동으로 무효가 된다.
CREATE TABLE IF NOT EXISTS books_edition_approvals (
  book_id TEXT PRIMARY KEY,
  edition TEXT NOT NULL,
  list_price INTEGER NOT NULL,
  file_key TEXT NOT NULL,
  file_etag TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  rights_confirmed INTEGER NOT NULL DEFAULT 0,
  content_reviewed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);
CREATE TABLE IF NOT EXISTS books_edition_approval_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

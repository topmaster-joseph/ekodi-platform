-- BOOKS-AUDIOBOOK-REVIEW-001: 무료 보너스 오디오북 검토·승인 기록. Additive only.
-- 승인은 그 순간 비공개 보관함에 있던 장별 MP3 묶음(번호·etag·크기)에 결속된다. 하나라도 바뀌면 자동 무효.
CREATE TABLE IF NOT EXISTS books_audiobook_approvals (
  book_id TEXT PRIMARY KEY,
  tracks_json TEXT NOT NULL,
  rights_approved INTEGER NOT NULL DEFAULT 0,
  author_approved INTEGER NOT NULL DEFAULT 0,
  voice_approved INTEGER NOT NULL DEFAULT 0,
  accessibility_reviewed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);
CREATE TABLE IF NOT EXISTS books_audiobook_review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

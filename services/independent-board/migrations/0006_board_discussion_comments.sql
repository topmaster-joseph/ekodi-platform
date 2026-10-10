-- Add standalone, site-local discussion comments for published finance entries and notices.
-- These public comments contain no internal finance evidence or author identifiers.
CREATE TABLE IF NOT EXISTS board_discussion_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_kind TEXT NOT NULL CHECK (board_kind IN ('finance','notices')),
  post_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '회원',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted')),
  submission_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_discussion_comments_public
  ON board_discussion_comments(board_kind,post_id,status,id);

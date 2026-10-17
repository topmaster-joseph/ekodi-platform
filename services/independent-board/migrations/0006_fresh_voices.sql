-- A new isolated citizen-voices board. Legacy board_posts, board_replies, notices, finance and R2 are untouched.
CREATE TABLE IF NOT EXISTS citizen_voices_fresh (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_subject TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 12000),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citizen_voices_fresh_public ON citizen_voices_fresh(status,id DESC);

-- Additive: replies on fresh citizen voices (Owner request 2026-10-27).
-- Separate table; citizen_voices_fresh rows and the legacy board_replies table are untouched.
CREATE TABLE IF NOT EXISTS citizen_voice_replies_fresh (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voice_id INTEGER NOT NULL REFERENCES citizen_voices_fresh(id),
  google_subject TEXT NOT NULL,
  submission_key TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citizen_voice_replies_fresh_voice ON citizen_voice_replies_fresh(voice_id,status,id);

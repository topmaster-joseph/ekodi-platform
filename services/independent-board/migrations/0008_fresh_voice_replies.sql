-- Additive standalone citizen voice replies: legacy records remain untouched.
-- Ownership is always enforced by the Worker against the verified Google/EKODI identity.
CREATE TABLE IF NOT EXISTS citizen_voice_replies_fresh (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voice_id INTEGER NOT NULL REFERENCES citizen_voices_fresh(id),
  google_subject TEXT NOT NULL,
  submission_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '회원',
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1500),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citizen_voice_replies_fresh_public ON citizen_voice_replies_fresh(voice_id,status,id);
CREATE INDEX IF NOT EXISTS idx_citizen_voice_replies_fresh_owner ON citizen_voice_replies_fresh(google_subject,id);

-- New citizen voices are published immediately by the intake path; historical moderation states remain unchanged.
CREATE TABLE IF NOT EXISTS seonammedi_civic_voice_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voice_id INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (voice_id) REFERENCES seonammedi_civic_voices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voice_replies_voice
ON seonammedi_civic_voice_replies(voice_id,id);

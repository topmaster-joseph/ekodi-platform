-- Citizen voices are published immediately; replies are public and contact data stays private.
UPDATE seonammedi_civic_voices
SET public_consent=1,
    review_status='published',
    updated_at=COALESCE(updated_at,created_at)
WHERE review_status<>'archived';

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

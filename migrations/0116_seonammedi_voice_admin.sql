-- Add citizen voice moderation capability to the SeonamMedi site-local board administrator.
UPDATE customer_access_grants
SET capabilities_json='["seonammedi.notice.manage","seonammedi.channel.manage","seonammedi.voice.manage"]',
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id=(SELECT id FROM customer_tenants WHERE slug='seonammedi' LIMIT 1)
  AND lower(trim(email))='ohwon69@gmail.com'
  AND role='board_admin';

CREATE TABLE IF NOT EXISTS seonammedi_civic_voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  public_consent INTEGER NOT NULL DEFAULT 0,
  privacy_consent INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'received',
  request_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_created
  ON seonammedi_civic_voices(created_at);
CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_review
  ON seonammedi_civic_voices(review_status,created_at);

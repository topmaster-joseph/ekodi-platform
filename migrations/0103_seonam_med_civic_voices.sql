CREATE TABLE IF NOT EXISTS seonam_med_civic_voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('question','proposal','experience','factcheck','tip','other')),
  display_name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  public_consent INTEGER NOT NULL DEFAULT 0 CHECK (public_consent IN (0,1)),
  privacy_consent INTEGER NOT NULL DEFAULT 1 CHECK (privacy_consent IN (0,1)),
  review_status TEXT NOT NULL DEFAULT 'received' CHECK (review_status IN ('received','reviewing','answered','published','archived')),
  request_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_created
  ON seonam_med_civic_voices(created_at);

CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_review
  ON seonam_med_civic_voices(review_status, created_at);

-- EKODI Journal first-party private photo intake. Originals stay in canonical Drive.
-- Additive private metadata only; no grants, approved-public rows, or publishing.
CREATE TABLE IF NOT EXISTS journal_private_editorial_media (
  id TEXT PRIMARY KEY NOT NULL,
  draft_slug TEXT NOT NULL REFERENCES journal_private_editorial_drafts(slug),
  drive_file_id TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/webp' CHECK(mime_type='image/webp'),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
  alt TEXT NOT NULL CHECK(length(alt) BETWEEN 5 AND 200),
  caption TEXT NOT NULL DEFAULT '' CHECK(length(caption) <= 500),
  credit TEXT NOT NULL DEFAULT '' CHECK(length(credit) <= 150),
  rights_status TEXT NOT NULL DEFAULT 'pending' CHECK(rights_status='pending'),
  actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS journal_private_editorial_media_slug_idx
  ON journal_private_editorial_media(draft_slug,created_at DESC);
CREATE TRIGGER IF NOT EXISTS journal_private_editorial_media_max_24
  BEFORE INSERT ON journal_private_editorial_media
  WHEN (SELECT COUNT(*) FROM journal_private_editorial_media WHERE draft_slug=NEW.draft_slug)>=24
  BEGIN SELECT RAISE(ABORT,'journal_media_limit'); END;
CREATE TABLE IF NOT EXISTS journal_private_editorial_media_audit (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL REFERENCES journal_private_editorial_media(id),
  action TEXT NOT NULL CHECK(action='photo_intake_pending_review'),
  actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  created_at TEXT NOT NULL
);

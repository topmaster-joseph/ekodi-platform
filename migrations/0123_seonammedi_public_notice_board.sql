-- Public notice board for authenticated Google/Supabase members with optional R2-backed images.
ALTER TABLE seonammedi_notices ADD COLUMN image_key TEXT NOT NULL DEFAULT '';
ALTER TABLE seonammedi_notices ADD COLUMN image_type TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_public_recent
  ON seonammedi_notices(status,published_at,id);

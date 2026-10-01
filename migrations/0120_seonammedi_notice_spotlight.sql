ALTER TABLE seonammedi_notices ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE seonammedi_notices ADD COLUMN notice_kind TEXT NOT NULL DEFAULT 'notice';
ALTER TABLE seonammedi_notices ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seonammedi_notices ADD COLUMN event_start TEXT;
ALTER TABLE seonammedi_notices ADD COLUMN event_end TEXT;
CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_spotlight ON seonammedi_notices(status,featured,notice_kind,event_start,event_end,published_at);

CREATE TABLE IF NOT EXISTS notice_views (notice_id INTEGER NOT NULL, visitor TEXT NOT NULL, window_id INTEGER NOT NULL, PRIMARY KEY(notice_id,visitor,window_id));
CREATE INDEX IF NOT EXISTS idx_notice_views_post ON notice_views(notice_id);

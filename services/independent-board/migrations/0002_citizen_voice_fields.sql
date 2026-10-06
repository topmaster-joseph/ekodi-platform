-- Citizen-opinion fields belong to the standalone board database.
ALTER TABLE board_posts ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE board_posts ADD COLUMN private_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE board_replies ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS idx_board_posts_status_created ON board_posts(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_replies_status_post ON board_replies(status,post_id,id);

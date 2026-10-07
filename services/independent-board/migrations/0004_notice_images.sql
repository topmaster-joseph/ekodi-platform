-- Notice attachments owned by the independent board.
ALTER TABLE notice_posts ADD COLUMN image_keys TEXT NOT NULL DEFAULT '[]';

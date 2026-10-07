-- Shared media fields for the standalone SeonamMedi boards.
-- Binary data lives in BOARD_FILES (R2); D1 stores only opaque object keys.
ALTER TABLE board_posts ADD COLUMN image_keys TEXT NOT NULL DEFAULT '[]';
ALTER TABLE notice_posts ADD COLUMN image_keys TEXT NOT NULL DEFAULT '[]';

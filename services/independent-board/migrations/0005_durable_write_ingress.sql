-- Durable public-write ingress for the standalone SeonamMedi board.
-- Queue delivery is at-least-once, so submission keys make writes idempotent.
ALTER TABLE board_posts ADD COLUMN submission_key TEXT NOT NULL DEFAULT '';
ALTER TABLE board_replies ADD COLUMN submission_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_posts_submission_key
  ON board_posts(submission_key) WHERE submission_key<>'';

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_replies_submission_key
  ON board_replies(submission_key) WHERE submission_key<>'';

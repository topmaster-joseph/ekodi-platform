-- A late-arriving canary Queue message must not recreate an already cleaned test post.
-- Durable tombstones apply ONLY to the generated run marker (never ordinary opinions).
-- Retain tombstones for the Queue retry/DLQ retention horizon to prevent delayed replay.
CREATE TABLE IF NOT EXISTS board_canary_cleanup_tombstones (
  marker TEXT PRIMARY KEY NOT NULL,
  post_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(marker GLOB 'EKODI-BOARD-CANARY-[0-9]*')
);
CREATE INDEX IF NOT EXISTS idx_board_canary_cleanup_post ON board_canary_cleanup_tombstones(post_id);

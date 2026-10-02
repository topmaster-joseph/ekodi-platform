-- Self-contained seed because long-lived staging databases may have older migration ledgers.
CREATE TABLE IF NOT EXISTS seonammedi_channel_previews (
  channel_id INTEGER PRIMARY KEY,
  preview_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (channel_id) REFERENCES seonammedi_channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seonammedi_channel_previews_updated
  ON seonammedi_channel_previews(updated_at);

-- Current verified public Instagram post for @wonokoh.
-- Administrators can replace this from the channel editor when a newer post should be pinned.
INSERT INTO seonammedi_channel_previews(channel_id,preview_url,updated_at)
SELECT c.id,'https://www.instagram.com/wonokoh/p/Dd8q1vCSlhT/',CURRENT_TIMESTAMP
FROM seonammedi_channels c
WHERE lower(c.platform)='instagram'
  AND lower(c.url) LIKE 'https://www.instagram.com/wonokoh/%'
ON CONFLICT(channel_id) DO UPDATE SET
  preview_url=excluded.preview_url,
  updated_at=excluded.updated_at;

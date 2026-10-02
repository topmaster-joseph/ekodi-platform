-- Keep this seed self-contained because some long-lived staging D1 databases can have
-- older migration ledgers where the preview table migration was not replayed.
CREATE TABLE IF NOT EXISTS seonammedi_channel_previews (
  channel_id INTEGER PRIMARY KEY,
  preview_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (channel_id) REFERENCES seonammedi_channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seonammedi_channel_previews_updated
  ON seonammedi_channel_previews(updated_at);

-- Pin the currently verified public Instagram post for the SeonamMedi channel preview.
-- The site admin can replace this URL later; runtime converts it to an official Instagram embed URL.
INSERT INTO seonammedi_channel_previews(channel_id,preview_url,updated_at)
SELECT c.id,'https://www.instagram.com/wonokoh/p/Dd8q1vCSlhT/',CURRENT_TIMESTAMP
FROM seonammedi_channels c
WHERE lower(c.platform)='instagram'
  AND lower(c.url) LIKE 'https://www.instagram.com/wonokoh/%'
ON CONFLICT(channel_id) DO UPDATE SET
  preview_url=excluded.preview_url,
  updated_at=excluded.updated_at;

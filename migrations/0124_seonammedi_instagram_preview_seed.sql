-- Pin the currently verified public Instagram post for the SeonamMedi channel preview.
-- The channel admin can replace this URL at any time; runtime normalizes it to an official Instagram embed URL.
INSERT INTO seonammedi_channel_previews(channel_id,preview_url,updated_at)
SELECT c.id,'https://www.instagram.com/wonokoh/p/Dd8q1vCSlhT/',CURRENT_TIMESTAMP
FROM seonammedi_channels c
WHERE lower(c.platform)='instagram'
  AND lower(c.url) LIKE 'https://www.instagram.com/wonokoh/%'
ON CONFLICT(channel_id) DO UPDATE SET
  preview_url=excluded.preview_url,
  updated_at=excluded.updated_at;

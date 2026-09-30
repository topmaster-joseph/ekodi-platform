-- Seed user-provided related channels for SeonamMedi.
-- Additive and idempotent; does not mark either channel as an official institutional source.

INSERT INTO seonammedi_channels(
  platform,name,url,category,official,visible,sort_order,note,created_by,created_at,updated_at
)
SELECT
  'instagram','서남권비상대책위원회 Instagram','https://www.instagram.com/wonokoh/','civic',0,1,10,
  '사용자 제공 공개 채널 · @wonokoh','topmaster-joseph',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM seonammedi_channels
  WHERE url='https://www.instagram.com/wonokoh/'
);

INSERT INTO seonammedi_channels(
  platform,name,url,category,official,visible,sort_order,note,created_by,created_at,updated_at
)
SELECT
  'youtube','Mokpotv','https://www.youtube.com/@Mokpo-tv','media',0,1,20,
  '사용자 제공 공개 채널 · @Mokpo-tv','topmaster-joseph',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM seonammedi_channels
  WHERE url='https://www.youtube.com/@Mokpo-tv'
);

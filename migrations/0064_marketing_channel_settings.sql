CREATE TABLE IF NOT EXISTS marketing_channel_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'service',
  is_default INTEGER NOT NULL DEFAULT 0,
  publish_privacy TEXT NOT NULL DEFAULT 'private',
  category_id TEXT NOT NULL DEFAULT '22',
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'KR',
  default_language TEXT NOT NULL DEFAULT 'ko',
  unsubscribed_trailer TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local',
  last_sync_at TEXT,
  last_sync_error TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type, subject_key, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_channel_settings_subject
  ON marketing_channel_settings(subject_type, subject_key, provider, is_default);

INSERT INTO marketing_channel_settings(subject_type,subject_key,provider,external_account_id,role,is_default,publish_privacy,category_id,description,keywords,country,default_language,updated_by,created_at,updated_at)
VALUES('tenant','ekodibiz','youtube','UCC1MknWOs8BDw2dbq4i9-Zg','mall',1,'private','22',
'에코디몰은 필요한 상품을 더 쉽게 발견하고 비교할 수 있도록 돕는 에코디비즈의 쇼핑 채널입니다. 상품 추천, 사용법, 실사용 정보, 쇼츠를 중심으로 실제 선택에 도움이 되는 정보를 전합니다.',
'에코디몰 EKODI MALL 쇼핑 상품추천 사용법 리뷰 쇼츠','KR','ko','system',datetime('now'),datetime('now'))
ON CONFLICT(subject_type,subject_key,provider,external_account_id) DO UPDATE SET
  role='mall', is_default=1, updated_at=datetime('now');

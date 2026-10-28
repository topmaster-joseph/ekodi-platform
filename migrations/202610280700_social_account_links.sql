-- SOCIAL-ID-001. Person-owned social account references, never login identities or OAuth credentials.
-- Safe additive schema. All rows remain unverified; provider OAuth consent is a separate future gate.
CREATE TABLE IF NOT EXISTS ekodi_social_account_links (
  id TEXT PRIMARY KEY,
  ekodi_user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN
    ('youtube','facebook','instagram','threads','naver','kakao','tiktok','x','linkedin','pinterest','bluesky','discord','telegram')),
  provider_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_provider_verification'
    CHECK(status IN ('pending_provider_verification','disabled','revoked')),
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(ekodi_user_id,provider,provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_ekodi_social_links_user
  ON ekodi_social_account_links(ekodi_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ekodi_social_links_provider
  ON ekodi_social_account_links(provider,status);

CREATE TABLE IF NOT EXISTS ekodi_social_account_link_audit (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('registration_pending')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ekodi_social_link_audit
  ON ekodi_social_account_link_audit(link_id,created_at DESC);

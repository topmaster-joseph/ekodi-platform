-- Shared Channel Automation Core. Additive only.
-- Legacy Marketing publication rows remain compatible while new workspace operations are pinned to immutable workspace_id.

ALTER TABLE marketing_brand_profiles ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_publish_policies ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_publish_channels ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_content_items ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_publication_jobs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_publication_audit ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS channel_automation_profiles (
  owner_type TEXT NOT NULL CHECK(owner_type IN ('person','workspace')),
  owner_key TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  schedule_json TEXT NOT NULL DEFAULT '{}',
  policy_json TEXT NOT NULL DEFAULT '{}',
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_type, owner_key, template_id)
);
CREATE TABLE IF NOT EXISTS channel_oauth_connections (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('person','workspace')),
  owner_key TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  credential_ciphertext TEXT NOT NULL DEFAULT '',
  credential_iv TEXT NOT NULL DEFAULT '',
  scopes TEXT NOT NULL DEFAULT '',
  discovered_channels_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_oauth' CHECK(status IN ('pending_oauth','selection_required','active','reconnect_required','revoked','error')),
  created_by_email TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_oauth_states (
  nonce_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(connection_id) REFERENCES channel_oauth_connections(id)
);
CREATE INDEX IF NOT EXISTS idx_channel_profiles_owner
  ON channel_automation_profiles(owner_type, owner_key, enabled);
CREATE INDEX IF NOT EXISTS idx_channel_connections_owner
  ON channel_oauth_connections(owner_type, owner_key, provider, status);
CREATE INDEX IF NOT EXISTS idx_channel_oauth_states_expiry
  ON channel_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_marketing_channels_workspace
  ON marketing_publish_channels(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_workspace
  ON marketing_publication_jobs(workspace_id, status, scheduled_at);

-- EKODI Personal Credential Vault
-- Design-review schema. Production activation is gated by PERSONAL-CREDENTIAL-VAULT-001.
-- No plaintext secret columns are permitted.

CREATE TABLE IF NOT EXISTS personal_credential_vaults (
  id TEXT PRIMARY KEY,
  owner_person_id TEXT NOT NULL UNIQUE,
  wrapped_dek_ciphertext TEXT NOT NULL,
  wrapped_dek_iv TEXT NOT NULL,
  wrapped_dek_aad TEXT NOT NULL,
  key_version TEXT NOT NULL,
  unlock_mode TEXT NOT NULL DEFAULT 'server_envelope' CHECK(unlock_mode IN ('server_envelope','zero_knowledge_future')),
  status TEXT NOT NULL DEFAULT 'locked' CHECK(status IN ('locked','active','rotation_required','recovery_required','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_credential_items (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  owner_person_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  service_key TEXT NOT NULL DEFAULT 'general',
  site_url TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  login_hint TEXT NOT NULL DEFAULT '',
  login_method TEXT NOT NULL DEFAULT 'password' CHECK(login_method IN ('password','google','kakao','apple','passkey','oauth','other')),
  secret_kind TEXT NOT NULL CHECK(secret_kind IN ('password','recovery_code','api_key','totp_seed','secure_note')),
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_aad TEXT NOT NULL,
  secret_version INTEGER NOT NULL DEFAULT 1,
  connection_ref TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_revealed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY(vault_id) REFERENCES personal_credential_vaults(id)
);

CREATE INDEX IF NOT EXISTS idx_personal_credential_items_owner
  ON personal_credential_items(owner_person_id, revoked_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_credential_items_provider
  ON personal_credential_items(owner_person_id, provider, service_key);

CREATE TABLE IF NOT EXISTS personal_credential_audit (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  item_id TEXT,
  owner_person_id TEXT NOT NULL,
  actor_person_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','metadata_update','secret_update','reveal','copy','delete','unlock','unlock_failed','export_encrypted','rotate_key','revoke')),
  auth_strength TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK(result IN ('allowed','denied','failed')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_credential_audit_owner
  ON personal_credential_audit(owner_person_id, created_at DESC);

-- external_account_connections.credential_ref may reference an item id, but ciphertext is never copied there.

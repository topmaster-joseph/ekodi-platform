-- EKODI Invest read-only broker adapter: encrypted access-token cache.
-- Additive only. Tokens are AES-GCM encrypted with a key derived (HKDF) from the
-- server-held app secret; no app key, app secret or account number is stored.
-- issued_at enforces the provider's one-issuance-per-minute rule across isolates.
CREATE TABLE IF NOT EXISTS investment_broker_token_cache (
  cache_key TEXT PRIMARY KEY CHECK (cache_key IN ('kis:paper','kis:live')),
  token_cipher TEXT NOT NULL DEFAULT '',
  token_iv TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  issued_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

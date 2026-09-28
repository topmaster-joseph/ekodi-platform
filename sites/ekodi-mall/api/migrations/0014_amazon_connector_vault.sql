-- EKODI Mall Amazon connector encrypted credential vault and read-only marketplace cache.
-- Secrets are encrypted with a Worker-only AMAZON_CREDENTIAL_KEY and never stored in plaintext.

CREATE TABLE IF NOT EXISTS amazon_connections (
  scope TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'amazon',
  status TEXT NOT NULL DEFAULT 'setup-required' CHECK (status IN ('setup-required','configured','verified','error','disabled')),
  display_name TEXT NOT NULL DEFAULT '',
  seller_id TEXT NOT NULL DEFAULT '',
  marketplace_id TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT 'https://sellingpartnerapi-fe.amazon.com',
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  last_error_code TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS amazon_marketplaces (
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  marketplace_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  default_currency_code TEXT NOT NULL DEFAULT '',
  default_language_code TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL DEFAULT '',
  participation_active INTEGER NOT NULL DEFAULT 0 CHECK (participation_active IN (0,1)),
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, marketplace_id)
);

CREATE INDEX IF NOT EXISTS idx_amazon_marketplaces_scope
ON amazon_marketplaces(scope, updated_at DESC);

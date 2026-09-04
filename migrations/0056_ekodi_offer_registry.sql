CREATE TABLE IF NOT EXISTS ekodi_offers (
  offer_id TEXT PRIMARY KEY,
  offer_type TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'platform',
  owner_key TEXT NOT NULL DEFAULT '',
  source_provider TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price_amount INTEGER NOT NULL DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'KRW',
  canonical_url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  action_kind TEXT NOT NULL DEFAULT 'view',
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',
  discovery_keywords_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(offer_type, source_provider, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ekodi_offers_public_discovery
  ON ekodi_offers(visibility, status, offer_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ekodi_offers_owner
  ON ekodi_offers(owner_type, owner_key, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ekodi_offers_source
  ON ekodi_offers(source_provider, source_id, status);

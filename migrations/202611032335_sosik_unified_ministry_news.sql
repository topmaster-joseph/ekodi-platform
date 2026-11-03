-- SOSIK-001 | Unified ministry news, scoped by organization and auditable publication.
-- Private data remains within existing EKODI D1 Control API binding.
CREATE TABLE IF NOT EXISTS sosik_entries (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL CHECK(organization IN ('church','mission','joint')),
  kind TEXT NOT NULL CHECK(kind IN ('worship','meeting','service','education','prayer','other')),
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'supporters' CHECK(visibility IN ('public','supporters','external')),
  people_present INTEGER NOT NULL DEFAULT 0 CHECK(people_present IN (0,1)),
  public_consent INTEGER NOT NULL DEFAULT 0 CHECK(public_consent IN (0,1)),
  external_consent INTEGER NOT NULL DEFAULT 0 CHECK(external_consent IN (0,1)),
  photo_keys_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT,
  author_id TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sosik_entries_scope ON sosik_entries(organization,occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_sosik_entries_public ON sosik_entries(visibility,published_at);

CREATE TABLE IF NOT EXISTS sosik_contacts (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL CHECK(organization IN ('church','mission')),
  audience TEXT NOT NULL CHECK(audience IN ('supporters','prayer','fan','missionfund')),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  consent_at TEXT,
  consent_source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','unsubscribed')),
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization,audience,email)
);
CREATE INDEX IF NOT EXISTS idx_sosik_contacts_scope ON sosik_contacts(organization,audience,status);

CREATE TABLE IF NOT EXISTS sosik_publications (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL CHECK(organization IN ('church','mission')),
  audience TEXT NOT NULL CHECK(audience IN ('supporters','prayer','fan','missionfund','site')),
  format TEXT NOT NULL CHECK(format IN ('letter','report','prayer','missionfund')),
  selected_ids_json TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ai_mode TEXT NOT NULL DEFAULT 'template',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sent','submitted')),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sosik_publications_status ON sosik_publications(organization,status,created_at DESC);

CREATE TABLE IF NOT EXISTS sosik_deliveries (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES sosik_publications(id),
  recipient_email TEXT NOT NULL,
  audience TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
  provider_message_id TEXT,
  sent_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(publication_id,recipient_email)
);
CREATE INDEX IF NOT EXISTS idx_sosik_delivery_duplicates ON sosik_deliveries(recipient_email,audience,payload_fingerprint,status);

CREATE TABLE IF NOT EXISTS sosik_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  event TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sosik_test_unsubscribes (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  used_at TEXT
);

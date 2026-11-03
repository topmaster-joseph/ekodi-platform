-- EKODI Journal: additive, private editorial draft ledger.
-- Never exposed by Journal's public Worker or as an approved publication.
CREATE TABLE IF NOT EXISTS journal_private_editorial_drafts (
  slug TEXT PRIMARY KEY NOT NULL CHECK(length(slug) BETWEEN 3 AND 80),
  source_revision TEXT,
  packet_json TEXT NOT NULL CHECK(length(packet_json) BETWEEN 32 AND 28000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  request_id TEXT NOT NULL UNIQUE,
  updated_by_hash TEXT NOT NULL CHECK(length(updated_by_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS journal_private_editorial_drafts_recent
  ON journal_private_editorial_drafts(updated_at DESC);

CREATE TABLE IF NOT EXISTS journal_private_editorial_audit (
  request_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  action TEXT NOT NULL CHECK(action IN ('draft_saved')),
  actor_hash TEXT NOT NULL CHECK(length(actor_hash) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY(slug) REFERENCES journal_private_editorial_drafts(slug)
);
CREATE INDEX IF NOT EXISTS journal_private_editorial_audit_slug
  ON journal_private_editorial_audit(slug, revision DESC);

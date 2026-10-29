-- EKODI Publishing private audit and outbox. Apply only to the isolated
-- Publishing D1 after 001_private_scheduled_editions.sql via protected migration.
-- No public/consumer or customer data belongs in these tables.
CREATE TABLE IF NOT EXISTS publishing_release_audit (
  edition_id TEXT NOT NULL REFERENCES publishing_private_editions(edition_id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  transition TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  release_digest TEXT NOT NULL,
  recorded_at_utc TEXT NOT NULL,
  PRIMARY KEY (edition_id, revision)
);
CREATE INDEX IF NOT EXISTS publishing_release_audit_time_idx
  ON publishing_release_audit(recorded_at_utc);

CREATE TABLE IF NOT EXISTS publishing_release_outbox (
  event_key TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES publishing_private_editions(edition_id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  release_digest TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type='publishing.edition.state.v1'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at_utc TEXT NOT NULL,
  delivered_at_utc TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  UNIQUE (edition_id,revision)
);
CREATE INDEX IF NOT EXISTS publishing_release_outbox_pending_idx
  ON publishing_release_outbox(created_at_utc,edition_id)
  WHERE delivered_at_utc IS NULL;

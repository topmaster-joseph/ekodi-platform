-- EKODI PUBLISHING — PRIVATE completed edition + scheduled release ledger.
-- Publisher-owned isolated D1 only. Do NOT apply to Bookstore/Mall/central auth DB.
-- Migration must be applied by protected EKODI Orchestrator deployment after owner review.
-- No contents/contract/private Google Drive URLs/customer records are stored in these rows.
CREATE TABLE IF NOT EXISTS publishing_private_editions (
  edition_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  release_digest TEXT NOT NULL CHECK (release_digest GLOB 'sha256:*'),
  state TEXT NOT NULL CHECK (state IN (
    'private_registered','scheduled','preparing','prepared','activating',
    'ready_to_release','released','cancelled','blocked')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private','public')),
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (checkout_enabled IN (0,1)),
  publish_at_utc TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (state = 'released' OR (visibility = 'private' AND checkout_enabled = 0)),
  CHECK (state <> 'released' OR (visibility = 'public' AND checkout_enabled = 1)),
  CHECK (state NOT IN ('scheduled','preparing','prepared','activating',
    'ready_to_release','released') OR publish_at_utc IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS publishing_private_editions_due_idx
  ON publishing_private_editions(state,publish_at_utc)
  WHERE state IN ('scheduled','preparing','prepared','activating','ready_to_release');

-- Channel acknowledgements are private to the publisher and are NOT sale authorization.
CREATE TABLE IF NOT EXISTS publishing_release_channel_receipts (
  edition_id TEXT NOT NULL REFERENCES publishing_private_editions(edition_id),
  channel TEXT NOT NULL CHECK (channel IN ('books','ekodimall')),
  stage TEXT NOT NULL CHECK (stage IN ('prepared','activated')),
  release_digest TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  verified_at_utc TEXT NOT NULL,
  PRIMARY KEY (edition_id,channel,stage,release_digest),
  UNIQUE (receipt_id)
);
CREATE INDEX IF NOT EXISTS publishing_release_receipts_by_edition
  ON publishing_release_channel_receipts(edition_id,release_digest);

-- Each state change uses optimistic compare-and-swap; a stale worker may not overwrite
-- an author change or cancellation. Release visibility remains fail-closed in consumers.

-- Publisher-owned private ingestion receipt. Apply ONLY to private D1 after 001/002.
-- No public catalog, checkout, customer identity or manuscript text is stored.
CREATE TABLE IF NOT EXISTS publishing_private_handoff_receipts (
 handoff_id TEXT PRIMARY KEY NOT NULL,
 source_revision TEXT NOT NULL CHECK (source_revision='review-9'),
 manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256)=64),
 actor_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK (state='private-editorial-ingested'),
 object_count INTEGER NOT NULL CHECK (object_count=9),
 receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
 created_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publishing_private_handoff_audit (
 audit_id TEXT PRIMARY KEY NOT NULL,
 handoff_id TEXT NOT NULL REFERENCES publishing_private_handoff_receipts(handoff_id),
 manifest_sha256 TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action='private-r2-readback-verified'),
 created_at_utc TEXT NOT NULL,
 UNIQUE(handoff_id,action)
);

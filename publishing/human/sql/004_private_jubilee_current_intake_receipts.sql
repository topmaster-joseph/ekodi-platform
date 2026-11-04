-- Review-9/review-10 current-candidate manuscript private intake only.
-- Apply to publisher-private D1 after 001/002/003 by an approved, audited release.
-- This schema is NOT a public catalog, a sale authorization, or an ISBN allocation.
CREATE TABLE IF NOT EXISTS publishing_private_current_receipts (
 handoff_id TEXT PRIMARY KEY NOT NULL,
 source_revision TEXT NOT NULL CHECK(source_revision='review-9+review-10'),
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
 actor_id TEXT NOT NULL,
 project1_id TEXT NOT NULL,
 project2_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state='private-editorial-ingested'),
 object_count INTEGER NOT NULL CHECK(object_count=6),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
 created_at_utc TEXT NOT NULL,
 CHECK(project1_id<>project2_id)
);
CREATE TABLE IF NOT EXISTS publishing_private_current_audit (
 audit_id TEXT PRIMARY KEY NOT NULL,
 handoff_id TEXT NOT NULL REFERENCES publishing_private_current_receipts(handoff_id),
 manifest_sha256 TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action='private-r2-readback-verified'),
 created_at_utc TEXT NOT NULL,
 UNIQUE(handoff_id,action)
);

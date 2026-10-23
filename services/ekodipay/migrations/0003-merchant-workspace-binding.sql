-- REFERENCE ONLY: DO NOT APPLY TO PRODUCTION until 0001/0002, verified
-- workspace authority, merchant ownership, migration rollback, and Human Gate.
-- This maps immutable customer_tenants.id (workspace_id), NOT URL slug or host,
-- to each merchant that the workspace is explicitly authorised to operate.
-- Each mapping must have independently verified, server-owned evidence.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ekodipay_merchant_workspace_bindings (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','active','revoked')),
  proof_ref TEXT NOT NULL CHECK(length(proof_ref) BETWEEN 8 AND 100),
  verified_at INTEGER,
  verified_by_ref TEXT,
  PRIMARY KEY (merchant_id, workspace_id),
  CHECK(status <> 'active' OR (verified_at IS NOT NULL AND verified_at > 0
    AND verified_by_ref IS NOT NULL AND length(verified_by_ref) > 0))
);
CREATE INDEX IF NOT EXISTS idx_ekodipay_merchant_workspace
 ON ekodipay_merchant_workspace_bindings(workspace_id, status, merchant_id);
-- No silent reassignment of immutable workspace or merchant ownership.
CREATE TRIGGER IF NOT EXISTS ekodipay_merchant_workspace_identity_immutable
BEFORE UPDATE OF merchant_id,workspace_id,proof_ref,verified_at,verified_by_ref
 ON ekodipay_merchant_workspace_bindings
BEGIN SELECT RAISE(ABORT,'merchant_workspace_identity_immutable'); END;
-- Revocation can be performed by a separately authenticated private financial
-- operator (not this read-only status API); un-revocation must require fresh
-- documentary verification through an independent onboarding process.
CREATE TRIGGER IF NOT EXISTS ekodipay_merchant_workspace_no_reactivation
BEFORE UPDATE OF status ON ekodipay_merchant_workspace_bindings
WHEN OLD.status='revoked' AND NEW.status<>'revoked'
BEGIN SELECT RAISE(ABORT,'revoked_merchant_workspace_requires_new_authorization'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_merchant_workspace_no_delete
BEFORE DELETE ON ekodipay_merchant_workspace_bindings
BEGIN SELECT RAISE(ABORT,'merchant_workspace_binding_delete_forbidden'); END;
-- D1 write admission and proof verification remain the responsibility of an
-- independently authenticated server operator. This is NOT an approval API.

-- FUTURE / PRIVATE ONLY. Append-only bank fingerprint rotation with two independent reviews.
-- NOT deployed automatically. Must be applied after 0001 to private D1 by a protected EKODI release.
-- Server-authenticated merchant owner and independent finance reviewer must be verified before inserting attestations.
-- No raw bank account, account-holder name, payment credential, financial transaction or PG call.

PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ekodipay_bank_change_requests (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  request_ref TEXT NOT NULL,
  old_fingerprint TEXT NOT NULL CHECK(length(old_fingerprint)=64),
  new_fingerprint TEXT NOT NULL CHECK(length(new_fingerprint)=64),
  new_bank_code TEXT NOT NULL CHECK(length(new_bank_code) BETWEEN 2 AND 12),
  new_account_last4 TEXT NOT NULL CHECK(length(new_account_last4)=4),
  new_proof_ref TEXT NOT NULL,
  requested_by_ref TEXT NOT NULL,
  requested_at INTEGER NOT NULL CHECK(requested_at>0),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  PRIMARY KEY(merchant_id,request_ref),
  UNIQUE(merchant_id,new_fingerprint),
  CHECK(old_fingerprint<>new_fingerprint),
  CHECK(expires_at>requested_at),
  CHECK(consumed_at IS NULL OR consumed_at BETWEEN requested_at AND expires_at)
);
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_change_staged_against_actual
BEFORE INSERT ON ekodipay_bank_change_requests
WHEN NOT EXISTS (
 SELECT 1 FROM ekodipay_merchant_bank_verification b
  WHERE b.merchant_id=NEW.merchant_id AND b.account_hmac_fingerprint=NEW.old_fingerprint
    AND b.review_state='verified'
)
BEGIN SELECT RAISE(ABORT,'bank_change_existing_account_mismatch'); END;

CREATE TABLE IF NOT EXISTS ekodipay_bank_change_approvals (
  merchant_id TEXT NOT NULL,
  request_ref TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('merchant_owner','finance_reviewer')),
  reviewer_ref TEXT NOT NULL,
  proof_ref TEXT NOT NULL,
  approved_at INTEGER NOT NULL CHECK(approved_at>0),
  PRIMARY KEY(merchant_id,request_ref,role),
  UNIQUE(merchant_id,request_ref,reviewer_ref),
  FOREIGN KEY(merchant_id,request_ref)
   REFERENCES ekodipay_bank_change_requests(merchant_id,request_ref)
);
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_approval_actor_boundary
BEFORE INSERT ON ekodipay_bank_change_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM ekodipay_bank_change_requests r
  WHERE r.merchant_id=NEW.merchant_id AND r.request_ref=NEW.request_ref
   AND r.consumed_at IS NULL AND NEW.approved_at BETWEEN r.requested_at AND r.expires_at
   AND NEW.reviewer_ref<>r.requested_by_ref
)
BEGIN SELECT RAISE(ABORT,'bank_change_reviewer_or_time_invalid'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_approval_no_edits
BEFORE UPDATE ON ekodipay_bank_change_approvals
BEGIN SELECT RAISE(ABORT,'bank_change_approval_immutable'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_approval_no_deletes
BEFORE DELETE ON ekodipay_bank_change_approvals
BEGIN SELECT RAISE(ABORT,'bank_change_approval_immutable'); END;

CREATE TABLE IF NOT EXISTS ekodipay_bank_change_audit (
  merchant_id TEXT NOT NULL,
  request_ref TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('account_changed','account_revoked')),
  old_fingerprint TEXT NOT NULL CHECK(length(old_fingerprint)=64),
  new_fingerprint TEXT NOT NULL CHECK(length(new_fingerprint)=64),
  verified_by_ref TEXT NOT NULL,
  event_at INTEGER NOT NULL,
  PRIMARY KEY(merchant_id,event_at,event_type)
);
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_audit_no_edits
BEFORE UPDATE ON ekodipay_bank_change_audit
BEGIN SELECT RAISE(ABORT,'bank_change_audit_immutable'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_audit_no_deletes
BEFORE DELETE ON ekodipay_bank_change_audit
BEGIN SELECT RAISE(ABORT,'bank_change_audit_immutable'); END;

-- Only permit a bank-identity update after a matching unconsumed change request
-- signed off by TWO DISTINCT server-authenticated identities.
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_account_update_requires_dual_approval
BEFORE UPDATE ON ekodipay_merchant_bank_verification
WHEN (
 OLD.bank_code<>NEW.bank_code OR
 OLD.account_last4<>NEW.account_last4 OR
 OLD.account_hmac_fingerprint<>NEW.account_hmac_fingerprint OR
 OLD.proof_ref<>NEW.proof_ref OR
 OLD.verified_by_ref<>NEW.verified_by_ref OR
 OLD.verified_at<>NEW.verified_at OR
 OLD.review_state<>NEW.review_state
) AND NOT (
 OLD.review_state='verified' AND NEW.review_state='revoked' AND
 OLD.bank_code=NEW.bank_code AND
 OLD.account_last4=NEW.account_last4 AND
 OLD.account_hmac_fingerprint=NEW.account_hmac_fingerprint AND
 OLD.proof_ref=NEW.proof_ref AND
 OLD.verified_by_ref=NEW.verified_by_ref AND
 OLD.verified_at=NEW.verified_at
)
AND NOT EXISTS (
 SELECT 1 FROM ekodipay_bank_change_requests r
 JOIN ekodipay_bank_change_approvals owner
  ON owner.merchant_id=r.merchant_id AND owner.request_ref=r.request_ref
    AND owner.role='merchant_owner'
 JOIN ekodipay_bank_change_approvals finance
  ON finance.merchant_id=r.merchant_id AND finance.request_ref=r.request_ref
    AND finance.role='finance_reviewer'
 WHERE r.merchant_id=OLD.merchant_id AND r.consumed_at IS NULL
   AND OLD.review_state='verified' AND NEW.review_state='verified'
   AND r.old_fingerprint=OLD.account_hmac_fingerprint
   AND r.new_fingerprint=NEW.account_hmac_fingerprint
   AND r.new_bank_code=NEW.bank_code AND r.new_account_last4=NEW.account_last4
   AND r.new_proof_ref=NEW.proof_ref
   AND owner.reviewer_ref<>finance.reviewer_ref
   AND owner.reviewer_ref<>r.requested_by_ref
   AND finance.reviewer_ref<>r.requested_by_ref
   AND NEW.verified_by_ref=finance.reviewer_ref
   AND NEW.verified_at>=owner.approved_at
   AND NEW.verified_at>=finance.approved_at
   AND NEW.verified_at BETWEEN r.requested_at AND r.expires_at
)
BEGIN SELECT RAISE(ABORT,'bank_change_dual_approval_required'); END;

CREATE TRIGGER IF NOT EXISTS ekodipay_bank_account_never_delete
BEFORE DELETE ON ekodipay_merchant_bank_verification
BEGIN SELECT RAISE(ABORT,'bank_account_deletion_forbidden'); END;

CREATE TRIGGER IF NOT EXISTS ekodipay_bank_account_audit_changed
AFTER UPDATE ON ekodipay_merchant_bank_verification
WHEN OLD.account_hmac_fingerprint<>NEW.account_hmac_fingerprint
BEGIN
 INSERT INTO ekodipay_bank_change_audit(merchant_id,request_ref,event_type,old_fingerprint,new_fingerprint,verified_by_ref,event_at)
 SELECT NEW.merchant_id,r.request_ref,'account_changed',OLD.account_hmac_fingerprint,NEW.account_hmac_fingerprint,NEW.verified_by_ref,NEW.verified_at
  FROM ekodipay_bank_change_requests r
  WHERE r.merchant_id=NEW.merchant_id AND r.old_fingerprint=OLD.account_hmac_fingerprint
   AND r.new_fingerprint=NEW.account_hmac_fingerprint AND r.consumed_at IS NULL;
 UPDATE ekodipay_bank_change_requests SET consumed_at=NEW.verified_at
  WHERE merchant_id=NEW.merchant_id AND old_fingerprint=OLD.account_hmac_fingerprint
   AND new_fingerprint=NEW.account_hmac_fingerprint AND consumed_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_account_audit_revoked
AFTER UPDATE ON ekodipay_merchant_bank_verification
WHEN OLD.review_state='verified' AND NEW.review_state='revoked'
BEGIN
 INSERT INTO ekodipay_bank_change_audit(merchant_id,request_ref,event_type,old_fingerprint,new_fingerprint,verified_by_ref,event_at)
 VALUES(NEW.merchant_id,NULL,'account_revoked',OLD.account_hmac_fingerprint,NEW.account_hmac_fingerprint,NEW.verified_by_ref,NEW.verified_at);
END;

-- Prevent staged requests being altered to retarget their approvals. Only the
-- verified bank-change trigger may consume a request; application credentials
-- must not expose raw SQL access to merchant users.
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_change_request_core_immutable
BEFORE UPDATE OF merchant_id,request_ref,old_fingerprint,new_fingerprint,
 new_bank_code,new_account_last4,new_proof_ref,requested_by_ref,requested_at,expires_at
 ON ekodipay_bank_change_requests
BEGIN SELECT RAISE(ABORT,'bank_change_request_immutable'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_bank_change_request_no_deletes
BEFORE DELETE ON ekodipay_bank_change_requests
BEGIN SELECT RAISE(ABORT,'bank_change_request_immutable'); END;

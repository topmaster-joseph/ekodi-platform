-- Reference-only migration for EKODI Pay tenant-isolated merchant onboarding.
-- NOT auto-executed; release through governed private D1 migration after validation.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ekodipay_merchants (
  merchant_id TEXT PRIMARY KEY,
  legal_entity_ref TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','suspended')),
  pg_provider TEXT NOT NULL DEFAULT 'tosspayments',
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ekodipay_merchant_mid (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  pg_provider TEXT NOT NULL DEFAULT 'tosspayments',
  pg_mode TEXT NOT NULL CHECK(pg_mode IN ('test','live')),
  mid TEXT NOT NULL,
  client_secret_binding_ref TEXT NOT NULL,
  server_secret_binding_ref TEXT NOT NULL,
  verified_at INTEGER,
  proof_ref TEXT,
  PRIMARY KEY(merchant_id,pg_provider,pg_mode),
  UNIQUE(merchant_id,pg_provider,pg_mode,mid),
  UNIQUE(pg_provider,pg_mode,mid),
  UNIQUE(client_secret_binding_ref),
  UNIQUE(server_secret_binding_ref)
);
CREATE TABLE IF NOT EXISTS ekodipay_merchant_bank_verification (
  merchant_id TEXT PRIMARY KEY REFERENCES ekodipay_merchants(merchant_id),
  bank_code TEXT NOT NULL,
  account_last4 TEXT NOT NULL CHECK(length(account_last4)=4),
  account_hmac_fingerprint TEXT NOT NULL UNIQUE CHECK(length(account_hmac_fingerprint)=64),
  proof_ref TEXT NOT NULL,
  verified_by_ref TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  review_state TEXT NOT NULL CHECK(review_state IN ('verified','revoked'))
);
CREATE TABLE IF NOT EXISTS ekodipay_merchant_service_issuers (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  service_id TEXT NOT NULL,
  issuer_ref TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK(is_enabled IN (0,1)),
  proof_ref TEXT,
  PRIMARY KEY(merchant_id,service_id,issuer_ref)
);
CREATE TABLE IF NOT EXISTS ekodipay_merchant_approval_evidence (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  criterion TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','verified','revoked')),
  proof_ref TEXT,
  approved_by_ref TEXT,
  approved_at INTEGER,
  PRIMARY KEY(merchant_id,criterion)
);
CREATE TABLE IF NOT EXISTS ekodipay_approved_orders (
  order_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  service_id TEXT NOT NULL,
  issuer_ref TEXT NOT NULL,
  pg_provider TEXT NOT NULL,
  pg_mode TEXT NOT NULL CHECK(pg_mode IN ('test','live')),
  mid TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency='KRW'),
  amount INTEGER NOT NULL CHECK(amount>=100),
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN
    ('approved','confirming','paid','hold','cancelled','expired')),
  expires_at INTEGER NOT NULL,
  issuer_proof_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(merchant_id,order_id),
  UNIQUE(merchant_id,order_id,pg_mode,mid),
  FOREIGN KEY(merchant_id,service_id,issuer_ref)
    REFERENCES ekodipay_merchant_service_issuers(merchant_id,service_id,issuer_ref),
  FOREIGN KEY(merchant_id,pg_provider,pg_mode,mid)
    REFERENCES ekodipay_merchant_mid(merchant_id,pg_provider,pg_mode,mid)
);
CREATE TRIGGER IF NOT EXISTS ekodipay_approved_order_enabled_issuer
BEFORE INSERT ON ekodipay_approved_orders
WHEN NOT EXISTS (
  SELECT 1 FROM ekodipay_merchant_service_issuers i
   WHERE i.merchant_id=NEW.merchant_id AND i.service_id=NEW.service_id
    AND i.issuer_ref=NEW.issuer_ref AND i.is_enabled=1
)
BEGIN SELECT RAISE(ABORT,'approved_order_issuer_not_enabled'); END;
-- Durable replay protection: a signed issuer claim may reference exactly one
-- immutable approved order. Use atomic INSERT in the protected tenant D1 before
-- any PG confirmation; a HMAC signature alone is never payment authorization.
CREATE TABLE IF NOT EXISTS ekodipay_issuer_nonce_claims (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  issuer_ref TEXT NOT NULL,
  pg_mode TEXT NOT NULL CHECK(pg_mode IN ('test','live')),
  nonce TEXT NOT NULL CHECK(length(nonce) BETWEEN 16 AND 96),
  order_id TEXT NOT NULL UNIQUE REFERENCES ekodipay_approved_orders(order_id),
  payload_digest TEXT NOT NULL CHECK(length(payload_digest)=64),
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY(merchant_id,issuer_ref,pg_mode,nonce)
);
CREATE TRIGGER IF NOT EXISTS ekodipay_nonce_claim_order_matches
BEFORE INSERT ON ekodipay_issuer_nonce_claims
WHEN NOT EXISTS (
  SELECT 1 FROM ekodipay_approved_orders o
  WHERE o.order_id=NEW.order_id AND o.merchant_id=NEW.merchant_id
    AND o.issuer_ref=NEW.issuer_ref AND o.pg_mode=NEW.pg_mode
    AND o.status='approved' AND o.created_at<=NEW.claimed_at
    AND o.expires_at>NEW.claimed_at
)
BEGIN SELECT RAISE(ABORT,'issuer_nonce_order_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS ekodipay_nonce_claim_immutable
BEFORE UPDATE ON ekodipay_issuer_nonce_claims
BEGIN SELECT RAISE(ABORT,'issuer_nonce_immutable'); END;
CREATE INDEX IF NOT EXISTS idx_ekodipay_orders_tenant
 ON ekodipay_approved_orders(merchant_id,service_id,pg_mode,status);
CREATE TRIGGER IF NOT EXISTS ekodipay_approved_order_immutable
BEFORE UPDATE OF merchant_id,service_id,issuer_ref,pg_provider,pg_mode,mid,currency,amount
ON ekodipay_approved_orders
BEGIN SELECT RAISE(ABORT,'approved_order_immutable'); END;
CREATE TABLE IF NOT EXISTS ekodipay_settlement_snapshots (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  pg_mode TEXT NOT NULL CHECK(pg_mode IN ('test','live')),
  mid TEXT NOT NULL,
  transaction_key TEXT NOT NULL,
  payment_key TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES ekodipay_approved_orders(order_id),
  amount INTEGER NOT NULL,
  paid_out_amount INTEGER NOT NULL,
  paid_out_date TEXT NOT NULL,
  provider_evidence_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(merchant_id,pg_mode,transaction_key),
  FOREIGN KEY(merchant_id,order_id,pg_mode,mid)
    REFERENCES ekodipay_approved_orders(merchant_id,order_id,pg_mode,mid)
);
CREATE INDEX IF NOT EXISTS idx_ekodipay_settlement_day
 ON ekodipay_settlement_snapshots(merchant_id,pg_mode,paid_out_date);
CREATE TABLE IF NOT EXISTS ekodipay_reconciliation_runs (
  merchant_id TEXT NOT NULL REFERENCES ekodipay_merchants(merchant_id),
  batch_ref TEXT NOT NULL,
  pg_mode TEXT NOT NULL CHECK(pg_mode IN ('test','live')),
  from_date TEXT NOT NULL,
  through_date TEXT NOT NULL,
  api_pagination_complete INTEGER NOT NULL DEFAULT 0 CHECK(api_pagination_complete IN (0,1)),
  pg_reconciled INTEGER NOT NULL DEFAULT 0 CHECK(pg_reconciled IN (0,1)),
  bank_credit_verified INTEGER NOT NULL DEFAULT 0 CHECK(bank_credit_verified IN (0,1)),
  state TEXT NOT NULL DEFAULT 'requires_review' CHECK(state IN
    ('requires_review','pg_reconciled','bank_verified')),
  verifier_ref TEXT,
  proof_ref TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(merchant_id,batch_ref)
);
-- Never store full bank account numbers, holder PII, PG secret values or CVV.
-- Actual bank credit confirmation requires independent authenticated statement
-- from the same merchant's authorized bank account, not PG projected payout alone.

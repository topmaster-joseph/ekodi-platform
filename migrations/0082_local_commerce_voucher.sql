PRAGMA foreign_keys = ON;

-- EKODI Local Commerce MVP: promotional vouchers/coupons/points only.
-- This namespace never stores bank/card credentials and never transfers cash.
CREATE TABLE IF NOT EXISTS local_commerce_issuers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  issuer_type TEXT NOT NULL CHECK (issuer_type IN ('merchant_association','autonomous_district','institution','organization','school_youth','festival','project')),
  name TEXT NOT NULL,
  symbol_name TEXT NOT NULL DEFAULT '',
  mascot_name TEXT NOT NULL DEFAULT '',
  theme_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','archived')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_issuers_workspace ON local_commerce_issuers(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_local_commerce_issuers_workspace_name ON local_commerce_issuers(workspace_id, name);

CREATE TABLE IF NOT EXISTS local_commerce_programs (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (program_type IN ('voucher','coupon','points','stamp')),
  unit_name TEXT NOT NULL DEFAULT 'P',
  budget_minor INTEGER NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  issued_minor INTEGER NOT NULL DEFAULT 0 CHECK (issued_minor >= 0),
  redeemed_minor INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_minor >= 0),
  cash_value_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cash_value_enabled IN (0,1)),
  payment_adapter TEXT NOT NULL DEFAULT 'disabled',
  settlement_mode TEXT NOT NULL DEFAULT 'promotional_reimbursement' CHECK (settlement_mode IN ('none','promotional_reimbursement')),
  valid_from TEXT,
  valid_to TEXT,
  rules_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_programs_issuer ON local_commerce_programs(issuer_id, status, valid_to);

CREATE TRIGGER IF NOT EXISTS trg_local_commerce_program_budget_guard
BEFORE UPDATE OF issued_minor ON local_commerce_programs
WHEN NEW.budget_minor > 0 AND NEW.issued_minor > NEW.budget_minor
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_program_budget_exceeded');
END;

CREATE TABLE IF NOT EXISTS local_commerce_merchants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  workspace_slug TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  business_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','paused','archived')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_merchants_workspace ON local_commerce_merchants(workspace_id, status);

CREATE TABLE IF NOT EXISTS local_commerce_merchant_enrollments (
  issuer_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','paused','ended')),
  settlement_label TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(issuer_id, merchant_id),
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);

CREATE TABLE IF NOT EXISTS local_commerce_merchant_user_links (
  merchant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'merchant_staff' CHECK (role IN ('merchant_owner','merchant_staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(merchant_id, user_id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_merchant_users ON local_commerce_merchant_user_links(user_id, status);

CREATE TABLE IF NOT EXISTS local_commerce_merchant_requests (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  merchant_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_merchant_requests_issuer ON local_commerce_merchant_requests(issuer_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS local_commerce_wallet_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, program_id),
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(program_id) REFERENCES local_commerce_programs(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_wallet_user ON local_commerce_wallet_accounts(user_id, issuer_id);

CREATE TRIGGER IF NOT EXISTS trg_local_commerce_wallet_nonnegative
BEFORE UPDATE OF balance_minor ON local_commerce_wallet_accounts
WHEN NEW.balance_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_insufficient_balance');
END;

CREATE TABLE IF NOT EXISTS local_commerce_ledger_entries (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('issue','claim','redeem','expire','adjust','reversal')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  balance_after_minor INTEGER NOT NULL CHECK (balance_after_minor >= 0),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('consumer','merchant','accountant','operator','workspace_admin','system')),
  actor_id TEXT NOT NULL,
  merchant_id TEXT,
  transaction_id TEXT,
  related_entry_id TEXT,
  idempotency_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(wallet_id, idempotency_key),
  FOREIGN KEY(wallet_id) REFERENCES local_commerce_wallet_accounts(id),
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(program_id) REFERENCES local_commerce_programs(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_ledger_user ON local_commerce_ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_commerce_ledger_issuer ON local_commerce_ledger_entries(issuer_id, created_at DESC);

-- Every ledger row must exactly describe the wallet transition it creates.
-- This closes stale-read and concurrent redemption races before the wallet update runs.
CREATE TRIGGER IF NOT EXISTS trg_local_commerce_ledger_balance_transition
BEFORE INSERT ON local_commerce_ledger_entries
WHEN NEW.balance_after_minor <> (
  COALESCE((SELECT balance_minor FROM local_commerce_wallet_accounts WHERE id = NEW.wallet_id), -1)
  + NEW.amount_minor
)
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_invalid_balance_transition');
END;

CREATE TRIGGER IF NOT EXISTS trg_local_commerce_ledger_no_update
BEFORE UPDATE ON local_commerce_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_ledger_append_only');
END;
CREATE TRIGGER IF NOT EXISTS trg_local_commerce_ledger_no_delete
BEFORE DELETE ON local_commerce_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_ledger_append_only');
END;

CREATE TABLE IF NOT EXISTS local_commerce_claim_campaigns (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  value_minor INTEGER NOT NULL CHECK (value_minor > 0),
  max_total_claims INTEGER NOT NULL DEFAULT 1 CHECK (max_total_claims > 0),
  claims_count INTEGER NOT NULL DEFAULT 0 CHECK (claims_count >= 0),
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(program_id) REFERENCES local_commerce_programs(id)
);
CREATE TRIGGER IF NOT EXISTS trg_local_commerce_claim_limit
BEFORE UPDATE OF claims_count ON local_commerce_claim_campaigns
WHEN NEW.claims_count > NEW.max_total_claims
BEGIN
  SELECT RAISE(ABORT, 'local_commerce_claim_limit_reached');
END;

CREATE TABLE IF NOT EXISTS local_commerce_claim_redemptions (
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(campaign_id, user_id),
  FOREIGN KEY(campaign_id) REFERENCES local_commerce_claim_campaigns(id),
  FOREIGN KEY(wallet_id) REFERENCES local_commerce_wallet_accounts(id),
  FOREIGN KEY(ledger_entry_id) REFERENCES local_commerce_ledger_entries(id)
);

CREATE TABLE IF NOT EXISTS local_commerce_qr_intents (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consumed','cancelled','expired')),
  created_by_user_id TEXT NOT NULL,
  consumed_by_user_id TEXT,
  transaction_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(program_id) REFERENCES local_commerce_programs(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_qr_merchant ON local_commerce_qr_intents(merchant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS local_commerce_transactions (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  qr_intent_id TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending','batched','reviewed','paid_external','void')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  UNIQUE(user_id, idempotency_key),
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id),
  FOREIGN KEY(program_id) REFERENCES local_commerce_programs(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id),
  FOREIGN KEY(qr_intent_id) REFERENCES local_commerce_qr_intents(id)
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_transactions_issuer ON local_commerce_transactions(issuer_id, settlement_status, created_at DESC);

CREATE TABLE IF NOT EXISTS local_commerce_settlement_batches (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed','paid_external','void')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
  external_reference TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(issuer_id) REFERENCES local_commerce_issuers(id)
);

CREATE TABLE IF NOT EXISTS local_commerce_settlement_items (
  batch_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  PRIMARY KEY(batch_id, transaction_id),
  FOREIGN KEY(batch_id) REFERENCES local_commerce_settlement_batches(id),
  FOREIGN KEY(transaction_id) REFERENCES local_commerce_transactions(id),
  FOREIGN KEY(merchant_id) REFERENCES local_commerce_merchants(id)
);

CREATE TABLE IF NOT EXISTS local_commerce_audit_log (
  id TEXT PRIMARY KEY,
  issuer_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_commerce_audit_issuer ON local_commerce_audit_log(issuer_id, created_at DESC);

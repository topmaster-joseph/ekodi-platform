-- EKODIBIZ Campus AI procurement ledger DRAFT schema.
-- No migration runner automatically applies this file. Owner/security/data review
-- and orchestrator-governed deployment required before any tenant data exists.
-- No card PAN, CVV, provider account password, OTP, chat history or email columns.
-- No SQL permission, API route, payment secret, checkout or charge dispatch.
-- Monetary amounts are the minor unit of KRW, never exchange estimates.

CREATE TABLE IF NOT EXISTS ekodibiz_campus_ai_agreements (
  agreement_id TEXT PRIMARY KEY,
  operator_org TEXT NOT NULL DEFAULT 'EKODIBIZ' CHECK (operator_org='EKODIBIZ'),
  university_workspace_id TEXT NOT NULL,
  provider_code TEXT NOT NULL CHECK (provider_code IN ('openai','anthropic','google')),
  contract_reference TEXT NOT NULL,
  term_start_date TEXT NOT NULL,
  term_months INTEGER NOT NULL DEFAULT 3 CHECK (term_months=3),
  seat_limit INTEGER NOT NULL CHECK (seat_limit BETWEEN 1 AND 100000),
  budget_minor INTEGER NOT NULL CHECK (budget_minor>0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  stage TEXT NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft','compliance_review','supplier_review','ready_for_owner_review','closed')),
  vendor_approval_reference TEXT,
  legal_review_reference TEXT,
  settled_funds_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(university_workspace_id,agreement_id)
);

CREATE TABLE IF NOT EXISTS ekodibiz_campus_ai_participants (
  agreement_id TEXT NOT NULL,
  university_workspace_id TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  consent_receipt_ref TEXT NOT NULL,
  membership_receipt_ref TEXT NOT NULL,
  personal_account_owner_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(personal_account_owner_confirmed IN (0,1)),
  no_password_or_otp_collected INTEGER NOT NULL DEFAULT 0 CHECK(no_password_or_otp_collected IN (0,1)),
  no_forced_workspace_merge INTEGER NOT NULL DEFAULT 1 CHECK(no_forced_workspace_merge=1),
  stage TEXT NOT NULL DEFAULT 'pending_review' CHECK(stage IN ('pending_review','eligible_for_review','terminated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(agreement_id,subject_ref),
  FOREIGN KEY(university_workspace_id,agreement_id)
    REFERENCES ekodibiz_campus_ai_agreements(university_workspace_id,agreement_id)
);

CREATE TABLE IF NOT EXISTS ekodibiz_campus_ai_cycle_previews (
  agreement_id TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  cycle_index INTEGER NOT NULL CHECK(cycle_index BETWEEN 0 AND 2),
  quote_minor INTEGER NOT NULL CHECK(quote_minor>0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency='KRW'),
  due_date TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','review_required','rejected','canceled')),
  review_receipt_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(agreement_id,subject_ref,cycle_index),
  FOREIGN KEY(agreement_id,subject_ref)
    REFERENCES ekodibiz_campus_ai_participants(agreement_id,subject_ref)
);

CREATE TABLE IF NOT EXISTS ekodibiz_campus_ai_termination_proofs (
  agreement_id TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  provider_cancellation_receipt TEXT NOT NULL,
  cancellation_confirmed_at TEXT NOT NULL,
  owner_account_preserved INTEGER NOT NULL CHECK(owner_account_preserved=1),
  created_at TEXT NOT NULL,
  PRIMARY KEY(agreement_id,subject_ref),
  FOREIGN KEY(agreement_id,subject_ref)
    REFERENCES ekodibiz_campus_ai_participants(agreement_id,subject_ref)
);

CREATE INDEX IF NOT EXISTS idx_ekodibiz_campus_ai_agreements_workspace
  ON ekodibiz_campus_ai_agreements(university_workspace_id,stage);
CREATE INDEX IF NOT EXISTS idx_ekodibiz_campus_ai_participants_termination
  ON ekodibiz_campus_ai_participants(agreement_id,stage);
CREATE INDEX IF NOT EXISTS idx_ekodibiz_campus_ai_cycle_preview_state
  ON ekodibiz_campus_ai_cycle_previews(agreement_id,stage,due_date);

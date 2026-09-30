-- EKODI shared payment / receipt confirmation ledger.
-- Payment and receipt are separate documents that may share one transaction_id.
-- This is fact-confirmation evidence and does not replace statutory tax documents.

CREATE TABLE IF NOT EXISTS confirmation_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('payment','receipt')),
  transaction_id TEXT NOT NULL,
  document_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmation_pending','confirmed','issued','cancelled')),
  value_type TEXT NOT NULL DEFAULT 'money' CHECK (value_type IN ('money','goods','service','support','other')),
  amount_decimal TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'KRW',
  value_description TEXT NOT NULL DEFAULT '',
  payer_name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'other' CHECK (method IN ('bank_transfer','cash','card','goods','service','other')),
  occurred_at TEXT NOT NULL,
  acceptance_token_hash TEXT,
  acceptance_expires_at TEXT,
  confirmed_at TEXT,
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  public_id TEXT UNIQUE,
  document_hash TEXT NOT NULL DEFAULT '',
  issued_at TEXT,
  issued_by TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT,
  cancelled_by TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_confirmation_workspace_kind_status
  ON confirmation_records(workspace_id,kind,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_confirmation_transaction
  ON confirmation_records(workspace_id,transaction_id,kind);
CREATE INDEX IF NOT EXISTS idx_confirmation_acceptance
  ON confirmation_records(acceptance_token_hash);
CREATE INDEX IF NOT EXISTS idx_confirmation_public
  ON confirmation_records(public_id);

CREATE TABLE IF NOT EXISTS confirmation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (confirmation_id) REFERENCES confirmation_records(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_confirmation_events_record
  ON confirmation_events(confirmation_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_confirmation_events_workspace
  ON confirmation_events(workspace_id,created_at DESC);

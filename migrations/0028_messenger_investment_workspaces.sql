-- Additive workspace ledgers for EKODI Messenger and Investment.
-- These tables intentionally contain no provider credentials, payment instruments,
-- securities execution fields, custody balances, or guaranteed-return fields.

CREATE TABLE IF NOT EXISTS messenger_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_human','resolved','archived')),
  target_service TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messenger_threads_subject_idx ON messenger_threads(subject_type,subject_key,updated_at DESC);
CREATE INDEX IF NOT EXISTS messenger_threads_owner_idx ON messenger_threads(owner_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS messenger_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  author_kind TEXT NOT NULL DEFAULT 'human' CHECK (author_kind IN ('human','ai','system','agent')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messenger_messages_thread_idx ON messenger_messages(thread_id,id ASC);

CREATE TABLE IF NOT EXISTS messenger_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'manager',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','closed','cancelled')),
  assigned_to_user_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messenger_handoffs_thread_idx ON messenger_handoffs(thread_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS investment_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  stage TEXT NOT NULL DEFAULT 'inbox' CHECK (stage IN ('inbox','screening','diligence','memo','watch','declined','connected')),
  summary TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  thesis TEXT NOT NULL DEFAULT '',
  risk_summary TEXT NOT NULL DEFAULT '',
  memo_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_opportunities_subject_idx ON investment_opportunities(subject_type,subject_key,updated_at DESC);
CREATE INDEX IF NOT EXISTS investment_opportunities_owner_idx ON investment_opportunities(owner_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS investment_diligence_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES investment_opportunities(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','verified','concern','not_applicable')),
  evidence_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_diligence_opportunity_idx ON investment_diligence_items(opportunity_id,status,id ASC);

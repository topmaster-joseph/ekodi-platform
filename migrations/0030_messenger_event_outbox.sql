-- Canonical asynchronous event backbone for EKODI Messenger.
-- Messages remain the source of truth. AI, operator notifications and channel delivery
-- consume this outbox independently so provider latency cannot block message writes.

CREATE TABLE IF NOT EXISTS messenger_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messenger_messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  consumer TEXT NOT NULL DEFAULT 'assistant',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messenger_outbox_pending_idx
  ON messenger_outbox(status,consumer,available_at,id);
CREATE INDEX IF NOT EXISTS messenger_outbox_thread_idx
  ON messenger_outbox(thread_id,id DESC);

CREATE TABLE IF NOT EXISTS messenger_identity_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principal_id TEXT NOT NULL,
  principal_kind TEXT NOT NULL,
  auth_provider TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  capability TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messenger_identity_audit_principal_idx
  ON messenger_identity_audit(principal_id,created_at DESC);

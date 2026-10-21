CREATE TABLE IF NOT EXISTS mail_intelligence_messages (
  gmail_id TEXT PRIMARY KEY,
  thread_id TEXT,
  received_at TEXT,
  sender TEXT,
  recipients_json TEXT NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'people_org',
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 0 AND 3),
  action_required INTEGER NOT NULL DEFAULT 0 CHECK(action_required IN (0,1)),
  action_text TEXT NOT NULL DEFAULT '',
  suppressed INTEGER NOT NULL DEFAULT 0 CHECK(suppressed IN (0,1)),
  suppression_reason TEXT NOT NULL DEFAULT '',
  status_signature TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL DEFAULT '',
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mail_intelligence_received ON mail_intelligence_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_intelligence_priority ON mail_intelligence_messages(priority, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_intelligence_action ON mail_intelligence_messages(action_required, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_intelligence_dedupe ON mail_intelligence_messages(dedupe_key, notified_at);

CREATE TABLE IF NOT EXISTS mail_intelligence_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

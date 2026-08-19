-- Canonical Messenger extensions for AI-first assistance, human operator audit,
-- and external channel adapters. The existing messenger_threads/messages/handoffs
-- remain the single conversation ledger.

CREATE TABLE IF NOT EXISTS messenger_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messenger_events_thread_idx
  ON messenger_events(thread_id,id DESC);

CREATE TABLE IF NOT EXISTS messenger_channel_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('kakao','whatsapp','telegram','email','sms')),
  external_thread_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','failed','closed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(thread_id,channel)
);
CREATE INDEX IF NOT EXISTS messenger_channel_links_thread_idx
  ON messenger_channel_links(thread_id,status,updated_at DESC);

-- Realtime chat, participant camera requests, and moderated presenter promotion.
CREATE TABLE IF NOT EXISTS realtime_chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_realtime_chat_room_time
  ON realtime_chat_messages(tenant_id, room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_realtime_chat_actor_time
  ON realtime_chat_messages(room_id, actor_key, created_at);

CREATE TABLE IF NOT EXISTS realtime_participation_requests (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  decided_by TEXT,
  UNIQUE(room_id, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_realtime_participation_room_status
  ON realtime_participation_requests(tenant_id, room_id, status, requested_at);

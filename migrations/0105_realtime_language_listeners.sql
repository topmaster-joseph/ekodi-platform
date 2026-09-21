-- Listener language preferences for viewer/participant simultaneous-interpretation demand.
CREATE TABLE IF NOT EXISTS realtime_language_listeners (
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  language_code TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_realtime_language_listeners_room_language
  ON realtime_language_listeners(tenant_id, room_id, language_code, updated_at);

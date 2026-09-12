CREATE TABLE IF NOT EXISTS realtime_media_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','cohost','presenter','participant','viewer')),
  provider TEXT NOT NULL DEFAULT 'cloudflare-realtime',
  provider_session_id TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closing','closed','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_session_id)
);

CREATE INDEX IF NOT EXISTS idx_realtime_media_sessions_room
  ON realtime_media_sessions(tenant_id, room_id, status);

CREATE TABLE IF NOT EXISTS realtime_media_tracks (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  publisher_session_id TEXT NOT NULL,
  track_name TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('audio','video')),
  source_type TEXT NOT NULL DEFAULT 'camera' CHECK (source_type IN ('camera','microphone','screen','program','translation')),
  language_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closing','closed','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, publisher_session_id, track_name)
);

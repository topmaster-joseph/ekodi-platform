-- Room-scoped, short-lived administrator-controlled mobile camera sources.
CREATE TABLE IF NOT EXISTS realtime_camera_source_invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','revoked','used','expired')),
  claimed_source_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_realtime_camera_invites_room ON realtime_camera_source_invites(room_id,status,expires_at);
CREATE TABLE IF NOT EXISTS realtime_camera_sources (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  invite_id TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','revoked','connected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_realtime_camera_sources_room ON realtime_camera_sources(room_id,status);

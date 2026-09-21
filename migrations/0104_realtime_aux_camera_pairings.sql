-- One-time, host-approved auxiliary camera pairing for EKODI Live.
CREATE TABLE IF NOT EXISTS realtime_camera_pairings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','approved','revoked','expired')),
  claim_hash TEXT,
  device_name TEXT NOT NULL DEFAULT '',
  media_session_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  approved_at TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_camera_pairings_room
  ON realtime_camera_pairings(tenant_id, room_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_realtime_camera_pairings_code
  ON realtime_camera_pairings(code, expires_at);

-- Short-lived QR pairing for management-only broadcast cameras.
CREATE TABLE IF NOT EXISTS realtime_management_camera_pairs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  pairing_hash TEXT NOT NULL UNIQUE,
  device_key_hash TEXT,
  label TEXT NOT NULL DEFAULT '관리 카메라',
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','pending','approved','connected','revoked','expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_at TEXT,
  approved_at TEXT,
  connected_at TEXT,
  revoked_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_management_camera_room
  ON realtime_management_camera_pairs(tenant_id, room_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_realtime_management_camera_expiry
  ON realtime_management_camera_pairs(expires_at, status);

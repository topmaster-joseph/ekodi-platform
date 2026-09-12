CREATE TABLE IF NOT EXISTS realtime_rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('public_broadcast','webinar','meeting','interpretation','consultation','education','worship','commerce')),
  security_profile TEXT NOT NULL DEFAULT 'standard' CHECK (security_profile IN ('standard','restricted','e2ee')),
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','starting','live','ending','ended','failed')),
  ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_enabled IN (0,1)),
  recording_enabled INTEGER NOT NULL DEFAULT 0 CHECK (recording_enabled IN (0,1)),
  recording_notice_enabled INTEGER NOT NULL DEFAULT 0 CHECK (recording_notice_enabled IN (0,1)),
  anonymous_viewers_enabled INTEGER NOT NULL DEFAULT 1 CHECK (anonymous_viewers_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_realtime_rooms_tenant_status ON realtime_rooms(tenant_id, status);

CREATE TABLE IF NOT EXISTS realtime_room_members (
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','cohost','presenter','participant','viewer')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_realtime_room_members_tenant ON realtime_room_members(tenant_id, room_id);

CREATE TABLE IF NOT EXISTS realtime_language_channels (
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','starting','active','degraded','stopping','failed')),
  listener_count INTEGER NOT NULL DEFAULT 0 CHECK (listener_count >= 0),
  provider_key TEXT,
  last_latency_ms INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, language_code)
);

CREATE TABLE IF NOT EXISTS realtime_recordings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting' CHECK (status IN ('starting','recording','stopping','ready','failed','deleted')),
  storage_key TEXT,
  checksum_sha256 TEXT,
  retention_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_recordings_room ON realtime_recordings(tenant_id, room_id, created_at);

CREATE TABLE IF NOT EXISTS realtime_destinations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','connecting','live','retrying','degraded','failed','stopped')),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_destinations_room ON realtime_destinations(tenant_id, room_id);

CREATE TABLE IF NOT EXISTS realtime_usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  language_code TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'event',
  cost_microusd INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_usage_tenant_time ON realtime_usage_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS realtime_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed','denied','failed')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_audit_tenant_time ON realtime_audit_log(tenant_id, created_at);

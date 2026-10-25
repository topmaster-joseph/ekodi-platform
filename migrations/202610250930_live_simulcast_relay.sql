-- EKODI-SIMULCAST-RELAY-001: EKODI-owned simulcast through the Device Agent.
-- Additive only. Stream keys never stored here (masked hint only).
CREATE TABLE IF NOT EXISTS live_relay_bindings (
  tenant_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  bound_by TEXT,
  bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  armed INTEGER NOT NULL DEFAULT 0 CHECK (armed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS live_relay_destinations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  preset TEXT NOT NULL DEFAULT 'custom',
  ingest_host TEXT NOT NULL DEFAULT '',
  key_hint TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  command_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_relay_destinations_tenant ON live_relay_destinations(tenant_id, created_at);

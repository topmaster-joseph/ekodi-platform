-- EKODI-NOTIFICATION-HEALTH-AUDIT-001: persisted 10-minute topic health checks.
-- Privacy: aggregate metrics only; no subscriber identifiers, endpoints, credentials or payload bodies.
-- This is NOT permission to activate Web Push or send any additional alerts.
CREATE TABLE IF NOT EXISTS notification_health_snapshots (
  topic TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('attention','configuration_required','unverified','push_paused','queue_clear')),
  subscriber_devices INTEGER NOT NULL DEFAULT 0,
  events_24h INTEGER NOT NULL DEFAULT 0,
  failed_24h INTEGER NOT NULL DEFAULT 0,
  stalled INTEGER NOT NULL DEFAULT 0,
  events_overdue INTEGER NOT NULL DEFAULT 0,
  publisher_ready INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  consecutive_attention INTEGER NOT NULL DEFAULT 0
);

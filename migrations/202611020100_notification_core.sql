-- EKODI notification core: opt-in delivery, tenant-scoped topics and audited event outbox.
-- No recipients are imported, no marketing consent is inferred, no sending without secrets.
CREATE TABLE IF NOT EXISTS notification_devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);
CREATE INDEX IF NOT EXISTS notification_devices_active_idx
  ON notification_devices(disabled_at, updated_at);
CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_path TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fanout','done')),
  CHECK(length(title) BETWEEN 1 AND 100),
  CHECK(length(body) BETWEEN 1 AND 240)
);
CREATE INDEX IF NOT EXISTS notification_events_due_idx ON notification_events(status, scheduled_at);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  event_id TEXT NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES notification_devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  locked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  delivered_at TEXT,
  PRIMARY KEY(event_id,device_id)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_due_idx ON notification_deliveries(status,next_attempt_at);

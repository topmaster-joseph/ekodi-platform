-- Promote EKODI API and Biz from legacy unmonitored seed state into the live Core fleet.
-- Existing administrator overrides are preserved: only untouched legacy rows are upgraded.

INSERT OR IGNORE INTO service_controls
  (service_id, state, monitor_enabled, note, updated_at, updated_by)
VALUES
  ('api', 'active', 1, '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL),
  ('biz', 'active', 1, '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL);

UPDATE service_controls
SET state = 'active',
    monitor_enabled = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE service_id = 'api'
  AND state = 'active'
  AND monitor_enabled = 0
  AND COALESCE(note, '') = ''
  AND updated_by IS NULL;

UPDATE service_controls
SET state = 'active',
    monitor_enabled = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE service_id = 'biz'
  AND state = 'planned'
  AND monitor_enabled = 0
  AND COALESCE(note, '') = ''
  AND updated_by IS NULL;

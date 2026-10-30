-- EKODI GitHub Control: event ingress is observation-only.
-- Do not store GitHub payloads, tokens, users or issue body.
CREATE TABLE IF NOT EXISTS github_operations_webhook_events (
  delivery_id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  repository TEXT NOT NULL CHECK(repository = 'topmaster-joseph/ekodi-platform'),
  installation_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_action TEXT NOT NULL,
  head_sha TEXT,
  source_number INTEGER,
  priority INTEGER NOT NULL DEFAULT 50,
  state TEXT NOT NULL DEFAULT 'observed',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS github_operations_events_time_idx
  ON github_operations_webhook_events(created_at DESC);
CREATE TABLE IF NOT EXISTS github_operations_jobs (
  operation_key TEXT PRIMARY KEY REFERENCES github_operations_webhook_events(operation_key),
  repository TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind = 'observation_only'),
  priority INTEGER NOT NULL DEFAULT 50,
  state TEXT NOT NULL CHECK(state IN ('queued', 'observed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS github_operations_jobs_state_priority_idx
  ON github_operations_jobs(state, priority, created_at);

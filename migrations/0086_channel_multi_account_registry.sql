-- Bind a pre-registered external account row to a one-time channel OAuth state.
-- Keep the binding in an additive sidecar table so retries remain idempotent even after a partial D1 migration.
CREATE TABLE IF NOT EXISTS marketing_oauth_state_registry (
  state TEXT PRIMARY KEY,
  registry_connection_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_oauth_state_registry_connection
  ON marketing_oauth_state_registry(registry_connection_id, created_at);

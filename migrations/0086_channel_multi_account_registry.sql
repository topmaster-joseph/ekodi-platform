-- Bind a pre-registered external account row to a one-time channel OAuth state.
-- Credentials remain in the encrypted marketing OAuth vault; this stores only a registry reference.
ALTER TABLE marketing_oauth_states
  ADD COLUMN registry_connection_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_marketing_oauth_states_registry
  ON marketing_oauth_states(registry_connection_id, provider, created_at);

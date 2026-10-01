-- EKODI-AI-PROVIDER-ROUTING-EVIDENCE-001
-- Add an append-only operational ledger for provider routing decisions.
-- This records why a provider was attempted, skipped, failed, or selected without storing prompts or secrets.

CREATE TABLE IF NOT EXISTS ai_provider_routing_events (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  previous_provider TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_provider_routing_events_created_idx
  ON ai_provider_routing_events(created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_routing_events_provider_idx
  ON ai_provider_routing_events(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_routing_events_capability_idx
  ON ai_provider_routing_events(capability, created_at DESC);

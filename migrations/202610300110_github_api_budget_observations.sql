-- EKODI Orchestrator read-only GitHub REST quota telemetry foundation.
-- No credentials, response bodies, actors, request URLs or IP addresses.
-- Absence of verified GitHub response data must display as unknown.
CREATE TABLE IF NOT EXISTS github_operations_api_budgets (
  installation_id INTEGER NOT NULL CHECK(installation_id > 0),
  resource TEXT NOT NULL CHECK(resource IN (
    'core','search','graphql','integration_manifest','source_import',
    'code_scanning_upload','actions_runner_registration','audit_log','code_search'
  )),
  limit_value INTEGER NOT NULL CHECK(limit_value >= 0),
  remaining_value INTEGER NOT NULL CHECK(remaining_value >= 0 AND remaining_value <= limit_value),
  reset_at_ms INTEGER NOT NULL CHECK(reset_at_ms > 0),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms > 0),
  blocked_until_ms INTEGER NOT NULL DEFAULT 0 CHECK(blocked_until_ms >= 0),
  evidence_kind TEXT NOT NULL DEFAULT 'verified_response'
    CHECK(evidence_kind = 'verified_response'),
  PRIMARY KEY (installation_id, resource)
);
CREATE INDEX IF NOT EXISTS github_operations_api_budget_freshness_idx
  ON github_operations_api_budgets(observed_at_ms DESC);

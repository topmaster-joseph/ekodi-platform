-- Internal EKODI short-lived API admission ledger; no token, actor or payload.
-- Disabled until an owner-provisioned authenticated GitHub App reporter exists.
CREATE TABLE IF NOT EXISTS github_operations_api_admissions (
  operation_key TEXT PRIMARY KEY CHECK(length(operation_key)=64),
  installation_id INTEGER NOT NULL CHECK(installation_id>0),
  resource TEXT NOT NULL CHECK(resource IN (
    'core','search','graphql','integration_manifest','source_import',
    'code_scanning_upload','actions_runner_registration','audit_log','code_search'
  )),
  head_sha TEXT NOT NULL CHECK(length(head_sha)=40),
  unit_cost INTEGER NOT NULL CHECK(unit_cost BETWEEN 1 AND 5),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms>0),
  admitted_at_ms INTEGER NOT NULL CHECK(admitted_at_ms>0),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>admitted_at_ms)
);
CREATE INDEX IF NOT EXISTS github_operations_api_admissions_capacity_idx
  ON github_operations_api_admissions(installation_id,resource,admitted_at_ms,expires_at_ms);

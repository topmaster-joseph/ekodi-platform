CREATE TABLE IF NOT EXISTS ai_control_workload_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace','platform_service')),
  scope_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  source_service_id TEXT NOT NULL,
  source_adapter_id TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  plan_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned',
  accepted_by TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  CHECK (
    (scope_type = 'workspace' AND workspace_id <> '' AND lower(scope_id) = lower(workspace_id))
    OR
    (scope_type = 'platform_service' AND workspace_id = '' AND lower(scope_id) = lower(source_service_id))
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_control_workload_scope
  ON ai_control_workload_events(scope_type, scope_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_control_workload_workspace
  ON ai_control_workload_events(workspace_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_control_workload_type
  ON ai_control_workload_events(event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_control_workload_state
  ON ai_control_workload_events(state, received_at DESC);

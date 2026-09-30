-- EKODI AI Account Node least-loaded local scheduler telemetry.
-- New/legacy nodes remain ineligible until a current agent explicitly reports desktop eligibility.

ALTER TABLE ai_control_nodes ADD COLUMN current_load INTEGER NOT NULL DEFAULT 100;
ALTER TABLE ai_control_nodes ADD COLUMN cpu_load_pct INTEGER NOT NULL DEFAULT 100;
ALTER TABLE ai_control_nodes ADD COLUMN memory_used_pct INTEGER NOT NULL DEFAULT 100;
ALTER TABLE ai_control_nodes ADD COLUMN max_concurrency INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ai_control_nodes ADD COLUMN is_portable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ai_control_nodes ADD COLUMN auto_execution_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_control_nodes ADD COLUMN system_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ai_nodes_scheduler
  ON ai_control_nodes(state, auto_execution_eligible, last_seen_at DESC, current_load ASC);

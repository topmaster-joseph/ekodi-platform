-- Fair bounded rotation for EKODI Orchestrator completion reconciliation.
-- A candidate is stamped when selected, so deferred stale tasks cannot occupy
-- every future LIMIT 50 batch and starve newly completed deployments.

ALTER TABLE ekodi_orchestrator_tasks ADD COLUMN reconciliation_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_ekodi_orchestrator_tasks_reconciliation_rotation
  ON ekodi_orchestrator_tasks(reconciliation_checked_at, updated_at DESC);

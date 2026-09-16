-- EKODI Orchestrator authoritative task lifecycle (Issue #1784)
-- Additive only: existing v8 command ledger remains compatible while the
-- Orchestrator gains a durable execution-owner state model.

CREATE TABLE IF NOT EXISTS ekodi_orchestrator_tasks (
  task_id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  requester_id TEXT,
  source TEXT NOT NULL DEFAULT 'ekodi',
  intent TEXT NOT NULL,
  target_json TEXT NOT NULL DEFAULT '{}',
  risk TEXT NOT NULL DEFAULT 'normal',
  permission_class TEXT NOT NULL DEFAULT 'delegated',
  assigned_worker TEXT,
  branch_ref TEXT,
  pr_ref TEXT,
  state TEXT NOT NULL DEFAULT 'received' CHECK (state IN (
    'received','triaged','assigned','executing','validating','pr_gates',
    'staging','deploying','production_verifying','completed','blocked','failed','cancelled'
  )),
  state_version INTEGER NOT NULL DEFAULT 1,
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TEXT,
  dead_letter_reason TEXT,
  deployment_requested INTEGER NOT NULL DEFAULT 0,
  production_evidence_json TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ekodi_orchestrator_tasks_state
  ON ekodi_orchestrator_tasks(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ekodi_orchestrator_tasks_worker
  ON ekodi_orchestrator_tasks(assigned_worker, lease_expires_at);

CREATE TABLE IF NOT EXISTS ekodi_orchestrator_task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, seq),
  FOREIGN KEY(task_id) REFERENCES ekodi_orchestrator_tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ekodi_orchestrator_task_events_task
  ON ekodi_orchestrator_task_events(task_id, seq DESC);

-- Importable transport linkage. GitHub issues/PRs are evidence/transports,
-- never the authority for task completion.
CREATE TABLE IF NOT EXISTS ekodi_orchestrator_external_refs (
  task_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(task_id, provider, ref_type, ref_value),
  FOREIGN KEY(task_id) REFERENCES ekodi_orchestrator_tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS autonomous_evolution_cycles (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  current_generation INTEGER NOT NULL DEFAULT 10,
  lifecycle_total INTEGER NOT NULL DEFAULT 0,
  research_verified INTEGER NOT NULL DEFAULT 0,
  experiments_ready INTEGER NOT NULL DEFAULT 0,
  experiments_passed INTEGER NOT NULL DEFAULT 0,
  candidates_ready INTEGER NOT NULL DEFAULT 0,
  post_change_verified INTEGER NOT NULL DEFAULT 0,
  rollback_required INTEGER NOT NULL DEFAULT 0,
  learning_closed INTEGER NOT NULL DEFAULT 0,
  production_mutation INTEGER NOT NULL DEFAULT 0,
  authority_expanded INTEGER NOT NULL DEFAULT 0,
  automatic_promotion INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autonomous_evolution_cycles_generated
  ON autonomous_evolution_cycles(generated_at DESC);

CREATE TABLE IF NOT EXISTS autonomous_evolution_records (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  research_id TEXT,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  research_verified INTEGER NOT NULL DEFAULT 0,
  experiment_ready INTEGER NOT NULL DEFAULT 0,
  experiment_passed INTEGER NOT NULL DEFAULT 0,
  candidate_ready INTEGER NOT NULL DEFAULT 0,
  post_change_verified INTEGER NOT NULL DEFAULT 0,
  rollback_required INTEGER NOT NULL DEFAULT 0,
  learning_closed INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES autonomous_evolution_cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_autonomous_evolution_records_cycle
  ON autonomous_evolution_records(cycle_id, status);

CREATE INDEX IF NOT EXISTS idx_autonomous_evolution_records_research
  ON autonomous_evolution_records(research_id, created_at DESC);

-- EKODI Evolution Kernel resource metadata registry
-- Additive only. No existing table or data is mutated.

CREATE TABLE IF NOT EXISTS evolution_kernel_resources (
  id TEXT PRIMARY KEY,
  resource_kind TEXT NOT NULL,
  canonical_source TEXT NOT NULL,
  version TEXT NOT NULL,
  owner TEXT NOT NULL,
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  effective_at TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evolution_kernel_resources_kind
  ON evolution_kernel_resources(resource_kind);

CREATE INDEX IF NOT EXISTS idx_evolution_kernel_resources_lifecycle
  ON evolution_kernel_resources(lifecycle_state, verification_state);

CREATE TABLE IF NOT EXISTS evolution_kernel_baselines (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  version TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  promoted_by TEXT NOT NULL,
  promoted_at TEXT NOT NULL,
  rollback_version TEXT,
  FOREIGN KEY(resource_id) REFERENCES evolution_kernel_resources(id)
);

CREATE INDEX IF NOT EXISTS idx_evolution_kernel_baselines_resource
  ON evolution_kernel_baselines(resource_id, promoted_at);

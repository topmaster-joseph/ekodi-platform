-- EKODI Execution Fabric global control gate.
-- Existing behavior remains enabled when this row is absent; this seed preserves that compatibility.

CREATE TABLE IF NOT EXISTS hybrid_execution_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

INSERT OR IGNORE INTO hybrid_execution_settings (id, enabled, updated_at, updated_by)
VALUES (1, 1, CURRENT_TIMESTAMP, NULL);

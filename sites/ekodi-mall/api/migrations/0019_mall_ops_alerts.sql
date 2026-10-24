-- EKODI-MALL-OPS-ALERTS-001: problems the autonomous lane surfaces to the operator cockpit.
CREATE TABLE IF NOT EXISTS mall_ops_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','error')),
  kind TEXT NOT NULL,
  order_id TEXT,
  product_id TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mall_ops_alerts_open ON mall_ops_alerts(status, kind, order_id);

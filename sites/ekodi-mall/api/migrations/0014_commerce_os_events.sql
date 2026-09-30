CREATE TABLE IF NOT EXISTS commerce_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('green','amber','red')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mall_commerce_events_time
  ON commerce_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_commerce_events_aggregate
  ON commerce_events(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_commerce_events_risk
  ON commerce_events(risk_class, occurred_at DESC);
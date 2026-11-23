-- PII-free, idempotent QTIN paid-order operator notice outbox.
-- Only the verified live Toss DONE -> paid transition may enqueue.
CREATE TABLE IF NOT EXISTS qtin_operator_notice_outbox (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qtin_operator_notice_due ON qtin_operator_notice_outbox (status, next_attempt_at);

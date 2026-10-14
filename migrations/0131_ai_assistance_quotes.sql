-- EKODIBIZ assistance: immutable merchant quote snapshots and customer review acknowledgments.
-- No payment-authoritative or workflow-start column is writable from the public client.
CREATE TABLE IF NOT EXISTS ai_assistance_quotes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES ai_assistance_requests(id),
  user_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  total_krw INTEGER NOT NULL CHECK(total_krw >= 0 AND total_krw <= 100000000),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency='KRW'),
  vat_included INTEGER NOT NULL DEFAULT 1 CHECK(vat_included=1),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN('issued','acknowledged','void')),
  approved_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  acknowledgment_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_assistance_quotes_member ON ai_assistance_quotes(user_id,issued_at DESC);
CREATE TABLE IF NOT EXISTS ai_assistance_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES ai_assistance_requests(id),
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('quote_issued','quote_acknowledged','quote_voided')),
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_assistance_events_request ON ai_assistance_events(request_id,created_at DESC);

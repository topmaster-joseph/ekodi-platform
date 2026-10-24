-- EKODI Private Wealth autopilot: owner-only policy, operating state, paper ledger and audit trail.
-- Additive only. No broker credential, account number or token is stored here.
-- live_approval_json stays NULL until a separately governed live-trading release adds an approval flow.
CREATE TABLE IF NOT EXISTS investment_autopilot_accounts (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person')),
  subject_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'RESEARCH_ONLY' CHECK (state IN ('RESEARCH_ONLY','PAPER_TRADING','LIVE_PENDING_APPROVAL','LIVE_ACTIVE','PAUSED','EMERGENCY_STOPPED')),
  resume_state TEXT NOT NULL DEFAULT '',
  policy_json TEXT NOT NULL DEFAULT '{}',
  policy_fingerprint TEXT NOT NULL DEFAULT '',
  live_approval_json TEXT,
  disclosure_ack_at TEXT NOT NULL DEFAULT '',
  paper_ledger_json TEXT NOT NULL DEFAULT '{}',
  paper_started_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_type, subject_key)
);

CREATE TABLE IF NOT EXISTS investment_autopilot_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('paper','live')),
  symbol TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty REAL NOT NULL,
  limit_price REAL NOT NULL,
  status TEXT NOT NULL,
  filled_qty REAL NOT NULL DEFAULT 0,
  avg_price REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  risk_allowed INTEGER NOT NULL DEFAULT 0,
  risk_reasons_json TEXT NOT NULL DEFAULT '[]',
  quote_source TEXT NOT NULL DEFAULT '',
  quote_price REAL NOT NULL DEFAULT 0,
  quote_at TEXT NOT NULL DEFAULT '',
  strategy_id TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  trade_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_investment_autopilot_orders_day ON investment_autopilot_orders(subject_type, subject_key, trade_day);

CREATE TABLE IF NOT EXISTS investment_autopilot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_autopilot_events_subject ON investment_autopilot_events(subject_type, subject_key, id);

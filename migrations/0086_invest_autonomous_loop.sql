CREATE TABLE IF NOT EXISTS investment_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow','simulation','limited_live','policy_auto')),
  state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','caution','safe_mode','halt')),
  max_position_pct REAL NOT NULL DEFAULT 10,
  max_daily_loss_pct REAL NOT NULL DEFAULT 2,
  max_leverage REAL NOT NULL DEFAULT 1,
  min_cash_pct REAL NOT NULL DEFAULT 10,
  live_trading_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_trading_enabled IN (0,1)),
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type,subject_key)
);
CREATE TABLE IF NOT EXISTS investment_strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('stock','bond','real_estate','fund','alternative','portfolio')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shadow' CHECK (status IN ('draft','shadow','simulation','paused','retired')),
  policy_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);CREATE TABLE IF NOT EXISTS investment_broker_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  broker_id TEXT NOT NULL,
  account_ref TEXT NOT NULL DEFAULT '',
  credential_ref TEXT NOT NULL DEFAULT '',
  permission_mode TEXT NOT NULL DEFAULT 'read_only' CHECK (permission_mode IN ('read_only','draft_order','user_approved_order','conditional_automation')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','pending','connected','degraded','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type,subject_key,broker_id,account_ref)
);
CREATE TABLE IF NOT EXISTS investment_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  strategy_id INTEGER REFERENCES investment_strategies(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','blocked','simulated','completed','failed','halted')),
  decision_json TEXT NOT NULL DEFAULT '{}',
  risk_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS investment_strategy_subject_idx ON investment_strategies(subject_type,subject_key,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS investment_cycle_subject_idx ON investment_cycles(subject_type,subject_key,id DESC);
CREATE INDEX IF NOT EXISTS investment_broker_subject_idx ON investment_broker_connections(subject_type,subject_key,status,updated_at DESC);
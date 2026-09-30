-- EKODI Invest lifecycle management.
-- Additive only. This schema stores analysis, IR, connection and aftercare records.
-- It intentionally contains no custody balances, securities execution fields,
-- broker credentials, payment instruments, guaranteed-return fields or discretionary mandates.

CREATE TABLE IF NOT EXISTS investment_project_profiles (
  opportunity_id INTEGER PRIMARY KEY REFERENCES investment_opportunities(id) ON DELETE CASCADE,
  project_type TEXT NOT NULL DEFAULT 'project' CHECK (project_type IN ('business','startup','small_business','local','impact','real_estate','project','other')),
  organization_name TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  funding_target INTEGER NOT NULL DEFAULT 0 CHECK (funding_target >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (length(currency) BETWEEN 3 AND 6),
  capital_purpose TEXT NOT NULL DEFAULT '',
  revenue_model TEXT NOT NULL DEFAULT '',
  ir_summary TEXT NOT NULL DEFAULT '',
  milestones_json TEXT NOT NULL DEFAULT '[]',
  review_state TEXT NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft','review_ready','reviewed')),
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_interest_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES investment_opportunities(id) ON DELETE CASCADE,
  counterparty_label TEXT NOT NULL CHECK (length(counterparty_label) BETWEEN 1 AND 180),
  counterparty_type TEXT NOT NULL DEFAULT 'other' CHECK (counterparty_type IN ('person','organization','institution','licensed_provider','other')),
  source TEXT NOT NULL DEFAULT 'owner_recorded' CHECK (source IN ('owner_recorded','external_inquiry','partner_referral')),
  interest_level TEXT NOT NULL DEFAULT 'watch' CHECK (interest_level IN ('watch','request_info','meeting','diligence','declined')),
  ticket_min INTEGER NOT NULL DEFAULT 0 CHECK (ticket_min >= 0),
  ticket_max INTEGER NOT NULL DEFAULT 0 CHECK (ticket_max >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (length(currency) BETWEEN 3 AND 6),
  preferred_sector TEXT NOT NULL DEFAULT '',
  preferred_region TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_interest_opportunity_idx ON investment_interest_records(opportunity_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS investment_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES investment_opportunities(id) ON DELETE CASCADE,
  interest_id INTEGER REFERENCES investment_interest_records(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','contacted','meeting','nda','diligence','connected','closed')),
  next_action TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_connections_opportunity_idx ON investment_connections(opportunity_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS investment_aftercare_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES investment_opportunities(id) ON DELETE CASCADE,
  connection_id INTEGER REFERENCES investment_connections(id) ON DELETE SET NULL,
  report_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'report' CHECK (category IN ('milestone','metric','risk','governance','report')),
  metric_name TEXT NOT NULL DEFAULT '',
  metric_value TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track','watch','attention','closed')),
  evidence_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_aftercare_opportunity_idx ON investment_aftercare_updates(opportunity_id,report_date DESC,id DESC);

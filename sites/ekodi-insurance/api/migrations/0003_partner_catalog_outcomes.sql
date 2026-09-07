PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS insurance_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL CHECK (partner_type IN ('insurer','ga','planner','affiliate','other')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','review','approved','paused','rejected')),
  agreement_status TEXT NOT NULL DEFAULT 'none' CHECK (agreement_status IN ('none','review','signed','expired')),
  feed_mode TEXT NOT NULL DEFAULT 'manual' CHECK (feed_mode IN ('manual','file','api')),
  public_label TEXT NOT NULL DEFAULT '',
  compliance_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_catalog_items (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  external_ref TEXT NOT NULL DEFAULT '',
  insurer_name TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  summary TEXT NOT NULL DEFAULT '',
  landing_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','paused')),
  comparison_approved INTEGER NOT NULL DEFAULT 0 CHECK (comparison_approved IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES insurance_partners(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_catalog_partner_ref
  ON insurance_catalog_items(partner_id, external_ref)
  WHERE external_ref != '';
CREATE INDEX IF NOT EXISTS idx_insurance_catalog_state
  ON insurance_catalog_items(status, comparison_approved, category);

CREATE TABLE IF NOT EXISTS insurance_consultation_outcomes (
  consultation_id TEXT PRIMARY KEY,
  partner_id TEXT,
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued','assigned','contacted','completed','declined','cancelled')),
  outcome_code TEXT NOT NULL DEFAULT '',
  external_case_ref TEXT NOT NULL DEFAULT '',
  revenue_krw INTEGER NOT NULL DEFAULT 0 CHECK (revenue_krw >= 0),
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultation_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (partner_id) REFERENCES insurance_partners(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_insurance_outcomes_stage
  ON insurance_consultation_outcomes(stage, updated_at DESC);

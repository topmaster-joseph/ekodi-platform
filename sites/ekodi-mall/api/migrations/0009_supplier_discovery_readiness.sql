PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS supplier_candidates (
  id TEXT PRIMARY KEY,
  candidate_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  discovery_source TEXT NOT NULL DEFAULT 'manual' CHECK (discovery_source IN (
    'manual','public_web','referral','trade_show','government_directory','marketplace_reference'
  )),
  discovery_ref TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  public_contact_ref TEXT NOT NULL DEFAULT '',
  candidate_status TEXT NOT NULL DEFAULT 'discovered' CHECK (candidate_status IN (
    'discovered','screening','shortlisted','outreach_ready','contacted','due_diligence_ready','converted','rejected'
  )),
  business_identity_status TEXT NOT NULL DEFAULT 'unknown' CHECK (business_identity_status IN ('unknown','confirmed','rejected')),
  direct_ship_status TEXT NOT NULL DEFAULT 'unknown' CHECK (direct_ship_status IN ('unknown','yes','no')),
  margin_percent_estimate REAL NOT NULL DEFAULT 0 CHECK (margin_percent_estimate >= 0 AND margin_percent_estimate <= 100),
  stock_reliability TEXT NOT NULL DEFAULT 'unknown' CHECK (stock_reliability IN ('unknown','low','medium','high')),
  returns_cs_status TEXT NOT NULL DEFAULT 'unknown' CHECK (returns_cs_status IN ('unknown','partial','ready','rejected')),
  pilot_support_status TEXT NOT NULL DEFAULT 'unknown' CHECK (pilot_support_status IN ('unknown','yes','no')),
  integration_capability TEXT NOT NULL DEFAULT 'unknown' CHECK (integration_capability IN ('unknown','manual','feed','api')),
  rights_clarity TEXT NOT NULL DEFAULT 'unknown' CHECK (rights_clarity IN ('unknown','clear','restricted')),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL DEFAULT 'high' CHECK (risk_level IN ('low','medium','high')),
  critical_blockers_json TEXT NOT NULL DEFAULT '[]',
  score_explanation TEXT NOT NULL DEFAULT '',
  converted_partner_id TEXT REFERENCES supplier_partners(id) ON DELETE RESTRICT,
  last_scored_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_candidates_status ON supplier_candidates(candidate_status,total_score DESC,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_candidates_score ON supplier_candidates(total_score DESC,risk_level,updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_candidate_evidence (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES supplier_candidates(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'business_identity','catalog','dropship','pricing','stock','returns','cs','pii','api','contact','rights','other'
  )),
  evidence_url TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (verification_status IN ('unreviewed','confirmed','rejected')),
  confidence INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_candidate_evidence ON supplier_candidate_evidence(candidate_id,verification_status,updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_outreach_tasks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES supplier_candidates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','phone','webform','kakao','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','contacted','responded','closed','cancelled')),
  public_contact_ref TEXT NOT NULL DEFAULT '',
  subject_draft TEXT NOT NULL DEFAULT '',
  message_draft TEXT NOT NULL DEFAULT '',
  response_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_outreach_status ON supplier_outreach_tasks(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_outreach_candidate ON supplier_outreach_tasks(candidate_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_pilot_preflights (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES supplier_partners(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  supplier_sku_id TEXT NOT NULL REFERENCES supplier_skus(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  scenario_source TEXT NOT NULL CHECK (scenario_source IN ('direct','marketplace','ai')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0),
  fee_rate_percent INTEGER NOT NULL CHECK (fee_rate_percent IN (7,8,9,10)),
  platform_fee_amount INTEGER NOT NULL CHECK (platform_fee_amount >= 0),
  supplier_cost_amount INTEGER NOT NULL CHECK (supplier_cost_amount >= 0),
  supplier_shipping_amount INTEGER NOT NULL CHECK (supplier_shipping_amount >= 0),
  contribution_margin INTEGER NOT NULL,
  contribution_margin_percent REAL NOT NULL,
  readiness_status TEXT NOT NULL CHECK (readiness_status IN ('blocked','operational_ready','transaction_locked')),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_preflight_partner ON supplier_pilot_preflights(partner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_preflight_product ON supplier_pilot_preflights(product_id,created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_discovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT REFERENCES supplier_candidates(id) ON DELETE SET NULL,
  preflight_id TEXT REFERENCES supplier_pilot_preflights(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_discovery_events_time ON supplier_discovery_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_discovery_events_candidate ON supplier_discovery_events(candidate_id,created_at DESC);

-- 후보를 Partner로 전환하려면 실사 준비상태와 최소 증거기준을 DB에서도 다시 확인한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_candidate_conversion_guard
BEFORE UPDATE OF candidate_status, converted_partner_id ON supplier_candidates
WHEN NEW.candidate_status = 'converted' AND (
  OLD.candidate_status <> 'due_diligence_ready' OR
  NEW.converted_partner_id IS NULL OR
  NEW.total_score < 75 OR
  NEW.business_identity_status <> 'confirmed' OR
  NEW.direct_ship_status <> 'yes' OR
  NEW.rights_clarity <> 'clear'
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_CANDIDATE_NOT_READY_FOR_CONVERSION');
END;

-- converted 상태는 Partner 연결을 잃을 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_candidate_converted_partner_lock
BEFORE UPDATE OF converted_partner_id ON supplier_candidates
WHEN OLD.candidate_status = 'converted' AND NEW.converted_partner_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_CANDIDATE_PARTNER_LINK_LOCKED');
END;

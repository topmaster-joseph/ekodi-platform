PRAGMA foreign_keys = ON;

ALTER TABLE insurance_advisor_profiles ADD COLUMN wonder_official_url TEXT NOT NULL DEFAULT 'https://ntc.lotteins.co.kr/landing.do';
ALTER TABLE insurance_advisor_profiles ADD COLUMN direct_design_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS insurance_practices (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('person','organization')),
  owner_ref TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_practice_members (
  practice_id TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','advisor','assistant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(practice_id,subject_ref),
  FOREIGN KEY(practice_id) REFERENCES insurance_practices(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS insurance_affiliations (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  carrier_key TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('agent','planner','ga','agency','broker','employee','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','active','paused','ended')),
  registration_reference TEXT NOT NULL DEFAULT '',
  verification_url TEXT NOT NULL DEFAULT '',
  official_company_url TEXT NOT NULL DEFAULT '',
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK(public_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(practice_id,carrier_key),
  FOREIGN KEY(practice_id) REFERENCES insurance_practices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insurance_provider_connectors (
  id TEXT PRIMARY KEY,
  affiliation_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'handoff' CHECK(mode IN ('handoff','read_only','api')),
  official_url TEXT NOT NULL DEFAULT '',
  app_url TEXT NOT NULL DEFAULT '',
  api_status TEXT NOT NULL DEFAULT 'unavailable' CHECK(api_status IN ('unavailable','review','connected','paused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(affiliation_id,provider_key),
  FOREIGN KEY(affiliation_id) REFERENCES insurance_affiliations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insurance_consultation_projections (
  consultation_id TEXT NOT NULL,
  affiliation_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'unassigned' CHECK(stage IN ('unassigned','queued','contacted','designed','submitted','completed','closed')),
  external_case_ref TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(consultation_id,affiliation_id),
  FOREIGN KEY(consultation_id) REFERENCES consultation_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(affiliation_id) REFERENCES insurance_affiliations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_insurance_affiliations_practice
  ON insurance_affiliations(practice_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_connectors_affiliation
  ON insurance_provider_connectors(affiliation_id,api_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_projection_affiliation
  ON insurance_consultation_projections(affiliation_id,stage,updated_at DESC);
INSERT OR IGNORE INTO insurance_practices
  (id,slug,owner_type,owner_ref,display_name,status,created_at,updated_at)
SELECT 'prc_primary',slug,'person','',display_name,'active',datetime('now'),datetime('now')
FROM insurance_advisor_profiles WHERE id='adv_primary';

INSERT OR IGNORE INTO insurance_affiliations
  (id,practice_id,carrier_key,carrier_name,relationship_type,status,registration_reference,verification_url,official_company_url,public_enabled,created_at,updated_at)
SELECT 'aff_lotte-primary','prc_primary','lotte',insurer_name,'planner',
       CASE WHEN registration_reference<>'' AND verification_url<>'' THEN 'active' ELSE 'pending' END,
       registration_reference,verification_url,official_company_url,public_enabled,datetime('now'),datetime('now')
FROM insurance_advisor_profiles WHERE id='adv_primary';

INSERT OR IGNORE INTO insurance_provider_connectors
  (id,affiliation_id,provider_key,label,mode,official_url,app_url,api_status,created_at,updated_at)
SELECT 'cnx_lotte-wonder','aff_lotte-primary','lotte-wonder','Wonder 플래너전용','handoff',
       CASE WHEN wonder_official_url<>'' THEN wonder_official_url ELSE 'https://ntc.lotteins.co.kr/landing.do' END,
       'https://play.google.com/store/apps/details?id=kr.co.lotteins.a2mars',
       'unavailable',datetime('now'),datetime('now')
FROM insurance_advisor_profiles WHERE id='adv_primary';

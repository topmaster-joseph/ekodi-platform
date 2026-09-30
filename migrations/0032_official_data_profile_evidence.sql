-- EKODI shared Profile + Evidence + Confirmation foundation
-- Additive only. Keeps official/public evidence, user corrections and AI inference
-- visibly separated so downstream services can reuse one living profile safely.

CREATE TABLE IF NOT EXISTS ekodi_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_key TEXT NOT NULL UNIQUE,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('person','organization','business','project')),
  display_name TEXT NOT NULL,
  public_identifier TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  review_state TEXT NOT NULL DEFAULT 'needs_review' CHECK(review_state IN ('needs_review','partially_confirmed','confirmed')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ekodi_profiles_subject
  ON ekodi_profiles(subject_type,subject_key,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_ekodi_profiles_entity
  ON ekodi_profiles(entity_type,display_name);

CREATE TABLE IF NOT EXISTS ekodi_profile_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_key TEXT NOT NULL UNIQUE,
  profile_key TEXT NOT NULL,
  field_path TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source_class TEXT NOT NULL CHECK(source_class IN ('official','verified','public','user','ai_inference','needs_check')),
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_record_id TEXT NOT NULL DEFAULT '',
  observed_at TEXT,
  confidence REAL,
  review_state TEXT NOT NULL DEFAULT 'unreviewed' CHECK(review_state IN ('unreviewed','confirmed','corrected','rejected')),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_key) REFERENCES ekodi_profiles(profile_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ekodi_profile_evidence_profile
  ON ekodi_profile_evidence(profile_key,is_current,field_path,id);
CREATE INDEX IF NOT EXISTS idx_ekodi_profile_evidence_source
  ON ekodi_profile_evidence(profile_key,source_class,review_state);

CREATE TABLE IF NOT EXISTS ekodi_profile_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_key TEXT NOT NULL UNIQUE,
  profile_key TEXT NOT NULL,
  field_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('confirm','correct','reject')),
  value_json TEXT,
  note TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_key) REFERENCES ekodi_profiles(profile_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ekodi_profile_confirmations_profile
  ON ekodi_profile_confirmations(profile_key,field_path,created_at);

CREATE TABLE IF NOT EXISTS ekodi_profile_discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  profile_key TEXT NOT NULL,
  provider_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('complete','degraded','failed')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY(profile_key) REFERENCES ekodi_profiles(profile_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ekodi_profile_discovery_runs_profile
  ON ekodi_profile_discovery_runs(profile_key,completed_at);

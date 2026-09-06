PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal_finance_consent_grants (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('GRANTED','REVOKED','EXPIRED')),
  source TEXT NOT NULL DEFAULT 'USER',
  granted_at TEXT,
  revoked_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_pf_consent_profile_status ON personal_finance_consent_grants(profile_id,status,scope);

CREATE TABLE IF NOT EXISTS personal_finance_connections (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  provider_family TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('CONNECTED','DEGRADED','DISCONNECTED','REVOKED')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  external_subject_ref TEXT NOT NULL DEFAULT '',
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_connections_profile ON personal_finance_connections(profile_id,status,provider_family);

CREATE TABLE IF NOT EXISTS personal_finance_evidence (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  observed_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_evidence_profile_time ON personal_finance_evidence(profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS personal_finance_insights (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence REAL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO','ATTENTION','ACTIONABLE','HIGH_IMPACT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONFIRMED','CORRECTED','DISMISSED','EXPIRED')),  user_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_insights_profile_status ON personal_finance_insights(profile_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS personal_finance_insight_evidence (
  insight_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  PRIMARY KEY(insight_id,evidence_id),
  FOREIGN KEY(insight_id) REFERENCES personal_finance_insights(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES personal_finance_evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_finance_action_requests (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_level TEXT NOT NULL CHECK(action_level IN ('L0','L1','L2','L3','L4')),
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','REJECTED','EXECUTED','CANCELLED','EXPIRED')),
  reversible INTEGER NOT NULL DEFAULT 1,
  request_json TEXT NOT NULL DEFAULT '{}',
  approved_at TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_action_profile_status ON personal_finance_action_requests(profile_id,status,action_level,created_at DESC);

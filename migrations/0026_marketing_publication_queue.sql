-- EKODI Marketing publication engine.
-- Additive ledger shared by personal brands, tenant organizations and stores.
-- Provider access tokens are never stored in D1. credential_ref points to a Worker secret name only.

CREATE TABLE IF NOT EXISTS marketing_brand_profiles (
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  audience_summary TEXT NOT NULL DEFAULT '',
  voice_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject_type, subject_key)
);

CREATE TABLE IF NOT EXISTS marketing_publish_policies (
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'review' CHECK(mode IN ('review','assisted','autonomous')),
  max_daily_posts INTEGER NOT NULL DEFAULT 5 CHECK(max_daily_posts BETWEEN 1 AND 100),
  allowed_providers_json TEXT NOT NULL DEFAULT '[]',
  quiet_hours_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject_type, subject_key)
);

CREATE TABLE IF NOT EXISTS marketing_publish_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_account_id TEXT NOT NULL DEFAULT '',
  credential_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'credentials_required'
    CHECK(status IN ('setup_required','credentials_required','active','paused','error')),
  config_json TEXT NOT NULL DEFAULT '{}',
  last_check_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type, subject_key, provider, channel_type, external_account_id)
);

CREATE TABLE IF NOT EXISTS marketing_content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'social_post'
    CHECK(content_type IN ('social_post','card_news','short_video','article','notice')),
  caption TEXT NOT NULL DEFAULT '',
  asset_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'human' CHECK(source IN ('human','ai','imported')),
  approval_state TEXT NOT NULL DEFAULT 'draft'
    CHECK(approval_state IN ('draft','approved','auto_approved','rejected')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_publication_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  schedule_kind TEXT NOT NULL DEFAULT 'immediate'
    CHECK(schedule_kind IN ('immediate','scheduled','repeating','optimal')),
  scheduled_at TEXT NOT NULL,
  recurrence_rule TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','queued','publishing','published','retrying','failed','cancelled','credentials_required')),
  requested_by TEXT NOT NULL DEFAULT 'human' CHECK(requested_by IN ('human','ai')),
  governance_action_id INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20),
  next_attempt_at TEXT,
  external_post_id TEXT NOT NULL DEFAULT '',
  external_post_url TEXT NOT NULL DEFAULT '',
  provider_response_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(content_id) REFERENCES marketing_content_items(id),
  FOREIGN KEY(channel_id) REFERENCES marketing_publish_channels(id),
  FOREIGN KEY(governance_action_id) REFERENCES ai_agent_actions(id)
);

CREATE TABLE IF NOT EXISTS marketing_publication_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  job_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES marketing_publication_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_publish_channels_subject
  ON marketing_publish_channels(subject_type, subject_key, status);
CREATE INDEX IF NOT EXISTS idx_marketing_content_subject
  ON marketing_content_items(subject_type, subject_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_publication_due
  ON marketing_publication_jobs(status, scheduled_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_marketing_publication_subject
  ON marketing_publication_jobs(subject_type, subject_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_publication_audit_subject
  ON marketing_publication_audit(subject_type, subject_key, created_at DESC);

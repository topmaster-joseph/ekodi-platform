-- Cheonggye Pass vendor handoff is additive and private.
-- No existing commerce, CGMA membership or financial tables are modified.
CREATE TABLE IF NOT EXISTS cheonggyepass_vendor_submissions (
  id TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL,
  delivery TEXT NOT NULL CHECK (delivery IN ('github_pr','zip','external_api')),
  vendor_name TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  source_ref TEXT NOT NULL DEFAULT '',
  api_base_url TEXT NOT NULL DEFAULT '',
  documentation_url TEXT NOT NULL DEFAULT '',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','quarantined','review_pending','approved_for_testing','rejected')),
  artifact_key TEXT,
  artifact_sha256 TEXT,
  artifact_size INTEGER NOT NULL DEFAULT 0,
  reviewer_email TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (actor_email,submission_key)
);
CREATE INDEX IF NOT EXISTS idx_cheonggyepass_vendor_actor_date
  ON cheonggyepass_vendor_submissions (actor_email,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cheonggyepass_vendor_status_date
  ON cheonggyepass_vendor_submissions (status,created_at DESC);

CREATE TABLE IF NOT EXISTS cheonggyepass_vendor_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES cheonggyepass_vendor_submissions(id),
  actor_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cheonggyepass_vendor_event_submission
  ON cheonggyepass_vendor_events(submission_id,created_at DESC);

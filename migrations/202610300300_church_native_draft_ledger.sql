-- EKODI Church native Google Docs/Slides draft receipts (D1 additive migration).
-- Intentionally no document text, OAuth tokens or personal information.
-- No worker automatically dispatches this job after this migration.
CREATE TABLE IF NOT EXISTS ekodi_church_native_draft_runs (
  job_id TEXT PRIMARY KEY NOT NULL,
  service_date TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed'
    CHECK (state IN ('claimed','draft_ready_for_pastor_review','blocked_reconciliation_required')),
  reason TEXT,
  source_registry_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ekodi_church_native_draft_assets (
  job_id TEXT NOT NULL REFERENCES ekodi_church_native_draft_runs(job_id),
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('sermonGoogleDocId','bulletinGoogleDocId','worshipGoogleSlidesId')),
  file_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('created_pending_readback','draft_readback_verified')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_id,asset_kind)
);
CREATE INDEX IF NOT EXISTS idx_ekodi_church_native_draft_state
  ON ekodi_church_native_draft_runs(state,updated_at);

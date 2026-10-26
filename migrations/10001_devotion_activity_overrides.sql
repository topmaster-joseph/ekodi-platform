-- Curated devotional activities only. Canonical scripture is never stored or editable here.
CREATE TABLE IF NOT EXISTS devotion_activity_overrides (
  date TEXT PRIMARY KEY CHECK (length(date)=10),
  activities_json TEXT NOT NULL CHECK (length(activities_json)<=30000),
  status TEXT NOT NULL CHECK (status IN ('draft','published')),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devotion_activity_overrides_status ON devotion_activity_overrides(status,date);

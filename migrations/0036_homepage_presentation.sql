CREATE TABLE IF NOT EXISTS homepage_presentation_controls (
  service_id TEXT PRIMARY KEY,
  visibility TEXT NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('hidden', 'normal', 'featured')),
  display_order INTEGER NOT NULL DEFAULT 9999 CHECK (display_order >= 0 AND display_order <= 9999),
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_homepage_presentation_order
  ON homepage_presentation_controls(display_order, service_id);

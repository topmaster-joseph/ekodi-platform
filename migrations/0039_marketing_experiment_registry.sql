-- Marketing AI experiment registry for comparable internal/external validation.
-- The first active experiment is EKODIBIZ only. External customer workspaces remain available
-- but are not active experiment subjects until a later comparison phase.

CREATE TABLE IF NOT EXISTS marketing_experiments (
  experiment_key TEXT PRIMARY KEY,
  comparison_framework TEXT NOT NULL,
  workspace_type TEXT NOT NULL CHECK(workspace_type IN ('tenant','store')),
  workspace_key TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  module_key TEXT NOT NULL,
  module_version TEXT NOT NULL,
  experiment_role TEXT NOT NULL CHECK(experiment_role IN ('baseline','challenger')),
  status TEXT NOT NULL CHECK(status IN ('planned','active','paused','completed','cancelled')),
  started_at TEXT,
  planned_end_at TEXT,
  completed_at TEXT,
  primary_outcome TEXT NOT NULL,
  kpis_json TEXT NOT NULL DEFAULT '[]',
  hypothesis TEXT NOT NULL DEFAULT '',
  campaign_id INTEGER,
  evidence_policy TEXT NOT NULL DEFAULT 'verified_only',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES marketing_campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_experiments_workspace
  ON marketing_experiments(workspace_type, workspace_key, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_experiments_framework
  ON marketing_experiments(comparison_framework, status, updated_at DESC);

-- Create only a draft campaign. No synthetic leads, customer events, value, or outcomes are seeded.
INSERT INTO marketing_campaigns
  (workspace_type,workspace_key,tenant_slug,store_id,name,objective,audience_segment,channel,offer_summary,status,created_by,created_at,updated_at)
SELECT
  'tenant','ekodibiz','ekodibiz',NULL,
  'EKODIBIZ 30-day self-marketing validation',
  'Generate qualified inquiries and move verified prospects through inquiry → consultation → proposal → contract → onboarding.',
  'Small-business and organization decision makers with a concrete marketing, automation, or business-operation problem.',
  'owned+organic',
  'Free problem diagnosis followed by paid execution only when the customer asks EKODI to do the work.',
  'draft','system:ekodibiz-pilot','2026-08-26T00:00:00+09:00','2026-08-26T00:00:00+09:00'
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_campaigns
  WHERE workspace_type='tenant' AND workspace_key='ekodibiz'
    AND name='EKODIBIZ 30-day self-marketing validation'
);

INSERT OR IGNORE INTO marketing_experiments
  (experiment_key,comparison_framework,workspace_type,workspace_key,tenant_slug,module_key,module_version,experiment_role,status,
   started_at,planned_end_at,primary_outcome,kpis_json,hypothesis,campaign_id,evidence_policy,notes,created_at,updated_at)
VALUES
  ('ekodibiz-native-20260826','ekodi-marketing-benchmark-v1','tenant','ekodibiz','ekodibiz',
   'ekodi-native-marketing-ai','v1','baseline','active',
   '2026-08-26T00:00:00+09:00','2026-09-25T00:00:00+09:00','qualified_pipeline_progression',
   '["inquiries","consultations","proposals","contracts","activations","renewals","attributed_value_krw","marketing_actions_completed","human_minutes_saved"]',
   'Using EKODI Marketing AI on EKODIBIZ itself should create measurable verified pipeline progress while reducing manual marketing work.',
   (SELECT id FROM marketing_campaigns
      WHERE workspace_type='tenant' AND workspace_key='ekodibiz'
        AND name='EKODIBIZ 30-day self-marketing validation'
      ORDER BY id DESC LIMIT 1),
   'verified_only',
   'Only EKODIBIZ is an active validation subject. Jadam and other external workspaces are retained as future comparison subjects, not counted in this baseline.',
   '2026-08-26T00:00:00+09:00','2026-08-26T00:00:00+09:00');

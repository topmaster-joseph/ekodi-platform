-- Privacy-safe Marketing Event Ledger and Campaign Ledger.
-- Customer identity is stored only as a salted one-way customer_key; raw phone/email/name must never be persisted here.

CREATE TABLE IF NOT EXISTS marketing_workspace_templates (
  workspace_type TEXT NOT NULL CHECK(workspace_type IN ('tenant','store')),
  workspace_key TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  store_id TEXT,
  template_key TEXT NOT NULL CHECK(template_key IN ('food_b2c','service_b2b','generic')),
  lifecycle_json TEXT NOT NULL DEFAULT '[]',
  identity_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_type, workspace_key)
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_type TEXT NOT NULL CHECK(workspace_type IN ('tenant','store')),
  workspace_key TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  store_id TEXT,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  audience_segment TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'unspecified',
  offer_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','scheduled','running','completed','cancelled')),
  approval_action_id INTEGER,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(approval_action_id) REFERENCES ai_agent_actions(id)
);

CREATE TABLE IF NOT EXISTS marketing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_type TEXT NOT NULL CHECK(workspace_type IN ('tenant','store')),
  workspace_key TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  store_id TEXT,
  customer_key TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'unknown',
  campaign_id INTEGER,
  value_krw INTEGER NOT NULL DEFAULT 0 CHECK(value_krw >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0),
  consent_scope TEXT NOT NULL DEFAULT 'unknown' CHECK(consent_scope IN ('unknown','none','transactional','marketing')),
  source TEXT NOT NULL DEFAULT 'manual',
  external_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES marketing_campaigns(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_events_source_ref
  ON marketing_events(workspace_type, workspace_key, source, external_ref)
  WHERE external_ref IS NOT NULL AND external_ref <> '';
CREATE INDEX IF NOT EXISTS idx_marketing_events_workspace_time
  ON marketing_events(workspace_type, workspace_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_customer_time
  ON marketing_events(workspace_type, workspace_key, customer_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_campaign
  ON marketing_events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_workspace
  ON marketing_campaigns(workspace_type, workspace_key, updated_at DESC);

-- Real pilot templates. No synthetic customer or campaign activity is seeded.
INSERT OR IGNORE INTO marketing_workspace_templates
  (workspace_type,workspace_key,tenant_slug,store_id,template_key,lifecycle_json,identity_salt,created_at,updated_at)
VALUES
  ('tenant','ekodibiz','ekodibiz',NULL,'service_b2b',
   '["inquiry","consultation","proposal","contract","onboarding","active","renewal"]',
   lower(hex(randomblob(32))),
   '2026-08-17T00:00:00.000Z','2026-08-17T00:00:00.000Z'),
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','ekodibiz','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','food_b2c',
   '["first_visit","order","repeat_order","coupon_redeemed","review","dormant","reactivated"]',
   lower(hex(randomblob(32))),
   '2026-08-17T00:00:00.000Z','2026-08-17T00:00:00.000Z');

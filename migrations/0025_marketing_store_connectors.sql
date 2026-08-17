-- Store-scoped Marketing CRM templates and data connector registry for the Mokpo Univ pilot.
-- Credentials/tokens are intentionally NOT stored here. Connector secrets belong in Worker secrets
-- or are represented only by one-way hashes when a bridge is paired.

INSERT OR IGNORE INTO marketing_workspace_templates
  (workspace_type,workspace_key,tenant_slug,store_id,template_key,lifecycle_json,identity_salt,created_at,updated_at)
VALUES
  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','ekodibiz','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','food_b2c',
   '["first_visit","order","repeat_order","coupon_redeemed","review","dormant","reactivated"]',
   lower(hex(randomblob(32))),
   '2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','ekodibiz','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','food_b2c',
   '["first_visit","order","repeat_order","coupon_redeemed","review","dormant","reactivated"]',
   lower(hex(randomblob(32))),
   '2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z');

CREATE TABLE IF NOT EXISTS marketing_data_connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_type TEXT NOT NULL CHECK(workspace_type IN ('tenant','store')),
  workspace_key TEXT NOT NULL,
  store_id TEXT,
  provider TEXT NOT NULL,
  connector_kind TEXT NOT NULL CHECK(connector_kind IN ('owned_order','pos','delivery_app','file','webhook')),
  mode TEXT NOT NULL DEFAULT 'read_only' CHECK(mode IN ('read_only','import_only')),
  status TEXT NOT NULL DEFAULT 'setup_required' CHECK(status IN ('ready','active','setup_required','partner_required','credentials_required','paused','error')),
  display_name TEXT NOT NULL,
  cursor_value TEXT NOT NULL DEFAULT '',
  bridge_key_hash TEXT NOT NULL DEFAULT '',
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  synced_records INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_type, workspace_key, provider)
);

CREATE INDEX IF NOT EXISTS idx_marketing_data_connectors_workspace
  ON marketing_data_connectors(workspace_type, workspace_key, status);
CREATE INDEX IF NOT EXISTS idx_marketing_data_connectors_store
  ON marketing_data_connectors(store_id, provider);

-- Every store gets the same connector contract while preserving an independent store boundary.
-- supabase_orders is immediately usable with an authenticated store-manager session.
-- Other providers remain explicit setup/partner states until official credentials or a POS bridge exist.
INSERT OR IGNORE INTO marketing_data_connectors
  (workspace_type,workspace_key,store_id,provider,connector_kind,mode,status,display_name,created_at,updated_at)
VALUES
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','supabase_orders','owned_order','read_only','ready','EKODI Orders','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','pos_bridge','pos','import_only','setup_required','POS Bridge','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','baemin','delivery_app','import_only','partner_required','배달의민족','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','coupang_eats','delivery_app','import_only','partner_required','쿠팡이츠','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa','yogiyo','delivery_app','import_only','partner_required','요기요','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),

  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','supabase_orders','owned_order','read_only','ready','EKODI Orders','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','pos_bridge','pos','import_only','setup_required','POS Bridge','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','baemin','delivery_app','import_only','partner_required','배달의민족','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','coupang_eats','delivery_app','import_only','partner_required','쿠팡이츠','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27','yogiyo','delivery_app','import_only','partner_required','요기요','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),

  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','supabase_orders','owned_order','read_only','ready','EKODI Orders','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','pos_bridge','pos','import_only','setup_required','POS Bridge','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','baemin','delivery_app','import_only','partner_required','배달의민족','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','coupang_eats','delivery_app','import_only','partner_required','쿠팡이츠','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z'),
  ('store','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce','yogiyo','delivery_app','import_only','partner_required','요기요','2026-08-17T03:50:00.000Z','2026-08-17T03:50:00.000Z');

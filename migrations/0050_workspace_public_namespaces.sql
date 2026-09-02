-- C3 migration: public workspace identity is no longer encoded by workspace type in the URL.
-- workspace_id remains immutable identity; public_namespace is a globally unique public locator.
ALTER TABLE customer_tenants ADD COLUMN workspace_id TEXT;
ALTER TABLE customer_tenants ADD COLUMN workspace_type TEXT;
ALTER TABLE customer_tenants ADD COLUMN workspace_subtype TEXT;
ALTER TABLE customer_tenants ADD COLUMN public_namespace TEXT;
ALTER TABLE customer_tenants ADD COLUMN namespace_claimed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tenants_workspace_id
  ON customer_tenants(workspace_id)
  WHERE workspace_id IS NOT NULL AND trim(workspace_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tenants_public_namespace
  ON customer_tenants(public_namespace COLLATE NOCASE)
  WHERE public_namespace IS NOT NULL AND trim(public_namespace) <> '';

CREATE TABLE IF NOT EXISTS workspace_namespace_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  public_namespace TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active',
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  UNIQUE(workspace_id, public_namespace, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_workspace_namespace_history_lookup
  ON workspace_namespace_history(public_namespace COLLATE NOCASE, status, valid_to);
UPDATE customer_tenants SET workspace_id='ws_org_cgma', workspace_type='organization', workspace_subtype='association', public_namespace='cgma', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='cgma';
UPDATE customer_tenants SET workspace_id='ws_org_jadam', workspace_type='organization', workspace_subtype='business', public_namespace='jadam', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='jadam';
UPDATE customer_tenants SET workspace_id='ws_org_pizzamaru', workspace_type='organization', workspace_subtype='business', public_namespace='pizzamaru', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='pizzamaru';
UPDATE customer_tenants SET workspace_id='ws_org_yogurt', workspace_type='organization', workspace_subtype='business', public_namespace='yogurt', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='yogurt';
UPDATE customer_tenants SET workspace_id='ws_org_ekodi_church', workspace_type='organization', workspace_subtype='church', public_namespace='ekodichurch', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='ekodi-church';
UPDATE customer_tenants SET workspace_id='ws_org_ekodi_biz', workspace_type='organization', workspace_subtype='business', public_namespace='ekodibiz', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='ekodi-biz';
UPDATE customer_tenants SET workspace_id='ws_org_ekodi_lab', workspace_type='organization', workspace_subtype='institution', public_namespace='ekodilab', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='ekodi-lab';
UPDATE customer_tenants SET workspace_id='ws_org_ekodi_trade', workspace_type='organization', workspace_subtype='business', public_namespace='ekoditrade', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='ekodi-trade';
UPDATE customer_tenants SET workspace_id='ws_org_ekodi_cafe', workspace_type='organization', workspace_subtype='business', public_namespace='ekodicafe', namespace_claimed_at=COALESCE(namespace_claimed_at, created_at) WHERE slug='ekodi-cafe';

-- Any pre-existing customer workspace outside the seeded set still receives immutable identity.
UPDATE customer_tenants
SET workspace_id='ws_legacy_' || id,
    workspace_type=COALESCE(NULLIF(workspace_type, ''), 'organization')
WHERE workspace_id IS NULL OR trim(workspace_id)='';

INSERT OR IGNORE INTO workspace_namespace_history (workspace_id, public_namespace, status, valid_from)
SELECT workspace_id, public_namespace, 'active', COALESCE(namespace_claimed_at, created_at)
FROM customer_tenants
WHERE workspace_id IS NOT NULL AND public_namespace IS NOT NULL;
-- Explicit owner request, 2026-10-24: two independent cooperative administrators.
-- This assigns local operating access, not a Google identity, legal office or platform role.
-- D1 runs each migration atomically. A conflicting link, revoked grant or identity fails closed.
WITH assignments(workspace_id,slug,founder_id,representative,email) AS (VALUES
('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1','정찬균','topmaster.joseph@gmail.com'),
('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1','임동섭','dlaehd12345619@gmail.com'))
-- The invalid-JSON branch raises an error before any data mutation on conflict.
SELECT CASE WHEN COUNT(*) = 2 THEN 1 ELSE json('COOP_ADMIN_ASSIGNMENT_CONFLICT') END
FROM assignments a
JOIN customer_tenants t ON t.slug = a.slug AND t.status = 'active'
JOIN cooperative_projects p ON p.workspace_id = a.workspace_id AND p.slug = a.slug
WHERE json_extract(p.snapshot_json,'$.founders[0].id') = a.founder_id
  AND json_extract(p.snapshot_json,'$.founders[0].representative') = a.representative
  AND json_extract(p.snapshot_json,'$.founders[0].position') = 'chair-designate'
  AND (json_extract(p.snapshot_json,'$.founders[0].accountEmail') IS NULL
    OR json_extract(p.snapshot_json,'$.founders[0].accountEmail') = a.email)
  AND NOT EXISTS (SELECT 1 FROM json_each(p.snapshot_json,'$.founders') f
    WHERE json_extract(f.value,'$.accountEmail') = a.email
      AND json_extract(f.value,'$.id') <> a.founder_id)
  AND NOT EXISTS (SELECT 1 FROM customer_access_grants g
    WHERE g.tenant_id = t.id AND lower(trim(g.email)) = a.email
      AND (g.email <> a.email OR g.enabled <> 1 OR g.principal_type <> 'member'
        OR (g.expires_at IS NOT NULL AND (julianday(g.expires_at) IS NULL OR julianday(g.expires_at) <= julianday('now')))
        OR NOT json_valid(g.capabilities_json) OR NOT json_valid(g.denied_capabilities_json)
        OR g.role IN ('external_vendor','external_developer')
        OR EXISTS (SELECT 1 FROM json_each(g.denied_capabilities_json) WHERE value = 'tenant.site.manage')
        OR NOT (g.role IN ('admin','owner','store_owner','tenant_admin','workspace_admin','client_admin','senior_pastor','platform_admin')
          OR EXISTS (SELECT 1 FROM json_each(g.capabilities_json) WHERE value = 'tenant.site.manage'))));

-- Retain the exact previous link and whether a new grant was needed for guarded reversal.
WITH assignments(workspace_id,slug,founder_id,representative,email) AS (VALUES
('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1','정찬균','topmaster.joseph@gmail.com'),
('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1','임동섭','dlaehd12345619@gmail.com'))
INSERT INTO customer_audit_logs(tenant_id,user_id,action,resource,detail,created_at)
SELECT t.id,NULL,'cooperative.admin.assign','cooperative-chair-admin:20261024',
  json_object('workspaceId',a.workspace_id,'founderId',a.founder_id,'email',a.email,
    'authorization','explicit-owner-request:20261024','previousAccountEmail',json_extract(p.snapshot_json,'$.founders[0].accountEmail'),
    'grantCreated',CASE WHEN EXISTS (SELECT 1 FROM customer_access_grants g WHERE g.tenant_id=t.id AND g.email=a.email) THEN 0 ELSE 1 END),CURRENT_TIMESTAMP
FROM assignments a
JOIN customer_tenants t ON t.slug=a.slug
JOIN cooperative_projects p ON p.workspace_id=a.workspace_id
WHERE NOT EXISTS (SELECT 1 FROM customer_audit_logs l WHERE l.tenant_id=t.id
  AND l.action='cooperative.admin.assign' AND l.resource='cooperative-chair-admin:20261024');

-- Existing grants are never overwritten or re-enabled. IAM/secrets/deploy remain outside this assignment.
WITH assignments(workspace_id,slug,founder_id,representative,email) AS (VALUES
('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1','정찬균','topmaster.joseph@gmail.com'),
('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1','임동섭','dlaehd12345619@gmail.com'))
INSERT OR IGNORE INTO customer_access_grants(
  tenant_id,email,role,enabled,created_at,created_by,last_verified_at,
  principal_type,github_username,capabilities_json,denied_capabilities_json,expires_at,note,updated_at,updated_by
)
SELECT t.id,a.email,'admin',1,CURRENT_TIMESTAMP,NULL,NULL,'member','',
  '["tenant.site.manage"]',
  '["tenant.access.manage","tenant.secrets.read","tenant.production.deploy","platform.admin","platform.secrets.read","platform.production.deploy"]',
  NULL,'cooperative-chair-admin:20261024',CURRENT_TIMESTAMP,NULL
FROM assignments a JOIN customer_tenants t ON t.slug=a.slug;

WITH assignments(workspace_id,slug,founder_id,representative,email) AS (VALUES
('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1','정찬균','topmaster.joseph@gmail.com'),
('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1','임동섭','dlaehd12345619@gmail.com'))
UPDATE cooperative_projects
SET snapshot_json=json_set(snapshot_json,'$.founders[0].accountEmail',
      (SELECT a.email FROM assignments a WHERE a.workspace_id=cooperative_projects.workspace_id)),
    revision=revision+1,last_change_id='cooperative-chair-admin:20261024',updated_at=CURRENT_TIMESTAMP
WHERE workspace_id IN (SELECT workspace_id FROM assignments)
  AND json_extract(snapshot_json,'$.founders[0].accountEmail') IS NULL;

WITH assignments(workspace_id,slug,founder_id,representative,email) AS (VALUES
('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1','정찬균','topmaster.joseph@gmail.com'),
('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1','임동섭','dlaehd12345619@gmail.com'))
INSERT INTO cooperative_audit(workspace_id,actor_id,authority_scope,action,revision,created_at)
SELECT p.workspace_id,'authorized-owner-request:20261024','tenant','founder.account.link',p.revision,CURRENT_TIMESTAMP
FROM cooperative_projects p JOIN assignments a ON a.workspace_id=p.workspace_id
WHERE p.last_change_id='cooperative-chair-admin:20261024'
  AND NOT EXISTS (SELECT 1 FROM cooperative_audit l WHERE l.workspace_id=p.workspace_id
    AND l.action='founder.account.link' AND l.revision=p.revision);


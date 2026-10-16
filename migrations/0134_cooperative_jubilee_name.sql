-- User-requested draft name update. Preserve workspace identity and all records.
UPDATE cooperative_projects
SET snapshot_json = json_set(snapshot_json, '$.profile.name', '희년세상협동조합', '$.profile.legalName', '희년세상협동조합', '$.profile.legalNameStatus', 'draft'),
    revision = revision + 1,
    last_change_id = 'jubilee-name-20261015',
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'c88205a8-9a6c-4c51-ae52-508c087a2d50'
  AND (json_extract(snapshot_json, '$.profile.name') <> '희년세상협동조합'
    OR json_extract(snapshot_json, '$.profile.legalName') <> '희년세상협동조합');

INSERT INTO cooperative_audit(workspace_id,actor_id,authority_scope,action,revision,created_at)
SELECT workspace_id,'authorized-user-request:20261015','tenant','profile.rename',revision,CURRENT_TIMESTAMP
FROM cooperative_projects
WHERE workspace_id = 'c88205a8-9a6c-4c51-ae52-508c087a2d50'
  AND last_change_id = 'jubilee-name-20261015'
  AND NOT EXISTS (SELECT 1 FROM cooperative_audit a WHERE a.workspace_id = cooperative_projects.workspace_id AND a.action = 'profile.rename' AND a.revision = cooperative_projects.revision);

UPDATE customer_tenants SET name = '희년세상협동조합'
WHERE slug = 'jubilee-distribution'
  AND name IN ('희년세상유통조합','희년세상유통협동조합')
  AND EXISTS (SELECT 1 FROM cooperative_projects WHERE workspace_id = 'c88205a8-9a6c-4c51-ae52-508c087a2d50');

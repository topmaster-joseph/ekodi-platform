import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const policy=JSON.parse(readFileSync(new URL('../config/storage-policy.json',import.meta.url),'utf8'));
const worker=readFileSync(new URL('../canonical-drive-writer.js',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../storage-gateway.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-points-backup-drive-acl.yml',import.meta.url),'utf8');

test('inherited shared drive members are checked against canonical policy source of truth',()=>{
  assert.equal(policy.sharedDriveMembershipSourceOfTruth,'Google Drive permissions.list');
  assert.ok(policy.canonicalSharedDriveApprovedAccounts.length>=2);
  assert.match(worker,/import storagePolicy from '.\/config\/storage-policy\.json' with \{type:'json'\}/);
  assert.match(worker,/\/permissions\?/);
  assert.match(worker,/permission\?\.type!=='user'/);
  assert.match(worker,/permitted\.has\(email\)/);
  assert.match(worker,/permission\.role==='organizer'/);
  assert.match(worker,/item\.hasAugmentedPermissions!==false/);
  assert.match(worker,/CANONICAL_BACKUP_MEMBERSHIP_UNAPPROVED/);
  assert.match(worker,/CANONICAL_BACKUP_FOLDER_SCOPE_UNVERIFIED/);
});
test('backup ACL server endpoint is protected and never exposes user email addresses',()=>{
  assert.match(gateway,/if \(!authorized\(request, env\)\) return json/);
  assert.match(gateway,/url\.pathname===\x60\$\{STORAGE_PREFIX\}\/backup-acl\x60/);
  assert.match(gateway,/verifyCanonicalBackupDriveAcl\(env\)/);
  assert.match(worker,/productionSchemaWriteAuthorized:false/);
  assert.match(worker,/backupExportAuthorized:false/);
  assert.match(worker,/pointsActivationAuthorized:false/);
});
test('owner ACL probe only follows protected Storage release and performs no writes',()=>{
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/Deploy EKODI Storage Control/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow,/github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/storage\/v1\/backup-acl/);
  assert.match(workflow,/--max-redirs 0/);
  assert.match(workflow,/\.backupExportAuthorized==false/);
  assert.doesNotMatch(workflow,/supabase db push|supabase migration up|delete-file|POINTS_ENABLED=true|--request POST/i);
});

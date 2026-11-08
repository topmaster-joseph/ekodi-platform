import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/verify-points-backup-drive-acl.yml','utf8');

test('scheduled backup ACL inspection is limited to protected production main',()=>{
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/STORAGE_GATEWAY_KEY: \$\{\{ secrets\.EKODI_STORAGE_GATEWAY_KEY \}\}/);
  assert.match(workflow,/test "\$GITHUB_SHA" = "\$\(gh api/);
});

test('missing protected Storage key fails before any authenticated ACL request',()=>{
  const guard=workflow.indexOf('if [ -z "$STORAGE_GATEWAY_KEY" ]; then');
  const request=workflow.indexOf('https://ekodi.kr/api/storage/v1/backup-acl');
  assert.ok(guard>=0&&request>guard,'credential check precedes authenticated request');
  assert.match(workflow,/Protected Points backup credential missing/);
  assert.match(workflow,/exit 2\n\s+fi/);
  assert.match(workflow,/backupExportAuthorized==false/);
  assert.match(workflow,/productionSchemaWriteAuthorized==false/);
  assert.match(workflow,/pointsActivationAuthorized==false/);
});

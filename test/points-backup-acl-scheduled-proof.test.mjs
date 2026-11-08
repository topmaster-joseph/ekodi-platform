import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wf=readFileSync(new URL('../.github/workflows/verify-points-backup-drive-acl.yml',import.meta.url),'utf8');

test('backup Drive ACL is independently checked on main even if GitHub bot events are suppressed',()=>{
  assert.match(wf,/on:\n  workflow_dispatch:\n[\s\S]*?  schedule:\n    - cron: '43 2 \* \* \*'/);
  assert.match(wf,/  workflow_run:\n    workflows:/);
  assert.match(wf,/github\.event_name == 'schedule'/);
  assert.match(wf,/github\.ref == 'refs\/heads\/main'/);
  assert.match(wf,/github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(wf,/environment: production/);
  assert.match(wf,/permissions:\n  contents: read/);
  assert.match(wf,/backupExportAuthorized==false/);
  assert.match(wf,/productionSchemaWriteAuthorized==false/);
  assert.match(wf,/pointsActivationAuthorized==false/);
  assert.match(wf,/https:\/\/ekodi\.kr\/api\/storage\/v1\/backup-acl/);
  assert.doesNotMatch(wf,/supabase db push|delete-file|POINTS_ENABLED=true/);
});

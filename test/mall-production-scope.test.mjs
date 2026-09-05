import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile('.github/workflows/deploy-ekodi-mall.yml','utf8');

test('Mall production separates static Pages from unchanged API/D1',()=>{
  assert.match(workflow,/name: Detect production Mall components/);
  assert.match(workflow,/fetch-depth: 2/);
  assert.match(workflow,/api_changed=false/);
  assert.match(workflow,/site_changed=false/);
  assert.match(workflow,/\^sites\/ekodi-mall\/api\//);
  assert.match(workflow,/steps\.production_scope\.outputs\.api_changed == 'true'/);
  assert.match(workflow,/steps\.production_scope\.outputs\.site_changed == 'true'/);
  assert.match(workflow,/Mall API\/D1 unchanged; preserving the verified production API/);
});

test('manual Mall release remains fail-closed for API and site',()=>{
  assert.match(workflow,/github\.event_name \}\}" = "workflow_dispatch"/);
  assert.match(workflow,/echo "api_changed=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow,/echo "site_changed=true" >> "\$GITHUB_OUTPUT"/);
});

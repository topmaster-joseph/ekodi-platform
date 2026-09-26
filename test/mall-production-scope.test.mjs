import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile('.github/workflows/deploy-ekodi-mall.yml','utf8');
const ownershipGuard=await readFile('sites/ekodi-mall/scripts/disable-git-auto-deploy.mjs','utf8');

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


test('Mall production disables legacy Git auto-deploy before direct upload',()=>{
  assert.match(workflow,/name: Enforce single EKODI Mall Pages production owner/);
  assert.match(workflow,/node scripts\/disable-git-auto-deploy\.mjs/);
  assert.match(workflow,/EKODI_MALL_LEGACY_GIT_OWNER: topmaster-joseph/);
  assert.match(workflow,/EKODI_MALL_LEGACY_GIT_REPO: ekodi-mall/);
  assert.match(ownershipGuard,/production_deployments_enabled = false/);
  assert.match(ownershipGuard,/preview_deployment_setting = 'none'/);
  assert.match(ownershipGuard,/UNEXPECTED_PAGES_GIT_SOURCE/);
  assert.match(ownershipGuard,/PAGES_PRODUCTION_GIT_AUTODEPLOY_STILL_ENABLED/);
  assert.match(ownershipGuard,/production remains owned by ekodi-platform direct-upload CI/);
});

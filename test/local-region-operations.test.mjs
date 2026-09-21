import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('local-region operating-rights migration is additive and seeds CGMA for every Cheonggye module',async()=>{
  const sql=await read('migrations/0103_local_region_operating_rights.sql');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS local_region_operator_assignments/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS local_region_operator_events/);
  assert.match(sql,/event_key TEXT NOT NULL UNIQUE/);
  for(const moduleId of ['directory','commerce','commerce-pass','events','jobs','sharing','broadcast','proposals']){
    assert.match(sql,new RegExp("'local:cheonggye','"+moduleId+"','cgma','cgma','lead_operator','active'"));
    assert.match(sql,new RegExp("'seed:local:cheonggye:"+moduleId+":cgma'"));
  }
});

test('Cheonggye admin exposes a live read-only operating-rights ledger',async()=>{
  const [page,client,router]=await Promise.all([
    read('local-region-page.js'),
    read('local-region-operations-admin.js'),
    read('platform-router-entry-worker.js'),
  ]);
  assert.match(page,/운영권 이력/);
  assert.match(page,/data-region-operations-ledger/);
  assert.match(page,/local-region-operations-admin\.js/);
  assert.match(client,/\/api\/local-operations\/cheonggye/);
  assert.match(client,/tenant\.operations\.manage/);
  assert.doesNotMatch(client,/method\s*:\s*['"]POST['"]/);
  assert.match(router,/localRegionOperationsAdminScript/);
  assert.match(router,/\/cheonggye\/local-region-operations-admin\.js/);
});

test('regional operations API is authenticated, operation-scoped and routed before generic customer APIs',async()=>{
  const [control,access,entry]=await Promise.all([
    read('local-region-operations-control.js'),
    read('regional-access-control.js'),
    read('customer-entry-worker.js'),
  ]);
  assert.match(control,/resolveRegionalAccess/);
  assert.match(control,/TENANT_ADMIN_CAPABILITIES\.operations/);
  assert.match(control,/local_region_operator_assignments/);
  assert.match(control,/local_region_operator_events/);
  assert.match(access,/export async function resolveRegionalAccess/);
  const operations=entry.indexOf("path.startsWith('/api/local-operations/')");
  const customer=entry.indexOf("path.startsWith('/api/customer/')");
  assert.ok(operations>0&&customer>operations);
  assert.match(entry,/handleLocalRegionOperations/);
});

test('release ownership and production manifests include the operating-rights ledger',async()=>{
  const [controlWorkflow,siteWorkflow,stageWorkflow,controlManifestText,siteManifestText]=await Promise.all([
    read('.github/workflows/deploy-control-api.yml'),
    read('.github/workflows/deploy-site-core.yml'),
    read('.github/workflows/stage-shared-site-shell.yml'),
    read('deploy/manifests/control-api.worker.json'),
    read('deploy/manifests/shared-site.worker.json'),
  ]);
  assert.match(controlWorkflow,/local-region-operations-control\.js/);
  assert.match(controlWorkflow,/test\/local-region-operations\.test\.mjs/);
  assert.match(siteWorkflow,/local-region-operations-admin\.js/);
  assert.match(stageWorkflow,/local-region-operations-admin\.js/);
  const controlManifest=JSON.parse(controlManifestText);
  const apiProbe=controlManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/api/local-operations/cheonggye');
  assert.ok(apiProbe);
  assert.deepEqual(apiProbe.statuses,[401]);
  const siteManifest=JSON.parse(siteManifestText);
  const adminProbe=siteManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/cheonggye/admin');
  assert.ok(adminProbe?.expect?.includes('운영권 이력'));
  assert.ok(adminProbe?.expect?.includes('local-region-operations-admin.js'));
});

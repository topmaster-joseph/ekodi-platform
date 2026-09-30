import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('local-region operating-rights migrations are additive and seed CGMA',async()=>{
  const [rights,directory]=await Promise.all([
    read('migrations/0103_local_region_operating_rights.sql'),
    read('migrations/0104_local_region_operator_directory.sql'),
  ]);
  assert.match(rights,/CREATE TABLE IF NOT EXISTS local_region_operator_assignments/);
  assert.match(rights,/CREATE TABLE IF NOT EXISTS local_region_operator_events/);
  assert.match(rights,/event_key TEXT NOT NULL UNIQUE/);
  for(const moduleId of ['directory','commerce','commerce-pass','events','jobs','sharing','broadcast','proposals']){
    assert.match(rights,new RegExp("'local:cheonggye','"+moduleId+"','cgma','cgma','lead_operator','active'"));
    assert.match(rights,new RegExp("'seed:local:cheonggye:"+moduleId+":cgma'"));
  }
  assert.match(directory,/CREATE TABLE IF NOT EXISTS local_region_operators/);
  assert.match(directory,/UNIQUE INDEX IF NOT EXISTS idx_local_region_operators_region_tenant/);
  assert.match(directory,/'local:cheonggye','cgma','cgma','청계면상인회'/);
});

test('Cheonggye admin exposes live operating-rights history and guarded management controls',async()=>{
  const [page,client,router]=await Promise.all([
    read('local-region-page.js'),
    read('local-region-operations-admin.js'),
    read('platform-router-entry-worker.js'),
  ]);
  assert.match(page,/운영권 이력/);
  assert.match(page,/data-region-operations-ledger/);
  assert.match(page,/ledger-manage-grid/);
  assert.match(page,/local-region-operations-admin\.js/);
  assert.match(client,/\/api\/local-operations\/cheonggye/);
  assert.match(client,/\/api\/local-operations\/cheonggye\/actions/);
  assert.match(client,/register_operator/);
  assert.match(client,/start_transfer/);
  assert.match(client,/complete_transfer/);
  assert.match(client,/canManageOperatingRights/);
  assert.match(client,/tenant\.operations\.manage/);
  assert.match(router,/localRegionOperationsAdminScript/);
  assert.match(router,/\/cheonggye\/local-region-operations-admin\.js/);
});

test('regional governance API separates read operations from high-authority writes',async()=>{
  const [control,access,entry]=await Promise.all([
    read('local-region-operations-control.js'),
    read('regional-access-control.js'),
    read('customer-entry-worker.js'),
  ]);
  assert.match(control,/resolveRegionalAccess/);
  assert.match(control,/TENANT_ADMIN_CAPABILITIES\.operations/);
  assert.match(control,/TENANT_ADMIN_CAPABILITIES\.access/);
  assert.match(control,/canManageOperatingRights/);
  assert.match(control,/sameOriginForWrite/);
  assert.match(control,/LOCAL_REGION_GOVERNANCE_FORBIDDEN/);
  assert.match(control,/LOCAL_REGION_LEAD_PROTECTED/);
  assert.match(control,/local_region_operator_assignments/);
  assert.match(control,/local_region_operator_events/);
  assert.match(control,/local_region_operators/);
  assert.match(access,/export async function resolveRegionalAccess/);
  assert.match(access,/delegatedOperatorCandidates/);
  assert.match(access,/GROUP_CONCAT\(DISTINCT a\.module_id\)/);
  assert.match(access,/canManageAccess:false/);
  const operations=entry.indexOf("path.startsWith('/api/local-operations/')");
  const customer=entry.indexOf("path.startsWith('/api/customer/')");
  assert.ok(operations>0&&customer>operations);
  assert.match(entry,/handleLocalRegionOperations/);
});

test('handover actions preserve overlap and audit semantics',async()=>{
  const control=await read('local-region-operations-control.js');
  for(const action of ['add_co_operator','start_transfer','complete_transfer','suspend_assignment','reactivate_assignment','revoke_assignment']){
    assert.match(control,new RegExp(action));
  }
  assert.match(control,/role='co_operator',status='handover'/);
  assert.match(control,/role='lead_operator',status='active'/);
  assert.match(control,/eventType:'transfer_completed'|transfer_completed/);
  assert.match(control,/eventType:'role_changed'|role_changed/);
  assert.match(control,/주 운영단체는 먼저 운영권 이양을 완료해야/);
});

test('release ownership and production manifests include governance controls',async()=>{
  const [controlWorkflow,siteWorkflow,stageWorkflow,controlManifestText,siteManifestText]=await Promise.all([
    read('.github/workflows/deploy-control-api.yml'),
    read('.github/workflows/deploy-site-core.yml'),
    read('.github/workflows/stage-shared-site-shell.yml'),
    read('deploy/manifests/control-api.worker.json'),
    read('deploy/manifests/shared-site.worker.json'),
  ]);
  assert.match(controlWorkflow,/local-region-operations-control\.js/);
  assert.match(controlWorkflow,/migrations\/\*\*/);
  assert.match(controlWorkflow,/test\/local-region-operations\.test\.mjs/);
  assert.match(siteWorkflow,/local-region-operations-admin\.js/);
  assert.match(stageWorkflow,/local-region-operations-admin\.js/);
  const controlManifest=JSON.parse(controlManifestText);
  const apiProbe=controlManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/api/local-operations/cheonggye');
  assert.ok(apiProbe);
  assert.deepEqual(apiProbe.statuses,[401]);
  const writeProbe=controlManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/api/local-operations/cheonggye/actions');
  assert.ok(writeProbe);
  assert.equal(writeProbe.method,'POST');
  assert.deepEqual(writeProbe.statuses,[401]);
  const siteManifest=JSON.parse(siteManifestText);
  const adminProbe=siteManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/cheonggye/admin');
  assert.ok(adminProbe?.expect?.includes('운영권 이력'));
  const assetProbe=siteManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/cheonggye/local-region-operations-admin.js');
  assert.ok(assetProbe);
  assert.ok(assetProbe.expect.includes('register_operator'));
  assert.ok(assetProbe.expect.includes('complete_transfer'));
});

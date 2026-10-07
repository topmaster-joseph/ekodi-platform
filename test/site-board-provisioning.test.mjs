import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  resolveSiteBoardRoute,
  EKODI_SITE_BOARD_PROVISIONING,
} from '../site-board-control.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('site board provisioning is registry-scoped and excludes generic platform utilities',()=>{
  assert.equal(EKODI_SITE_BOARD_PROVISIONING.policyId,'EKODI-SITE-BOARD-PROVISIONING-001');
  assert.equal(EKODI_SITE_BOARD_PROVISIONING.status,'enforced');
  assert.equal(EKODI_SITE_BOARD_PROVISIONING.sharedPlatformDependency,'authentication_identity_only');
  assert.equal(EKODI_SITE_BOARD_PROVISIONING.futureSitesAutoInherit,true);
  assert.equal(EKODI_SITE_BOARD_PROVISIONING.genericPlatformServicesExcludedByDefault,true);

  for(const path of [
    'https://ekodi.kr/jadam/board',
    'https://ekodi.kr/pizzamaru/board',
    'https://ekodi.kr/yogurt/board',
    'https://ekodi.kr/cheonggye/board',
    'https://ekodi.kr/cgma/board',
    'https://ekodi.kr/mnubiz/board',
    'https://ekodi.kr/ekodichurch/board',
    'https://ekodi.kr/ekodibiz/board',
    'https://ekodi.kr/ekodilab/board',
    'https://ekodi.kr/ekoditrade/board',
    'https://ekodi.kr/ekodicafe/board',
    'https://ekodi.kr/ekodimission/board',
    'https://ekodi.kr/pyeonggongmok/board',
  ]) assert.ok(resolveSiteBoardRoute(path),path);

  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/my/board'),null);
  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/ai/board'),null);
  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/ekodimall/board'),null);
  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/invest/board'),null);
});

test('independent custom domains retain independent board identity',()=>{
  assert.equal(resolveSiteBoardRoute('https://seonammedi.kr/board')?.siteId,'seonammedi');
  assert.equal(resolveSiteBoardRoute('https://cgma.or.kr/board')?.siteId,'cgma');
  assert.equal(resolveSiteBoardRoute('https://www.cgma.or.kr/board/api/health')?.siteId,'cgma');
});

test('board coverage reconcile is non-destructive and scheduled',async()=>{
  const board=await read('site-board-control.js');
  const router=await read('platform-router-entry-worker.js');
  const wrangler=await read('wrangler.site.toml');
  assert.match(board,/export async function reconcileSiteBoardInstances/);
  assert.match(board,/INSERT OR IGNORE INTO ekodi_board_instances/);
  assert.match(board,/destructiveChanges:0/);
  assert.match(board,/active_customer_tenant/);
  assert.match(board,/isWorkspaceSlug/);
  assert.doesNotMatch(board,/DELETE FROM ekodi_board_instances/);
  assert.doesNotMatch(board,/DROP TABLE ekodi_board_instances/);
  const control=await read('mission-control-entry-worker.js');
  assert.doesNotMatch(router,/async scheduled\(controller,env,ctx\)/);
  assert.doesNotMatch(wrangler,/\[triggers\]/);
  assert.match(control,/reconcileSiteBoardInstances/);
  assert.match(control,/scheduledAt\.getUTCMinutes\(\) === 0/);
  assert.match(control,/boardCoverageHourly/);
  assert.doesNotMatch(wrangler,/"\/\*\/board\*"/);
  const stage=await read('.github/workflows/stage-shared-site-shell.yml');
  const deploy=await read('.github/workflows/deploy-site-core.yml');
  assert.match(stage,/Static asset would shadow the independent Board Runtime route/);
  assert.match(deploy,/Static asset would shadow the independent Board Runtime route/);
});

test('site lifecycle registry owns future board provisioning policy',async()=>{
  const registry=JSON.parse(await read('config/site-lifecycle-registry.json'));
  const p=registry.boardProvisioning;
  assert.equal(p.sourceOfTruth,'site-lifecycle-registry');
  assert.deepEqual(p.eligibleClasses,['workspace_user_site']);
  assert.equal(p.dynamicTenantSource,'active_customer_tenants');
  assert.equal(p.authorizationOwner,'board_local_membership');
  assert.equal(p.provisioningMode,'idempotent_reconcile');
  assert.equal(p.futureSitesAutoInherit,true);
  assert.equal(p.perSiteOptOutAllowed,false);
  assert.equal(p.destructiveReconciliationForbidden,true);
  const ids=new Set(p.independentSites.map(site=>site.id));
  for(const id of ['ekodimission','seonammedi','pyeonggongmok'])assert.ok(ids.has(id));
});

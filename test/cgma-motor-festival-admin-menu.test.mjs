import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';
import { workspaceAdminCanAccess, workspaceAdminScript } from '../workspace-admin-page.js';
import { tenantRoleCanManageAccess } from '../tenant-access-authority.js';
import { festivalStatisticsText } from '../cgma-motor-festival-admin.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('festival menu lives in the CGMA admin shell at /cgma/admin/festival', async () => {
  assert.equal(isWorkspaceAdminPathShape('/cgma/admin/festival'), true);
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /\['festival','모터페스티벌 신청'\]/);
  assert.match(script, /dedicated\.add\('festival'\)/);
  assert.match(script, /workspace==='cgma'&&section==='festival'\)return cgmaFestivalAdmin\(\)/);
  assert.match(script, /festival:POLICY\.capabilities\.access/);
  assert.match(script, /\/cgma\/admin\/assets\/cgma-motor-festival-admin\.js/);
  assert.match(script, /mountCgmaMotorFestivalAdmin\(\{root:\$\('mainPanel'\),summaryRoot:\$\('summaryCards'\),getToken:accessToken,state\}\)/);
});

test('menu visibility matches the server-side authority exactly', () => {
  for (const role of ['owner','tenant_admin','workspace_admin','admin','manager','member','viewer','marketing_manager']) {
    assert.equal(workspaceAdminCanAccess(role,'festival'), tenantRoleCanManageAccess(role), role);
  }
  assert.equal(workspaceAdminCanAccess('owner','festival'), true);
  assert.equal(workspaceAdminCanAccess('admin','festival'), true);
  assert.equal(workspaceAdminCanAccess('member','festival'), false);
});

test('module uses the shell token, same-origin API, safe DOM and published assets', async () => {
  const [module, site, build] = await Promise.all([read('cgma-motor-festival-admin.js'), read('site-worker.js'), read('scripts/build.mjs')]);
  assert.match(module, /const API='\/api\/merchant-events\/motor-festival-2026\/applications'/);
  assert.match(module, /authorization:'Bearer '\+token/);
  assert.doesNotMatch(module, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(module, /sessionStorage|localStorage/);
  assert.match(site, /\['\/cgma\/admin\/assets\/cgma-motor-festival-admin\.js','\/cgma-motor-festival-admin\.js'\]/);
  assert.match(site, /\['\/cgma\/admin\/assets\/cgma-motor-festival-admin\.css','\/cgma-motor-festival-admin\.css'\]/);
  assert.match(build, /'cgma-motor-festival-admin\.css','cgma-motor-festival-admin\.js'/);
});

test('copied statistics carry no personal data', () => {
  const text = festivalStatisticsText({total:2,participating:1,maybe:1,declined:0,regular:1,join:1,info:0,none:0,
    byCategory:{'음식·분식':2},byActivity:{'판매':2},bySupport:{'전기':1},byHours:{all:2}});
  assert.match(text, /전체 2건/);
  assert.match(text, /종일 2/);
  assert.doesNotMatch(text, /010|MF26-|@/);
});

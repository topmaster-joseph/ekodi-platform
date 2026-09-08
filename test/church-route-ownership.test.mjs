import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHURCH_ROUTE_CONTRACT } from '../scripts/ensure-church-route-ownership.mjs';

test('Church route contract avoids the ambiguous no-slash wildcard and verifies live public/admin boundaries',()=>{
  assert.deepEqual(CHURCH_ROUTE_CONTRACT.desiredGateway,['ekodi.kr/ekodichurch','ekodi.kr/ekodichurch/*']);
  assert.equal(CHURCH_ROUTE_CONTRACT.retiredGateway,'ekodi.kr/ekodichurch*');
  assert.equal(CHURCH_ROUTE_CONTRACT.gateway,'ekodi-church-path-gateway');
  assert.equal(CHURCH_ROUTE_CONTRACT.publicUrl,'https://ekodi.kr/ekodichurch/');
  assert.equal(CHURCH_ROUTE_CONTRACT.adminUrl,'https://ekodi.kr/ekodichurch/admin');
  assert.equal(CHURCH_ROUTE_CONTRACT.publicRoute,'church-public-path');
  assert.equal(CHURCH_ROUTE_CONTRACT.adminRoute,'workspace-admin');
});

test('Shared Site production workflow repairs Church route ownership before guarded promotion',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const repair=workflow.indexOf('Enforce canonical Church route ownership');
  const promote=workflow.indexOf('Candidate at 0%, verify routes, promote and auto-rollback on failure');
  assert.ok(repair>0&&promote>repair);
  assert.match(workflow,/node scripts\/ensure-church-route-ownership\.mjs/);
});

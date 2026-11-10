import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CHEONGGYE_PUBLICATION_HOLD,cheonggyePublicHoldResponse,
  cheonggyePublicApiHoldResponse,
} from '../region-publication-hold.js';

const manifest=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const withheld=manifest=>manifest.worker.requests.filter(x=>x.headerExpect?.includes('x-ekodi-route: regional-private-hold'));

test('Control API 404 owner-held regional canaries enforce canonical no-store across all seven paths',()=>{
  assert.equal(CHEONGGYE_PUBLICATION_HOLD,true,'no automated public release of private region');
  const requests=withheld(manifest('../deploy/manifests/control-api.worker.json'));
  assert.equal(requests.length,7);
  for(const entry of requests){
    assert.deepEqual(entry.statuses,[404],entry.url);
    assert.ok(entry.headerExpect.includes('cache-control: no-store'),entry.url);
    assert.ok(entry.headerExpect.includes('x-ekodi-region-publication: private-owner-release-required'),entry.url);
    assert.ok(entry.headerExpect.some(x=>x.startsWith('x-robots-tag: noindex')),entry.url);
    assert.ok(entry.headerExpect.includes('x-content-type-options: nosniff'),entry.url);
    assert.equal(entry.rollbackVerify,false,entry.url);
    assert.equal(entry.expect?.includes('REGIONAL_PUBLICATION_PRIVATE'),true,entry.url);
  }
});

test('Site Core keeps stronger private+no-store canary for all thirteen held paths',()=>{
  const requests=withheld(manifest('../deploy/manifests/shared-site.worker.json'));
  assert.equal(requests.length,13);
  for(const entry of requests){
    assert.deepEqual(entry.statuses,[404],entry.url);
    assert.ok(entry.headerExpect.includes('cache-control: private, no-store'),entry.url);
    assert.ok(entry.headerExpect.includes('x-ekodi-region-publication: private-owner-release-required'),entry.url);
    assert.ok(entry.headerExpect.some(x=>x.startsWith('x-robots-tag: noindex')),entry.url);
  }
});

test('the real Cheonggye 404 source remains private even when canonical Control proxy normalizes cache text',async()=>{
  const html=cheonggyePublicHoldResponse(new Request('https://ekodi.kr/cheonggye'));
  const api=cheonggyePublicApiHoldResponse(new Request('https://ekodi.kr/api/local-operations/cheonggye/modules/directory'));
  for(const response of [html,api]){
    assert.ok(response);
    assert.equal(response.status,404);
    assert.match(response.headers.get('cache-control')||'',/private/i);
    assert.match(response.headers.get('cache-control')||'',/no-store/i);
    assert.equal(response.headers.get('x-ekodi-region-publication'),'private-owner-release-required');
    assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
  }
  assert.equal(cheonggyePublicApiHoldResponse(
    new Request('https://ekodi.kr/api/local-operations/cheonggye/modules/directory/admin')
  ),null,'privileged admin route must remain owned by its authorization gate');
});

test('board verifier contract changes automatically trigger the guarded Shared Site owner deploy',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const push=workflow.slice(workflow.indexOf('  push:'),workflow.indexOf('\npermissions:'));
  assert.ok(push.includes("'scripts/verify-independent-board-live.mjs'"),
    'live board sentinel must trigger its own protected release');
  assert.ok(push.includes("'test/independent-board-live-sentinel.test.mjs'"),
    'board sentinel regression tests must trigger protected release');
  assert.ok(workflow.includes('run: node scripts/verify-independent-board-live.mjs'));
  assert.ok(workflow.includes('Candidate at 0%, verify routes, promote and auto-rollback on failure'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const recovery=readFileSync(new URL('../scripts/recover-release-provenance.mjs',import.meta.url),'utf8');
const converger=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const e2e=readFileSync(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml',import.meta.url),'utf8');

test('owner-approved exact-SHA immediate recovery triggers authenticated production Admin E2E',()=>{
  const selector=recovery.slice(recovery.indexOf('const adminContinuityTouched='),recovery.indexOf('await github',recovery.indexOf('const adminContinuityTouched=')));
  for(const file of ['scripts/recover-release-provenance.mjs','scripts/converge-orchestrated-pr-merge.mjs','scripts/admin-assist-canonical-e2e.mjs','scripts/admin-authenticated-e2e-menu-worker.mjs','scripts/admin-authenticated-e2e-retry.mjs']) {
    assert.ok(selector.includes("'"+file+"'"),file);
  }
  const guard=recovery.indexOf('if(merge.response.ok&&adminContinuityTouched){');
  const mainCheck=recovery.indexOf("main changed before authenticated Admin E2E dispatch");
  const dispatch=recovery.indexOf('actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches',guard);
  const accepted=recovery.indexOf("out('admin_e2e_dispatch','accepted')",dispatch);
  assert.ok(guard>0&&mainCheck>guard&&dispatch>mainCheck&&accepted>dispatch);
  assert.match(recovery,/merge\.data\?\.merged!==true/);
  assert.match(recovery,/main\.data\?\.commit\?\.sha/);
  assert.match(recovery,/authenticated Admin E2E dispatch failed: HTTP/);
  assert.match(recovery,/status!==204/);
  assert.match(recovery,/const merge=checksReady&&upToDate/);
  assert.match(recovery,/run\.app\?\.slug==='github-actions'/);
});

test('protected convergence covers recovery script changes when immediate merge is unavailable',()=>{
  const selector=converger.slice(converger.indexOf('const adminContinuityVerificationTouched='),converger.indexOf('async function dispatchPostMergeDeploys()'));
  assert.ok(selector.includes("file==='scripts/recover-release-provenance.mjs'"));
  assert.ok(selector.includes("file==='test/recovery-admin-e2e-dispatch.test.mjs'"));
  assert.ok(converger.includes("if(adminContinuityVerificationTouched){"));
  assert.ok(converger.includes("'/actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches'"));
});

test('real-session production E2E retains full menu sweep and mandatory session revocation',()=>{
  for(const marker of ['Issue short-lived genuine super-admin session','Verify Admin login and reload session continuity','Click and render every authenticated admin menu','Revoke short-lived E2E session','always()']){
    assert.ok(e2e.includes(marker),marker);
  }
});

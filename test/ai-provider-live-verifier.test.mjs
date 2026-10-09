import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('live provider control verifier checks the current tabbed UI rather than a retired heading',()=>{
  const verifier=read('scripts/verify-admin-provider-control-production.mjs');
  assert.ok(verifier.includes('EKODI AI CONTROL CENTER'));
  assert.ok(verifier.includes('ekodi-ai-center-tabs'));
  assert.ok(verifier.includes('EKODIProviderControl'));
  assert.ok(verifier.includes('/admin/status/aiops'));
  assert.ok(!verifier.includes('COMMON AI PROVIDER CONTROL'));
});

test('admin UI verifier changes retrigger guarded site deployment',()=>{
  const release=read('scripts/converge-orchestrated-pr-merge.mjs');
  const start=release.indexOf('const sharedSiteTouched=');
  const stop=release.indexOf('async function dispatchPostMergeDeploys');
  assert.ok(start>=0&&stop>start);
  const site=release.slice(start,stop);
  assert.ok(site.includes('scripts/verify-admin-provider-control-production.mjs'));
  assert.ok(release.includes('if(sharedSiteTouched)'));
  assert.ok(release.includes('release_branch_ref:branch,release_task_id:taskId'));
});

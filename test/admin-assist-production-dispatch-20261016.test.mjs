import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml',import.meta.url),'utf8');

test('canonical Assist verification changes trigger full genuine-session Admin E2E',()=>{
  const start=source.indexOf('const adminContinuityVerificationTouched=');
  const end=source.indexOf('async function dispatchPostMergeDeploys()',start);
  assert.ok(start>=0&&end>start,'authenticated production E2E dispatch selector required');
  const selector=source.slice(start,end);
  for(const file of [
    'scripts/admin-authenticated-e2e-menu-worker.mjs',
    'scripts/admin-authenticated-e2e-retry.mjs',
    'scripts/admin-assist-canonical-e2e.mjs',
    'test/admin-assist-production-dispatch-20261016.test.mjs',
  ]) assert.ok(selector.includes("file==='"+file+"'"),file);
  assert.ok(source.includes("if(adminContinuityVerificationTouched){"));
  assert.ok(source.includes("'/actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches'"));
  assert.ok(source.includes("body:JSON.stringify({ref:'main'})"));
});

test('protected real-session sweep issues and revokes a temporary session',()=>{
  assert.ok(workflow.includes('Issue short-lived genuine super-admin session'));
  assert.ok(workflow.includes('Verify Admin login and reload session continuity'));
  assert.ok(workflow.includes('Click and render every authenticated admin menu'));
  assert.ok(workflow.includes('Revoke short-lived E2E session'));
  assert.ok(workflow.includes('always()'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const workflow=read('.github/workflows/verify-ekodimission-native-postrelease.yml');
const native=read('.github/workflows/ekodi-background-browser-worker.yml');
const policy=JSON.parse(read('config/background-browser-worker-policy.json'));

test('Mission postrelease canary uses EKODI-owned browser on both phone and desktop',()=>{
  assert.match(workflow,/uses: \.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g);
  assert.match(workflow,/device_profile: mobile-portrait/);
  assert.match(workflow,/device_profile: desktop/);
  for(const route of ['/ekodimission','/ekodimission/activities','/ekodimission/history','/ekodimission/stories','/ekodimission/partners','/ekodimission/activities/260926-chuseok-open-table/archive'])
    assert.ok(workflow.includes(route),'Missing canonical route '+route);
  assert.match(workflow,/Deploy Activity Public Share Schema/);
  assert.match(workflow,/Deploy EKODI Operating Space/);
  assert.match(workflow,/workflow_run.conclusion == 'success'/);
});

test('Mission live browser smoke is bounded read-only and does not expose user credentials',()=>{
  assert.equal(policy.status,'enforced');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.networkSafety.mutationGrantDefault,false);
  assert.equal(policy.evidence.machineReadableResultRequired,true);
  assert.match(native,/allowMutation:false/);
  assert.match(native,/\.horizontalOverflow == true/);
  assert.match(native,/\.pageErrors \| length == 0/);
  assert.match(native,/artifacts\/background-browser-worker/);
  assert.doesNotMatch(workflow,/(?:SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN|permissions: write|Desktop_Commander|curl.*POST|allowMutation: true)/);
});

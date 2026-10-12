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
  assert.equal((workflow.match(/surface_registry: config\/ekodimission-native-postrelease-surfaces\.json/g)||[]).length,2);
  const onlyMission=JSON.parse(read('config/ekodimission-native-postrelease-surfaces.json'));
  assert.equal(onlyMission.canonicalOrigin,'https://ekodi.kr');
  assert.equal(onlyMission.maxPaths,6);
  assert.deepEqual(onlyMission.surfaces,[],'Avoid unrelated board endpoints in Mission release canary');
  for(const route of ['/ekodimission','/ekodimission/activities','/ekodimission/history','/ekodimission/stories','/ekodimission/partners','/ekodimission/activities/260926-chuseok-open-table/archive'])
    assert.ok(workflow.includes(route),'Missing canonical route '+route);
  assert.match(workflow,/Deploy Activity Public Share Schema/);
  assert.match(workflow,/Deploy EKODI Operating Space/);
  assert.match(workflow,/workflow_run.conclusion == 'success'/);
  assert.equal((workflow.match(/workflow_run.event == 'workflow_dispatch'/g)||[]).length,2,'Both device canaries must require actual dispatch for release workflow runs');
  assert.equal((workflow.match(/workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main'/g)||[]).length,2,'Only protected main push releases may trigger the native canary');
  assert.doesNotMatch(workflow,/if: github.event_name != 'workflow_run' \|\| github.event.workflow_run.conclusion == 'success'/);

});

test('Each native canary job itself refuses PR schema-validation completions',()=>{
  const jobs=['native-mobile','native-desktop'];
  const desired="github.event.workflow_run.event == 'workflow_dispatch' || (github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main')";
  for(const job of jobs){
    const section=workflow.split('  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]*:\n/)[0]||'';
    assert.ok(section,'Native job not present: '+job);
    assert.ok(section.includes(desired),'No production trigger guard inside '+job);
    assert.ok(!section.includes("github.event.workflow_run.event == 'pull_request'"),'PR-only validation cannot trigger '+job);
  }
});

test('Mission live browser smoke is bounded read-only and does not expose user credentials',()=>{
  assert.equal(policy.status,'enforced');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.networkSafety.mutationGrantDefault,false);
  assert.equal(policy.provider.orchestration,'ekodi-owned','Browser tasks must remain under EKODI Orchestrator control');
  assert.equal(policy.evidence.machineReadableResultRequired,true);
  assert.match(native,/allowMutation:false/);
  assert.match(native,/\.horizontalOverflow == true/);
  assert.match(native,/\.httpErrorResponses \| type == \"array\"/,'Native worker must retain network error evidence');
  assert.match(native,/\.screenshots \| length >= 1/,'Native worker must retain visual screenshot evidence');
  assert.match(native,/\.pageErrors \| length == 0/);
  assert.match(native,/artifacts\/background-browser-worker/);
  assert.doesNotMatch(workflow,/(?:SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN|permissions: write|Desktop_Commander|curl.*POST|allowMutation: true)/);
});

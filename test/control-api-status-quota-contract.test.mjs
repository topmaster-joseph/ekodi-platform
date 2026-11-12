import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const publish=async()=>{
  const workflow=await read('.github/workflows/deploy-control-api.yml');
  const start=workflow.indexOf('      - name: Publish Control API production status');
  assert.ok(start>=0,'required publisher not found');
  const end=workflow.indexOf('\n# manual rerun',start);
  return workflow.slice(start,end<0?undefined:end);
};

test('Control API publisher uses the quota-aware transport without bypassing failure',async()=>{
  const step=await publish();
  assert.match(step,/if: always\(\)/);
  assert.match(step,/set -euo pipefail/);
  assert.match(step,/source scripts\/github-status-transient\.sh/);
  assert.match(step,/github_status_curl --fail-with-body -sS/);
  assert.match(step,/\$\{GITHUB_REPOSITORY\}\/statuses\/\$\{GITHUB_SHA\}/);
  assert.match(step,/\$\{\{ job\.status \}\}/);
  assert.match(step,/\$\{\{ github\.token \}\}/);
  assert.doesNotMatch(step,/continue-on-error|\|\|\s*true|set\s+\+e|POST\s+.+workflow_dispatch/);
});

test('legacy status emits the real deployment result, not a hard-coded green',async()=>{
  const step=await publish();
  assert.match(step,/success\) state=success/);
  assert.match(step,/cancelled\) state=error/);
  assert.match(step,/\*\) state=failure/);
  assert.match(step,/--arg state "\$state"/);
  assert.match(step,/\$JOB_STATUS/);
  assert.match(step,/ekodi\/control-api-production/);
  // Asserting that the three branches exist does not say the value survives to
  // the request: a later `state=success` would overwrite all three and this step
  // would report green on a failed deployment. Pin that `state` is assigned
  // nowhere but those branches.
  const assignments=[...step.matchAll(/(^|[\s;(])state=([^\s;&|]*)/g)].map(m=>m[2]);
  assert.deepEqual(assignments,['success','error','failure'],
    'state must be assigned only by the three case branches, in order');
});

test('guarded promotion and production attestation remain mandatory before status transport',async()=>{
  const workflow=await read('.github/workflows/deploy-control-api.yml');
  const guarded=workflow.indexOf('Guarded 0-percent Control candidate then promote');
  const publishIndex=workflow.indexOf('Publish Control API production status');
  assert.ok(guarded>0&&publishIndex>guarded);
  const script=await read('scripts/guarded-worker-release.mjs');
  assert.match(script,/verifyReleaseAttestation\(candidateVersion, 'candidate'\)/);
  assert.match(script,/verifyReleaseAttestation\(candidateVersion, 'production'\)/);
  assert.match(script,/await verifyAll\('', 'production'\)/);
  const transport=await read('scripts/github-status-transient.sh');
  assert.match(transport,/quota_circuit_suppressed/);
  assert.match(transport,/return 22/);
  assert.doesNotMatch(transport,/\bgh pr merge\b|git push|force-push/);
});

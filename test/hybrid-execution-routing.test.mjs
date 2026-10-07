import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridWorkloadPolicySnapshot, normalizeServiceScope, resolveHybridWorkload } from '../hybrid-execution-routing.js';

test('service scopes cover EKODI platform and major subservices', () => {
  const policy=hybridWorkloadPolicySnapshot();
  for (const scope of ['platform','seonammedi','board','ai','ekodichurch','ekodimall','ekodibiz','ekodibooks','ekodilive']) {
    assert.ok(policy.serviceScopes.includes(scope), scope);
  }
  assert.equal(policy.stateAuthority,'cloud');
  assert.equal(policy.workerTransport,'outbound-pull');
  assert.equal(policy.arbitraryShell,false);
});

test('workloads resolve to the existing closed task allowlist and capabilities', () => {
  assert.deepEqual(resolveHybridWorkload({workloadClass:'browser.verify',serviceScope:'seonammedi'}), {
    workloadClass:'browser.verify', serviceScope:'seonammedi', taskType:'computer.browser.execute', requiredCapabilities:['backgroundBrowser'],
  });
  assert.equal(resolveHybridWorkload({workloadClass:'unknown'}), null);
  assert.equal(normalizeServiceScope('../bad'),'platform');
});

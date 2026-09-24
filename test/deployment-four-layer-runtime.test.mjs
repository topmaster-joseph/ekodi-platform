import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveDeploymentContinuity } from '../scripts/resolve-deployment-four-layer.mjs';

test('runtime quota exhaustion prepares verified artifact but holds live promotion',()=>{
  const result=resolveDeploymentContinuity({
    intent:'code_release',
    codeChange:true,
    quotaReport:{state:'exhausted',requests:100000,limit:100000},
  });
  assert.equal(result.selectedLayer,'guarded-deploy');
  assert.equal(result.releaseAction,'prepare-and-hold');
  assert.equal(result.promotionAllowed,false);
  assert.equal(result.verificationMode,'none-live');
  assert.equal(result.resumeCondition,'cloudflare-workers-runtime-quota-reset');
  assert.deepEqual(result.preparedBeforeHold,['ci','staging','immutable-release-artifact','artifact-continuity-evidence']);
});

test('protect state continues guarded deployment with essential-only verification',()=>{
  const result=resolveDeploymentContinuity({
    intent:'code_release',codeChange:true,quotaReport:{state:'protect'}
  });
  assert.equal(result.selectedLayer,'guarded-deploy');
  assert.equal(result.releaseAction,'proceed');
  assert.equal(result.promotionAllowed,true);
  assert.equal(result.verificationMode,'essential-only');
});

test('normal state continues full guarded deployment',()=>{
  const result=resolveDeploymentContinuity({
    intent:'code_release',codeChange:true,quotaReport:{state:'normal'}
  });
  assert.equal(result.selectedLayer,'guarded-deploy');
  assert.equal(result.releaseAction,'proceed');
  assert.equal(result.verificationMode,'full');
});

test('Workers Builds exhaustion does not block GitHub Actions plus Wrangler transport',()=>{
  const result=resolveDeploymentContinuity({
    intent:'code_release',codeChange:true,workersBuildsExhausted:true,quotaReport:{state:'normal'}
  });
  assert.equal(result.selectedLayer,'guarded-deploy');
  assert.equal(result.promotionAllowed,true);
});

test('workflow resolves four-layer continuity before any exhausted-quota hold',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const resolve=workflow.indexOf('Resolve four-layer deployment continuity');
  const build=workflow.indexOf('Build shared site assets');
  const continuity=workflow.indexOf('Enforce staging-to-production artifact continuity');
  const hold=workflow.indexOf('Hold production promotion after artifact preparation');
  const guarded=workflow.indexOf('Candidate at 0%, verify routes, promote and auto-rollback on failure');
  assert.ok(resolve>=0&&resolve<build);
  assert.ok(build<continuity);
  assert.ok(continuity<hold);
  assert.ok(hold<guarded);
  assert.match(workflow,/steps\.continuity\.outputs\.release_action == 'prepare-and-hold'/);
  assert.doesNotMatch(workflow,/Open quota circuit before production probes when exhausted/);
});

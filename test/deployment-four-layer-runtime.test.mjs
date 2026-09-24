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


test('unknown quota state remains guarded Deploy and is never invented as exhausted',()=>{
  const result=resolveDeploymentContinuity({
    intent:'code_release',codeChange:true,quotaReport:{state:'unknown'}
  });
  assert.equal(result.selectedLayer,'guarded-deploy');
  assert.equal(result.runtimeQuotaExhausted,false);
  assert.equal(result.releaseAction,'proceed');
  assert.equal(result.promotionAllowed,true);
});

test('security-critical runtime exhaustion never degrades around the Worker boundary',()=>{
  const result=resolveDeploymentContinuity({
    intent:'safe_static_degrade',
    codeChange:false,
    runtimeSupported:true,
    securityCritical:true,
    quotaReport:{state:'exhausted'}
  });
  assert.equal(result.selectedLayer,'owner');
  assert.equal(result.releaseAction,'owner-decision');
  assert.equal(result.promotionAllowed,false);
  assert.equal(result.preserveSecurityBoundary,true);
});

test('hold happens before infrastructure repair and guarded candidate mutation',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const hold=workflow.indexOf('Hold production promotion after artifact preparation');
  const domainRepair=workflow.indexOf('Verify and repair Cloudflare custom-domain attachments');
  const candidate=workflow.indexOf('Candidate at 0%, verify routes, promote and auto-rollback on failure');
  assert.ok(hold>=0&&hold<domainRepair);
  assert.ok(domainRepair<candidate);
});


test('scheduled recovery runs only after a quota-specific hold and never promotes stale artifacts directly',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  assert.match(workflow,/cron: '7 0 \* \* \*'/);
  assert.match(workflow,/prior_conclusion/);
  assert.match(workflow,/non-quota-failure-requires-review/);
  assert.match(workflow,/Cloudflare Workers runtime quota is exhausted\. EKODI completed CI, staging and immutable artifact continuity/);
  assert.match(workflow,/quota-reset-resume-same-sha/);
  assert.match(workflow,/quota-reset-revalidate-current-main/);
  assert.match(workflow,/fresh-current-main-revalidation/);
  assert.match(workflow,/No held artifact is promoted directly/);
});

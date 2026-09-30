import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deploymentLayerOrder,selectDeploymentLayer,explainFourLayerFallback} from '../deployment-layer-router.js';

test('deployment priority is Runtime then guarded Deploy then Cloud Control then Owner',()=>{
  assert.deepEqual(deploymentLayerOrder().map(x=>x.id),['runtime','guarded-deploy','cloud-control','owner']);
});

test('existing runtime/config path wins without production deployment',()=>{
  const result=selectDeploymentLayer({intent:'existing_feature_flag',runtimeSupported:true,codeChange:false});
  assert.equal(result.layer,'runtime');
  assert.equal(result.rank,1);
  assert.equal(result.automatic,true);
});

test('code release uses GitHub Actions plus Wrangler even when Workers Builds is exhausted',()=>{
  const result=selectDeploymentLayer({
    intent:'code_release',codeChange:true,guardedDeployAvailable:true,
    githubActionsWranglerAvailable:true,workersBuildsExhausted:true
  });
  assert.equal(result.layer,'guarded-deploy');
  assert.equal(result.rank,2);
  assert.equal(result.cloudflareWorkersBuildsRequired,false);
  assert.match(result.reason,/bypasses-workers-builds/);
});

test('Cloud Control is break-glass repair only and returns to guarded Deploy',()=>{
  const result=selectDeploymentLayer({
    intent:'route_repair',cloudControlAuthorized:true,cloudControlAllowlisted:true,
    guardedDeployAvailable:false
  });
  assert.equal(result.layer,'cloud-control');
  assert.equal(result.rank,3);
  assert.equal(result.serviceDeploymentLane,false);
  assert.equal(result.returnsTo,'guarded-deploy');
});

test('owner layer owns billing plan and limit increase decisions',()=>{
  for(const intent of ['provider_plan_change','paid_cost_commitment','limit_increase_request','billing_change']){
    const result=selectDeploymentLayer({intent});
    assert.equal(result.layer,'owner');
    assert.equal(result.rank,4);
    assert.equal(result.requiresHumanApproval,true);
  }
});

test('security-critical runtime quota exhaustion never fails open',()=>{
  const result=selectDeploymentLayer({
    intent:'safe_static_degrade',runtimeSupported:true,codeChange:false,
    runtimeQuotaExhausted:true,securityCritical:true
  });
  assert.equal(result.layer,'owner');
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'security-critical-runtime-capacity-exhausted');
});

test('unknown or unavailable lower path fails closed to Owner rather than inventing capacity',()=>{
  const result=explainFourLayerFallback({intent:'code_release',codeChange:true,guardedDeployAvailable:false});
  assert.equal(result.choice.layer,'owner');
  assert.equal(result.automaticPaidUpgrade,false);
  assert.equal(result.preserveSecurityBoundary,true);
});

test('policy records current Cloudflare reference without turning it into measured usage',async()=>{
  const policy=JSON.parse(await readFile('config/deployment-four-layer-policy.json','utf8'));
  assert.equal(policy.cloudflareReference.workersBuildsFree.buildMinutesPerMonth,3000);
  assert.equal(policy.cloudflareReference.workersBuildsFree.concurrentBuilds,1);
  assert.equal(policy.cloudflareReference.workersFree.requestsPerDay,100000);
  assert.equal(policy.selectionRules.unknownQuotaStateIsNotExhausted,true);
});

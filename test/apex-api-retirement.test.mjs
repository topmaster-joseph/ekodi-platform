import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('public EKODI API is apex-only and the legacy Worker domain is explicitly retired',()=>{
  const retiredHost=['api','ekodi','kr'].join('.');
  const wrangler=read('wrangler.api.toml');
  const workflow=read('.github/workflows/deploy-control-api.yml');
  const retirementWorkflow=read('.github/workflows/retire-public-subdomains-wave1.yml');
  const router=read('canonical-surface-router.js');
  const mcp=read('ekodi-mcp-gateway.js');
  const tapo=read('tools/ekodi-device-agent/tapo/index.mjs');
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  const policy=JSON.parse(read('config/domain-canonical-policy.json'));
  const retirement=JSON.parse(read('config/retire-public-subdomains-wave1.json'));

  assert.equal(wrangler.includes('https://'+retiredHost),false);
  assert.equal(wrangler.includes('pattern = "'+retiredHost+'"'),false);
  assert.match(wrangler,/name = "ekodi-auth-api"/);
  assert.match(wrangler,/main = "mission-control-entry-worker\.js"/);
  assert.match(wrangler,/workers_dev = false/);

  assert.equal(workflow.includes('https://'+retiredHost),false);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/health/);

  assert.match(router,/path\.startsWith\(`?['"]\/api\//);
  assert.match(router,/proxyBinding\(request,env\?\.CONTROL_API/);

  assert.equal(mcp.includes('https://'+retiredHost),false);
  assert.equal(tapo.includes('https://'+retiredHost),false);

  const urls=manifest.worker.requests.flatMap(item=>[String(item.url||''),String(item.candidateUrl||'')]);
  assert.equal(urls.some(url=>url.includes(retiredHost)),false);
  assert.equal(urls.some(url=>url.includes('ekodi-auth-api.topmaster-joseph.workers.dev')),false);
  assert.equal(urls.some(url=>url==='https://ekodi.kr/api/health'),true);

  assert.equal(policy.canonicalHost,'ekodi.kr');
  assert.equal(policy.publicAddressPolicy,'apex-path-only');
  assert.equal(policy.subdomainPolicy,'forbidden');
  assert.equal(policy.legacySubdomainRedirects,false);
  for(const name of ['api','auth','mcp','health']){
    assert.ok(policy.siteBoundaryPolicy.reservedTopLevelPaths.includes(name));
  }

  const apiTarget=retirement.targets.find(item=>item.label==='api');
  assert.ok(apiTarget,'API legacy hostname must be included in retirement targets');
  assert.equal(apiTarget.service,'ekodi-auth-api');
  assert.equal(apiTarget.apexHealth,'https://ekodi.kr/api/health');
  assert.equal(apiTarget.directHealth,undefined);
  assert.ok(apiTarget.apexExpect.includes('"canonicalApiBase":"https://ekodi.kr/api"'));
  assert.match(retirementWorkflow,/wrangler\.api\.toml/);
  assert.match(retirementWorkflow,/wrangler\.community\.toml wrangler\.social\.toml wrangler\.energy\.toml wrangler\.work\.toml wrangler\.api\.toml/);
});


test('canonical apex API execution policy blocks retired browser and Admin host use',()=>{
  const policy=JSON.parse(read('config/canonical-api-execution-policy.json'));
  const retired=policy.retiredPublicHostParts.join('.');
  assert.equal(policy.policyId,'CANONICAL-APEX-API-001');
  assert.equal(policy.status,'enforced');
  assert.equal(policy.mode,'mandatory');
  assert.equal(policy.canonicalApiBase,'https://ekodi.kr/api');
  assert.equal(policy.internalExecutionBoundary,'CONTROL_API');
  assert.equal(policy.csp.retiredHostAllowed,false);
  assert.equal(policy.csp.wideningToRetiredHostForbidden,true);
  assert.ok(policy.enforcement.includes('scripts/verify-admin-production-ui-e2e.mjs'));
  assert.ok(policy.fingerprintRequiredAssets.includes('common-services-admin.js'));
  assert.ok(policy.fingerprintRequiredAssets.includes('ai-ops-admin.js'));

  for(const file of policy.browserRuntimeFiles){
    assert.equal(read(file).includes(retired),false,`${file} must not contain retired API host`);
  }
  for(const file of policy.serverRuntimeFiles){
    assert.equal(read(file).includes(retired),false,`${file} must not contain retired API host fallback`);
  }

  const controlPlane=read('admin-ai-control-plane.js');
  const commonServices=read('common-services-admin.js');
  const providerControl=read('admin-provider-control.js');
  const aiControl=read('ai-control-worker.js');
  const postbuild=read('scripts/admin-performance-postbuild.mjs');
  const e2e=read('scripts/admin-authenticated-e2e.mjs');
  const productionE2e=read('scripts/verify-admin-production-ui-e2e.mjs');
  const pkg=JSON.parse(read('package.json'));
  const monitor=JSON.parse(read('monitor-status.json'));
  const api=monitor.sites.find(item=>item.id==='api');

  assert.match(controlPlane,/const API='https:\/\/ekodi\.kr'/);
  assert.match(commonServices,/const CONTROL='https:\/\/ekodi\.kr'/);
  assert.match(providerControl,/const API='https:\/\/ekodi\.kr'/);
  assert.match(aiControl,/clean\(env\.CONTROL_API_URL\)\|\|'https:\/\/ekodi\.kr'/);
  assert.match(postbuild,/admin-ai-control-plane\.js/);
  assert.match(postbuild,/common-services-admin\.js/);
  assert.match(postbuild,/ai-ops-admin\.js/);
  assert.match(e2e,/retiredApiRequests/);
  assert.match(e2e,/Retired API browser requests detected/);
  assert.match(e2e,/Retired API console references detected/);
  assert.match(productionE2e,/retiredApiRequests/);
  assert.match(productionE2e,/Retired API browser requests detected/);
  assert.match(productionE2e,/Retired API console references detected/);
  assert.match(pkg.scripts.precheck,/validate-canonical-api-execution\.mjs/);
  assert.equal(api.domain,'ekodi.kr');
  assert.equal(api.url,'https://ekodi.kr/api/health');
});

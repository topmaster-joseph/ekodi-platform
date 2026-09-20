import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('public EKODI API is apex-only and legacy Worker domain is in the retirement plan',()=>{
  const retiredHost=['api','ekodi','kr'].join('.');
  const wrangler=read('wrangler.api.toml');
  const workflow=read('.github/workflows/deploy-control-api.yml');
  const retirementWorkflow=read('.github/workflows/retire-public-subdomains-wave1.yml');
  const router=read('canonical-surface-router.js');
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  const policy=JSON.parse(read('config/domain-canonical-policy.json'));
  const retirement=JSON.parse(read('config/retire-public-subdomains-wave1.json'));

  assert.equal(wrangler.includes('https://'+retiredHost),false);
  assert.equal(wrangler.includes('pattern = "'+retiredHost+'"'),false);
  assert.match(wrangler,/name = "ekodi-auth-api"/);
  assert.match(wrangler,/main = "mission-control-entry-worker\.js"/);

  assert.equal(workflow.includes('https://'+retiredHost),false);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/health/);

  assert.doesNotMatch(router,/\[legacyEkodiHost\('api'\)\]/);
  assert.match(router,/path\.startsWith\('\/api\/'\)/);
  assert.match(router,/proxyBinding\(request,env\?\.CONTROL_API/);

  const urls=manifest.worker.requests.map(item=>String(item.url||''));
  assert.equal(urls.some(url=>url.includes(retiredHost)),false);
  assert.equal(urls.some(url=>url==='https://ekodi.kr/api/health'),true);

  assert.equal(policy.canonicalHost,'ekodi.kr');
  assert.equal(policy.publicAddressPolicy,'apex-path-only');
  assert.equal(policy.subdomainPolicy,'forbidden');
  assert.equal(policy.legacySubdomainRedirects,false);
  for(const path of ['api','auth','mcp','health']){
    assert.ok(policy.siteBoundaryPolicy.reservedTopLevelPaths.includes(path));
  }

  const apiTarget=retirement.targets.find(item=>item.label==='api');
  assert.ok(apiTarget,'API legacy hostname must be included in retirement targets');
  assert.equal(apiTarget.service,'ekodi-auth-api');
  assert.equal(apiTarget.apexHealth,'https://ekodi.kr/api/health');
  assert.equal(apiTarget.directHealth,'https://ekodi-auth-api.topmaster-joseph.workers.dev/health');
  assert.ok(apiTarget.apexExpect.includes('"canonicalApiBase":"https://ekodi.kr/api"'));
  assert.match(retirementWorkflow,/wrangler\.api\.toml/);
  assert.match(retirementWorkflow,/wrangler\.community\.toml wrangler\.social\.toml wrangler\.energy\.toml wrangler\.api\.toml/);
});

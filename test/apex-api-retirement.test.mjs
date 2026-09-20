import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('public EKODI API is apex-only and Control remains privately bound',()=>{
  const wrangler=read('wrangler.api.toml');
  const workflow=read('.github/workflows/deploy-control-api.yml');
  const router=read('canonical-surface-router.js');
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  const policy=JSON.parse(read('config/domain-canonical-policy.json'));

  assert.doesNotMatch(wrangler,/api\.ekodi\.kr/);
  assert.doesNotMatch(wrangler,/pattern\s*=\s*"api\.ekodi\.kr"/);
  assert.match(wrangler,/name = "ekodi-auth-api"/);
  assert.match(wrangler,/main = "mission-control-entry-worker\.js"/);

  assert.doesNotMatch(workflow,/https:\/\/api\.ekodi\.kr/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/health/);

  assert.doesNotMatch(router,/\[legacyEkodiHost\('api'\)\]/);
  assert.match(router,/path\.startsWith\('\/api\/'\)/);
  assert.match(router,/proxyBinding\(request,env\?\.CONTROL_API/);

  const urls=manifest.worker.requests.map(item=>String(item.url||''));
  assert.equal(urls.some(url=>url.includes('api.ekodi.kr')),false);
  assert.equal(urls.some(url=>url==='https://ekodi.kr/api/health'),true);

  assert.equal(policy.canonicalHost,'ekodi.kr');
  assert.equal(policy.publicAddressPolicy,'apex-path-only');
  assert.equal(policy.subdomainPolicy,'forbidden');
  assert.equal(policy.legacySubdomainRedirects,false);
  for(const path of ['api','auth','mcp','health']){
    assert.ok(policy.siteBoundaryPolicy.reservedTopLevelPaths.includes(path));
  }
});

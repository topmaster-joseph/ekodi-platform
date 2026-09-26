import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('public EKODI API is apex-path only',()=>{
  const wrangler=read('wrangler.api.toml');
  const workflow=read('.github/workflows/deploy-control-api.yml');
  const router=read('canonical-surface-router.js');
  const mcp=read('ekodi-mcp-gateway.js');
  const tapo=read('tools/ekodi-device-agent/tapo/index.mjs');
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  const policy=JSON.parse(read('config/domain-canonical-policy.json'));
  assert.match(wrangler,/name = "ekodi-auth-api"/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/health/);
  assert.match(router,/proxyBinding\(request,env\?\.CONTROL_API/);
  assert.match(mcp,/https:\/\/ekodi\.kr\/api\//);
  assert.match(tapo,/API_DEFAULT = 'https:\/\/ekodi\.kr'/);
  assert.ok(manifest.worker.requests.some(item=>String(item.url||'')==='https://ekodi.kr/api/health'));
  assert.equal(policy.canonicalHost,'ekodi.kr');
  assert.equal(policy.publicAddressPolicy,'apex-path-only');
  assert.equal(policy.subdomainPolicy,'forbidden');
  assert.equal(policy.legacySubdomainRedirects,false);
});

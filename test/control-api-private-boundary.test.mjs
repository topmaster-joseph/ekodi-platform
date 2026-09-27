import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Control API production has no public workers.dev route and candidate verification stays on the apex',()=>{
  const wrangler=read('wrangler.api.toml');
  const router=read('canonical-surface-router.js');
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  assert.match(wrangler,/workers_dev = false/);
  assert.match(router,/headers:request\.headers/);
  assert.match(router,/proxyBinding\(request,env\?\.CONTROL_API/);
  const allUrls=manifest.worker.requests.flatMap(item=>[item.url,item.candidateUrl].filter(Boolean));
  assert.equal(allUrls.some(url=>String(url).includes('ekodi-auth-api.topmaster-joseph.workers.dev')),false);
  const preview=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/api/public/preview/map?scope=ekodi&mode=platform');
  assert.ok(preview);
  assert.equal(preview.candidateUrl,undefined);
});

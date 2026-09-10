import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const router=read('canonical-surface-router.js');
const wrangler=read('wrangler.site.toml');
const docs=read('my/docs/index.html');
test('ekodi.kr/my is served by the canonical surface router through the My binding',()=>{
  assert.match(wrangler,/binding = "MY"\s+service = "ekodi-my"/);
  assert.match(router,/my:'\/my'/);
  assert.match(router,/proxyBinding\(request,env\?\.MY,SURFACE_PREFIXES\.my,'my'\)/);
  assert.match(router,/x-ekodi-canonical-path/);
});
test('My Docs assets are portable below the apex /my path',()=>{
  assert.match(docs,/href="\.\/docs\.css/);
  assert.match(docs,/src="\.\/docs\.js/);
  assert.match(docs,/src="\.\.\/config\.js/);
  assert.doesNotMatch(docs,/src="\/docs\/docs\.js/);
});
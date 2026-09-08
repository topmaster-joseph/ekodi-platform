import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const site=read('site-worker.js');
const wrangler=read('wrangler.site.toml');
const docs=read('my/docs/index.html');

test('ekodi.kr/my is served through the My EKODI service binding',()=>{
  assert.match(wrangler,/binding = "MY"\s+service = "ekodi-my"/);
  assert.match(wrangler,/"\/my\*"/);
  assert.match(site,/isMyApexPath/);
  assert.match(site,/env\.MY\.fetch/);
  assert.match(site,/x-ekodi-canonical-path/);
});

test('My Docs assets are portable below the apex /my path',()=>{
  assert.match(docs,/href="\.\/docs\.css/);
  assert.match(docs,/src="\.\/docs\.js/);
  assert.match(docs,/src="\.\.\/config\.js/);
  assert.doesNotMatch(docs,/src="\/docs\/docs\.js/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../scripts/retire-worker-custom-domains.mjs',import.meta.url),'utf8');

test('Cloudflare retirement accepts 2xx responses without a success field',()=>{
  assert.match(source,/!response\.ok\|\|data\.success===false/);
  assert.doesNotMatch(source,/data\.success!==true/);
});

test('Cloudflare retirement remains fail-closed for explicit API failure',()=>{
  assert.match(source,/throw new Error\("Cloudflare API "/);
  assert.match(source,/data\.errors\|\|data/);
});

test('legacy hostname verification allows Cloudflare edge propagation without cache reuse',()=>{
  assert.match(source,/attempt<=60/);
  assert.match(source,/setTimeout\(r,5000\)/);
  assert.match(source,/"cache-control":"no-cache"/);
  assert.match(source,/"pragma":"no-cache"/);
});

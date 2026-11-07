import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');
const begin = source.indexOf('const MALL_PUBLIC_STARTUP_ASSETS = new Set(');
const end = source.indexOf('\nasync function proxyMallService(', begin);
assert.ok(begin > 0 && end > begin, 'public Mall cache helper must stay isolated');
const code = source.slice(begin, end);
const cacheControl = runInNewContext(
  code + '\nmallPublicStartupAssetCacheControl;',
  { MALL_PREFIX:'/ekodimall' },
);

function probe(path, { method='GET', type, upstreamCache='', status=200, cookie=false, authorization=false, setCookie=false } = {}) {
  const req = {method, headers:new Headers({
    ...(cookie ? {cookie:'a=b'} : {}),
    ...(authorization ? {authorization:'Bearer example'} : {}),
  })};
  const contentType = type || (path.endsWith('.css') ? 'text/css' : 'text/javascript');
  const upstream = {status, headers:new Headers({
    'content-type': contentType,
    ...(upstreamCache ? {'cache-control':upstreamCache} : {}),
    ...(setCookie ? {'set-cookie':'member=one'} : {}),
  })};
  return cacheControl(req, upstream, path);
}

test('only exact public Mall first-page styles and scripts use a short browser cache', () => {
  for(const file of ['styles.css','platform.css','market-dna.css','context-curator.css',
    'home-refresh.css','local-commerce.js','app.js','marketplace-live.js',
    'bookstore-live.js','category-visibility.js','context-curator.js',
    'commerce.js','home-refresh.js']) {
    assert.equal(probe('/ekodimall/assets/'+file),
      'public, max-age=60, stale-while-revalidate=30', file);
  }
  assert.match(source, /mallPublicStartupAssetCacheControl\(request, upstreamResponse, incoming\.pathname, publicPrefix\)/);
});

test('admin, payment, API, private assets, non-200 or wrong MIME are never granted public TTL', () => {
  for (const path of ['/ekodimall/','/ekodimall/api/products',
    '/ekodimall/admin/','/ekodimall/assets/order-ops.js',
    '/ekodimall/assets/supplier-ops.js','/ekodimall/assets/app.js.map',
    '/ekodimall/assets/app.js/evil.js','/ekodimall/assets/private.json',
    '/ekodimall/assets/verification-ops.js']) {
    assert.equal(probe(path),null,path);
  }
  assert.equal(probe('/ekodimall/assets/app.js',{method:'POST'}),null);
  assert.equal(probe('/ekodimall/assets/app.js',{status:404}),null);
  assert.equal(probe('/ekodimall/assets/app.js',{type:'text/html'}),null);
  assert.equal(probe('/ekodimall/assets/styles.css',{type:'text/html'}),null);
});

test('authentication cookies, tokens, private upstream cache and Set-Cookie fail closed', () => {
  const path='/ekodimall/assets/app.js';
  assert.equal(probe(path,{cookie:true}),null);
  assert.equal(probe(path,{authorization:true}),null);
  assert.equal(probe(path,{setCookie:true}),null);
  assert.equal(probe(path,{upstreamCache:'private, max-age=300'}),null);
  assert.equal(probe(path,{upstreamCache:'no-store'}),null);
});

test('privileged Mall proxy surfaces stay no-store and unversioned public HTML keeps revalidation', () => {
  assert.match(source, /adminSurface \|\| apiSurface \|\| verificationOpsSurface \|\| adminEmbed\s*\? 'no-store'/);
  assert.match(source, /\|\| 'public, max-age=0, must-revalidate'\)/);
  assert.equal(probe('/ekodimall/assets/app.js'), 'public, max-age=60, stale-while-revalidate=30');
  assert.equal(probe('/ekodimall/products/book-example'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyAdminAliasTarget} from '../admin-address-policy.js';
import siteWorker from '../site-worker.js';

const origin='https://ekodi.kr';
const canonical='/admin/ai/search-visibility';
const env={ASSETS:{fetch:async()=>new Response('<!doctype html><html><title>EKODI Admin</title></html>',{
  headers:{'content-type':'text/html'}
})}};

test('old Search Visibility short URL preserves site-specific admin intent',()=>{
  assert.equal(legacyAdminAliasTarget('/admin/search-visibility'),canonical);
  assert.equal(legacyAdminAliasTarget('/admin/search-visibility/'),canonical);
  assert.equal(legacyAdminAliasTarget('/admin/search-visibility/other'),'');
  assert.equal(legacyAdminAliasTarget(canonical),'');
  assert.equal(legacyAdminAliasTarget('/admin/payment'),'');
});

test('short Search Visibility deep link redirects before fallback login, preserving safe query',async()=>{
  for(const method of ['GET','HEAD']){
    const r=await siteWorker.fetch(new Request(origin+'/admin/search-visibility/?source=naver&site=ekodibiz.kr',{method}),env,{});
    assert.equal(r.status,308);
    assert.equal(r.headers.get('location'),origin+canonical+'?source=naver&site=ekodibiz.kr');
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(r.headers.get('x-ekodi-route'),'admin-canonical-handoff');
    assert.equal(await r.text(),'');
  }
});

test('canonical Search Visibility is not redirected to another admin section',async()=>{
  const r=await siteWorker.fetch(new Request(origin+canonical),env,{});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('x-ekodi-route'),'admin-fallback');
  assert.equal(r.headers.get('location'),null);
});

test('other existing admin alias routing remains unaffected',()=>{
  assert.equal(legacyAdminAliasTarget('/admin/ekodimall'),'/ekodimall/admin');
  assert.equal(legacyAdminAliasTarget('/cmpmyi/admin/jadam'),'/jadam/admin');
});


test('admin URL policy changes are owned by the protected Site Core release',async()=>{
  const {readFileSync}=await import('node:fs');
  const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const converge=get('scripts/converge-orchestrated-pr-merge.mjs');
  const workflow=get('.github/workflows/deploy-site-core.yml');
  assert.ok(converge.includes("file==='admin-address-policy.js'||"));
  assert.ok(workflow.includes("      - 'admin-address-policy.js'"));
  assert.ok(converge.includes("workflow:'deploy-site-core.yml'"));
  assert.ok(converge.includes("if(sharedSiteTouched)"));
});

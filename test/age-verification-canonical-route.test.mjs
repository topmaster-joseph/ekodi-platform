import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCanonicalSurface} from '../canonical-surface-router.js';
import sharedSite from '../site-shell-worker.js';

const base='https://ekodi.kr';
function setup() {
  const seen=[];
  const env={ASSETS:{async fetch(req){
    seen.push(new URL(req.url).pathname);
    return new Response('<html lang="ko">에코디 성인인증</html>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  }}};
  const legacyFetch=req=>sharedSite.fetch(req,env);
  return {env,legacyFetch,seen};
}
test('only exact /verify/adult namespace goes to canonical Shared Site, no workspace or injected Shell', async()=>{
  const {env,legacyFetch,seen}=setup();
  const result=await routeCanonicalSurface(new Request(base+'/verify/adult/?site=singles'),env,{legacyFetch});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('x-ekodi-route'),'age-verify-ui');
  assert.equal(result.headers.get('x-ekodi-canonical-surface'),'age-verification-ui');
  assert.equal(result.headers.get('x-ekodi-canonical-path'),'/verify/adult');
  assert.equal(result.headers.get('x-ekodi-workspace-visual-dna'),null);
  assert.equal(result.headers.get('x-ekodi-shell'),null);
  assert.match(result.headers.get('content-security-policy'),/cdn\.portone\.io/);
  assert.match(result.headers.get('cache-control'),/no-store/);
  assert.match(result.headers.get('x-robots-tag'),/noindex/);
  assert.deepEqual(seen,['/verify/adult/']);
});
test('canonical path preserves site and return_to on trailing slash redirect', async()=>{
  const {env,legacyFetch}=setup();
  const result=await routeCanonicalSurface(new Request(base+'/verify/adult?site=singles&return_to=%2Fsingles%2Fsubscribe'),env,{legacyFetch});
  assert.equal(result.status,308);
  assert.match(result.headers.get('location'),/\/verify\/adult\/\?site=singles&return_to=%2Fsingles%2Fsubscribe/);
});
test('credential UI assets use same protected route, and unsupported methods/paths fail closed',async()=>{
  const {env,legacyFetch}=setup();
  const a=await routeCanonicalSurface(new Request(base+'/verify/adult/app.js'),env,{legacyFetch});
  assert.equal(a.status,200);
  assert.match(a.headers.get('content-security-policy'),/portone\.io/);
  const b=await routeCanonicalSurface(new Request(base+'/verify/adult/',{method:'POST'}),env,{legacyFetch});
  assert.equal(b.status,405);
  const c=await routeCanonicalSurface(new Request(base+'/verify/adult/unregistered'),env,{legacyFetch});
  assert.equal(c.status,404);
  const unavailable=await routeCanonicalSurface(new Request(base+'/verify/adult/'),env,{});
  assert.equal(unavailable.status,503);
});
test('unrelated workspace /verify paths remain outside the new exact route',async()=>{
  const {env,legacyFetch,seen}=setup();
  const unrelated=await routeCanonicalSurface(new Request(base+'/verify/other'),env,{legacyFetch});
  assert.equal(unrelated,null);
  assert.deepEqual(seen,[]);
});

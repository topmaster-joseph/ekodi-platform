import test from 'node:test';
import assert from 'node:assert/strict';
import {isSinglesRoute,routeSinglesSurface} from '../singles-surface.js';

const env={ASSETS:{fetch:async()=>new Response('asset',{headers:{'content-type':'text/plain'}})}};
const req=(path,method='GET',headers={})=>new Request('https://ekodi.kr'+path,{method,headers});
test('singles route is isolated from legacy Connect and workspaces',()=>{
  assert.equal(isSinglesRoute('/singles'),true);
  assert.equal(isSinglesRoute('/singles/'),true);
  assert.equal(isSinglesRoute('/singles/my'),true);
  assert.equal(isSinglesRoute('/singlesgroup'),false);
  assert.equal(isSinglesRoute('/connect'),false);
});
test('public landing serves only static content without invented people or events',async()=>{
  const result=await routeSinglesSurface(req('/singles'),env);
  assert.equal(result.status,200);
  const html=await result.text();
  assert.match(html,/같은 믿음/);
  assert.match(html,/\/singles\/my/);
  assert.doesNotMatch(html,/<img[^>]+src=['"]https?:/i);
  assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const events=await (await routeSinglesSurface(req('/singles/api/public'),env)).json();
  assert.deepEqual(events.events,[]);
  assert.deepEqual(events.groups,[]);
});
test('missing private configuration means no personal data operations',async()=>{
  const s=await (await routeSinglesSurface(req('/singles/api/status'),env)).json();
  assert.equal(s.onboarding_enabled,false);
  assert.equal(s.matching_enabled,false);
  assert.equal(s.messaging_enabled,false);
  const denied=await routeSinglesSurface(req('/singles/api/me','PUT',{'content-type':'application/json'}),env);
  assert.equal(denied.status,503);
  assert.equal((await denied.json()).error,'singles_enrollment_not_launched');
  assert.equal((await routeSinglesSurface(req('/singles/api/withdraw','DELETE'),env)).status,503);
});
test('private routes are noindex, admin denies access, trailing slashes equivalent',async()=>{
  for(const path of ['/singles/my','/singles/my/','/singles/messages','/singles/discover']){
    const r=await routeSinglesSurface(req(path),env);
    assert.equal(r.status,200);
    assert.match(r.headers.get('x-robots-tag'),/noindex/);
    assert.match(r.headers.get('cache-control'),/no-store/);
  }
  assert.equal((await routeSinglesSurface(req('/singles/admin'),env)).status,404);
  assert.equal((await routeSinglesSurface(req('/singles/missing'),env)).status,404);
  const h=await routeSinglesSurface(req('/singles','HEAD'),env);
  assert.equal(h.status,200);
  assert.equal(await h.text(),'');
});
test('M1 public assets keep static serving path and reject non-safe methods',async()=>{
  const css=await routeSinglesSurface(req('/singles/styles.css'),env);
  assert.equal(await css.text(),'asset');
  const denied=await routeSinglesSurface(req('/singles/groups','POST'),env);
  assert.equal(denied.status,405);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeCanonicalSurface } from '../canonical-surface-router.js';
import publishingWorker from '../publishing-worker.js';

test('canonical publishing prefix strips to the correct private release API without subdomains',async()=>{
  const seen=[];
  const env={PUBLISHING:{fetch:async request=>{
    const url=new URL(request.url);
    seen.push({path:url.pathname,origin:request.headers.get('origin'),method:request.method});
    return publishingWorker.fetch(request,{PUBLISHING_PRIVATE_RELEASE_ENABLED:'false'});
  }}};
  const list=await routeCanonicalSurface(new Request(
    'https://ekodi.kr/publishing/api/private-releases'),env);
  assert.equal(list.status,404);
  const post=await routeCanonicalSurface(new Request(
    'https://ekodi.kr/publishing/api/private-releases/register',{
      method:'POST',
      headers:{origin:'https://ekodi.kr','content-type':'application/json',
        'x-ekodi-csrf':'test-only-not-an-actual-valid-token'},
      body:JSON.stringify({editionId:'PRIVATE-EDITION-001'}),
  }),env);
  assert.equal(post.status,404);
  assert.deepEqual(seen,[
    {path:'/api/private-releases',origin:null,method:'GET'},
    {path:'/api/private-releases/register',origin:'https://ekodi.kr',method:'POST'},
  ]);
  const disabled=await post.json();
  assert.equal(disabled.error,'not-found');
});
test('the public admin shell path also traverses the publisher Worker, not central /api',async()=>{
  const paths=[];
  const env={PUBLISHING:{fetch:async request=>{
    paths.push(new URL(request.url).pathname);
    return new Response('<!doctype html><html lang="ko"><body>비공개 등록</body></html>',
      {headers:{'content-type':'text/html; charset=utf-8'}});
  }}};
  const response=await routeCanonicalSurface(
    new Request('https://ekodi.kr/publishing/private-releases/'),env);
  assert.ok(response);
  assert.equal(response.status,200);
  assert.deepEqual(paths,['/private-releases/']);
});

test('canonical router rewrites private publishing UI script API prefix to the real apex route',async()=>{
  const script=readFileSync(new URL('../publishing/private-releases/private-releases.js',import.meta.url),'utf8');
  const env={PUBLISHING:{fetch:async()=>new Response(script,{
    headers:{'content-type':'application/javascript; charset=utf-8'}})}};
  const response=await routeCanonicalSurface(new Request(
    'https://ekodi.kr/publishing/private-releases/private-releases.js'),env);
  assert.equal(response.status,200);
  const output=await response.text();
  assert.match(output,/const API='\\/publishing\\/api\\/private-releases'/);
  assert.doesNotMatch(output,/const API='\\/api\\/private-releases'/);
});

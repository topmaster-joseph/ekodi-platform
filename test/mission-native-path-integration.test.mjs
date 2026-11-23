import test from 'node:test';
import assert from 'node:assert/strict';
import spaceWorker from '../space-worker.js';

const assets=Object.freeze({
  '/ekodimission.page': ['text/html; charset=utf-8','<!doctype html><html><head><link rel="canonical" href="https://ekodi.kr/ekodimission/"><link rel="stylesheet" href="/ekodimission/assets/site.css"></head><body><a href="/ekodimission/activities">행사</a></body></html>'],
  '/ekodimission.css': ['text/css; charset=utf-8','/* mission stylesheet */ .mission::after{content:"/ekodimission/activities"}'],
});
const env={ASSETS:{fetch:async input=>{
  const path=new URL(input.url).pathname;
  const entry=assets[path];
  return entry?new Response(entry[1],{status:200,headers:{'content-type':entry[0]}}):new Response('Not Found',{status:404});
}}};

test('GET /mission is a native published page, not a redirect, retaining its original worker ownership',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/mission'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('location'),null);
  assert.equal(response.headers.get('x-ekodi-independent-site'),'true');
  const html=await response.text();
  assert.match(html,/href="https:\/\/ekodi\.kr\/mission\/"/);
  assert.match(html,/href="\/mission\/assets\/site\.css"/);
  assert.match(html,/href="\/mission\/activities"/);
  assert.doesNotMatch(html,/href="\/ekodimission/);
});
test('GET /mission/assets/site.css preserves correct MIME and native linked URLs',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/mission/assets/site.css'),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')||'',/text\/css/);
  const css=await response.text();
  assert.match(css,/\/mission\/activities/);
  assert.doesNotMatch(css,/\/ekodimission\/activities/);
});
test('HEAD /mission is directly serviced without a redirect or body',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/mission',{method:'HEAD'}),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('location'),null);
  assert.equal(await response.text(),'');
});

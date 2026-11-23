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

test('Cloudflare routes Mission through Worker before static fallback without sacrificing other critical roots',async()=>{
  const {readFile}=await import('node:fs/promises');
  const wrangler=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  const entries=JSON.parse(wrangler.match(/run_worker_first\s*=\s*(\[[^\]]*\])/)[1]);
  assert.equal(entries.length,100,'Cloudflare worker-first budget must stay <= 100');
  const runs=path=>{
    const regex=pattern=>pattern.includes('*')?(path.startsWith(pattern.split('*')[0])&&path.endsWith(pattern.split('*').at(-1))):path===pattern;
    return entries.some(p=>!p.startsWith('!')&&regex(p))&&!entries.some(p=>p.startsWith('!')&&regex(p.slice(1)));
  };
  for(const p of ['/mission','/mission/','/mission/devotion','/mission/assets/site.js','/ekodi-church','/ekodichurch/admin','/system-health-admin.js','/system-health-admin.css','/auth-bootstrap.js','/auth-entry.js','/auth-router.js','/auth.js','/workspace-trade-admin.js','/workspace-trade-portal.js','/workspace-trade-portal.css'])assert.equal(runs(p),true,p);
  assert.match(wrangler,/pattern = "ekodi\.kr\/mission\*"/);
});
test('Mission production acceptance checks the canonical links even on legacy compatibility paths',async()=>{
  const {readFile}=await import('node:fs/promises');
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'));
  const pages=manifest.worker.requests.filter(item=>item.url?.startsWith('https://ekodi.kr/ekodimission')&&item.statuses?.includes(200)&&item.expect?.some(marker=>marker==='data-mission-nav'));
  assert.ok(pages.length>=8,'every published Mission page must be represented by guarded probes');
  for(const page of pages){
    assert.ok(page.expect.includes('/mission/assets/shell.css'),page.url);
    assert.ok(page.expect.includes('/mission/assets/shell.js'),page.url);
    assert.equal(page.rollbackVerify,false,page.url);
    assert.ok(!page.expect.some(x=>x.startsWith('/ekodimission/')),page.url);
  }
  // Existing historical event aliases stay governed by their own 308 contract.
  const old=manifest.worker.requests.find(x=>x.url==='https://ekodi.kr/ekodimission/activities/260926-chuseok-open-table');
  assert.deepEqual(old.statuses,[308]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import platform from '../platform-router-entry-worker.js';
import siteWorker from '../site-worker.js';
import workspaceEntry from '../workspace-platform-entry-worker.js';
import myWorker from '../my-worker.js';

const request=(url,method='GET')=>new Request(url,{method});
const env={ENVIRONMENT:'test'};

test('all public Invest paths and EKODIBIZ investment routes return a non-cacheable 410',async()=>{
 for(const path of ['/invest','/invest/','/invest/analysis','/invest/app.js','/invest/stock','/invest/personal','/invest/admin','/ekodibiz/invest','/ekodibiz/invest/ir','/ekodibiz/invest/admin']){
  const response=await platform.fetch(request('https://ekodi.kr'+path),env,{});
  assert.equal(response.status,410,path);
  assert.equal(response.headers.get('x-ekodi-route'),'invest-retired',path);
  assert.match(response.headers.get('cache-control'),/no-store/,path);
  assert.match(response.headers.get('x-robots-tag'),/noindex/,path);
 }
 for(const path of ['/','/analysis','/admin']){
  const response=await platform.fetch(request(('https://'+['invest','ekodi','kr'].join('.'))+path),env,{});
  assert.equal(response.status,410,path);
 }
});

test('direct shared-site fallback cannot resurrect retired investment routes',async()=>{
 for(const path of ['/invest','/invest/analysis','/ekodibiz/invest','/ekodibiz/invest/admin']){
  const response=await siteWorker.fetch(request('https://ekodi.kr'+path),env);
  assert.equal(response.status,410,path);
 }
});

test('shared investment APIs are retired and reject non-GET methods',async()=>{
 for(const path of ['/v1/invest/common-analysis','/v1/invest/opportunities','/v1/invest/automation/status','/v1/invest/context']){
  const response=await workspaceEntry.fetch(request('https://ekodi.kr'+path),{},null);
  assert.equal(response.status,410,path);
  assert.equal((await response.json()).error,'service_retired');
 }
 const post=await workspaceEntry.fetch(request('https://ekodi.kr/v1/invest/opportunities','POST'),{},null);
 assert.equal(post.status,410);
});

test('the surviving /my/invest is private and its owner access gate remains intact',async()=>{
 const page=await myWorker.fetch(request('https://ekodi.kr/my/invest'),{});
 assert.equal(page.status,200);
 assert.match(page.headers.get('cache-control'),/no-store/);
 assert.match(page.headers.get('x-robots-tag'),/noindex/);
 const html=await page.text();
 assert.match(html,/마이투자/);
 assert.doesNotMatch(html,/href="\/invest"/);
 assert.doesNotMatch(html,/href="\/invest\/analysis"/);
 const access=await myWorker.fetch(request('https://ekodi.kr/my/invest/access'),{});
 assert.equal(access.status,401);
 assert.equal((await access.json()).error,'authentication_required');
});

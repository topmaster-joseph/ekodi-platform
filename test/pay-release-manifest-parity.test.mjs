import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('shared-site canary tests legacy Pay redirects without treating retired Pay hub as live',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
 const find=(value,node=manifest,out=[])=>{
  if(node&&typeof node==='object'){
   if(node.url===value)out.push(node);
   for(const child of Object.values(node))find(value,child,out);
  }
  return out;
 };
 for(const path of ['/pay','/pay/']){
  const list=find('https://ekodi.kr'+path);
  assert.equal(list.length,1,path);
  const item=list[0];
  assert.deepEqual(item.statuses,[308]);
  assert.equal(item.redirect,'manual');
  assert.ok(item.headerExpect.includes('location: https://ekodi.kr/ekodipay/'));
  assert.deepEqual(item.expect,[]);
 }
 const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 assert.match(router,/url\.pathname==='\/pay'/);
 assert.match(router,/https:\/\/ekodi\.kr\/ekodipay\//);
});

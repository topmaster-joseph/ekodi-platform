import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharedSiteWorker from '../platform-router-entry-worker.js';

const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const entry=url=>manifest.worker.requests.find(req=>req.url===url);
const headerText=response=>[...response.headers.entries()].map(([key,value])=>key+': '+value).join('\n').toLowerCase();
test('rollback checks the actual canonical payment route and never bypasses rollback verification',async()=>{
  for(const path of ['/pay','/pay/']){
    const url='https://ekodi.kr'+path;
    const probe=entry(url);
    assert.ok(probe,url+' must be probed on rollback');
    assert.notEqual(probe.rollbackVerify,false,url+' rollback verification cannot be skipped');
    const response=await sharedSiteWorker.fetch(new Request(url),{},{});
    assert.deepEqual(probe.rollbackStatuses,[response.status],url);
    assert.equal(response.status,308,url);
    assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodipay/',url);
    assert.equal(response.headers.get('cache-control'),'no-store',url);
    for(const requirement of probe.rollbackHeaderExpect||[])assert.ok(headerText(response).includes(requirement.toLowerCase()),url+': '+requirement);
    await response.body?.cancel();
  }
});
test('business cooperative hub and assets remain non-cacheable using final Worker headers',async()=>{
  for(const path of ['/business-coop/','/business-coop/assets/app.css','/business-coop/assets/app.js']){
    const url='https://ekodi.kr'+path;
    const probe=entry(url);
    assert.ok(probe,'production release probe required for '+path);
    const response=await sharedSiteWorker.fetch(new Request(url),{},{});
    assert.equal(response.status,200,url);
    const cache=response.headers.get('cache-control')||'';
    assert.ok(cache.split(',').map(value=>value.trim().toLowerCase()).includes('no-store'),url+' must never cache');
    assert.ok(probe.headerExpect?.some(value=>value==='cache-control: no-store'),url+' must validate no-store');
    for(const requirement of probe.headerExpect||[])assert.ok(headerText(response).includes(requirement.toLowerCase()),url+': '+requirement);
    assert.equal(probe.rollbackVerify,false,url+' is a new candidate-only hub surface');
    await response.body?.cancel();
  }
});

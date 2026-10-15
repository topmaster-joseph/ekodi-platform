import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharedSiteWorker from '../platform-router-entry-worker.js';
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
const find=url=>manifest.worker.requests.find(item=>item.url===url);
test('both retired Pay URLs retain exact, non-cached 308 redirects during candidate and stable rollback verification',async()=>{
  for(const path of ['/pay','/pay/']){
    const url='https://ekodi.kr'+path;
    const probe=find(url);
    assert.ok(probe);
    assert.deepEqual(probe.statuses,[308]);
    assert.deepEqual(probe.rollbackStatuses,[308]);
    assert.notEqual(probe.rollbackVerify,false);
    for(const key of ['headerExpect','rollbackHeaderExpect']){
      assert.ok(probe[key].includes('location: https://ekodi.kr/ekodipay/'));
      if(key==='rollbackHeaderExpect') assert.ok(probe[key].includes('cache-control: no-store'));
    }
    const response=await sharedSiteWorker.fetch(new Request(url),{},{});
    assert.equal(response.status,308,path);
    assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodipay/',path);
    assert.equal(response.headers.get('cache-control'),'no-store',path);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff',path);
    await response.body?.cancel();
  }
});
test('cooperative hub and assets reject all storage without relying on a private cache-directive that the edge normalizes',async()=>{
  for(const path of ['/business-coop/','/business-coop/assets/app.css','/business-coop/assets/app.js']){
    const url='https://ekodi.kr'+path,probe=find(url);
    assert.ok(probe,path);
    assert.ok(probe.headerExpect.includes('cache-control: no-store'),path);
    assert.notEqual(probe.rollbackVerify,undefined,'preserve intentional rollback scope');
    const response=await sharedSiteWorker.fetch(new Request(url),{},{});
    assert.equal(response.status,200,path);
    const cc=String(response.headers.get('cache-control')||'');
    assert.ok(cc.split(',').map(x=>x.trim()).includes('no-store'),path);
    const normalized=[...response.headers].map(([k,v])=>k+': '+v).join('\n').toLowerCase();
    for(const marker of probe.headerExpect){
      if(marker.toLowerCase()==='cache-control: no-store'){
        assert.ok(cc.split(',').map(x=>x.trim()).includes('no-store'),path+': '+marker);
      }else assert.ok(normalized.includes(marker.toLowerCase()),path+': '+marker);
    }
    await response.body?.cancel();
  }
});

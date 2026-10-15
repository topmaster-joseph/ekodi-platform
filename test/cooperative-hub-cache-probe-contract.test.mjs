import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../platform-router-entry-worker.js';
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
test('cooperative hub guard checks actual no-store confidentiality rather than header ordering',async()=>{
 const route='https://ekodi.kr/business-coop/';
 const check=manifest.worker.requests.find(item=>item.url===route);
 assert.ok(check);
 assert.deepEqual(check.headerExpect,['cache-control: no-store']);
 assert.equal(check.rollbackVerify,false,'do not silently alter rollback scope');
 const response=await worker.fetch(new Request(route),{},{});
 assert.equal(response.status,200);
 const cacheControl=response.headers.get('cache-control')||'';
 assert.ok(cacheControl.split(',').map(part=>part.trim()).includes('no-store'),'confidential pages must not be stored');
 assert.match(await response.text(),/협동조합 운영관리자 공간/);
});

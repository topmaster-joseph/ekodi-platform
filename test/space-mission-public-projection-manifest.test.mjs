import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missionPublicReferences } from '../mission-public-path.js';
import { missionPageEntries, validateMissionManifest, REQUIRED_SHELL_MARKERS } from '../scripts/validate-ekodimission-shell-contract.mjs';

test('guarded Space manifest checks the actual canonical Mission response, not stale source paths',async()=>{
  const [raw,worker]=await Promise.all([
    readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'),
    readFile(new URL('../space-worker.js',import.meta.url),'utf8')
  ]);
  const manifest=JSON.parse(raw);
  assert.equal(missionPublicReferences('/ekodimission/assets/shell.css'),'/mission/assets/shell.css');
  assert.equal(missionPublicReferences('/ekodimission/apply/260926-open-table'),'/mission/apply/260926-open-table');
  const entries=missionPageEntries(worker);
  assert.ok(entries.length>=10);
  assert.equal(validateMissionManifest(manifest,entries),true);
  const requests=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/ekodimission'));
  assert.ok(requests.length>=entries.length);
  for(const {url,expect=[]} of requests){
    for(const token of expect){
      assert.equal(token,missionPublicReferences(token),'stale runtime response marker at '+url+': '+token);
    }
    if(expect.includes('class="mission-site-header"')){
      for(const token of REQUIRED_SHELL_MARKERS){
        assert.ok(expect.includes(missionPublicReferences(token)),'missing required canonical marker at '+url);
      }
    }
  }
  assert.ok(requests.some(item=>item.url==='https://ekodi.kr/ekodimission'&&item.expect.includes('/mission/assets/shell.css')));
  const bbq=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/bbqcg'));
  assert.deepEqual(bbq.map(item=>item.url),['https://ekodi.kr/bbqcg','https://ekodi.kr/bbqcg/order']);
  const [storefront,order]=bbq;
  assert.deepEqual(storefront.statuses,[200]);
  assert.equal(storefront.rollbackVerify,false,'new launch banner cannot block rollback to last stable release');
  assert.ok(storefront.expect.includes('전화 주문하기'));
  assert.ok(storefront.expect.includes('자체 온라인 결제는 준비 중입니다.'));
  assert.ok(storefront.headerExpect.includes('x-ekodi-route: space-storefront'));
  assert.ok(order.expect.includes('온라인 결제 및 매장 자동 접수는 아직 준비 중입니다.'));
  assert.ok(order.headerExpect.includes('x-robots-tag: noindex, nofollow, noarchive'));
  assert.ok(order.headerExpect.includes('x-ekodi-route: bbqcg-qr-order'));
  assert.ok(order.rollbackVerify!==false,'prior stable order route must remain rollback-verifiable');
});

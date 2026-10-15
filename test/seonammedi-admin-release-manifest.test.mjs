import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('SeonamMedi production candidate checks current administrator route rather than retired copy',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const admin=await readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8');
  const routes=manifest.worker?.verification?.routes||manifest.worker?.verification?.requests||[];
  // Find route within the manifest without relaxing its existing security requirements.
  const visit=node=>{
    if(!node||typeof node!=='object')return null;
    if(node.url==='https://ekodi.kr/seonammedi/admin/')return node;
    for(const value of Object.values(node)){
      if(value&&typeof value==='object'){
        const match=visit(value);
        if(match)return match;
      }
    }
    return null;
  };
  const route=visit(manifest);
  assert.ok(route,'SeonamMedi admin live route must remain a protected release probe');
  for(const expected of ['class="admin-finance-link"','id="boardAccountRegistration"']){
    assert.ok(admin.includes(expected),'admin HTML must render '+expected);
    assert.ok(route.expect.includes(expected),'release candidate must check '+expected);
  }
  assert.ok(!route.expect.includes('사용자 화면에서 바로 관리 도구가 표시됩니다'),'retired copy must not block actual UI');
  assert.deepEqual(route.statuses,[200]);
  for(const header of ['x-ekodi-route: seonammedi-static','x-robots-tag: noindex, nofollow, noarchive','cache-control: no-store'])assert.ok(route.headerExpect.includes(header),header);
  assert.ok(route.forbid.includes('/admin/sites/workspace'),'avoid cross-site admin exposure');
  const pay=visitPay(manifest);
  assert.ok(pay,'EKODI Pay rollback protection must be retained');
  assert.ok(pay.rollbackHeaderExpect?.includes('location: https://ekodi.kr/pay/'),'Pay rollback redirect guard must remain intact');
});

function visitPay(node){
  if(!node||typeof node!=='object')return null;
  if(node.url==='https://ekodi.kr/pay')return node;
  for(const v of Object.values(node)){
    if(v&&typeof v==='object'){const found=visitPay(v);if(found)return found;}
  }
  return null;
}

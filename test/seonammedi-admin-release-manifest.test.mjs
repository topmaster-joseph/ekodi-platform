import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('SeonamMedi production candidate checks current administrator route rather than retired copy',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const admin=await readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8');
  assert.ok(admin.includes('id="boardAccountForm"'),'admin account grant form must remain visible in source under owner authorization');
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
  assert.deepEqual(pay.rollbackStatuses,[308],'Pay rollback must verify the live 308 redirect');
  assert.ok(pay.rollbackHeaderExpect?.includes('location: https://ekodi.kr/ekodipay/'),'Pay rollback redirect guard must match the live /ekodipay/ redirect (since #4733)');
  assert.ok(pay.headerExpect?.includes('location: https://ekodi.kr/ekodipay/'),'Pay production canonical redirect guard must remain intact');
  assert.ok(pay.rollbackStatuses?.includes(308),'Pay rollback status checks must remain active');
});

function visitPay(node){
  if(!node||typeof node!=='object')return null;
  if(node.url==='https://ekodi.kr/pay')return node;
  for(const v of Object.values(node)){
    if(v&&typeof v==='object'){const found=visitPay(v);if(found)return found;}
  }
  return null;
}

test('SeonamMedi access panel deep link survives organization data refresh',async()=>{
  const source=await readFile(new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url),'utf8');
  const start=source.indexOf('async function loadOrganization(){');
  const end=source.indexOf("$('organizationForm')?.addEventListener",start);
  assert.ok(start>=0&&end>start,'organization loader must exist');
  const loader=source.slice(start,end);
  assert.match(loader,/showOrgAdminTab\(form\.elements\.orgKey\.value\|\|'bidae',\{route:false\}\)/,'background organization load must not rewrite ?panel=access or other login-return routes');
  assert.match(source,/const ADMIN_ROUTE_PANELS=new Set\([^;]*'access'/,'access is a supported admin deep link');
  const admin=await readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8');
  assert.match(admin,/<section class="panel-page" data-panel="access" hidden>/,'registration must remain in the access panel');
  assert.match(admin,/id="boardAccountRegistration" hidden/,'registration remains gated until platform authority is verified');
  assert.match(source,/panel\.hidden=!state\.me\?\.platform/,'grant form must remain hidden without platform administrator authority');
  assert.match(source,/restoreAdminRoute\(\{replace:true\}\)/,'initialize the selected panel after background data loads');
});

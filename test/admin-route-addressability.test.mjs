import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';
import { isStoreAdminPathShape } from '../store-admin-engine.js';
import { isChurchPastorAdminPath } from '../church-pastor-admin-page.js';
import { isOrganizationAdminPath } from '../organization-admin-page.js';

const source=fs.readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');

function routesFor(pathname='/admin/'){
  const location={href:`https://ekodi.kr${pathname}`,hostname:'ekodi.kr',pathname,search:'',hash:''};
  const window={location};
  vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String,Array,decodeURIComponent,encodeURIComponent});
  return window.EKODIAdminRoutes;
}

test('every platform admin menu has a unique canonical address',()=>{
  const routes=routesFor();
  const seen=new Map();
  for(const item of ADMIN_MENU_REGISTRY.filter(item=>!item.href)){
    const path=routes.pathFor(item.id);
    assert.match(path,/^\/admin(?:\/|$)/,`${item.id} must have an /admin canonical path`);
    assert.equal(seen.has(path),false,`duplicate canonical route ${path}: ${seen.get(path)} and ${item.id}`);
    seen.set(path,item.id);
  }
});

test('platform admin detail routes round-trip without collapsing to the menu root',()=>{
  const routes=routesFor();
  const path=routes.pathFor('finance',['transactions','txn-123','edit']);
  assert.equal(path,'/admin/content/finance/transactions/txn-123/edit');
  const route=routes.routeFromPath(path);
  assert.equal(route.section,'finance');
  assert.deepEqual(Array.from(route.detailSegments),['transactions','txn-123','edit']);
  assert.equal(routes.sectionFromPath(path),'finance');
});

test('canonical URL preserves page state query while removing only legacy route query',()=>{
  const routes=routesFor();
  const loc={
    href:'https://ekodi.kr/admin/?route=finance&filter=pending&page=3',
    hostname:'ekodi.kr',pathname:'/admin/',search:'?route=finance&filter=pending&page=3',hash:''
  };
  assert.equal(
    routes.canonicalUrl('finance',loc,['transactions']),
    '/admin/content/finance/transactions?filter=pending&page=3'
  );
});

test('workspace and service admins accept deep submenu and detail addresses',()=>{
  assert.equal(isWorkspaceAdminPathShape('/sample-workspace/admin/members/member-123/edit'),true);
  assert.equal(isWorkspaceAdminPathShape('/sample-workspace/service/admin/settings/profile/edit'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodimission/admin'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodimission/admin/activities'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodimission/admin/activities/participant-123/edit'),true);
});

test('store admins require a registered first menu segment but allow detail descendants',()=>{
  assert.equal(isStoreAdminPathShape('/jadam/admin/menu/item-123/edit'),true);
  assert.equal(isStoreAdminPathShape('/pizzamaru/admin/orders/order-456'),true);
  assert.equal(isStoreAdminPathShape('/jadam/admin/not-a-section/item-123'),false);
});

test('church and organization admins preserve recognized menu identity on deep routes',()=>{
  assert.equal(isChurchPastorAdminPath('/ekodichurch/admin/people/member-123/profile'),true);
  assert.equal(isChurchPastorAdminPath('/ekodichurch/admin/attendance/member-123/2026-09'),true);
  assert.equal(isChurchPastorAdminPath('/ekodichurch/admin/not-a-section/member-123'),false);
  assert.equal(isOrganizationAdminPath('/hammu/admin/notices/notice-123/edit'),true);
  assert.equal(isOrganizationAdminPath('/hammu/admin/unknown/item-123'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADMIN_SERVICE_CATALOG,canonicalServiceAdminPath} from '../admin-service-catalog.js';
import {summarizeTenantServiceMenuProjection,recommendTenantServicePreset} from '../tenant-service-admin-ui.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('ADMIN-NAV-STABLE-001: superadmin retains one categorized platform control plane',()=>{
  const registry=source('admin-menu-registry.js');
  const groups=[...registry.matchAll(/[{] id: '(home|sites|ai|services|finance|ops|settings|accounts)', icon:/g)].map(match=>match[1]);
  assert.deepEqual(groups,['home','sites','ai','services','finance','ops','settings','accounts']);
  assert.equal(new Set(groups).size,8);
  const js=source('workspace-admin-page.js');
  assert.match(js,/label:'업무메뉴'/);
  assert.doesNotMatch(js,/label:'공통메뉴'/);
  assert.doesNotMatch(js,/label:'전용메뉴'/);
  assert.match(js,/settings\.dataset\.adminSection='services'/);
  assert.match(js,/renderTenantServiceAdmin\(\$\('mainPanel'\)/);
});

test('ADMIN-NAV-STABLE-001: church and tenant admins do not revive competing common/dedicated menus',()=>{
  const church=source('church-admin-navigation.js');
  assert.match(church,/const groupsInOrder=/);
  assert.match(church,/admin-nav-service-settings/);
  assert.doesNotMatch(church,/\[\['common','공통메뉴'\],\['dedicated','전용메뉴'\]\]/);
  const service=source('tenant-service-admin-ui.js');
  assert.match(service,/root\.dataset\.tenantServiceCategory/);
  assert.match(service,/root\.dataset\.tenantServiceFilter/);
  assert.match(service,/tenant-service-preview/);
  assert.match(service,/onToggle/);
});

test('ADMIN-NAV-STABLE-001: menu visibility is a safe projection, never a capability grant',()=>{
  const summary=summarizeTenantServiceMenuProjection([
    {navSection:'publishing',readiness:'ready',menuVisible:true,categoryLabel:'채널'},
    {navSection:'publishing',readiness:'ready',menuVisible:false,categoryLabel:'채널'},
    {navSection:'finance',readiness:'setup_required',menuVisible:true,categoryLabel:'재무'}
  ]);
  assert.deepEqual(summary.map(x=>[x.navSection,x.state]),[['publishing','partial']]);
  const rec=recommendTenantServicePreset('ekodichurch',[{key:'members',label:'회원',readiness:'ready',menuVisible:false}]);
  assert.deepEqual(rec.missing.map(x=>x.key),['members']);
  const workspace=source('workspace-admin-page.js');
  assert.match(workspace,/canSection\(key,role\)/);
  assert.match(workspace,/tenant_site_service_catalog_snapshot/);
  assert.match(workspace,/confirmTenantServicePreference/);
});

test('ADMIN-NAV-STABLE-001: preserve specialized owner paths without fabricating service-settings routes',()=>{
  const byId=new Map(ADMIN_SERVICE_CATALOG.map(s=>[s.id,s]));
  for(const id of ['books','cmpmyi']){
    const item=byId.get(id);
    assert.ok(item,'registered owner '+id);
    assert.equal(canonicalServiceAdminPath(item.basePath),'/'+id+'/admin');
  }
  const portfolio=source('store-portfolio-admin-page.js');
  assert.match(portfolio,/data-cmpmyi-navigation="common-store-split"/);
  assert.match(portfolio,/function selectedStoreMenu\(/);
  assert.doesNotMatch(portfolio,/\/cmpmyi\/admin\/services/);
  const docs=source('docs/admin-navigation-stability-contract.md');
  assert.match(docs,/중복 메뉴와 별도 Sidebar 구현 금지/);
});

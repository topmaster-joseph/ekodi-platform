import test from 'node:test';
import assert from 'node:assert/strict';
import { EKODIBIZ_ADMIN_SCOPES, ekodiBizAdminScopeForPath } from '../ekodibiz-admin-registry.js';
import { workspaceAdminPage, workspaceAdminScript } from '../workspace-admin-page.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';
import { readFile } from 'node:fs/promises';

test('EKODIBIZ admin hub registers common and independent service management scopes',()=>{
  assert.deepEqual(EKODIBIZ_ADMIN_SCOPES.map(item=>item.id),['common','mall','trade','invest','tax','books','lab']);
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/admin'),'common');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='mall')?.adminHref,'/ekodimall/admin');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='mall')?.publicHref,'/ekodimall');
  assert.equal(ekodiBizAdminScopeForPath('/ekodimall/admin/channel-settings'),'mall');
  assert.equal(ekodiBizAdminScopeForPath('/admin/ekodimall/channel-settings'),'');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/mall/admin/channels'),'');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/trade/admin/access'),'trade');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/invest/admin/ir'),'invest');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='invest')?.publicHref,'/ekodibiz/invest');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='tax')?.adminHref,'/tax');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='books')?.label,'에코디북스');
  assert.equal(EKODIBIZ_ADMIN_SCOPES.find(item=>item.id==='books')?.adminHref,'/books/admin?source=ekodibiz');
  assert.equal(ekodiBizAdminScopeForPath('/books/admin/catalog'),'books');
  assert.equal(ekodiBizAdminScopeForPath('/tax'),'tax');
  assert.equal(ekodiBizAdminScopeForPath('/tax/invoices'),'tax');
  assert.equal(ekodiBizAdminScopeForPath('/ekodi-lab/admin'),'lab');
});

test('Tax and Books preserve the single EKODIBIZ site-switch pattern',async()=>{
  const tax=await readFile(new URL('../tax-portal-worker.js',import.meta.url),'utf8');
  const registry=await readFile(new URL('../ekodibiz-admin-registry.js',import.meta.url),'utf8');
  assert.match(tax,/EKODIBIZ_ADMIN_SCOPES/);
  assert.match(tax,/id="ekodibizSiteSwitcher"/);
  assert.match(tax,/사이트 전환/);
  assert.match(tax,/scope\.id==='tax'/);
  assert.match(registry,/\/books\/admin\?source=ekodibiz/);
});

test('workspace and trade admins expose scope handoff only through full authority',async()=>{
  const html=await workspaceAdminPage().text();
  const rootScript=await workspaceAdminScript().text();
  const tradeScript=await (await workspaceTradeAdminScript()).text();
  assert.match(html,/id="adminScopeSwitcher"/);
  assert.match(rootScript,/hasFullWorkspaceAdminScope/);
  assert.match(rootScript,/관리 사이트 전환/);
  assert.match(rootScript,/admin-scope-select/);
  assert.match(rootScript,/label:'경영'/);
  assert.match(rootScript,/label:'사이트 관리'/);
  assert.doesNotMatch(rootScript,/label:'운영 · 재무'/);
  assert.match(rootScript,/\['tax','세금 · 증빙'\]/);
  assert.match(rootScript,/isBizWorkspace&&section==='tax'/);
  assert.match(rootScript,/roleCapabilities\(role\)\.includes\('\*'\)/);
  assert.match(tradeScript,/access\?\.role!=='workspace_admin'/);
  assert.match(tradeScript,/사이트 전환/);
  assert.match(tradeScript,/admin-scope-select/);
  assert.match(tradeScript,/option\.selected=scope\.id==='trade'/);
});

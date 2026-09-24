import test from 'node:test';
import assert from 'node:assert/strict';
import { EKODIBIZ_ADMIN_SCOPES, ekodiBizAdminScopeForPath } from '../ekodibiz-admin-registry.js';
import { workspaceAdminPage, workspaceAdminScript } from '../workspace-admin-page.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';

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
  assert.equal(ekodiBizAdminScopeForPath('/tax'),'tax');
  assert.equal(ekodiBizAdminScopeForPath('/tax/invoices'),'tax');
  assert.equal(ekodiBizAdminScopeForPath('/ekodi-lab/admin'),'lab');
});

test('workspace and trade admins expose scope handoff only through full authority',async()=>{
  const html=await workspaceAdminPage().text();
  const rootScript=await workspaceAdminScript().text();
  const tradeScript=await (await workspaceTradeAdminScript()).text();
  assert.match(html,/id="adminScopeSwitcher"/);
  assert.match(rootScript,/hasFullWorkspaceAdminScope/);
  assert.match(rootScript,/\['tax','세금 · 증빙'\]/);
  assert.match(rootScript,/isBizWorkspace&&section==='tax'/);
  assert.match(rootScript,/roleCapabilities\(role\)\.includes\('\*'\)/);
  assert.match(tradeScript,/access\?\.role!=='workspace_admin'/);
  assert.match(tradeScript,/scope\.id==='trade'/);
});

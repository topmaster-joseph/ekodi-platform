import test from 'node:test';
import assert from 'node:assert/strict';
import { EKODIBIZ_ADMIN_SCOPES, ekodiBizAdminScopeForPath } from '../ekodibiz-admin-registry.js';
import { workspaceAdminPage, workspaceAdminScript } from '../workspace-admin-page.js';
import { workspaceTradeAdminScript } from '../workspace-trade-admin-page.js';
import { readFile } from 'node:fs/promises';

test('EKODIBIZ admin hub registers common and independent service management scopes',()=>{
  assert.deepEqual(EKODIBIZ_ADMIN_SCOPES.map(item=>item.id),['common','mall','trade','books','lab']);
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/admin'),'common');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/mall/admin/channels'),'mall');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/trade/admin/access'),'trade');
  assert.equal(ekodiBizAdminScopeForPath('/ekodi-lab/admin'),'lab');
});

test('workspace and trade admins expose the overall scope switcher only through full authority',async()=>{
  const html=await (await workspaceAdminPage()).text();
  const rootScript=await (await workspaceAdminScript()).text();
  const tradeScript=await (await workspaceTradeAdminScript()).text();
  assert.match(html,/id="adminScopeSwitcher"/);
  assert.match(rootScript,/hasFullWorkspaceAdminScope/);
  assert.match(rootScript,/roleCapabilities\(role\)\.includes\('\*'\)/);
  assert.match(rootScript,/관리 영역/);
  assert.match(tradeScript,/access\?\.role!=='workspace_admin'/);
  assert.match(tradeScript,/scope\.id==='trade'/);
});

test('central Books admin keeps the EKODIBIZ overall-admin hub only for super admin source handoff',async()=>{
  const runtime=await readFile(new URL('../admin-menu-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/source !== 'ekodibiz'/);
  assert.match(runtime,/currentSession\?\.role !== 'super_admin'/);
  assert.match(runtime,/EKODIBIZ_ADMIN_SCOPES/);
});

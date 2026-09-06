import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tenantAdminCan, tenantAdminPolicySnapshot } from '../tenant-admin-policy.js';
import { storeAdminPage } from '../store-admin-engine.js';
import { churchPastorAdminPage } from '../church-pastor-admin-page.js';
import { workspaceAdminPage, workspaceAdminScript, workspaceAdminCanAccess, workspaceAdminSectionsForRole } from '../workspace-admin-page.js';

test('tenant admin constitution keeps one page and projects authority by capability', async()=>{
  const policy=tenantAdminPolicySnapshot();
  assert.equal(policy.authorityScope,'tenant');
  assert.equal(policy.noRoleSpecificAdminPages,true);
  assert.equal(policy.platformAdminRequiresExplicitTenantContext,true);
  assert.equal(tenantAdminCan('store_owner',policy.capabilities.site),true);
  assert.equal(tenantAdminCan('marketing_manager',policy.capabilities.finance),false);
  assert.equal(tenantAdminCan('pastor',policy.capabilities.care),true);
  assert.equal(tenantAdminCan('pastor',policy.capabilities.access),false);
  assert.equal(tenantAdminCan('viewer',policy.capabilities.care),false);
  for(const response of [storeAdminPage({slug:'demo',name:'Demo'}),churchPastorAdminPage(),workspaceAdminPage()]){
    const html=await response.text();
    assert.match(html,/data-ekodi-authority-scope="tenant"/);
    assert.match(html,/data-ekodi-admin-sidebar/);
    assert.equal(response.headers.get('x-ekodi-authority-scope'),'tenant');
    assert.doesNotMatch(html,/super[-_]?admin|master[-_]?admin/i);
  }
});

test('workspace admin projects root and mall sections from tenant-local capabilities',async()=>{
  assert.deepEqual(workspaceAdminSectionsForRole('marketing_manager'),['overview','mall','publishing','marketing']);
  assert.deepEqual(workspaceAdminSectionsForRole('accounting_manager'),['overview','mall','finance']);
  assert.deepEqual(workspaceAdminSectionsForRole('client_viewer'),['overview','mall']);
  assert.deepEqual(workspaceAdminSectionsForRole('marketing_manager','mall'),['overview','sales','marketing','channels','automation','analytics']);
  assert.deepEqual(workspaceAdminSectionsForRole('accounting_manager','mall'),['overview','sales','analytics']);
  assert.equal(workspaceAdminCanAccess('manager','members'),false);
  assert.equal(workspaceAdminCanAccess('workspace_admin','members'),true);
  assert.equal(workspaceAdminCanAccess('member','overview'),false);
  const source=await (await workspaceAdminScript()).text();
  assert.match(source,/current_site_activity_contexts/);
  assert.match(source,/authorization_role/);
  assert.match(source,/canSection\(section\)/);
  assert.match(source,/noRoleSpecificAdminPages/);
  assert.match(source,/ekodi:tenant-context/);
});

test('entry router applies the shared Admin Shell to tenant admin pages',async()=>{
  const source=await fs.promises.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(source,/injectEkodiShell\(storeAdminPage\(storeRoute\),'business','admin'\)/);
  assert.match(source,/injectEkodiShell\(churchPastorAdminPage\(\),'church','admin'\)/);
  assert.match(source,/injectEkodiShell\(workspaceAdminPage\(\),'space','admin'\)/);
});

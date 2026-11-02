import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminCanAccess,workspaceAdminScript,workspaceAdminPage,workspaceAdminCss} from '../workspace-admin-page.js';
import {TENANT_SERVICE_CSS} from '../tenant-service-admin-ui.js';

const migration=readFileSync(new URL('../supabase/migrations/20261102162000_tenant_site_service_catalog.sql',import.meta.url),'utf8');

test('tenant service configuration is a site-local administrator function, not a platform privilege',()=>{
  assert.equal(workspaceAdminCanAccess('tenant_admin','services'),true);
  assert.equal(workspaceAdminCanAccess('store_owner','services','mall'),true);
  assert.equal(workspaceAdminCanAccess('store_staff','services'),false);
  assert.equal(workspaceAdminCanAccess('viewer','services'),false);
  assert.equal(workspaceAdminCanAccess('marketing_manager','services'),false);
  assert.equal(workspaceAdminCanAccess('external_developer','services'),false);
  assert.equal(workspaceAdminCanAccess('tenant_admin','unknown'),false);
});

test('all 12 catalog categories are registered and non-ready options cannot be saved',()=>{
  const keys=['broadcast','publishing','finance','payment','membership','events','communication','ai','marketing','commerce','work','analytics'];
  for(const group of keys)assert.ok(migration.includes("'"+group+"'"),group);
  assert.match(migration,/if v_ready is distinct from 'ready' then raise exception/);
  assert.match(migration,/references public\.tenants\(id\) on delete cascade/);
  assert.match(migration,/p_menu_visible boolean/);
  assert.match(migration,/tenant_site_service_audit/);
  assert.match(migration,/current_site_activity_contexts\(\)/);
  assert.match(migration,/authorization_role'[\s\S]*'tenant_admin'/);
  assert.match(migration,/revoke all on public\.tenant_site_service_catalog,public\.tenant_site_service_preferences,public\.tenant_site_service_audit from anon,authenticated/);
  assert.match(migration,/grant execute on function public\.tenant_site_service_preference_set\(uuid,text,boolean\) to authenticated/);
});

test('workspace routes include a safe services section and no public menu administration',async()=>{
  const js=await workspaceAdminScript().text();
  const html=await workspaceAdminPage().text();
  const css=await workspaceAdminCss().text();
  assert.ok(js.includes('tenant_site_service_catalog_snapshot'));
  assert.ok(js.includes('tenant_site_service_preference_set'));
  assert.ok(js.includes('서비스 구성·사용 설정'));
  assert.ok(js.includes('serviceMenuVisible(key)'));
  assert.ok(js.includes('renderTenantServiceAdmin'));
  assert.ok(!js.includes('localStorage.setItem("tenant_service_preference"'));
  assert.ok(html.includes('data-ekodi-authority-scope="tenant"'));
  assert.ok(css.includes(TENANT_SERVICE_CSS));
  assert.ok(css.includes('@media(max-width:620px)'));
});

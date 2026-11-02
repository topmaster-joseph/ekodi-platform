import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminScript,workspaceAdminCss} from '../workspace-admin-page.js';
import {renderTenantServiceAdmin,TENANT_SERVICE_CSS} from '../tenant-service-admin-ui.js';

const migration=readFileSync(new URL('../supabase/migrations/20261103004500_tenant_ai_tool_selection.sql',import.meta.url),'utf8');

test('AI tools stay within the existing site services screen and owner-controlled RPC',async()=>{
  const js=await workspaceAdminScript().text();
  const css=await workspaceAdminCss().text();
  assert.match(js,/tenant_ai_tool_catalog_snapshot/);
  assert.match(js,/tenant_ai_tool_preference_set/);
  assert.match(js,/p_tenant_id:workspaceContext\.tenantId,p_tool_id:item\.id,p_selected:next/);
  assert.match(js,/aiTools:aiToolSnapshot\?\.tools\|\|\[\]/);
  assert.match(js,/Promise\.allSettled/);
  assert.match(css,/\.tenant-ai-tools-row/);
  assert.equal(typeof renderTenantServiceAdmin,'function');
  assert.match(TENANT_SERVICE_CSS,/@media\(max-width:620px\)/);
  assert.doesNotMatch(js,/localStorage\.setItem\(['"]tenant_ai_tool/);
});

test('tenants select only candidate tools: no API entitlements, credentials or side effects',()=>{
  assert.match(migration,/selectionOnly',true/);
  assert.match(migration,/not an execution entitlement/i);
  assert.match(migration,/tenant_ai_tool_catalog_snapshot\(p_tenant_id uuid\)/);
  assert.match(migration,/tenant_ai_tool_preference_set\(/);
  assert.match(migration,/if auth\.uid\(\) is null or p_tenant_id is null or p_selected is null/);
  assert.match(migration,/c->>'tenant_id'=p_tenant_id::text/g);
  assert.match(migration,/c->>'authorization_role' in \(/g);
  assert.match(migration,/unknown_ai_tool/);
  assert.match(migration,/set search_path = ''/g);
  assert.match(migration,/alter table public\.tenant_ai_tool_catalog enable row level security/);
  assert.match(migration,/alter table public\.tenant_ai_tool_preferences enable row level security/);
  assert.match(migration,/alter table public\.tenant_ai_tool_audit enable row level security/);
  assert.match(migration,/revoke all on public\.tenant_ai_tool_catalog,public\.tenant_ai_tool_preferences,public\.tenant_ai_tool_audit from public,anon,authenticated,service_role/);
  assert.match(migration,/revoke all on function public\.tenant_ai_tool_catalog_snapshot\(uuid\) from public,anon,authenticated,service_role/);
  assert.match(migration,/revoke all on function public\.tenant_ai_tool_preference_set\(uuid,text,boolean\) from public,anon,authenticated,service_role/);
  assert.match(migration,/grant execute on function public\.tenant_ai_tool_catalog_snapshot\(uuid\) to authenticated/);
  assert.match(migration,/grant execute on function public\.tenant_ai_tool_preference_set\(uuid,text,boolean\) to authenticated/);
  assert.match(migration,/insert into public\.tenant_ai_tool_audit/);
  assert.doesNotMatch(migration,/create policy .*using \(true\)/i);
  assert.doesNotMatch(migration,/grant (?:select|insert|update|delete) on public\.tenant_ai_tool_preferences to authenticated/i);
});

test('twelve GPT PARK-selected tool IDs correspond to the shared AI operating center',()=>{
  const page=readFileSync(new URL('../ai-operations-center-admin.js',import.meta.url),'utf8');
  const catalog=page.match(/const TOOL_DIRECTORY = Object\.freeze\((\[.*?\])\.map\(Object\.freeze\)\);/s);
  assert.ok(catalog,'AI operating center tool catalog must exist');
  const records=JSON.parse(catalog[1]);
  const ids=records.map(item=>item.id);
  assert.equal(ids.length,12);
  assert.equal(new Set(ids).size,12);
  for(const id of ids)assert.ok(migration.includes("('"+id+"',"),id);
  assert.match(page,/data-aic-tool-tab="providers"/);
});

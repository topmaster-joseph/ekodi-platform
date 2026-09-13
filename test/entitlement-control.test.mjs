import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleEntitlementControl, PRESENTATION_ENTITLEMENT_CATALOG, ENTITLEMENT_CONTROL_CONTRACT } from '../entitlement-control.js';

const source=fs.readFileSync(new URL('../entitlement-control.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0083_entitlement_engine.sql',import.meta.url),'utf8');

test('presentation entitlement catalog keeps a complete free core',()=>{
  const byId=new Map(PRESENTATION_ENTITLEMENT_CATALOG.map(item=>[item.id,item]));
  for(const id of ['presentation.open','presentation.pptx','presentation.pdf','presentation.docx','presentation.hwp','presentation.spreadsheet','presentation.text','presentation.image','presentation.fullscreen','presentation.history','presentation.speaker-notes']){
    assert.equal(byId.get(id)?.defaults?.[0],true,id);
  }
  assert.equal(byId.get('presentation.ai-refine')?.defaults?.[0],false);
  assert.equal(byId.get('presentation.multi-file')?.defaults?.[2],true);
  assert.equal(ENTITLEMENT_CONTROL_CONTRACT.freeCoreComplete,true);
});

test('public catalog endpoint exposes tier precedence without database access',async()=>{
  const request=new Request('https://api.ekodi.kr/api/entitlements/catalog');
  const response=await handleEntitlementControl(request,{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.policy,'tier-default < workspace-default < user-exception');
  assert.equal(body.catalog.some(item=>item.id==='presentation.hwp'),true);
});
test('workspace entitlement lookup revalidates user workspace authority',()=>{
  assert.match(source,/verifiedWorkspaceForIdentity/);
  assert.match(source,/workspace_access_required/);
  assert.match(source,/tenantAdminCan\(data\.role,TENANT_ADMIN_CAPABILITIES\.access\)/);
});

test('entitlement schema is additive, scoped and audited',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS entitlement_overrides/i);
  assert.match(migration,/UNIQUE\s*\(workspace_key,subject_type,subject_key,service,capability_id\)/i);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS entitlement_audit_logs/i);
  assert.match(source,/override\.delete/);
  assert.match(source,/workspace_scope_forbidden/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmTenantServicePreference} from '../tenant-service-setting-verification.js';
import {workspaceAdminScript} from '../workspace-admin-page.js';

const tenantId='fae52c63-663d-4b52-9652-95b99ca86a01';

test('site menu selection is independently read back after server write',async()=>{
  let saved=true;
  const calls=[];
  const call=async(name,args,resultKey)=>{
    calls.push({name,args,resultKey});
    if(name==='tenant_site_service_preference_set'){
      assert.equal(args.p_service_key,'channels');
      saved=args.p_menu_visible;
      return {tenantId,items:[{key:'channels',menuVisible:true}]}; // stale write echo must not be trusted
    }
    return {tenantId,items:[{key:'channels',menuVisible:saved}]};
  };
  const result=await confirmTenantServicePreference({call,tenantId,kind:'service',id:'channels',selected:false});
  assert.equal(result.items[0].menuVisible,false);
  assert.deepEqual(calls.map(x=>x.name),[
    'tenant_site_service_preference_set','tenant_site_service_catalog_snapshot'
  ]);
  assert.deepEqual(calls[1].args,{p_tenant_id:tenantId});
});

test('AI tool selection is independently read back after write',async()=>{
  const calls=[];
  const call=async(name,args,resultKey)=>{
    calls.push({name,args,resultKey});
    if(name==='tenant_ai_tool_preference_set'){
      assert.deepEqual(args,{p_tenant_id:tenantId,p_tool_id:'tool-1',p_selected:true});
      return {tenantId,tools:[]};
    }
    return {tenantId,tools:[{id:'tool-1',selected:true}]};
  };
  const result=await confirmTenantServicePreference({call,tenantId,kind:'ai',id:'tool-1',selected:true});
  assert.equal(result.tools[0].selected,true);
  assert.deepEqual(calls.map(x=>x.resultKey),['tools','tools']);
});

test('fails closed on uncommitted write, wrong tenant and missing entry',async()=>{
  const mismatch=async()=>({tenantId,items:[{key:'channels',menuVisible:true}]});
  await assert.rejects(confirmTenantServicePreference({
    call:mismatch,tenantId,kind:'service',id:'channels',selected:false
  }),/service_preference_not_persisted/);
  const wrongTenant=async()=>({tenantId:'00000000-0000-0000-0000-000000000000',items:[{key:'channels',menuVisible:false}]});
  await assert.rejects(confirmTenantServicePreference({
    call:wrongTenant,tenantId,kind:'service',id:'channels',selected:false
  }),/service_preference_tenant_mismatch/);
  await assert.rejects(confirmTenantServicePreference({
    call:async()=>({tenantId,items:[]}),tenantId,kind:'service',id:'channels',selected:false
  }),/service_preference_not_persisted/);
});

test('invalid inputs and server-side rejections never create verified success',async()=>{
  let calls=0;
  const call=async()=>{calls++;throw Error('tenant_site_admin_required');};
  await assert.rejects(confirmTenantServicePreference({
    call,tenantId,kind:'service',id:'channels',selected:false
  }),/tenant_site_admin_required/);
  assert.equal(calls,1);
  await assert.rejects(confirmTenantServicePreference({
    call,tenantId,kind:'unknown',id:'channels',selected:false
  }),/invalid_tenant_service_kind/);
  await assert.rejects(confirmTenantServicePreference({
    call,tenantId,kind:'service',id:'channels',selected:'false'
  }),/invalid_tenant_service_preference/);
  assert.equal(calls,1);
});

test('bundled tenant admin page includes read-after-write confirmation',async()=>{
  const js=await workspaceAdminScript().text();
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/const confirmTenantServicePreference=async function|const confirmTenantServicePreference=function|const confirmTenantServicePreference=\(/);
  assert.match(js,/kind:'service',id:item\.key,selected:next/);
  assert.match(js,/kind:'ai',id:item\.id,selected:next/);
  assert.match(js,/sitePreferenceWritePending/);
  assert.doesNotMatch(js,/siteServiceSnapshot=await siteServiceApi\('tenant_site_service_preference_set'/);
});

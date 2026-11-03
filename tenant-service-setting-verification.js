/**
 * Client-side read-after-write confirmation of a tenant-scoped menu preference.
 * The authoritative permission check and audit trail remain in Supabase RPCs.
 * This function never grants privileges or activates an external integration.
 */
export async function confirmTenantServicePreference({call,tenantId,kind,id,selected}={}){
  if(typeof call!=='function'||typeof tenantId!=='string'||!tenantId.trim()||
    typeof id!=='string'||!id.trim()||typeof selected!=='boolean'){
    throw new TypeError('invalid_tenant_service_preference');
  }
  const settings={
    service:{set:'tenant_site_service_preference_set',snapshot:'tenant_site_service_catalog_snapshot',
      idArg:'p_service_key',valueArg:'p_menu_visible',items:'items',key:'key',selected:'menuVisible'},
    ai:{set:'tenant_ai_tool_preference_set',snapshot:'tenant_ai_tool_catalog_snapshot',
      idArg:'p_tool_id',valueArg:'p_selected',items:'tools',key:'id',selected:'selected'},
  };
  const contract=settings[kind];
  if(!contract)throw new TypeError('invalid_tenant_service_kind');
  const input={p_tenant_id:tenantId,[contract.idArg]:id,[contract.valueArg]:selected};
  await call(contract.set,input,contract.items);
  // Never trust the write response alone. Verify that a fresh server read
  // reflects the exact value selected for this tenant and service/tool.
  const result=await call(contract.snapshot,{p_tenant_id:tenantId},contract.items);
  const entry=result?.[contract.items]?.find(item=>String(item?.[contract.key])===id);
  if(!entry||entry[contract.selected]!==selected)throw new Error('service_preference_not_persisted');
  if(String(result.tenantId||'')!==tenantId)throw new Error('service_preference_tenant_mismatch');
  return result;
}

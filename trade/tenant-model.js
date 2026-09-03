const INTERNAL_ROLES = Object.freeze(['tenant_admin','trade_manager','trade_operator','accounting','compliance','viewer']);
const COUNTERPARTY_TYPES = Object.freeze(['supplier','buyer','agent','broker','forwarder','customs','other']);

const text=value=>String(value??'').trim();

export function normalizeTradeTenant(input={}){
  const tenantId=text(input.tenantId||input.workspaceId);
  if(!tenantId)throw new TypeError('tenantId is required');
  return Object.freeze({
    tenantId,
    name:text(input.name),
    slug:text(input.slug).toLowerCase(),
    role:INTERNAL_ROLES.includes(input.role)?input.role:'viewer',
    settings:Object.freeze({...input.settings}),
  });
}

export function createCounterparty(input={}){
  const id=text(input.id);
  const tenantId=text(input.tenantId||input.workspaceId);
  if(!id)throw new TypeError('counterparty id is required');
  if(!tenantId)throw new TypeError('tenantId is required');
  const type=COUNTERPARTY_TYPES.includes(input.type)?input.type:'other';
  return Object.freeze({
    id,tenantId,type,
    name:text(input.name),
    slug:text(input.slug||id).toLowerCase(),
    countryCode:text(input.countryCode).toUpperCase(),
    status:text(input.status||'active'),
    uniqueProfile:Object.freeze({...input.uniqueProfile}),
  });
}

export function assertSameTenant(...records){
  const ids=new Set(records.filter(Boolean).map(item=>text(item.tenantId||item.workspaceId)).filter(Boolean));
  if(ids.size>1)throw new Error('cross_tenant_access_denied');
  return true;
}

export function canManageTrade(role){return ['tenant_admin','trade_manager'].includes(text(role));}
export function canOperateTrade(role){return [...INTERNAL_ROLES].filter(role=>role!=='viewer').includes(text(role));}
export function canSeeFinancials(role){return ['tenant_admin','trade_manager','accounting'].includes(text(role));}

export function scopeTradeCases(cases=[],scope={}){
  const tenantId=text(scope.tenantId||scope.workspaceId);
  const counterpartyId=text(scope.counterpartyId);
  if(!tenantId)return [];
  return cases.filter(item=>{
    if(text(item.tenantId||item.workspaceId)!==tenantId)return false;
    if(!counterpartyId)return true;
    return [item.counterpartyId,item.supplierId,item.buyerId].map(text).includes(counterpartyId);
  });
}

export const TRADE_TENANCY_CONTRACT=Object.freeze({
  version:1,
  canonicalHost:'trade.ekodi.kr',
  hierarchy:'platform > tenant company > counterparty company > trade case',
  tenantIdentity:'EKODI tenant/workspace id',
  counterpartyIsolation:true,
  crossTenantImplicitAccess:false,
  roles:INTERNAL_ROLES,
  counterpartyTypes:COUNTERPARTY_TYPES,
  adminSurfaces:Object.freeze(['platform-observability','tenant-admin','counterparty-admin']),
});

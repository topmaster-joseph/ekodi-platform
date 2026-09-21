import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive, effectiveAccessCapabilities } from './access-governance.js';
import { ensureCustomerAccessSchema } from './customer-google-prereg.js';
import { tenantAdminCapabilitiesForRole, TENANT_ADMIN_CAPABILITIES } from './tenant-admin-policy.js';
import { localRegionBySlug } from './local-region-registry.js';

const SCOPES=Object.freeze({
  'cheonggye-local':Object.freeze({slug:'cheonggye-local',regionId:'local:cheonggye',label:'청계잇다 지역플랫폼',publicPath:'/cheonggye',adminPath:'/cheonggye/admin',service:'region'}),
  'cheonggye-pass':Object.freeze({slug:'cheonggye-pass',regionId:'local:cheonggye',label:'청계패스',publicPath:'/cheonggye/pass',adminPath:'/cheonggye/admin/pass',service:'commerce-pass'}),
});
const clean=value=>String(value||'').trim().toLowerCase();
const DELEGATED_OPERATOR_ROLES=new Set(['owner','tenant_admin','workspace_admin','admin','manager','client_admin']);

export function delegatedRegionalCapabilitiesFor(scopeSlug,operatorTenantSlug,role){
  const scope=SCOPES[clean(scopeSlug)];
  const operatorSlug=clean(operatorTenantSlug);
  const normalizedRole=clean(role);
  if(!scope||operatorSlug!=='cgma'||!DELEGATED_OPERATOR_ROLES.has(normalizedRole))return Object.freeze([]);
  const region=localRegionBySlug('cheonggye');
  const operator=region?.operators?.cgma;
  if(scope.regionId!==region?.id||operator?.status!=='active'||clean(operator?.tenantSlug)!==operatorSlug||operator?.operatingRights?.accessMode!=='delegated-operations')return Object.freeze([]);
  const roleCapabilities=tenantAdminCapabilitiesForRole(normalizedRole);
  const canOperate=roleCapabilities.includes('*')||roleCapabilities.includes(TENANT_ADMIN_CAPABILITIES.operations);
  if(!canOperate)return Object.freeze([]);
  if(scope.service==='commerce-pass'){
    return Object.freeze([
      TENANT_ADMIN_CAPABILITIES.dashboard,
      TENANT_ADMIN_CAPABILITIES.integrationInspect,
      TENANT_ADMIN_CAPABILITIES.integrationTest,
      TENANT_ADMIN_CAPABILITIES.logs,
    ]);
  }
  return Object.freeze([
    TENANT_ADMIN_CAPABILITIES.dashboard,
    TENANT_ADMIN_CAPABILITIES.operations,
  ]);
}


function json(request,data,status=200){
  const origin=request.headers.get('origin')||'';
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'};
  if(origin==='https://ekodi.kr'){headers['access-control-allow-origin']=origin;headers.vary='Origin';}
  return new Response(JSON.stringify(data),{status,headers});
}

async function adminSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.email?session:null;
}

async function tenantBySlug(env,slug){
  if(!env?.DB)return null;
  await ensureCustomerAccessSchema(env.DB);
  return env.DB.prepare('SELECT id,slug,name,domain,status FROM customer_tenants WHERE slug=?').bind(slug).first();
}

async function grantFor(env,tenantId,email){
  return env.DB.prepare('SELECT role,enabled,principal_type,github_username,capabilities_json,denied_capabilities_json,expires_at,last_verified_at FROM customer_access_grants WHERE tenant_id=? AND lower(trim(email))=?').bind(tenantId,email).first();
}

async function delegatedOperatorAccess(env,scope,email){
  if(scope.regionId!=='local:cheonggye')return null;
  const region=localRegionBySlug('cheonggye');
  const operator=region?.operators?.cgma;
  if(operator?.status!=='active'||!operator?.tenantSlug)return null;
  const tenant=await tenantBySlug(env,operator.tenantSlug);
  if(!tenant||tenant.status!=='active')return null;
  const grant=await grantFor(env,tenant.id,email);
  if(!accessGrantIsActive(grant))return null;
  const capabilities=[...delegatedRegionalCapabilitiesFor(scope.slug,operator.tenantSlug,grant.role)];
  if(!capabilities.length)return null;
  try{await env.DB.prepare('UPDATE customer_access_grants SET last_verified_at=? WHERE tenant_id=? AND lower(trim(email))=?').bind(new Date().toISOString(),tenant.id,email).run();}catch{}
  return {
    ok:true,
    platform:false,
    email,
    role:clean(grant.role),
    capabilities,
    canManageAccess:false,
    scope,
    principalType:'delegated_operator',
    expiresAt:grant.expires_at||'',
    delegatedOperator:{id:operator.id,name:operator.name,tenantSlug:operator.tenantSlug,role:operator.role},
    menu:menuFor(scope,capabilities,false),
  };
}

function capabilitiesFor(grant){
  return [...new Set([...tenantAdminCapabilitiesForRole(grant?.role),...effectiveAccessCapabilities(grant)])];
}

function menuFor(scope,capabilities,platform=false){
  const set=new Set(capabilities);const all=platform||set.has('*');const allow=cap=>all||set.has(cap);
  const items=scope.service==='commerce-pass' ? [
    ['overview','현황',TENANT_ADMIN_CAPABILITIES.dashboard],
    ['integration','외부업체·연동','tenant.integration.inspect'],
    ['tests','연동 테스트','tenant.integration.test'],
    ['logs','로그','tenant.logs.read'],
    ['access','사용자·권한',TENANT_ADMIN_CAPABILITIES.access],
  ] : [
    ['overview','통합현황',TENANT_ADMIN_CAPABILITIES.dashboard],
    ['operations','서비스 운영주체',TENANT_ADMIN_CAPABILITIES.operations],
    ['access','사용자·권한',TENANT_ADMIN_CAPABILITIES.access],
  ];
  return items.filter(item=>allow(item[2])).map(item=>({id:item[0],label:item[1]}));
}

async function resolveAccess(request,env,scope){
  const session=await adminSession(request,env);
  if(session?.role==='super_admin')return {ok:true,platform:true,email:clean(session.email),role:'super_admin',capabilities:['*'],canManageAccess:true,scope,menu:menuFor(scope,['*'],true)};
  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return {ok:false,status:401,code:'REGION_AUTH_REQUIRED'};
  const tenant=await tenantBySlug(env,scope.slug);
  if(!tenant||tenant.status!=='active')return {ok:false,status:404,code:'REGION_SCOPE_NOT_FOUND'};
  const email=clean(principal.email);
  const grant=await grantFor(env,tenant.id,email);
  if(accessGrantIsActive(grant)){
    const capabilities=capabilitiesFor(grant);
    const canManageAccess=capabilities.includes('*')||capabilities.includes(TENANT_ADMIN_CAPABILITIES.access);
    try{await env.DB.prepare('UPDATE customer_access_grants SET last_verified_at=? WHERE tenant_id=? AND lower(trim(email))=?').bind(new Date().toISOString(),tenant.id,email).run();}catch{}
    return {ok:true,platform:false,email,role:clean(grant.role),capabilities,canManageAccess,scope,principalType:grant.principal_type||'member',expiresAt:grant.expires_at||'',menu:menuFor(scope,capabilities,false)};
  }
  const delegated=await delegatedOperatorAccess(env,scope,email);
  if(delegated)return delegated;
  return {ok:false,status:403,code:'REGION_ACCESS_FORBIDDEN',email};
}

export async function handleRegionalAccessControl(request,env){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/local-access\/([a-z0-9-]+)\/me$/);
  if(!match)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://ekodi.kr','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,OPTIONS','cache-control':'no-store'}});
  if(request.method!=='GET')return json(request,{error:'method_not_allowed'},405);
  const scope=SCOPES[clean(match[1])];
  if(!scope)return json(request,{error:'등록되지 않은 지역 권한 범위입니다.',code:'REGION_SCOPE_UNKNOWN'},404);
  if(!env?.DB)return json(request,{error:'권한 데이터베이스를 사용할 수 없습니다.',code:'REGION_ACCESS_DB_UNAVAILABLE'},503);
  const result=await resolveAccess(request,env,scope);
  if(!result.ok){
    const loginUrl=new URL('https://ekodi.kr/auth/');loginUrl.searchParams.set('site','portal');loginUrl.searchParams.set('direct','1');loginUrl.searchParams.set('return_to',scope.adminPath);
    return json(request,{authenticated:false,error:result.status===401?'Google 로그인이 필요합니다.':'이 관리공간에 등록된 권한이 없습니다.',code:result.code,loginUrl:loginUrl.toString(),publicUrl:scope.publicPath},result.status);
  }
  return json(request,{authenticated:true,platform:Boolean(result.platform),email:result.email,role:result.role,principalType:result.principalType||'platform',capabilities:result.capabilities,canManageAccess:result.canManageAccess,delegatedOperator:result.delegatedOperator||null,scope:{slug:scope.slug,label:scope.label,service:scope.service,adminPath:scope.adminPath,publicPath:scope.publicPath},menu:result.menu,expiresAt:result.expiresAt||''});
}

export function regionalAccessScopeSnapshot(){return Object.freeze(Object.values(SCOPES).map(item=>Object.freeze({...item})));}

import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantExpired, accessGrantIsActive, accessRolePreset, effectiveAccessCapabilities, parseCapabilityList } from './access-governance.js';
import { TENANT_ADMIN_CAPABILITIES, TENANT_ADMIN_ROLE_CAPABILITIES, tenantAdminCapabilitiesForRole } from './tenant-admin-policy.js';

const normalize=value=>String(value||'').trim().toLowerCase();

export const SITE_RESPONSIBILITY_ROLES=Object.freeze([
  'super_admin','platform_admin','owner','store_owner','tenant_admin','workspace_admin','client_admin','senior_pastor',
]);

export const SITE_ASSIGNABLE_ROLES=Object.freeze([
  'admin','manager','marketer','accountant','staff','member','viewer',
  'marketing_manager','accounting_manager','hq_manager','client_editor','client_viewer',
  'external_vendor','external_developer','pastor','care_staff',
]);

const HIERARCHICAL_ADMIN_TENANTS=new Set(['cgma','cheonggye-local','cheonggye-pass']);
const ROLE_MANAGEMENT_RANK=Object.freeze({
  super_admin:1000,platform_admin:950,
  owner:900,store_owner:900,tenant_admin:900,workspace_admin:900,client_admin:900,senior_pastor:900,
  admin:800,
  hq_manager:700,manager:700,
  marketing_manager:600,accounting_manager:600,pastor:600,
  marketer:500,accountant:500,staff:500,care_staff:500,client_editor:500,
  external_vendor:400,external_developer:400,
  viewer:300,client_viewer:300,
  member:200,
});
const roleManagementRank=role=>ROLE_MANAGEMENT_RANK[normalize(role)]||0;
const usesHierarchicalAdminPolicy=authority=>HIERARCHICAL_ADMIN_TENANTS.has(normalize(authority?.tenantSlug));

export function accessGrantAssignableRoles(authority,target={}){
  if(!authority?.ok)return Object.freeze([]);
  if(authority.scope==='platform')return Object.freeze(['owner',...SITE_ASSIGNABLE_ROLES]);
  if(!usesHierarchicalAdminPolicy(authority))return Object.freeze([...SITE_ASSIGNABLE_ROLES]);
  const targetEmail=normalize(target.email);
  const targetRole=normalize(target.role);
  if(targetEmail&&targetEmail===normalize(authority.email))return Object.freeze([]);
  if(targetRole&&SITE_RESPONSIBILITY_ROLES.includes(targetRole))return Object.freeze([]);
  const actorRank=roleManagementRank(authority.role);
  if(targetRole&&actorRank<=roleManagementRank(targetRole))return Object.freeze([]);
  return Object.freeze(SITE_ASSIGNABLE_ROLES.filter(role=>actorRank>roleManagementRank(role)));
}

export function tenantRoleCanManageAccess(role){
  const allowed=TENANT_ADMIN_ROLE_CAPABILITIES[normalize(role)]||[];
  return allowed.includes('*')||allowed.includes(TENANT_ADMIN_CAPABILITIES.access);
}

export function tenantGrantCapabilityProjection(grant={}){
  const roleCapabilities=tenantAdminCapabilitiesForRole(grant?.role);
  const explicitCapabilities=effectiveAccessCapabilities(grant);
  const denied=new Set([
    ...(accessRolePreset(grant?.role)?.denied||[]),
    ...parseCapabilityList(grant?.denied_capabilities_json??grant?.deniedCapabilities),
  ]);
  const wildcard=roleCapabilities.includes('*');
  const combined=[...new Set([...roleCapabilities.filter(item=>item!=='*'),...explicitCapabilities])];
  return Object.freeze({
    mode:wildcard?'all_except_denied':'listed',
    effectiveCapabilities:wildcard?Object.freeze(['*']):Object.freeze(combined.filter(capability=>!denied.has(capability)).sort()),
    deniedCapabilities:Object.freeze([...denied].sort()),
  });
}

export function tenantGrantCapabilityDecision(grant={},capability='',now=new Date()){
  const target=normalize(capability);
  if(!target)return Object.freeze({allowed:false,capability:'',reason:'CAPABILITY_REQUIRED'});
  if(!grant)return Object.freeze({allowed:false,capability:target,reason:'GRANT_NOT_FOUND'});
  if(Number(grant.enabled)!==1)return Object.freeze({allowed:false,capability:target,reason:'GRANT_DISABLED'});
  if(accessGrantExpired(grant,now))return Object.freeze({allowed:false,capability:target,reason:'GRANT_EXPIRED'});
  if(!accessGrantIsActive(grant,now))return Object.freeze({allowed:false,capability:target,reason:'GRANT_INACTIVE'});

  const projection=tenantGrantCapabilityProjection(grant);
  if(projection.deniedCapabilities.includes(target)){
    return Object.freeze({allowed:false,capability:target,reason:'EXPLICIT_DENY'});
  }
  if(projection.mode==='all_except_denied'){
    return Object.freeze({allowed:true,capability:target,reason:'ROLE_WILDCARD'});
  }
  const roleCapabilities=tenantAdminCapabilitiesForRole(grant?.role);
  if(roleCapabilities.includes(target)){
    return Object.freeze({allowed:true,capability:target,reason:'ROLE_ALLOW'});
  }
  if(effectiveAccessCapabilities(grant).includes(target)){
    return Object.freeze({allowed:true,capability:target,reason:'EXPLICIT_ALLOW'});
  }
  return Object.freeze({allowed:false,capability:target,reason:'NOT_GRANTED'});
}

async function adminSession(request,env){
  const url=new URL(request.url);
  url.pathname='/api/session';
  url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.email?session:null;
}

async function tenantRow(env,slug){
  if(!env?.DB||!slug)return null;
  return env.DB.prepare('SELECT id, slug, name, domain, status FROM customer_tenants WHERE slug = ?')
    .bind(slug).first();
}

export async function resolveTenantAccessAuthority(request,env,{tenantSlug=''}={}){
  const session=await adminSession(request,env);
  if(session?.role==='super_admin'){
    return Object.freeze({
      ok:true,scope:'platform',email:normalize(session.email),role:'super_admin',
      tenantSlug:normalize(tenantSlug),tenantId:null,canManageAllTenants:true,
    });
  }

  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return Object.freeze({ok:false,status:401,code:'ACCESS_AUTH_REQUIRED'});

  const slug=normalize(tenantSlug);
  if(!slug)return Object.freeze({ok:false,status:403,code:'TENANT_CONTEXT_REQUIRED'});

  const tenant=await tenantRow(env,slug);
  if(!tenant||tenant.status!=='active')return Object.freeze({ok:false,status:404,code:'TENANT_NOT_FOUND'});

  const parentSlug=slug==='cheonggye-pass'?'cheonggye-local':'';
  if(parentSlug){
    const parent=await tenantRow(env,parentSlug);
    if(parent?.status==='active'){
      const parentGrant=await env.DB.prepare(`SELECT role, enabled, principal_type, github_username,
          capabilities_json, denied_capabilities_json, expires_at
        FROM customer_access_grants
        WHERE tenant_id = ? AND lower(trim(email)) = ?`)
        .bind(parent.id,normalize(principal.email)).first();
      if(accessGrantIsActive(parentGrant)&&tenantRoleCanManageAccess(parentGrant.role)){
        return Object.freeze({
          ok:true,scope:'tenant-delegated',email:normalize(principal.email),role:normalize(parentGrant.role),
          tenantSlug:tenant.slug,tenantId:Number(tenant.id),canManageAllTenants:false,parentTenantSlug:parent.slug,
        });
      }
    }
  }

  const grant=await env.DB.prepare(`SELECT role, enabled, principal_type, github_username,
      capabilities_json, denied_capabilities_json, expires_at
    FROM customer_access_grants
    WHERE tenant_id = ? AND lower(trim(email)) = ?`)
    .bind(tenant.id,normalize(principal.email)).first();

  if(!accessGrantIsActive(grant)||!tenantRoleCanManageAccess(grant.role)){
    return Object.freeze({ok:false,status:403,code:'TENANT_ACCESS_MANAGE_FORBIDDEN'});
  }

  return Object.freeze({
    ok:true,scope:'tenant',email:normalize(principal.email),role:normalize(grant.role),
    tenantSlug:tenant.slug,tenantId:Number(tenant.id),canManageAllTenants:false,
  });
}

export function accessGrantManagementDecision(authority,target={},next={}){
  if(!authority?.ok)return Object.freeze({ok:false,code:'ACCESS_AUTH_REQUIRED'});
  if(authority.scope==='platform')return Object.freeze({ok:true});

  const targetEmail=normalize(target.email);
  const targetRole=normalize(target.role);
  const nextRole=normalize(next.role||targetRole);

  if(targetEmail&&targetEmail===normalize(authority.email)){
    return Object.freeze({ok:false,code:'ACCESS_SELF_MUTATION_FORBIDDEN'});
  }
  if(targetRole&&SITE_RESPONSIBILITY_ROLES.includes(targetRole)){
    return Object.freeze({ok:false,code:'ACCESS_RESPONSIBILITY_ROLE_PROTECTED'});
  }
  if(nextRole&&SITE_RESPONSIBILITY_ROLES.includes(nextRole)){
    return Object.freeze({ok:false,code:'ACCESS_RESPONSIBILITY_ROLE_ASSIGN_FORBIDDEN'});
  }
  if(nextRole&&!SITE_ASSIGNABLE_ROLES.includes(nextRole)){
    return Object.freeze({ok:false,code:'ACCESS_ROLE_ASSIGN_FORBIDDEN'});
  }
  if(usesHierarchicalAdminPolicy(authority)){
    const actorRank=roleManagementRank(authority.role);
    if(targetRole&&actorRank<=roleManagementRank(targetRole)){
      return Object.freeze({ok:false,code:'ACCESS_PEER_OR_HIGHER_ROLE_PROTECTED'});
    }
    if(nextRole&&actorRank<=roleManagementRank(nextRole)){
      return Object.freeze({ok:false,code:'ACCESS_ROLE_LEVEL_TOO_HIGH'});
    }
  }
  return Object.freeze({ok:true});
}

export function accessGrantManageable(authority,target={}){
  return accessGrantManagementDecision(authority,target,{role:target.role}).ok;
}

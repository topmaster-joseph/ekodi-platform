import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive } from './access-governance.js';
import { TENANT_ADMIN_CAPABILITIES, TENANT_ADMIN_ROLE_CAPABILITIES } from './tenant-admin-policy.js';

const normalize=value=>String(value||'').trim().toLowerCase();

export const SITE_RESPONSIBILITY_ROLES=Object.freeze([
  'owner','store_owner','tenant_admin','workspace_admin','client_admin','senior_pastor',
]);

export const SITE_ASSIGNABLE_ROLES=Object.freeze([
  'admin','manager','marketer','accountant','staff','member','viewer',
  'marketing_manager','accounting_manager','hq_manager','client_editor','client_viewer',
  'external_developer','pastor','care_staff',
]);

export function tenantRoleCanManageAccess(role){
  const allowed=TENANT_ADMIN_ROLE_CAPABILITIES[normalize(role)]||[];
  return allowed.includes('*')||allowed.includes(TENANT_ADMIN_CAPABILITIES.access);
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

  const slug=normalize(tenantSlug);
  if(!slug)return Object.freeze({ok:false,status:403,code:'TENANT_CONTEXT_REQUIRED'});

  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return Object.freeze({ok:false,status:401,code:'ACCESS_AUTH_REQUIRED'});

  const tenant=await tenantRow(env,slug);
  if(!tenant||tenant.status!=='active')return Object.freeze({ok:false,status:404,code:'TENANT_NOT_FOUND'});

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
  return Object.freeze({ok:true});
}

export function accessGrantManageable(authority,target={}){
  return accessGrantManagementDecision(authority,target,{role:target.role}).ok;
}

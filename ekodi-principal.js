import { activityRoleFor, ownedCustomerSiteFor } from './ekodi-site-policy.js';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SUBJECT_TYPES=new Set(['person','tenant']);
const LEGACY_WRITE_ROLES=new Set(['store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const encoder=new TextEncoder();

export const CORE_ROLES=Object.freeze(['owner','admin','manager','marketer','accountant','staff','member','viewer']);

const CORE_ROLE_SET=new Set(CORE_ROLES);
const CORE_ROLE_ALIASES=Object.freeze({
  super_admin:'admin',
  admin:'admin',
  owner:'owner',
  manager:'manager',
  store_owner:'owner',
  hq_manager:'manager',
  marketing_manager:'marketer',
  accounting_manager:'accountant',
  client_admin:'owner',
  client_editor:'marketer',
  client_viewer:'viewer',
  marketer:'marketer',
  accountant:'accountant',
  staff:'staff',
  member:'member',
  viewer:'viewer',
});

function bytesToHex(bytes){
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function sha256(value){
  return bytesToHex(await crypto.subtle.digest('SHA-256',encoder.encode(String(value||''))));
}

export function canonicalCoreRole(role='',kind='user'){
  const normalized=clean(role,80).toLowerCase();
  if(kind==='admin'&&(!normalized||normalized==='super_admin'))return 'admin';
  if(CORE_ROLE_SET.has(normalized))return normalized;
  return CORE_ROLE_ALIASES[normalized]||'member';
}

export function principalCapabilities(role='',kind='user'){
  const normalized=clean(role,80).toLowerCase();
  const coreRole=canonicalCoreRole(normalized,kind);
  const set=new Set(['conversation:read']);

  // Platform authority is activated only by an authenticated admin principal.
  // A tenant-local role named "admin" must never inherit platform authority.
  if(kind==='admin'){
    ['conversation:write','conversation:operate','conversation:handoff','conversation:channel-link'].forEach(v=>set.add(v));
  }else if(LEGACY_WRITE_ROLES.has(normalized)||['owner','admin','manager','marketer','accountant','staff'].includes(coreRole)){
    ['conversation:write','conversation:handoff'].forEach(v=>set.add(v));
  }
  return [...set];
}

export function buildPrincipal({id,email='',kind='user',provider='unknown',role='member',subjectType='person',subjectKey='',activityRole='',activityRoleLabel=''}){
  const principalId=clean(id,240);
  if(!principalId)return null;
  const normalizedKind=kind==='admin'?'admin':'user';
  const normalizedRole=clean(role,80)||'member';
  const normalizedSubjectType=SUBJECT_TYPES.has(subjectType)?subjectType:'person';
  const authorityScope=normalizedKind==='admin'?'platform':normalizedSubjectType==='tenant'?'tenant':'person';
  return Object.freeze({
    id:principalId,
    email:clean(email,320).toLowerCase(),
    kind:normalizedKind,
    provider:clean(provider,80)||'unknown',
    role:normalizedRole,
    coreRole:canonicalCoreRole(normalizedRole,normalizedKind),
    activityRole:clean(activityRole,80)||null,
    activityRoleLabel:clean(activityRoleLabel,120)||null,
    authorityScope,
    subject:Object.freeze({type:normalizedSubjectType,key:clean(subjectKey,240)||principalId}),
    capabilities:Object.freeze(principalCapabilities(normalizedRole,normalizedKind)),
  });
}

export async function principalFromSupabaseRequest(request){
  const auth=String(request.headers.get('authorization')||'');
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token||token.length>8192)return null;
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`},
    signal:AbortSignal.timeout(10000),
  }).catch(()=>null);
  if(!response?.ok)return null;
  const user=await response.json().catch(()=>null);
  const email=String(user?.email||'').trim().toLowerCase();
  if(!user?.id||!email||!user?.email_confirmed_at)return null;
  return buildPrincipal({id:`person:${user.id}`,email,kind:'user',provider:'supabase',role:'owner',subjectType:'person',subjectKey:String(user.id)});
}

export async function principalFromCustomerSession(request,env){
  if(!env?.DB)return null;
  const auth=String(request.headers.get('authorization')||'');
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token||token.length>256)return null;
  const tokenHash=await sha256(token);
  const row=await env.DB.prepare(`SELECT
      u.id AS user_id,u.email,u.display_name,u.status AS user_status,
      t.id AS tenant_id,t.slug,t.name AS tenant_name,t.domain,t.status AS tenant_status,
      m.role,m.status AS membership_status,s.expires_at
    FROM customer_sessions s
    JOIN customer_users u ON u.id=s.user_id
    JOIN customer_tenants t ON t.id=s.tenant_id
    JOIN customer_memberships m ON m.user_id=u.id AND m.tenant_id=t.id
    WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(tokenHash,new Date().toISOString()).first();
  if(!row||row.user_status!=='active'||row.tenant_status!=='active'||row.membership_status!=='active')return null;
  const activity=activityRoleFor(row.slug,row.role);
  return buildPrincipal({
    id:`customer:${row.user_id}`,
    email:row.email,
    kind:'user',
    provider:'ekodi-customer-session',
    role:row.role,
    subjectType:'tenant',
    subjectKey:row.slug,
    activityRole:activity.role,
    activityRoleLabel:activity.label,
  });
}

export async function resolveWorkspacePrincipal(request,env,{write=false}={}){
  const base=await principalFromSupabaseRequest(request);
  if(!base)return {error:'AUTH_REQUIRED',status:401};
  const url=new URL(request.url);
  const subjectType=SUBJECT_TYPES.has(String(url.searchParams.get('subject_type')||'').toLowerCase())?String(url.searchParams.get('subject_type')).toLowerCase():'person';
  if(subjectType==='person'){
    const principal=buildPrincipal({id:base.id,email:base.email,kind:'user',provider:base.provider,role:'owner',subjectType:'person',subjectKey:base.subject.key});
    if(write&&!principal.capabilities.includes('conversation:write'))return {error:'SUBJECT_READ_ONLY',status:403};
    if(write&&String(env.ALLOW_MUTATIONS)!=='true')return {error:'MUTATIONS_DISABLED',status:503};
    return {principal,subject:principal.subject,identity:{id:base.subject.key,email:base.email}};
  }
  const tenantKey=clean(url.searchParams.get('subject_key'),80).toLowerCase();
  if(!tenantKey)return {error:'SUBJECT_FORBIDDEN',status:403};
  const tenant=await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(tenantKey).first();
  if(!tenant||tenant.status!=='active')return {error:'SUBJECT_FORBIDDEN',status:403};
  const grant=await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,base.email).first();
  if(!grant||Number(grant.enabled)!==1)return {error:'SUBJECT_FORBIDDEN',status:403};
  const site=ownedCustomerSiteFor(tenant.slug);
  const activity=activityRoleFor(site?.id||tenant.slug,String(grant.role||'member'));
  const principal=buildPrincipal({
    id:base.id,email:base.email,kind:'user',provider:base.provider,role:String(grant.role||'member'),
    subjectType:'tenant',subjectKey:String(tenant.slug),activityRole:activity.role,activityRoleLabel:activity.label,
  });
  if(write&&!principal.capabilities.includes('conversation:write'))return {error:'SUBJECT_READ_ONLY',status:403};
  if(write&&String(env.ALLOW_MUTATIONS)!=='true')return {error:'MUTATIONS_DISABLED',status:503};
  return {principal,subject:principal.subject,identity:{id:base.subject.key,email:base.email}};
}

export async function principalFromAdminSession(request,env,authWorker){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return {response,principal:null};
  const session=await response.clone().json().catch(()=>null);
  if(!session?.authenticated||!session?.email)return {response,principal:null};
  const role=String(session.role||'admin');
  const principal=buildPrincipal({id:`admin:${session.email.toLowerCase()}`,email:session.email,kind:'admin',provider:'ekodi-admin-session',role,subjectType:'person',subjectKey:session.email.toLowerCase()});
  return {response,principal,session};
}

export async function auditPrincipal(env,principal,capability='conversation:read'){
  if(!env?.DB||!principal)return;
  try{
    // The audit ledger intentionally does not duplicate raw email. Principal ID, provider,
    // workspace subject and capability are sufficient to trace authorization decisions.
    await env.DB.prepare(`INSERT INTO messenger_identity_audit(principal_id,principal_kind,auth_provider,email,subject_type,subject_key,role,capability,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(principal.id,principal.kind,principal.provider,'',principal.subject.type,principal.subject.key,principal.role,clean(capability,120),new Date().toISOString()).run();
  }catch{}
}

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SUBJECT_TYPES=new Set(['person','tenant']);
const WRITE_ROLES=new Set(['store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const ADMIN_ROLES=new Set(['super_admin','admin','owner','manager']);
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);

export function principalCapabilities(role='',kind='user'){
  const normalized=clean(role,80).toLowerCase();
  const set=new Set(['conversation:read']);
  if(kind==='admin'||ADMIN_ROLES.has(normalized)){
    ['conversation:write','conversation:operate','conversation:handoff','conversation:channel-link'].forEach(v=>set.add(v));
  }else if(WRITE_ROLES.has(normalized)||normalized==='owner'){
    ['conversation:write','conversation:handoff'].forEach(v=>set.add(v));
  }
  return [...set];
}

export function buildPrincipal({id,email='',kind='user',provider='unknown',role='member',subjectType='person',subjectKey=''}){
  const principalId=clean(id,240);
  if(!principalId)return null;
  const normalizedRole=clean(role,80)||'member';
  return Object.freeze({
    id:principalId,
    email:clean(email,320).toLowerCase(),
    kind:kind==='admin'?'admin':'user',
    provider:clean(provider,80)||'unknown',
    role:normalizedRole,
    subject:Object.freeze({type:SUBJECT_TYPES.has(subjectType)?subjectType:'person',key:clean(subjectKey,240)||principalId}),
    capabilities:Object.freeze(principalCapabilities(normalizedRole,kind)),
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
  const principal=buildPrincipal({id:base.id,email:base.email,kind:'user',provider:base.provider,role:String(grant.role||'member'),subjectType:'tenant',subjectKey:String(tenant.slug)});
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
    await env.DB.prepare(`INSERT INTO messenger_identity_audit(principal_id,principal_kind,auth_provider,email,subject_type,subject_key,role,capability,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(principal.id,principal.kind,principal.provider,principal.email,principal.subject.type,principal.subject.key,principal.role,clean(capability,120),new Date().toISOString()).run();
  }catch{}
}
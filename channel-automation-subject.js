const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES = new Set(['tenant_admin','admin','workspace_admin','store_owner','hq_manager','client_admin','client_editor','marketing_manager','marketer','manager','owner']);

function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function platformAdminActor(request, env, token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || '')) || !env?.CONTROL_API?.fetch) return null;
  try {
    const probe = new URL(request.url);
    probe.protocol = 'https:';
    probe.hostname = 'ekodi.kr';
    probe.pathname = '/api/session';
    probe.search = '';
    const response = await env.CONTROL_API.fetch(new Request(probe.toString(), {
      method:'GET',
      headers:{authorization:`Bearer ${token}`,accept:'application/json'},
      redirect:'manual',
    }));
    if (!response.ok) return null;
    const session = await response.json().catch(() => null);
    const email = String(session?.email || '').trim().toLowerCase();
    const role = String(session?.role || '').trim().toLowerCase();
    if (!session?.authenticated || !email || role !== 'super_admin') return null;
    return { id:`admin:${email}`, email, token, contexts:[], platformAdmin:true, adminRole:role };
  } catch {
    return null;
  }
}

function tenantKeyCandidates(value) {
  const key=clean(value,120).toLowerCase();
  const aliases={
    'ekodibiz':['ekodi-biz','ekodibiz'],
    'ekodi-biz':['ekodi-biz','ekodibiz'],
    'ekodichurch':['ekodi-church','ekodichurch'],
    'ekodi-church':['ekodi-church','ekodichurch'],
    'ekoditrade':['ekoditrade','ekodi-trade','ekodibiz-trade'],
    'ekodi-trade':['ekoditrade','ekodi-trade','ekodibiz-trade'],
    'ekodibiz-trade':['ekoditrade','ekodi-trade','ekodibiz-trade'],
    'ekodilab':['ekodi-lab','ekodilab'],
    'ekodi-lab':['ekodi-lab','ekodilab'],
  };
  return [...new Set(aliases[key] || [key])].filter(Boolean);
}

async function platformTenantSubject(env, key) {
  if (!env?.DB) return null;
  for (const candidate of tenantKeyCandidates(key)) {
    const tenant=await env.DB.prepare('SELECT id,slug,name,status FROM customer_tenants WHERE slug=?').bind(candidate).first();
    if (tenant?.status === 'active') return tenant;
  }
  return null;
}
async function supabaseJson(path, token, env, init = {}) {
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY);
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}, cache:'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `SUPABASE_${response.status}`), { status:response.status });
  return data;
}

export async function channelAutomationActor(request, env) {
  const token = bearer(request);
  if (!token || token.length > 8192) return null;
  const platformAdmin=await platformAdminActor(request,env,token);
  if(platformAdmin)return platformAdmin;
  try {
    const [user, raw] = await Promise.all([
      supabaseJson('/auth/v1/user', token, env),
      supabaseJson('/rest/v1/rpc/current_site_activity_contexts', token, env, { method:'POST', body:'{}' }),
    ]);
    if (!user?.id || !user?.email || !user?.email_confirmed_at) return null;    const contexts = (Array.isArray(raw) ? raw : []).map(item => ({
      workspaceId:String(item?.tenant_id || ''),
      workspaceKey:String(item?.workspace_key || ''),
      workspaceSlug:String(item?.tenant || '').trim().toLowerCase(),
      workspaceName:String(item?.workspace_name || item?.tenant || ''),
      workspaceKind:String(item?.workspace_kind || 'organization'),
      authorizationRole:String(item?.authorization_role || ''),
      canManage:WRITE_ROLES.has(String(item?.authorization_role || '')),
    })).filter(item => item.workspaceId && item.workspaceSlug);
    return { id:String(user.id), email:String(user.email).trim().toLowerCase(), token, contexts };
  } catch (error) {
    console.error('Channel Automation actor resolution', error?.message || error);
    return null;
  }
}

function clean(value, max = 100) { return String(value || '').trim().slice(0, max); }
function workspaceMatch(actor, key) {
  const value = clean(key, 120).toLowerCase();
  return actor.contexts.find(item => item.workspaceId.toLowerCase() === value || item.workspaceSlug === value || item.workspaceKey.toLowerCase() === value) || null;
}

export async function resolveChannelAutomationSubject(env, actor, type, key) {
  const requested = String(type || 'person').trim().toLowerCase();
  if (requested === 'person') return { type:'person', key:actor.id, workspaceId:'', workspaceSlug:'', ownerType:'person', ownerKey:actor.id, role:actor.platformAdmin?'super_admin':'owner', writable:true };
  if (requested === 'workspace' || requested === 'tenant') {
    if(actor.platformAdmin&&actor.adminRole==='super_admin'){
      const tenant=await platformTenantSubject(env,key);
      if(!tenant)return null;
      return { type:'tenant', key:String(tenant.slug), workspaceId:String(tenant.id), workspaceSlug:String(tenant.slug), ownerType:'workspace', ownerKey:String(tenant.id), role:'super_admin', writable:true, workspaceKind:'organization', workspaceName:String(tenant.name||tenant.slug) };
    }
    const context = workspaceMatch(actor, key);
    if (!context) return null;
    return { type:'tenant', key:context.workspaceSlug, workspaceId:context.workspaceId, workspaceSlug:context.workspaceSlug, ownerType:'workspace', ownerKey:context.workspaceId, role:context.authorizationRole, writable:context.canManage, workspaceKind:context.workspaceKind, workspaceName:context.workspaceName };
  }
  if (requested !== 'store') return null;
  const storeId = clean(key, 100);
  if (!storeId || !env.DB) return null;
  const store = await env.DB.prepare('SELECT store_id,tenant_slug,status FROM marketing_store_workspaces WHERE store_id=?').bind(storeId).first();
  if (!store || store.status !== 'active' || !store.tenant_slug) return null;
  if(actor.platformAdmin&&actor.adminRole==='super_admin'){
    const tenant=await platformTenantSubject(env,store.tenant_slug);
    if(!tenant)return null;
    return { type:'store', key:String(store.store_id), workspaceId:String(tenant.id), workspaceSlug:String(tenant.slug), ownerType:'workspace', ownerKey:String(tenant.id), role:'super_admin', writable:true, workspaceKind:'organization', workspaceName:String(tenant.name||tenant.slug) };
  }
  const context = workspaceMatch(actor, store.tenant_slug);
  if (!context) return null;
  return { type:'store', key:String(store.store_id), workspaceId:context.workspaceId, workspaceSlug:context.workspaceSlug, ownerType:'workspace', ownerKey:context.workspaceId, role:context.authorizationRole, writable:context.canManage, workspaceKind:context.workspaceKind, workspaceName:context.workspaceName };
}

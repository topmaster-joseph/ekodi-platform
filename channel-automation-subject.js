const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES = new Set(['tenant_admin','admin','store_owner','hq_manager','client_admin','client_editor','manager','owner']);

function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
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
  if (requested === 'person') return { type:'person', key:actor.id, workspaceId:'', workspaceSlug:'', ownerType:'person', ownerKey:actor.id, role:'owner', writable:true };
  if (requested === 'workspace' || requested === 'tenant') {
    const context = workspaceMatch(actor, key);
    if (!context) return null;    return { type:'tenant', key:context.workspaceSlug, workspaceId:context.workspaceId, workspaceSlug:context.workspaceSlug, ownerType:'workspace', ownerKey:context.workspaceId, role:context.authorizationRole, writable:context.canManage, workspaceKind:context.workspaceKind, workspaceName:context.workspaceName };
  }
  if (requested !== 'store') return null;
  const storeId = clean(key, 100);
  if (!storeId || !env.DB) return null;
  const store = await env.DB.prepare('SELECT store_id,tenant_slug,status FROM marketing_store_workspaces WHERE store_id=?').bind(storeId).first();
  if (!store || store.status !== 'active' || !store.tenant_slug) return null;
  const context = workspaceMatch(actor, store.tenant_slug);
  if (!context) return null;
  return { type:'store', key:String(store.store_id), workspaceId:context.workspaceId, workspaceSlug:context.workspaceSlug, ownerType:'workspace', ownerKey:context.workspaceId, role:context.authorizationRole, writable:context.canManage, workspaceKind:context.workspaceKind, workspaceName:context.workspaceName };
}

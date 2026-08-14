const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const PLUS_OR_ABOVE = new Set(['plus','pro','auto','enterprise']);
const PRO_OR_ABOVE = new Set(['pro','auto','enterprise']);
const STORE_MANAGERS = new Set(['store_owner','tenant_admin','platform_admin','hq_manager','client_admin','accounting_manager']);
const RESERVED_SLUGS = new Set(['www','api','auth','admin','marketing','mail','live','pay','portal','support','help','status','cdn','static','assets','root']);

function bearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}
function normalizeStoreId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}
export function normalizeWorkspaceSlug(value) {
  const slug = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (slug.length < 3 || RESERVED_SLUGS.has(slug)) return '';
  return slug;
}
function normalizeCanonicalHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  return /^[a-z0-9-]+\.ai\.ekodi\.kr$/.test(host) ? host : '';
}
function planActive(planId, status) {
  return String(status || '').toLowerCase() === 'active' && PLUS_OR_ABOVE.has(String(planId || '').toLowerCase());
}
function proActive(planId, status) {
  return String(status || '').toLowerCase() === 'active' && PRO_OR_ABOVE.has(String(planId || '').toLowerCase());
}
function canManage(role) { return STORE_MANAGERS.has(String(role || '')); }
function originAllowed(origin, env) {
  if (!origin) return true;
  const configured = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(url.hostname);
  } catch {
    return false;
  }
}
function cors(origin, allowed) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(data, status, request, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(request.headers.get('origin'), allowed),
    },
  });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function supabaseUser(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:user.id, email };
}
async function supabaseWorkspaces(request) {
  const token = bearerToken(request);
  if (!token) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`, {
    method:'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type':'application/json',
    },
    body: JSON.stringify({ p_site_key:'marketing' }),
  });
  if (!response.ok) return [];
  const value = await response.json();
  return Array.isArray(value) ? value : [];
}
async function resolveStore(request, storeId) {
  const id = normalizeStoreId(storeId);
  if (!id) return null;
  const [identity, workspaces] = await Promise.all([supabaseUser(request), supabaseWorkspaces(request)]);
  if (!identity) return null;
  const item = workspaces.find(row => String(row?.store_id || '').toLowerCase() === id && String(row?.workspace_key || '') === `store:${id}`);
  if (!item) return null;
  return {
    identity,
    id,
    slug:String(item.store || ''),
    name:String(item.store_name || item.workspace_name || ''),
    tenant:String(item.tenant || ''),
    role:String(item.role || ''),
    basePlan:String(item.plan || '').toLowerCase() === 'basic' ? 'basic' : 'free',
  };
}

async function subscriptionFor(env, storeId) {
  return env.DB.prepare(`SELECT plan_id,status,current_period_end,cancel_at_period_end
    FROM service_subscriptions WHERE subject_type='store' AND subject_key=? AND site='marketing'`)
    .bind(storeId).first();
}
async function workspaceFor(env, storeId) {
  return env.DB.prepare(`SELECT id,store_id,tenant_slug,workspace_slug,canonical_domain,
    provider,provider_project,landing_path,status,created_at,updated_at
    FROM marketing_store_workspaces WHERE store_id=?`)
    .bind(storeId).first();
}
function publicWorkspace(workspace, subscription, store) {
  if (!workspace) return null;
  const active = workspace.status === 'active';
  return {
    id:Number(workspace.id),
    storeId:workspace.store_id,
    storeName:store?.name || '',
    slug:workspace.workspace_slug,
    canonicalDomain:workspace.canonical_domain,
    canonicalUrl:`https://${workspace.canonical_domain}${workspace.landing_path !== '/' ? workspace.landing_path : ''}`,
    status:workspace.status,
    planId:subscription?.plan_id || store?.basePlan || 'free',
    planStatus:subscription?.status || (store?.basePlan === 'basic' ? 'active' : 'free'),
    dedicatedDomainActive:active,
    customDomainEligible:proActive(subscription?.plan_id, subscription?.status),
  };
}

async function cfRequest(env, path, { method='GET', body=null, allow404=false } = {}) {
  const token = String(env.CF_API_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Cloudflare Workspace 연결 권한이 준비되지 않았습니다.'), { code:'DOMAIN_PROVIDER_NOT_READY' });
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization:`Bearer ${token}`, 'content-type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && response.status === 404) return null;
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.success === false) {
    const message = payload?.errors?.[0]?.message || `Cloudflare 요청 실패 (${response.status})`;
    throw Object.assign(new Error(message), { code:'DOMAIN_PROVIDER_ERROR', status:response.status });
  }
  return payload.result;
}
async function accountId(env) {
  const configured = String(env.CF_ACCOUNT_ID || '').trim();
  if (/^[a-f0-9]{32}$/i.test(configured)) return configured;
  const accounts = await cfRequest(env, '/accounts?per_page=50');
  const active = (Array.isArray(accounts) ? accounts : []).filter(item => item?.id && item?.status !== 'closed');
  if (active.length === 1) return active[0].id;
  throw Object.assign(new Error('Cloudflare 계정을 자동으로 결정할 수 없습니다.'), { code:'DOMAIN_PROVIDER_ACCOUNT_REQUIRED' });
}
function pagesPath(account, suffix='') {
  return `/accounts/${account}/pages/projects/marketing-ai${suffix}`;
}
async function pagesProject(env) {
  const account = await accountId(env);
  const project = await cfRequest(env, pagesPath(account));
  const target = String(project?.subdomain || '').trim().toLowerCase();
  if (!target) throw Object.assign(new Error('Marketing AI 배포 대상을 찾을 수 없습니다.'), { code:'WORKSPACE_TARGET_NOT_READY' });
  return { account, target };
}
async function attachCanonical(env, hostname) {
  const { account, target } = await pagesProject(env);
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  let domain = await cfRequest(env, pagesPath(account, suffix), { allow404:true });
  if (!domain) domain = await cfRequest(env, pagesPath(account, '/domains'), { method:'POST', body:{ name:hostname } });
  return { domain, target };
}
async function detachCanonical(env, hostname) {
  const { account } = await pagesProject(env);
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  const current = await cfRequest(env, pagesPath(account, suffix), { allow404:true });
  if (current) await cfRequest(env, pagesPath(account, suffix), { method:'DELETE' });
}

async function slugAvailable(env, slug, storeId) {
  const row = await env.DB.prepare(`SELECT store_id FROM marketing_store_workspaces
    WHERE workspace_slug=? OR canonical_domain=? LIMIT 1`).bind(slug, `${slug}.ai.ekodi.kr`).first();
  return !row || row.store_id === storeId;
}
async function chooseSlug(env, store, requested='') {
  const requestedSlug = normalizeWorkspaceSlug(requested);
  if (requested && !requestedSlug) throw Object.assign(new Error('AI 주소는 영문 소문자, 숫자, 하이픈으로 3~48자 이내로 입력해 주세요.'), { code:'INVALID_WORKSPACE_SLUG' });
  if (requestedSlug) {
    if (await slugAvailable(env, requestedSlug, store.id)) return requestedSlug;
    throw Object.assign(new Error('이미 사용 중인 AI 주소입니다.'), { code:'WORKSPACE_SLUG_TAKEN' });
  }
  const storeSlug = normalizeWorkspaceSlug(store.slug);
  const tenantSlug = normalizeWorkspaceSlug(store.tenant);
  const short = store.id.replace(/-/g, '').slice(0, 8);
  const candidates = [storeSlug, normalizeWorkspaceSlug(`${tenantSlug || 'store'}-${storeSlug || short}`), normalizeWorkspaceSlug(`store-${short}`)].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    if (await slugAvailable(env, candidate, store.id)) return candidate;
  }
  throw Object.assign(new Error('사용 가능한 AI 주소를 자동으로 만들 수 없습니다.'), { code:'WORKSPACE_SLUG_UNAVAILABLE' });
}

async function resolveCanonical(request, env, allowed) {
  const host = normalizeCanonicalHost(new URL(request.url).searchParams.get('host'));
  if (!host) return json({ error:'유효한 EKODI AI Workspace 주소를 입력해 주세요.', code:'INVALID_CANONICAL_HOST' }, 400, request, allowed);
  const row = await env.DB.prepare(`SELECT store_id,workspace_slug,canonical_domain,landing_path,status
    FROM marketing_store_workspaces WHERE canonical_domain=? AND status='active' LIMIT 1`).bind(host).first();
  if (!row) return json({ error:'활성화된 점포 Workspace를 찾을 수 없습니다.', code:'WORKSPACE_NOT_FOUND' }, 404, request, allowed);
  return json({
    workspace:{
      storeId:row.store_id,
      slug:row.workspace_slug,
      canonicalDomain:row.canonical_domain,
      canonicalUrl:`https://${row.canonical_domain}${row.landing_path !== '/' ? row.landing_path : ''}`,
    },
  }, 200, request, allowed);
}

async function getStoreWorkspace(request, env, allowed) {
  const url = new URL(request.url);
  const store = await resolveStore(request, url.searchParams.get('store'));
  if (!store) return json({ error:'이 계정과 연결된 점포를 확인할 수 없습니다.', code:'STORE_ACCESS_REQUIRED' }, 403, request, allowed);
  const [subscription, workspace] = await Promise.all([subscriptionFor(env, store.id), workspaceFor(env, store.id)]);
  return json({
    store:{ id:store.id, slug:store.slug, name:store.name, tenant:store.tenant, role:store.role },
    basePlan:store.basePlan,
    planId:subscription?.plan_id || store.basePlan,
    planStatus:subscription?.status || (store.basePlan === 'basic' ? 'active' : 'free'),
    eligible:planActive(subscription?.plan_id, subscription?.status),
    requiredPlan:'plus',
    canManage:canManage(store.role),
    workspace:publicWorkspace(workspace, subscription, store),
  }, 200, request, allowed);
}

async function provisionStoreWorkspace(request, env, allowed) {
  const body = await readJson(request);
  const store = await resolveStore(request, body?.store);
  if (!store) return json({ error:'이 계정과 연결된 점포를 확인할 수 없습니다.', code:'STORE_ACCESS_REQUIRED' }, 403, request, allowed);
  if (!canManage(store.role)) return json({ error:'이 점포의 Marketing AI 플랜과 주소를 관리할 권한이 없습니다.', code:'STORE_MANAGER_REQUIRED' }, 403, request, allowed);
  const subscription = await subscriptionFor(env, store.id);
  if (!planActive(subscription?.plan_id, subscription?.status)) {
    return json({ error:'점포 전용 AI 주소는 Marketing AI Plus 이상에서 제공됩니다.', code:'PLUS_REQUIRED', basePlan:store.basePlan }, 403, request, allowed);
  }

  let workspace = await workspaceFor(env, store.id);
  if (workspace?.status === 'active') return json({ ok:true, created:false, workspace:publicWorkspace(workspace, subscription, store) }, 200, request, allowed);

  const slug = workspace?.workspace_slug || await chooseSlug(env, store, body?.slug);
  const hostname = workspace?.canonical_domain || `${slug}.ai.ekodi.kr`;
  let provider;
  try {
    provider = await attachCanonical(env, hostname);
  } catch (error) {
    return json({ error:error.message, code:error.code || 'WORKSPACE_PROVIDER_ERROR' }, error.code === 'DOMAIN_PROVIDER_NOT_READY' ? 503 : 502, request, allowed);
  }
  const now = new Date().toISOString();
  if (workspace) {
    await env.DB.prepare(`UPDATE marketing_store_workspaces SET status='active',updated_at=? WHERE id=?`).bind(now, workspace.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO marketing_store_workspaces
      (store_id,tenant_slug,workspace_slug,canonical_domain,provider,provider_project,landing_path,status,created_at,updated_at)
      VALUES (?,?,?,?, 'cloudflare-pages','marketing-ai','/','active',?,?)`)
      .bind(store.id, store.tenant || null, slug, hostname, now, now).run();
  }
  workspace = await workspaceFor(env, store.id);
  return json({
    ok:true,
    created:true,
    providerStatus:String(provider?.domain?.status || provider?.domain?.validation_status || ''),
    workspace:publicWorkspace(workspace, subscription, store),
  }, 201, request, allowed);
}

export async function handleMarketingStoreWorkspaceRequest(request, env) {
  if (!env.DB) return null;
  const origin = request.headers.get('origin');
  const allowed = originAllowed(origin, env);
  if (origin && !allowed) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, false);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, allowed) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/workspace/resolve') return resolveCanonical(request, env, allowed);
  if (request.method === 'GET' && path === '/api/marketing/workspace') return getStoreWorkspace(request, env, allowed);
  if (request.method === 'POST' && path === '/api/marketing/workspace/provision') return provisionStoreWorkspace(request, env, allowed);
  return null;
}

export async function runMarketingStoreWorkspaceSchedule(env) {
  if (!env.DB) return { checked:0, suspended:0, restored:0 };
  const rows = await env.DB.prepare(`SELECT w.*,s.plan_id,s.status AS subscription_status
    FROM marketing_store_workspaces w
    LEFT JOIN service_subscriptions s ON s.subject_type='store' AND s.subject_key=w.store_id AND s.site='marketing'
    ORDER BY w.updated_at ASC LIMIT 30`).all();
  let checked = 0;
  let suspended = 0;
  let restored = 0;
  for (const row of rows.results || []) {
    checked += 1;
    const eligible = planActive(row.plan_id, row.subscription_status);
    if (!eligible && row.status === 'active') {
      try {
        await detachCanonical(env, row.canonical_domain);
        await env.DB.prepare("UPDATE marketing_store_workspaces SET status='suspended',updated_at=? WHERE id=?")
          .bind(new Date().toISOString(), row.id).run();
        suspended += 1;
      } catch (error) {
        console.error('Failed to suspend store Marketing workspace', row.id, error);
      }
    } else if (eligible && row.status === 'suspended') {
      try {
        await attachCanonical(env, row.canonical_domain);
        await env.DB.prepare("UPDATE marketing_store_workspaces SET status='active',updated_at=? WHERE id=?")
          .bind(new Date().toISOString(), row.id).run();
        restored += 1;
      } catch (error) {
        console.error('Failed to restore store Marketing workspace', row.id, error);
      }
    }
  }
  return { checked, suspended, restored };
}

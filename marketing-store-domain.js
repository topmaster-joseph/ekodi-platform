const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const PRO_OR_ABOVE = new Set(['pro','auto','enterprise']);
const STORE_MANAGERS = new Set(['store_owner','tenant_admin','platform_admin','hq_manager','client_admin','accounting_manager']);
const RESERVED_SUFFIXES = ['.ekodi.kr','.pages.dev','.workers.dev'];

function bearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}
function normalizeStoreId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}
export function normalizeStoreCustomerHostname(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.length > 253 || raw.includes('/') || raw.includes(':') || raw.includes('*')) return '';
  let hostname = '';
  try { hostname = new URL(`https://${raw}`).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
  if (!/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes('.')) return '';
  const labels = hostname.split('.');
  if (labels.length < 3 || labels.some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return '';
  if (RESERVED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) return '';
  return hostname;
}
function proActive(planId, status) {
  return String(status || '').toLowerCase() === 'active' && PRO_OR_ABOVE.has(String(planId || '').toLowerCase());
}
function mappingLimit(planId) { return String(planId || '').toLowerCase() === 'enterprise' ? 10 : 1; }
function canManage(role) { return STORE_MANAGERS.has(String(role || '')); }
function originAllowed(origin, env) {
  if (!origin) return true;
  const configured = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(url.hostname);
  } catch { return false; }
}
function cors(origin, allowed) {
  const headers = {
    'access-control-allow-headers':'content-type, authorization',
    'access-control-allow-methods':'GET, POST, DELETE, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(data, status, request, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', ...cors(request.headers.get('origin'), allowed) },
  });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function resolveStore(request, storeId) {
  const id = normalizeStoreId(storeId);
  const token = bearerToken(request);
  if (!id || !token) return null;
  const [userResponse, workspacesResponse] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`, {
      method:'POST',
      headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}`, 'content-type':'application/json' },
      body:JSON.stringify({ p_site_key:'marketing' }),
    }),
  ]);
  if (!userResponse.ok || !workspacesResponse.ok) return null;
  const user = await userResponse.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  const rows = await workspacesResponse.json();
  const item = (Array.isArray(rows) ? rows : []).find(row => String(row?.store_id || '').toLowerCase() === id && String(row?.workspace_key || '') === `store:${id}`);
  if (!item) return null;
  return { id, email, role:String(item.role || ''), name:String(item.store_name || item.workspace_name || '') };
}
async function subscriptionFor(env, storeId) {
  return env.DB.prepare(`SELECT plan_id,status FROM service_subscriptions
    WHERE subject_type='store' AND subject_key=? AND site='marketing'`).bind(storeId).first();
}
async function workspaceFor(env, storeId) {
  return env.DB.prepare(`SELECT * FROM marketing_workspaces WHERE subject_type='store' AND subject_key=? AND status='active'`)
    .bind(storeId).first();
}

async function cfRequest(env, path, { method='GET', body=null, allow404=false } = {}) {
  const token = String(env.CF_API_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Cloudflare 도메인 자동연결 권한이 준비되지 않았습니다.'), { code:'DOMAIN_PROVIDER_NOT_READY' });
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' },
    body:body ? JSON.stringify(body) : undefined,
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
function pagesPath(account, suffix='') { return `/accounts/${account}/pages/projects/marketing-ai${suffix}`; }
async function pagesDomain(env, hostname, create=false) {
  const account = await accountId(env);
  const project = await cfRequest(env, pagesPath(account));
  const target = String(project?.subdomain || '').trim().toLowerCase();
  if (!target) throw Object.assign(new Error('Marketing AI 배포 대상을 찾을 수 없습니다.'), { code:'WORKSPACE_TARGET_NOT_READY' });
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  let domain = await cfRequest(env, pagesPath(account, suffix), { allow404:true });
  if (!domain && create) domain = await cfRequest(env, pagesPath(account, '/domains'), { method:'POST', body:{ name:hostname } });
  return { account, target, domain };
}
async function deletePagesDomain(env, hostname) {
  const account = await accountId(env);
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  const current = await cfRequest(env, pagesPath(account, suffix), { allow404:true });
  if (current) await cfRequest(env, pagesPath(account, suffix), { method:'DELETE' });
}
function providerStatus(domain) { return String(domain?.status || domain?.validation_status || '').trim().toLowerCase(); }
function localStatus(domain) { return providerStatus(domain) === 'active' ? 'active' : 'pending_dns'; }
function validationPayload(domain) {
  const value = domain?.validation_data || domain?.verification_data || domain?.validation || null;
  return value && typeof value === 'object' ? value : {};
}
function publicDomain(row) {
  let validation = {};
  try { validation = JSON.parse(row.validation_json || '{}'); } catch {}
  return {
    id:Number(row.id), hostname:row.hostname, status:row.status, providerStatus:row.provider_status || '',
    url:`https://${row.hostname}`, canonicalUrl:`https://${row.canonical_domain}`,
    dns:{ type:'CNAME', name:row.dns_name, target:row.dns_target, ttl:'Auto', proxy:'DNS only 권장' },
    providerValidation:validation, error:row.error || '', verifiedAt:row.verified_at || null, updatedAt:row.updated_at,
  };
}
async function context(request, env, storeId) {
  const store = await resolveStore(request, storeId);
  if (!store) return { error:{ status:403, body:{ error:'이 계정과 연결된 점포를 확인할 수 없습니다.', code:'STORE_ACCESS_REQUIRED' } } };
  if (!canManage(store.role)) return { error:{ status:403, body:{ error:'이 점포의 도메인을 관리할 권한이 없습니다.', code:'STORE_MANAGER_REQUIRED' } } };
  const [subscription, workspace] = await Promise.all([subscriptionFor(env, store.id), workspaceFor(env, store.id)]);
  return { store, subscription, workspace };
}

async function listStoreDomains(request, env, allowed) {
  const url = new URL(request.url);
  const ctx = await context(request, env, url.searchParams.get('store'));
  if (ctx.error) return json(ctx.error.body, ctx.error.status, request, allowed);
  const { store, subscription, workspace } = ctx;
  const eligible = proActive(subscription?.plan_id, subscription?.status);
  const rows = await env.DB.prepare(`SELECT d.*,w.canonical_domain FROM marketing_custom_domains d
    JOIN marketing_workspaces w ON w.id=d.workspace_id
    WHERE d.subject_type='store' AND d.subject_key=? AND d.status<>'disabled' ORDER BY d.id DESC`).bind(store.id).all();
  return json({
    eligible, requiredPlan:'pro', planId:subscription?.plan_id || 'basic', planStatus:subscription?.status || 'active',
    workspace:workspace ? { slug:workspace.workspace_slug, canonicalDomain:workspace.canonical_domain, canonicalUrl:`https://${workspace.canonical_domain}` } : null,
    mappingLimit:eligible ? mappingLimit(subscription?.plan_id) : 0,
    domains:(rows.results || []).map(publicDomain),
  }, 200, request, allowed);
}

async function createStoreDomain(request, env, allowed) {
  const body = await readJson(request);
  const ctx = await context(request, env, body?.store);
  if (ctx.error) return json(ctx.error.body, ctx.error.status, request, allowed);
  const { store, subscription, workspace } = ctx;
  if (!proActive(subscription?.plan_id, subscription?.status)) return json({ error:'고객 소유 도메인 연결은 Marketing AI Pro 이상에서 사용할 수 있습니다.', code:'PRO_REQUIRED' }, 403, request, allowed);
  if (!workspace) return json({ error:'점포 전용 Marketing AI Workspace를 먼저 개통해 주세요.', code:'WORKSPACE_NOT_PROVISIONED' }, 409, request, allowed);
  const hostname = normalizeStoreCustomerHostname(body?.hostname);
  if (!hostname) return json({ error:'고객이 소유한 서브도메인을 입력해 주세요. 예: ai.example.com', code:'INVALID_CUSTOM_HOSTNAME' }, 400, request, allowed);
  const existing = await env.DB.prepare('SELECT subject_type,subject_key,status FROM marketing_custom_domains WHERE hostname=?').bind(hostname).first();
  if (existing && (existing.subject_type !== 'store' || existing.subject_key !== store.id || existing.status !== 'disabled')) return json({ error:'이미 연결되었거나 연결 진행 중인 도메인입니다.', code:'HOSTNAME_ALREADY_REGISTERED' }, 409, request, allowed);
  const current = await env.DB.prepare(`SELECT COUNT(*) AS count FROM marketing_custom_domains
    WHERE subject_type='store' AND subject_key=? AND status IN ('pending_dns','verifying','active','disconnect_pending')`).bind(store.id).first();
  if (Number(current?.count || 0) >= mappingLimit(subscription.plan_id)) return json({ error:'현재 플랜에서 연결 가능한 고객 소유 도메인 수를 모두 사용했습니다.', code:'CUSTOM_DOMAIN_LIMIT' }, 409, request, allowed);
  let provider;
  try { provider = await pagesDomain(env, hostname, true); }
  catch (error) { return json({ error:error.message, code:error.code || 'DOMAIN_PROVIDER_ERROR' }, error.code === 'DOMAIN_PROVIDER_NOT_READY' ? 503 : 502, request, allowed); }
  const now = new Date().toISOString();
  const state = localStatus(provider.domain);
  const pStatus = providerStatus(provider.domain);
  const validation = JSON.stringify(validationPayload(provider.domain));
  const verified = state === 'active' ? now : null;
  if (existing?.status === 'disabled') {
    await env.DB.prepare(`UPDATE marketing_custom_domains SET workspace_id=?,subject_type='store',subject_key=?,status=?,provider_status=?,provider_domain_id=?,
      dns_type='CNAME',dns_name=?,dns_target=?,validation_json=?,error='',created_by_email=?,created_at=?,verified_at=?,updated_at=?,disabled_at=NULL WHERE hostname=?`)
      .bind(workspace.id,store.id,state,pStatus,String(provider.domain?.id || provider.domain?.name || ''),hostname,provider.target,validation,store.email,now,verified,now,hostname).run();
  } else {
    await env.DB.prepare(`INSERT INTO marketing_custom_domains
      (workspace_id,subject_type,subject_key,hostname,status,provider_status,provider_domain_id,dns_type,dns_name,dns_target,validation_json,error,created_by_email,created_at,verified_at,updated_at)
      VALUES (?,'store',?,?,?,?,?,'CNAME',?,?,?,'',?,?,?,?)`)
      .bind(workspace.id,store.id,hostname,state,pStatus,String(provider.domain?.id || provider.domain?.name || ''),hostname,provider.target,validation,store.email,now,verified,now).run();
  }
  const row = await env.DB.prepare(`SELECT d.*,w.canonical_domain FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id WHERE d.hostname=?`).bind(hostname).first();
  return json({ ok:true, message:state === 'active' ? '고객 소유 도메인이 연결되었습니다.' : '아래 CNAME을 고객의 DNS 관리화면에 추가해 주세요.', domain:publicDomain(row) }, state === 'active' ? 200 : 201, request, allowed);
}

async function verifyStoreDomain(request, env, allowed, domainId) {
  const body = await readJson(request);
  const ctx = await context(request, env, body?.store);
  if (ctx.error) return json(ctx.error.body, ctx.error.status, request, allowed);
  const { store, subscription } = ctx;
  if (!proActive(subscription?.plan_id, subscription?.status)) return json({ error:'도메인 검증은 Marketing AI Pro 이상에서 사용할 수 있습니다.', code:'PRO_REQUIRED' }, 403, request, allowed);
  const row = await env.DB.prepare(`SELECT d.*,w.canonical_domain FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id
    WHERE d.id=? AND d.subject_type='store' AND d.subject_key=? AND d.status<>'disabled'`).bind(domainId,store.id).first();
  if (!row) return json({ error:'연결 정보를 찾을 수 없습니다.' }, 404, request, allowed);
  let provider;
  try { provider = await pagesDomain(env, row.hostname, false); }
  catch (error) { return json({ error:error.message, code:error.code || 'DOMAIN_PROVIDER_ERROR' }, 502, request, allowed); }
  if (!provider.domain) return json({ error:'Cloudflare 연결 정보가 사라졌습니다. 도메인을 다시 연결해 주세요.', code:'PROVIDER_MAPPING_MISSING' }, 409, request, allowed);
  const now = new Date().toISOString();
  const state = localStatus(provider.domain);
  const pStatus = providerStatus(provider.domain);
  await env.DB.prepare(`UPDATE marketing_custom_domains SET status=?,provider_status=?,dns_target=?,validation_json=?,error='',
    verified_at=CASE WHEN ?='active' THEN COALESCE(verified_at,?) ELSE verified_at END,updated_at=? WHERE id=?`)
    .bind(state,pStatus,provider.target,JSON.stringify(validationPayload(provider.domain)),state,now,now,row.id).run();
  const updated = await env.DB.prepare(`SELECT d.*,w.canonical_domain FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id WHERE d.id=?`).bind(row.id).first();
  return json({ ok:state === 'active', message:state === 'active' ? 'DNS와 HTTPS 연결이 확인되었습니다.' : '아직 DNS/HTTPS 확인 중입니다.', domain:publicDomain(updated) }, 200, request, allowed);
}

async function deleteStoreDomain(request, env, allowed, domainId) {
  const url = new URL(request.url);
  const ctx = await context(request, env, url.searchParams.get('store'));
  if (ctx.error) return json(ctx.error.body, ctx.error.status, request, allowed);
  const { store } = ctx;
  const row = await env.DB.prepare(`SELECT * FROM marketing_custom_domains WHERE id=? AND subject_type='store' AND subject_key=? AND status<>'disabled'`)
    .bind(domainId,store.id).first();
  if (!row) return json({ error:'연결 정보를 찾을 수 없습니다.' }, 404, request, allowed);
  try { await deletePagesDomain(env, row.hostname); }
  catch (error) {
    await env.DB.prepare("UPDATE marketing_custom_domains SET status='disconnect_pending',error=?,updated_at=? WHERE id=?")
      .bind(String(error.message || error).slice(0,500),new Date().toISOString(),row.id).run();
    return json({ error:'Cloudflare 연결 해제를 완료하지 못했습니다. 자동 재시도합니다.', code:'DISCONNECT_PENDING' }, 502, request, allowed);
  }
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE marketing_custom_domains SET status='disabled',provider_status='',error='',disabled_at=?,updated_at=? WHERE id=?")
    .bind(now,now,row.id).run();
  return json({ ok:true, hostname:row.hostname, status:'disabled' }, 200, request, allowed);
}

export async function handleMarketingStoreDomainRequest(request, env) {
  if (!env.DB) return null;
  const origin = request.headers.get('origin');
  const allowed = originAllowed(origin, env);
  if (origin && !allowed) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, false);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, allowed) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/store-domains') return listStoreDomains(request, env, allowed);
  if (request.method === 'POST' && path === '/api/marketing/store-domains') return createStoreDomain(request, env, allowed);
  const verify = path.match(/^\/api\/marketing\/store-domains\/(\d+)\/verify$/);
  if (request.method === 'POST' && verify) return verifyStoreDomain(request, env, allowed, Number(verify[1]));
  const remove = path.match(/^\/api\/marketing\/store-domains\/(\d+)$/);
  if (request.method === 'DELETE' && remove) return deleteStoreDomain(request, env, allowed, Number(remove[1]));
  return null;
}

import { isAllowedOrigin } from './auth-worker.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const DOMAIN_MANAGER_ROLES = new Set(['store_owner', 'hq_manager', 'client_admin']);
const PRO_OR_ABOVE = new Set(['pro', 'auto', 'enterprise']);
const LIVE_DOMAIN_STATES = new Set(['pending_dns', 'verifying', 'active', 'disconnect_pending']);
const RESERVED_SUFFIXES = ['.ekodi.kr', '.pages.dev', '.workers.dev'];

function normalizeTenant(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

export function isProOrAbove(planId, status = 'active') {
  return String(status || '').toLowerCase() === 'active' && PRO_OR_ABOVE.has(String(planId || '').toLowerCase());
}

export function normalizeCustomerHostname(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.length > 253 || raw.includes('/') || raw.includes(':') || raw.includes('*')) return '';
  let hostname = '';
  try {
    hostname = new URL(`https://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
  if (hostname !== raw && !raw.startsWith('xn--')) {
    // URL() may safely convert IDN to punycode; accept the normalized ASCII result.
  }
  if (!/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes('.')) return '';
  const labels = hostname.split('.');
  if (labels.length < 3 || labels.some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return '';
  if (RESERVED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) return '';
  return hostname;
}

function mappingLimit(planId) {
  return String(planId || '').toLowerCase() === 'enterprise' ? 10 : 1;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS marketing_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      tenant_slug TEXT,
      workspace_slug TEXT NOT NULL UNIQUE,
      canonical_domain TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'cloudflare-pages',
      provider_project TEXT NOT NULL,
      landing_path TEXT NOT NULL DEFAULT '/',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subject_type, subject_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS marketing_custom_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      hostname TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending_dns',
      provider_status TEXT NOT NULL DEFAULT '',
      provider_domain_id TEXT,
      dns_type TEXT NOT NULL DEFAULT 'CNAME',
      dns_name TEXT NOT NULL,
      dns_target TEXT NOT NULL,
      validation_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      updated_at TEXT NOT NULL,
      disabled_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS marketing_domain_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      hostname TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_subject ON marketing_custom_domains(subject_type,subject_key,status)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_marketing_custom_domains_workspace ON marketing_custom_domains(workspace_id,status)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_marketing_domain_audit_subject ON marketing_domain_audit(subject_type,subject_key,created_at DESC)'),
  ]);
}

async function supabaseUser(accessToken) {
  if (!accessToken || accessToken.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id: user.id, email };
}

async function identityFromRequest(request) {
  const auth = String(request.headers.get('authorization') || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return supabaseUser(token);
}

async function resolveSubject(env, identity, tenantSlug = '') {
  const tenant = normalizeTenant(tenantSlug);
  if (!tenant) return { type: 'person', key: identity.id, tenant: null, role: null };
  const row = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(tenant).first();
  if (!row || row.status !== 'active') return null;
  const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?')
    .bind(row.id, identity.email).first();
  if (!grant || Number(grant.enabled) !== 1) return null;
  return { type: 'tenant', key: row.slug, tenant: row.slug, role: String(grant.role || '') };
}

function canManageDomain(subject) {
  return subject?.type === 'person' || DOMAIN_MANAGER_ROLES.has(String(subject?.role || ''));
}

async function marketingSubscription(env, subject) {
  return env.DB.prepare(`SELECT plan_id,status,current_period_end,cancel_at_period_end
    FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site='marketing'`)
    .bind(subject.type, subject.key).first();
}

async function workspaceFor(env, subject) {
  return env.DB.prepare(`SELECT id,subject_type,subject_key,tenant_slug,workspace_slug,canonical_domain,
    provider,provider_project,landing_path,status
    FROM marketing_workspaces WHERE subject_type=? AND subject_key=? AND status='active'`)
    .bind(subject.type, subject.key).first();
}

async function writeAudit(env, subject, hostname, action, detail, email = '') {
  await env.DB.prepare(`INSERT INTO marketing_domain_audit
    (subject_type,subject_key,hostname,action,detail,actor_email,created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(subject.type, subject.key, hostname, action, String(detail || '').slice(0, 800), email, new Date().toISOString()).run();
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function marketingOriginAllowed(origin, env) {
  if (!origin) return true;
  if (isAllowedOrigin(origin, env)) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  if (/^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(parsed.hostname)) return true;
  if (!env.DB) return false;
  const row = await env.DB.prepare(`SELECT id FROM marketing_custom_domains
    WHERE hostname=? AND status IN ('pending_dns','verifying','active') LIMIT 1`)
    .bind(parsed.hostname.toLowerCase()).first();
  return Boolean(row);
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

async function cfRequest(env, path, { method = 'GET', body = null, allow404 = false } = {}) {
  const token = String(env.CF_API_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Cloudflare 도메인 자동연결 권한이 준비되지 않았습니다.'), { code: 'DOMAIN_PROVIDER_NOT_READY' });
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && response.status === 404) return null;
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.success === false) {
    const message = payload?.errors?.[0]?.message || `Cloudflare 요청 실패 (${response.status})`;
    throw Object.assign(new Error(message), { code: 'DOMAIN_PROVIDER_ERROR', status: response.status });
  }
  return payload.result;
}

async function cloudflareAccountId(env) {
  const configured = String(env.CF_ACCOUNT_ID || '').trim();
  if (/^[a-f0-9]{32}$/i.test(configured)) return configured;
  const accounts = await cfRequest(env, '/accounts?per_page=50');
  const active = (Array.isArray(accounts) ? accounts : []).filter(account => account?.id && account?.status !== 'closed');
  if (active.length === 1) return active[0].id;
  throw Object.assign(new Error('Cloudflare 계정을 자동으로 결정할 수 없습니다.'), { code: 'DOMAIN_PROVIDER_ACCOUNT_REQUIRED' });
}

function pagesPath(accountId, project, suffix = '') {
  return `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}${suffix}`;
}

async function pagesProject(env, workspace) {
  const accountId = await cloudflareAccountId(env);
  const project = await cfRequest(env, pagesPath(accountId, workspace.provider_project));
  const target = String(project?.subdomain || '').trim().toLowerCase();
  if (!target) throw Object.assign(new Error('Marketing AI 배포 대상 주소를 확인할 수 없습니다.'), { code: 'WORKSPACE_TARGET_NOT_READY' });
  return { accountId, target };
}

async function pagesDomain(env, workspace, hostname, { create = false } = {}) {
  const { accountId, target } = await pagesProject(env, workspace);
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  let domain = await cfRequest(env, pagesPath(accountId, workspace.provider_project, suffix), { allow404: true });
  if (!domain && create) {
    domain = await cfRequest(env, pagesPath(accountId, workspace.provider_project, '/domains'), {
      method: 'POST',
      body: { name: hostname },
    });
  }
  return { domain, accountId, target };
}

async function deletePagesDomain(env, workspace, hostname) {
  const accountId = await cloudflareAccountId(env);
  const suffix = `/domains/${encodeURIComponent(hostname)}`;
  const existing = await cfRequest(env, pagesPath(accountId, workspace.provider_project, suffix), { allow404: true });
  if (!existing) return;
  await cfRequest(env, pagesPath(accountId, workspace.provider_project, suffix), { method: 'DELETE' });
}

function providerStatus(domain) {
  return String(domain?.status || domain?.validation_status || '').trim().toLowerCase();
}

function validationPayload(domain) {
  const value = domain?.validation_data || domain?.verification_data || domain?.validation || null;
  return value && typeof value === 'object' ? value : {};
}

function localStatus(domain) {
  return providerStatus(domain) === 'active' ? 'active' : 'pending_dns';
}

function publicDomain(row) {
  let validation = {};
  try { validation = JSON.parse(row.validation_json || '{}'); } catch {}
  return {
    id: Number(row.id),
    hostname: row.hostname,
    status: row.status,
    providerStatus: row.provider_status || '',
    url: `https://${row.hostname}${row.landing_path && row.landing_path !== '/' ? row.landing_path : ''}`,
    canonicalUrl: `https://${row.canonical_domain}${row.landing_path && row.landing_path !== '/' ? row.landing_path : ''}`,
    dns: {
      type: row.dns_type || 'CNAME',
      name: row.dns_name,
      target: row.dns_target,
      ttl: 'Auto',
      proxy: 'DNS only 권장',
    },
    providerValidation: validation,
    error: row.error || '',
    verifiedAt: row.verified_at || null,
    updatedAt: row.updated_at,
  };
}

async function subjectContext(request, env, tenantFromBody = '') {
  const identity = await identityFromRequest(request);
  if (!identity) return { error: { status: 401, body: { error: 'Google 로그인 세션을 확인해 주세요.', code: 'LOGIN_REQUIRED' } } };
  const url = new URL(request.url);
  const tenant = tenantFromBody || url.searchParams.get('tenant') || '';
  const subject = await resolveSubject(env, identity, tenant);
  if (!subject) return { error: { status: 403, body: { error: '이 계정은 해당 고객·조직 Workspace에 등록되어 있지 않습니다.', code: 'TENANT_ACCESS_REQUIRED' } } };
  if (!canManageDomain(subject)) return { error: { status: 403, body: { error: '이 Workspace의 도메인을 연결할 권한이 없습니다.', code: 'DOMAIN_MANAGER_REQUIRED' } } };
  const subscription = await marketingSubscription(env, subject);
  const workspace = await workspaceFor(env, subject);
  return { identity, subject, subscription, workspace };
}

async function listDomains(request, env, allowed) {
  const context = await subjectContext(request, env);
  if (context.error) return json(context.error.body, context.error.status, request, allowed);
  const { subject, subscription, workspace } = context;
  const eligible = isProOrAbove(subscription?.plan_id, subscription?.status);
  const rows = await env.DB.prepare(`SELECT d.*,w.canonical_domain,w.landing_path
    FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id
    WHERE d.subject_type=? AND d.subject_key=? AND d.status<>'disabled' ORDER BY d.id DESC`)
    .bind(subject.type, subject.key).all();
  return json({
    eligible,
    requiredPlan: 'pro',
    planId: subscription?.plan_id || 'free',
    planStatus: subscription?.status || 'free',
    workspace: workspace ? {
      slug: workspace.workspace_slug,
      canonicalDomain: workspace.canonical_domain,
      canonicalUrl: `https://${workspace.canonical_domain}${workspace.landing_path !== '/' ? workspace.landing_path : ''}`,
    } : null,
    mappingLimit: eligible ? mappingLimit(subscription?.plan_id) : 0,
    domains: (rows.results || []).map(publicDomain),
  }, 200, request, allowed);
}

async function createDomain(request, env, allowed) {
  const body = await readJson(request);
  const context = await subjectContext(request, env, body?.tenant);
  if (context.error) return json(context.error.body, context.error.status, request, allowed);
  const { identity, subject, subscription, workspace } = context;
  if (!isProOrAbove(subscription?.plan_id, subscription?.status)) {
    return json({ error: '고객 소유 도메인 연결은 Marketing AI Pro 이상에서 사용할 수 있습니다.', code: 'PRO_REQUIRED' }, 403, request, allowed);
  }
  if (!workspace) {
    return json({ error: '전용 Marketing AI Workspace가 아직 프로비저닝되지 않았습니다.', code: 'WORKSPACE_NOT_PROVISIONED' }, 409, request, allowed);
  }
  if (workspace.provider !== 'cloudflare-pages') {
    return json({ error: '현재 Workspace의 자동 도메인 연결 방식을 지원하지 않습니다.', code: 'WORKSPACE_PROVIDER_UNSUPPORTED' }, 409, request, allowed);
  }
  const hostname = normalizeCustomerHostname(body?.hostname);
  if (!hostname) {
    return json({
      error: '고객이 소유한 서브도메인을 입력해 주세요. 예: ai.example.com',
      code: 'INVALID_CUSTOM_HOSTNAME',
    }, 400, request, allowed);
  }
  if (hostname === workspace.canonical_domain) return json({ error: 'EKODI 기본 Workspace 주소와 다른 고객 소유 도메인을 입력해 주세요.' }, 400, request, allowed);

  const existingHost = await env.DB.prepare('SELECT subject_type,subject_key,status FROM marketing_custom_domains WHERE hostname=?').bind(hostname).first();
  if (existingHost && (existingHost.subject_type !== subject.type || existingHost.subject_key !== subject.key || existingHost.status !== 'disabled')) {
    return json({ error: '이미 연결되었거나 연결 진행 중인 도메인입니다.', code: 'HOSTNAME_ALREADY_REGISTERED' }, 409, request, allowed);
  }
  const current = await env.DB.prepare(`SELECT COUNT(*) AS count FROM marketing_custom_domains
    WHERE subject_type=? AND subject_key=? AND status IN ('pending_dns','verifying','active','disconnect_pending')`)
    .bind(subject.type, subject.key).first();
  if (Number(current?.count || 0) >= mappingLimit(subscription.plan_id)) {
    return json({ error: '현재 플랜에서 연결 가능한 고객 소유 도메인 수를 모두 사용했습니다.', code: 'CUSTOM_DOMAIN_LIMIT' }, 409, request, allowed);
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const attempts = await env.DB.prepare(`SELECT COUNT(*) AS count FROM marketing_domain_audit
    WHERE subject_type=? AND subject_key=? AND action='domain.create' AND created_at>?`)
    .bind(subject.type, subject.key, cutoff).first();
  if (Number(attempts?.count || 0) >= 5) return json({ error: '도메인 연결 변경이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', code: 'DOMAIN_RATE_LIMIT' }, 429, request, allowed);

  let provider;
  try {
    provider = await pagesDomain(env, workspace, hostname, { create: true });
  } catch (error) {
    await writeAudit(env, subject, hostname, 'domain.create_failed', error?.message || String(error), identity.email);
    return json({ error: error.message, code: error.code || 'DOMAIN_PROVIDER_ERROR' }, error.code === 'DOMAIN_PROVIDER_NOT_READY' ? 503 : 502, request, allowed);
  }
  const now = new Date().toISOString();
  const state = localStatus(provider.domain);
  const pStatus = providerStatus(provider.domain);
  const validation = JSON.stringify(validationPayload(provider.domain));
  const verifiedAt = state === 'active' ? now : null;
  if (existingHost?.status === 'disabled') {
    await env.DB.prepare(`UPDATE marketing_custom_domains SET workspace_id=?,subject_type=?,subject_key=?,status=?,provider_status=?,
      provider_domain_id=?,dns_type='CNAME',dns_name=?,dns_target=?,validation_json=?,error='',created_by_email=?,created_at=?,
      verified_at=?,updated_at=?,disabled_at=NULL WHERE hostname=?`)
      .bind(workspace.id, subject.type, subject.key, state, pStatus, String(provider.domain?.id || provider.domain?.name || ''),
        hostname, provider.target, validation, identity.email, now, verifiedAt, now, hostname).run();
  } else {
    await env.DB.prepare(`INSERT INTO marketing_custom_domains
      (workspace_id,subject_type,subject_key,hostname,status,provider_status,provider_domain_id,dns_type,dns_name,dns_target,
       validation_json,error,created_by_email,created_at,verified_at,updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CNAME', ?, ?, ?, '', ?, ?, ?, ?)`)
      .bind(workspace.id, subject.type, subject.key, hostname, state, pStatus, String(provider.domain?.id || provider.domain?.name || ''),
        hostname, provider.target, validation, identity.email, now, verifiedAt, now).run();
  }
  await writeAudit(env, subject, hostname, 'domain.create', JSON.stringify({ state, providerStatus: pStatus, target: provider.target }), identity.email);
  const row = await env.DB.prepare(`SELECT d.*,w.canonical_domain,w.landing_path FROM marketing_custom_domains d
    JOIN marketing_workspaces w ON w.id=d.workspace_id WHERE d.hostname=?`).bind(hostname).first();
  return json({
    ok: true,
    message: state === 'active' ? '고객 소유 도메인이 연결되었습니다.' : '도메인 등록을 시작했습니다. 아래 CNAME을 고객의 DNS 관리화면에 추가해 주세요.',
    domain: publicDomain(row),
  }, state === 'active' ? 200 : 201, request, allowed);
}

async function verifyDomain(request, env, allowed, domainId) {
  const body = await readJson(request);
  const context = await subjectContext(request, env, body?.tenant);
  if (context.error) return json(context.error.body, context.error.status, request, allowed);
  const { identity, subject, subscription } = context;
  if (!isProOrAbove(subscription?.plan_id, subscription?.status)) {
    return json({ error: '도메인 연결 검증은 Marketing AI Pro 이상에서 사용할 수 있습니다.', code: 'PRO_REQUIRED' }, 403, request, allowed);
  }
  const row = await env.DB.prepare(`SELECT d.*,w.canonical_domain,w.landing_path,w.provider,w.provider_project
    FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id
    WHERE d.id=? AND d.subject_type=? AND d.subject_key=? AND d.status<>'disabled'`)
    .bind(domainId, subject.type, subject.key).first();
  if (!row) return json({ error: '연결 정보를 찾을 수 없습니다.' }, 404, request, allowed);
  let provider;
  try {
    provider = await pagesDomain(env, row, row.hostname, { create: false });
  } catch (error) {
    await env.DB.prepare('UPDATE marketing_custom_domains SET error=?,updated_at=? WHERE id=?')
      .bind(String(error.message || error).slice(0, 500), new Date().toISOString(), row.id).run();
    return json({ error: error.message, code: error.code || 'DOMAIN_PROVIDER_ERROR' }, 502, request, allowed);
  }
  if (!provider.domain) return json({ error: 'Cloudflare 연결 정보가 사라졌습니다. 도메인을 다시 연결해 주세요.', code: 'PROVIDER_MAPPING_MISSING' }, 409, request, allowed);
  const now = new Date().toISOString();
  const state = localStatus(provider.domain);
  const pStatus = providerStatus(provider.domain);
  await env.DB.prepare(`UPDATE marketing_custom_domains SET status=?,provider_status=?,dns_target=?,validation_json=?,error='',
    verified_at=CASE WHEN ?='active' THEN COALESCE(verified_at,?) ELSE verified_at END,updated_at=? WHERE id=?`)
    .bind(state, pStatus, provider.target, JSON.stringify(validationPayload(provider.domain)), state, now, now, row.id).run();
  await writeAudit(env, subject, row.hostname, 'domain.verify', JSON.stringify({ state, providerStatus: pStatus }), identity.email);
  const updated = await env.DB.prepare(`SELECT d.*,w.canonical_domain,w.landing_path FROM marketing_custom_domains d
    JOIN marketing_workspaces w ON w.id=d.workspace_id WHERE d.id=?`).bind(row.id).first();
  return json({
    ok: state === 'active',
    message: state === 'active' ? 'DNS와 HTTPS 연결이 확인되었습니다.' : '아직 DNS/HTTPS 확인 중입니다. CNAME 값을 확인한 뒤 다시 검증해 주세요.',
    domain: publicDomain(updated),
  }, 200, request, allowed);
}

async function disconnectDomain(request, env, allowed, domainId) {
  const context = await subjectContext(request, env);
  if (context.error) return json(context.error.body, context.error.status, request, allowed);
  const { identity, subject } = context;
  const row = await env.DB.prepare(`SELECT d.*,w.provider,w.provider_project,w.canonical_domain,w.landing_path
    FROM marketing_custom_domains d JOIN marketing_workspaces w ON w.id=d.workspace_id
    WHERE d.id=? AND d.subject_type=? AND d.subject_key=? AND d.status<>'disabled'`)
    .bind(domainId, subject.type, subject.key).first();
  if (!row) return json({ error: '연결 정보를 찾을 수 없습니다.' }, 404, request, allowed);
  try {
    await deletePagesDomain(env, row, row.hostname);
  } catch (error) {
    await env.DB.prepare("UPDATE marketing_custom_domains SET status='disconnect_pending',error=?,updated_at=? WHERE id=?")
      .bind(String(error.message || error).slice(0, 500), new Date().toISOString(), row.id).run();
    await writeAudit(env, subject, row.hostname, 'domain.disconnect_pending', error?.message || String(error), identity.email);
    return json({ error: 'Cloudflare 연결 해제를 완료하지 못했습니다. 자동 재시도합니다.', code: 'DISCONNECT_PENDING' }, 502, request, allowed);
  }
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE marketing_custom_domains SET status='disabled',provider_status='',error='',disabled_at=?,updated_at=? WHERE id=?")
    .bind(now, now, row.id).run();
  await writeAudit(env, subject, row.hostname, 'domain.disconnect', 'customer requested', identity.email);
  return json({ ok: true, hostname: row.hostname, status: 'disabled' }, 200, request, allowed);
}

export async function handleMarketingDomainRequest(request, env) {
  if (!env.DB) return new Response(JSON.stringify({ error: '데이터베이스 연결이 설정되지 않았습니다.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  await ensureSchema(env.DB);
  const origin = request.headers.get('origin');
  const allowed = await marketingOriginAllowed(origin, env);
  if (origin && !allowed) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, false);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, allowed) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/domains') return listDomains(request, env, allowed);
  if (request.method === 'POST' && path === '/api/marketing/domains') return createDomain(request, env, allowed);
  const verify = path.match(/^\/api\/marketing\/domains\/(\d+)\/verify$/);
  if (request.method === 'POST' && verify) return verifyDomain(request, env, allowed, Number(verify[1]));
  const remove = path.match(/^\/api\/marketing\/domains\/(\d+)$/);
  if (request.method === 'DELETE' && remove) return disconnectDomain(request, env, allowed, Number(remove[1]));
  return null;
}

export async function runMarketingDomainSchedule(env) {
  if (!env.DB) return { checked: 0, activated: 0, disconnected: 0 };
  await ensureSchema(env.DB);
  const rows = await env.DB.prepare(`SELECT d.*,w.provider,w.provider_project,w.canonical_domain,w.landing_path,
      s.plan_id,s.status AS subscription_status
    FROM marketing_custom_domains d
    JOIN marketing_workspaces w ON w.id=d.workspace_id
    LEFT JOIN service_subscriptions s ON s.subject_type=d.subject_type AND s.subject_key=d.subject_key AND s.site='marketing'
    WHERE d.status IN ('pending_dns','verifying','active','disconnect_pending')
    ORDER BY d.updated_at ASC LIMIT 30`).all();
  let checked = 0;
  let activated = 0;
  let disconnected = 0;
  for (const row of rows.results || []) {
    const eligible = isProOrAbove(row.plan_id, row.subscription_status);
    if (!eligible || row.status === 'disconnect_pending') {
      try {
        await deletePagesDomain(env, row, row.hostname);
        const now = new Date().toISOString();
        await env.DB.prepare("UPDATE marketing_custom_domains SET status='disabled',provider_status='',error='',disabled_at=?,updated_at=? WHERE id=?")
          .bind(now, now, row.id).run();
        await writeAudit(env, { type: row.subject_type, key: row.subject_key }, row.hostname, 'domain.auto_disconnect', eligible ? 'retry completed' : 'Pro entitlement ended', 'system');
        disconnected += 1;
      } catch (error) {
        await env.DB.prepare("UPDATE marketing_custom_domains SET status='disconnect_pending',error=?,updated_at=? WHERE id=?")
          .bind(String(error.message || error).slice(0, 500), new Date().toISOString(), row.id).run();
      }
      continue;
    }
    try {
      const provider = await pagesDomain(env, row, row.hostname, { create: false });
      if (!provider.domain) continue;
      const state = localStatus(provider.domain);
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE marketing_custom_domains SET status=?,provider_status=?,dns_target=?,validation_json=?,error='',
        verified_at=CASE WHEN ?='active' THEN COALESCE(verified_at,?) ELSE verified_at END,updated_at=? WHERE id=?`)
        .bind(state, providerStatus(provider.domain), provider.target, JSON.stringify(validationPayload(provider.domain)), state, now, now, row.id).run();
      checked += 1;
      if (state === 'active' && row.status !== 'active') activated += 1;
    } catch (error) {
      await env.DB.prepare('UPDATE marketing_custom_domains SET error=?,updated_at=? WHERE id=?')
        .bind(String(error.message || error).slice(0, 500), new Date().toISOString(), row.id).run();
    }
  }
  return { checked, activated, disconnected };
}

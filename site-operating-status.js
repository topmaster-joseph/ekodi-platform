import { isWorkspaceSlug, workspaceRouteFromPublicPath } from './workspace-route-policy.js';

export const SITE_OPERATING_STATUSES = Object.freeze(['public', 'private', 'maintenance', 'development']);

const VALID_STATUSES = new Set(SITE_OPERATING_STATUSES);
const API_PREFIX = '/api/control/site-status';
const LEGACY_API_PREFIX = '/api/control/public-sites';
const SITE_ADMIN_ROLES = new Set([
  'platform_admin', 'tenant_admin', 'workspace_admin', 'client_admin', 'hq_manager',
  'store_owner', 'owner', 'admin', 'senior_pastor', 'manager'
]);

const STATUS_COPY = Object.freeze({
  private: {
    label: '비공개',
    title: '현재 비공개 사이트입니다',
    message: '운영자가 공개하기 전까지 이 사이트를 이용할 수 없습니다.',
    httpStatus: 403
  },
  maintenance: {
    label: '점검중',
    title: '현재 점검 중입니다',
    message: '안정적인 서비스를 위해 잠시 점검하고 있습니다.',
    httpStatus: 503
  },
  development: {
    label: '개발중',
    title: '현재 개발 중입니다',
    message: '더 나은 서비스로 준비하고 있습니다.',
    httpStatus: 503
  }
});

let schemaReadyPromise = null;

const now = () => new Date().toISOString();
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const normalizeSiteId = value => clean(value, 100).toLowerCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function safeSiteId(value) {
  const normalized = normalizeSiteId(value);
  return isWorkspaceSlug(normalized) ? normalized : '';
}

function statusSnapshot(row = {}) {
  const status = VALID_STATUSES.has(row.public_status) ? row.public_status : 'public';
  const copy = STATUS_COPY[status] || {};
  const id = clean(row.site_id, 100);
  const domain = clean(row.domain, 255);
  const workspaceId = clean(row.workspace_id, 100) || id;
  const title = clean(row.maintenance_title, 160) || copy.title || '';
  const message = clean(row.maintenance_message, 500) || copy.message || '';
  return Object.freeze({
    id,
    siteId: id,
    name: id,
    workspaceId,
    domain,
    url: /^https?:\/\//i.test(domain) ? domain : (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? `https://${domain}` : `https://ekodi.kr/${id}`),
    status,
    label: status === 'public' ? '공개' : copy.label,
    publicStatus: status,
    maintenanceDisplayType: clean(row.maintenance_display_type, 32) || 'default',
    maintenanceRedirectUrl: clean(row.maintenance_redirect_url, 500),
    maintenanceTitle: title,
    maintenanceMessage: message,
    redirectMode: clean(row.redirect_mode, 32) || 'button',
    title,
    message,
    updatedAt: row.updated_at || '',
    updatedBy: row.updated_by || ''
  });
}

async function ensureSchema(env) {
  if (!env?.DB?.prepare) return false;
  if (!schemaReadyPromise) {
    schemaReadyPromise = env.DB.prepare(`CREATE TABLE IF NOT EXISTS public_site_controls (
      site_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      public_status TEXT NOT NULL DEFAULT 'public',
      maintenance_display_type TEXT NOT NULL DEFAULT 'default',
      maintenance_redirect_url TEXT NOT NULL DEFAULT '',
      maintenance_title TEXT NOT NULL DEFAULT '',
      maintenance_message TEXT NOT NULL DEFAULT '',
      redirect_mode TEXT NOT NULL DEFAULT 'button',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT NOT NULL DEFAULT ''
    )`).run().then(() => true).catch(() => false);
  }
  return schemaReadyPromise;
}

async function readSite(env, id) {
  if (!env?.DB?.prepare) return null;
  try {
    return await env.DB.prepare('SELECT * FROM public_site_controls WHERE site_id = ?').bind(safeSiteId(id)).first();
  } catch {
    return null;
  }
}

async function readDomain(env, host) {
  if (!env?.DB?.prepare) return null;
  try {
    return await env.DB.prepare('SELECT * FROM public_site_controls WHERE lower(domain) = lower(?)').bind(clean(host, 255)).first();
  } catch {
    return null;
  }
}

async function ensureSite(env, id) {
  const normalized = safeSiteId(id);
  if (!normalized || !await ensureSchema(env)) return null;
  const domainKey = `workspace:${normalized}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO public_site_controls
    (site_id, workspace_id, domain, public_status, maintenance_display_type, maintenance_redirect_url, maintenance_title, maintenance_message, redirect_mode, updated_at, updated_by)
    VALUES (?, ?, ?, 'public', 'default', '', '', '', 'button', ?, 'system:auto-register')`)
    .bind(normalized, normalized, domainKey, now()).run();
  return env.DB.prepare('SELECT * FROM public_site_controls WHERE site_id = ?').bind(normalized).first();
}

async function listSites(env) {
  if (!await ensureSchema(env)) return [];
  const result = await env.DB.prepare('SELECT * FROM public_site_controls ORDER BY site_id').all();
  return (result.results || []).map(statusSnapshot);
}

function tokenHeader(request) {
  return clean(request.headers.get('authorization'), 5000);
}

async function highestAdminAuthority(request, env) {
  const authorization = tokenHeader(request);
  if (!authorization || !env?.CONTROL_API?.fetch) return null;
  const response = await env.CONTROL_API.fetch(new Request('https://internal/api/control/services', {
    headers: { authorization }
  })).catch(() => null);
  if (!response?.ok) return null;
  return { kind: 'platform', role: 'super_admin', actor: 'platform:super_admin' };
}

function siteAliases(id) {
  const normalized = safeSiteId(id);
  const values = new Set(normalized ? [normalized] : []);
  const pairs = [
    ['ekodibiz', 'ekodi-biz'], ['ekoditrade', 'ekodi-trade'], ['cgma', 'cheonggye'], ['ekodimall', 'mall']
  ];
  for (const [a, b] of pairs) {
    if (values.has(a)) values.add(b);
    if (values.has(b)) values.add(a);
  }
  return [...values];
}

async function accessApiCall(env, authorization, pathname, params) {
  const base = clean(env?.MY_SUPABASE_URL, 1000).replace(/\/$/, '');
  const apiKey = clean(env?.MY_SUPABASE_PUBLISHABLE_KEY, 5000);
  if (!base || !apiKey) return null;
  const url = new URL(`${base}/functions/v1/access-api/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { authorization, apikey: apiKey, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  }).catch(() => null);
  if (!response) return null;
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function siteAdminAuthority(request, env, id) {
  const authorization = tokenHeader(request);
  if (!authorization.startsWith('Bearer ')) return null;
  for (const candidate of siteAliases(id)) {
    const tenantResult = await accessApiCall(env, authorization, 'reviewer', { site: candidate, tenant: candidate });
    if (tenantResult?.response?.ok && tenantResult.data?.allowed === true) {
      const role = clean(tenantResult.data.role || 'tenant_admin', 80).toLowerCase();
      return { kind: 'site', role, actor: `site:${candidate}:${role}` };
    }
    const siteResult = await accessApiCall(env, authorization, 'me', { site: candidate });
    const role = clean(siteResult?.data?.role, 80).toLowerCase();
    const active = ['active', 'pre_registered'].includes(clean(siteResult?.data?.status, 40).toLowerCase());
    if (siteResult?.response?.ok && siteResult.data?.authenticated === true && active && SITE_ADMIN_ROLES.has(role)) {
      return { kind: role === 'platform_admin' ? 'platform' : 'site', role, actor: `site:${candidate}:${role}` };
    }
  }
  return null;
}

async function authorityFor(request, env, id, { platformOnly = false } = {}) {
  const platform = await highestAdminAuthority(request, env);
  if (platform) return platform;
  if (platformOnly) return null;
  return siteAdminAuthority(request, env, id);
}

async function audit(env, { actor, action, siteId, status }) {
  try {
    await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(clean(actor, 180), action, 'public_site', safeSiteId(siteId), JSON.stringify({ status }), now()).run();
  } catch {
    // Audit storage must not make a reversible visibility update unavailable.
  }
}

export function alternateStatusResponse(status, { title = '', message = '', method = 'GET' } = {}) {
  const copy = STATUS_COPY[status];
  if (!copy) return null;
  const pageTitle = clean(title, 160) || copy.title;
  const pageMessage = clean(message, 500) || copy.message;
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(pageTitle)}</title><style>:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f6f7f9}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 20%,#fff 0,#f6f7f9 58%,#edf0f4 100%)}main{width:min(620px,100%);padding:44px 34px;border:1px solid #e3e7ed;border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 18px 60px rgba(15,23,42,.08);text-align:center}.status{display:inline-flex;padding:7px 11px;border-radius:999px;background:#f0f3f7;color:#536174;font-size:12px;font-weight:750;letter-spacing:.04em}h1{margin:18px 0 10px;font-size:clamp(26px,5vw,40px);letter-spacing:-.045em}p{margin:0;color:#667085;font-size:15px;line-height:1.75;word-break:keep-all}@media(max-width:560px){main{padding:36px 22px;border-radius:18px}}</style></head><body><main><span class="status">${escapeHtml(copy.label)}</span><h1>${escapeHtml(pageTitle)}</h1><p>${escapeHtml(pageMessage)}</p></main></body></html>`;
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow',
    'x-ekodi-site-status': status
  });
  if (status !== 'private') headers.set('retry-after', '300');
  return new Response(method === 'HEAD' ? null : body, { status: copy.httpStatus, headers });
}

export async function maybeGateSiteOperatingStatus(request, env = {}) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  let row = null;
  if (host === 'ekodi.kr') {
    const route = workspaceRouteFromPublicPath(url.pathname);
    if (route?.public) row = await readSite(env, route.slug);
  } else {
    row = await readDomain(env, host);
  }
  if (!row) return null;
  const site = statusSnapshot(row);
  if (site.status === 'public') return null;
  return alternateStatusResponse(site.status, { title: site.title, message: site.message, method: request.method });
}

export async function registerSuccessfulWorkspaceRequest(request, response, env = {}, ctx) {
  if (!['GET', 'HEAD'].includes(request.method) || !response || response.status >= 400) return;
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== 'ekodi.kr') return;
  const route = workspaceRouteFromPublicPath(url.pathname);
  if (!route?.public) return;
  const task = ensureSite(env, route.slug).catch(() => null);
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
}

function statusApiPath(pathname) {
  for (const prefix of [API_PREFIX, LEGACY_API_PREFIX]) {
    if (pathname === prefix) return { prefix, suffix: '' };
    if (pathname.startsWith(`${prefix}/`)) return { prefix, suffix: pathname.slice(prefix.length + 1) };
  }
  return null;
}

export async function handleSiteOperatingStatusApi(request, env = {}) {
  const url = new URL(request.url);
  const route = statusApiPath(url.pathname);
  if (!route) return null;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-methods': 'GET,PUT,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
        'cache-control': 'no-store'
      }
    });
  }
  const legacy = route.prefix === LEGACY_API_PREFIX;
  if (request.method === 'GET') {
    const id = safeSiteId(route.suffix || url.searchParams.get('site'));
    if (id) {
      const authority = await authorityFor(request, env, id);
      if (!authority) return json({ error: 'site_admin_required' }, 403);
      const row = await ensureSite(env, id);
      if (!row) return json({ error: 'site_status_store_unavailable' }, 503);
      return json({ site: statusSnapshot(row), authority: { kind: authority.kind, role: authority.role } });
    }
    const authority = await authorityFor(request, env, '', { platformOnly: true });
    if (!authority) return json({ error: 'super_admin_required' }, 403);
    const sites = await listSites(env);
    return legacy ? json({ sites }) : json({ statuses: SITE_OPERATING_STATUSES, sites });
  }
  if (request.method === 'PUT') {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const id = safeSiteId(route.suffix || body.siteId || body.site_id || url.searchParams.get('site'));
    if (!id) return json({ error: 'valid_site_required' }, 400);
    const authority = await authorityFor(request, env, id);
    if (!authority) return json({ error: 'site_admin_required' }, 403);
    const status = clean(body.status || body.publicStatus || body.public_status, 40).toLowerCase();
    if (!VALID_STATUSES.has(status)) return json({ error: 'invalid_status', allowed: SITE_OPERATING_STATUSES }, 400);
    const current = await ensureSite(env, id);
    if (!current) return json({ error: 'site_status_store_unavailable' }, 503);
    const copy = STATUS_COPY[status] || {};
    const title = clean(body.title || body.maintenanceTitle || body.maintenance_title, 160) || copy.title || '';
    const message = clean(body.message || body.maintenanceMessage || body.maintenance_message, 500) || copy.message || '';
    await env.DB.prepare(`UPDATE public_site_controls
      SET public_status = ?, maintenance_title = ?, maintenance_message = ?, updated_at = ?, updated_by = ?
      WHERE site_id = ?`).bind(status, title, message, now(), authority.actor, id).run();
    await audit(env, { actor: authority.actor, action: 'site_operating_status.update', siteId: id, status });
    const row = await readSite(env, id);
    return json({ ok: true, site: statusSnapshot(row), authority: { kind: authority.kind, role: authority.role } });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

import authWorker from './auth-worker.js';
import { handleMailControl } from './mail-control.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { remotePowerSnapshot, requestRemoteWake } from './remote-power-control.js';
import { analyzeServiceFleet, evaluateTechnologyCandidate } from './evolution-intelligence-runtime.js';
import { evolutionStoreSummary, listEvolutionRecommendations, persistEvolutionReport } from './evolution-intelligence-store.js';

// Provider service registry only. Customer organizations and their sites are managed as
// customer tenants/workspaces through the customer directory, never as EKODI services.
const SERVICE_CATALOG = [
  { id: 'root', name: 'EKODI Root', domain: 'ekodi.kr', url: 'https://ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'admin', name: 'EKODI Control Center', domain: 'admin.ekodi.kr', url: 'https://admin.ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'api', name: 'EKODI API', domain: 'api.ekodi.kr', url: 'https://api.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: false },
  { id: 'biz', name: '에코디비즈', domain: 'biz.ekodi.kr', url: 'https://biz.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'trade', name: 'EKODI Global Trading', domain: 'trade.ekodi.kr', url: 'https://trade.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'mall', name: '에코디몰', domain: 'ekodi.kr/ekodibiz/mall', url: 'https://ekodi.kr/ekodibiz/mall', group: 'business', defaultState: 'active', defaultMonitor: true },
  { id: 'pay', name: '에코디결제', domain: 'pay.ekodi.kr', url: 'https://pay.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'books', name: '에코디북스', domain: 'books.ekodi.kr', url: 'https://books.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'lab', name: '에코디연구소', domain: 'lab.ekodi.kr', url: 'https://lab.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'edu', name: '에코디교육', domain: 'edu.ekodi.kr', url: 'https://edu.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'media', name: '에코디미디어', domain: 'media.ekodi.kr', url: 'https://media.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'church', name: '에코디교회', domain: 'church.ekodi.kr', url: 'https://church.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'community', name: '커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'social', name: 'EKODI Social', domain: 'social.ekodi.kr', url: 'https://social.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: true }
];

const PUBLIC_SITE_CATALOG = [
  {
    id: 'cgma',
    workspaceId: 'cgma',
    name: 'CGMA',
    domain: 'cgma.or.kr',
    defaultPublicStatus: 'maintenance',
    defaultMaintenanceDisplayType: 'default',
    defaultMaintenanceRedirectUrl: '',
    defaultMaintenanceTitle: '현재 사이트 개발중입니다',
    defaultMaintenanceMessage: '더 좋은 서비스로 준비 중입니다.',
    defaultRedirectMode: 'button'
  }
];

const SERVICE_BY_ID = new Map(SERVICE_CATALOG.map(service => [service.id, service]));
const PUBLIC_SITE_BY_ID = new Map(PUBLIC_SITE_CATALOG.map(site => [site.id, site]));
const PUBLIC_SITE_BY_DOMAIN = new Map(PUBLIC_SITE_CATALOG.map(site => [site.domain, site]));
const VALID_STATES = new Set(['planned', 'active', 'paused']);
const VALID_PUBLIC_STATUSES = new Set(['public', 'maintenance']);
const VALID_MAINTENANCE_DISPLAY_TYPES = new Set(['default', 'url']);
const VALID_REDIRECT_MODES = new Set(['button', 'auto']);
const CONTROL_PREFIX = '/api/control';
const PUBLIC_SITE_PREFIX = `${CONTROL_PREFIX}/public-sites`;
const DEVELOPMENT_WORKER = 'https://ekodi-platform-development.ekodi-development.workers.dev';
const ACCOUNT_SERVICE_TARGETS = Object.freeze(EKODI_SERVICE_MANIFEST.services
  .filter(service => service.state !== 'planned')
  .map(service => Object.freeze({
    id: service.id,
    name: service.name,
    host: new URL(service.url).hostname,
    path: `${new URL(service.url).pathname}${new URL(service.url).search}`
  })));

function controlJson(data, status, headers = new Headers()) {
  const responseHeaders = new Headers();
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('x-content-type-options', 'nosniff');
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function siteHtml(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  });
  return new Response(data, { status, headers });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validPublicRedirectUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function maintenancePage(site) {
  const title = escapeHtml(site.maintenanceTitle || '현재 사이트 개발중입니다');
  const message = escapeHtml(site.maintenanceMessage || '더 좋은 서비스로 준비 중입니다.');
  const redirectUrl = validPublicRedirectUrl(site.maintenanceRedirectUrl);
  const showButton = site.maintenanceDisplayType === 'url' && redirectUrl && site.redirectMode !== 'auto';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    :root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(circle at top,#f3f8ff,#e9edf3 52%,#dde4ee);color:#152033}
    main{width:min(92vw,560px);padding:42px 28px;border:1px solid rgba(80,105,135,.18);border-radius:28px;background:rgba(255,255,255,.78);box-shadow:0 22px 70px rgba(25,50,80,.14);text-align:center;backdrop-filter:blur(16px)}
    .eyebrow{display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border-radius:999px;background:#edf5ff;color:#35628e;font-size:13px;font-weight:700;letter-spacing:.04em}
    h1{margin:18px 0 10px;font-size:clamp(28px,5vw,42px);line-height:1.12;letter-spacing:-.04em}
    p{margin:0 auto;color:#536273;font-size:17px;line-height:1.65;word-break:keep-all}
    a{display:inline-flex;margin-top:26px;padding:13px 18px;border-radius:14px;background:#163454;color:#fff;text-decoration:none;font-weight:800}
    footer{margin-top:28px;color:#8390a1;font-size:12px}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">CGMA</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${showButton ? `<a href="${escapeHtml(redirectUrl)}" rel="noopener noreferrer">임시 안내 페이지 보기</a>` : ''}
    <footer>cgma.or.kr</footer>
  </main>
</body>
</html>`;
}

let controlCatalogSeedPromise;
async function ensureControlCatalog(db) {
  if (controlCatalogSeedPromise) return controlCatalogSeedPromise;
  controlCatalogSeedPromise = (async () => {
    const now = new Date().toISOString();
    const seed = db.prepare(`INSERT OR IGNORE INTO service_controls
      (service_id, state, monitor_enabled, note, updated_at)
      VALUES (?, ?, ?, '', ?)`);
    await db.batch(SERVICE_CATALOG.map(service => seed.bind(
      service.id, service.defaultState, service.defaultMonitor ? 1 : 0, now
    )));
    const siteSeed = db.prepare(`INSERT OR IGNORE INTO public_site_controls
      (site_id, workspace_id, domain, public_status, maintenance_display_type, maintenance_redirect_url, maintenance_title, maintenance_message, redirect_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    await db.batch(PUBLIC_SITE_CATALOG.map(site => siteSeed.bind(
      site.id, site.workspaceId, site.domain, site.defaultPublicStatus,
      site.defaultMaintenanceDisplayType, site.defaultMaintenanceRedirectUrl,
      site.defaultMaintenanceTitle, site.defaultMaintenanceMessage, site.defaultRedirectMode, now
    )));
  })();
  try { await controlCatalogSeedPromise; }
  catch (error) { controlCatalogSeedPromise = null; throw error; }
}

function normalizePublicSiteRow(row, fallback) {
  return {
    id: row?.site_id || fallback.id,
    workspaceId: row?.workspace_id || fallback.workspaceId,
    name: fallback.name,
    domain: row?.domain || fallback.domain,
    publicStatus: row?.public_status || fallback.defaultPublicStatus,
    maintenanceDisplayType: row?.maintenance_display_type || fallback.defaultMaintenanceDisplayType,
    maintenanceRedirectUrl: row?.maintenance_redirect_url || fallback.defaultMaintenanceRedirectUrl,
    maintenanceTitle: row?.maintenance_title || fallback.defaultMaintenanceTitle,
    maintenanceMessage: row?.maintenance_message || fallback.defaultMaintenanceMessage,
    redirectMode: row?.redirect_mode || fallback.defaultRedirectMode,
    updatedAt: row?.updated_at || '',
    updatedBy: row?.updated_by || null
  };
}

async function publicSiteSnapshot(env) {
  await ensureControlCatalog(env.DB);
  const rows = await env.DB.prepare('SELECT * FROM public_site_controls').all();
  const byId = new Map(rows.results.map(row => [row.site_id, row]));
  return PUBLIC_SITE_CATALOG.map(site => normalizePublicSiteRow(byId.get(site.id), site));
}

async function handlePublicDomainRequest(request, env) {
  if (!env.DB) return null;
  const host = new URL(request.url).hostname.toLowerCase();
  const catalog = PUBLIC_SITE_BY_DOMAIN.get(host);
  if (!catalog) return null;
  await ensureControlCatalog(env.DB);
  const row = await env.DB.prepare('SELECT * FROM public_site_controls WHERE domain = ?').bind(host).first();
  const site = normalizePublicSiteRow(row, catalog);
  if (site.publicStatus !== 'maintenance') return null;
  const redirectUrl = validPublicRedirectUrl(site.maintenanceRedirectUrl);
  if (site.maintenanceDisplayType === 'url' && redirectUrl && site.redirectMode === 'auto') {
    return Response.redirect(redirectUrl, 302);
  }
  return siteHtml(maintenancePage(site));
}

async function probeEnvironmentService(environment, target) {
  const isDevelopment = environment === 'development';
  const url = isDevelopment
    ? `${DEVELOPMENT_WORKER}${target.path || '/'}`
    : `https://${target.host}${target.path || '/'}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 8000);
  try {
    const headers = { 'user-agent': 'EKODI-Account-Monitor/1.0' };
    if (isDevelopment) headers['x-ekodi-staging-host'] = target.host;
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers });
    await response.body?.cancel();
    const responseMs = Date.now() - startedAt;
    const status = response.status >= 200 && response.status < 400
      ? (responseMs > 3000 ? 'degraded' : 'online')
      : 'offline';
    return { environment, ...target, status, httpStatus: response.status, responseMs, detail: response.ok ? '' : `HTTP ${response.status}`, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { environment, ...target, status: 'offline', httpStatus: null, responseMs: Date.now() - startedAt, detail: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'network error').slice(0, 160), checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function runCloudflareEnvironmentChecks(env) {
  await ensureControlCatalog(env.DB);
  const jobs = [
    ...ACCOUNT_SERVICE_TARGETS.map(target => ({ environment: 'production', target })),
    ...ACCOUNT_SERVICE_TARGETS.map(target => ({ environment: 'development', target }))
  ];
  const checks = await mapWithConcurrency(jobs, 6, ({ environment, target }) => probeEnvironmentService(environment, target));
  const upsert = env.DB.prepare(`INSERT INTO cloudflare_environment_checks
    (environment, service_id, service_name, host, status, http_status, response_ms, detail, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(environment, service_id) DO UPDATE SET
      service_name=excluded.service_name, host=excluded.host, status=excluded.status,
      http_status=excluded.http_status, response_ms=excluded.response_ms,
      detail=excluded.detail, checked_at=excluded.checked_at`);
  await env.DB.batch(checks.map(check => upsert.bind(
    check.environment, check.id, check.name, check.host, check.status,
    check.httpStatus, check.responseMs, check.detail, check.checkedAt
  )));
  return checks;
}

function environmentSummary(environment, rows) {
  const services = rows.filter(row => row.environment === environment).map(row => ({
    id: row.service_id,
    name: row.service_name,
    host: row.host,
    status: row.status,
    httpStatus: row.http_status,
    responseTime: row.response_ms,
    detail: row.detail || '',
    checkedAt: row.checked_at
  }));
  const offline = services.filter(service => service.status === 'offline').length;
  const degraded = services.filter(service => service.status === 'degraded').length;
  return {
    id: environment,
    name: environment === 'production' ? 'EKODI Production' : 'EKODI Development',
    accountId: environment === 'production' ? '6986…d797' : '46aa…c0f',
    deploymentBranch: environment === 'production' ? 'main' : 'development',
    status: offline ? 'offline' : degraded ? 'degraded' : 'online',
    summary: { total: services.length, online: services.length - offline - degraded, degraded, offline },
    checkedAt: services.reduce((latest, service) => service.checkedAt > latest ? service.checkedAt : latest, ''),
    services
  };
}

async function cloudflareAccountSnapshot(env, force = false) {
  await ensureControlCatalog(env.DB);
  const latest = await env.DB.prepare('SELECT MAX(checked_at) AS checked_at FROM cloudflare_environment_checks').first();
  const stale = !latest?.checked_at || Date.now() - Date.parse(latest.checked_at) > 30 * 60 * 1000;
  if (force || stale) await runCloudflareEnvironmentChecks(env);
  const rows = await env.DB.prepare('SELECT * FROM cloudflare_environment_checks ORDER BY environment, service_name').all();
  return {
    generatedAt: new Date().toISOString(),
    accounts: ['production', 'development'].map(environment => environmentSummary(environment, rows.results))
  };
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const sessionRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const response = await authWorker.fetch(sessionRequest, env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function adminIdForSession(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

async function writeAudit(env, session, action, resource, detail = '') {
  const adminId = await adminIdForSession(env, session);
  await env.DB.prepare(`INSERT INTO audit_logs
    (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(adminId, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function probeService(service) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 8000);
  try {
    const response = await fetch(service.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'EKODI-Control-Center/4.0' }
    });
    const responseMs = Date.now() - startedAt;
    const httpStatus = response.status;
    let status = 'offline';
    if (httpStatus >= 200 && httpStatus < 400) status = responseMs > 2500 ? 'degraded' : 'online';
    else if (httpStatus >= 400 && httpStatus < 500) status = 'degraded';
    return {
      serviceId: service.id,
      status,
      httpStatus,
      responseMs,
      detail: response.ok ? '' : `HTTP ${httpStatus}`,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      serviceId: service.id,
      status: 'offline',
      httpStatus: null,
      responseMs: Date.now() - startedAt,
      detail: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'network error').slice(0, 160),
      checkedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

function serviceCheckHour(iso) {
  return `${String(iso || "").slice(0, 13)}:00:00.000Z`;
}

async function runChecks(env) {
  await ensureControlCatalog(env.DB);
  const controls = await env.DB.prepare('SELECT * FROM service_controls').all();
  const byId = new Map(controls.results.map(row => [row.service_id, row]));
  const targets = SERVICE_CATALOG.filter(service => {
    const control = byId.get(service.id);
    return control?.state === 'active' && Boolean(control?.monitor_enabled);
  });
  const checks = await Promise.all(targets.map(probeService));
  if (checks.length) {
    const raw = env.DB.prepare(`INSERT INTO service_checks
      (service_id, status, http_status, response_ms, detail, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const latest = env.DB.prepare(`INSERT INTO service_check_latest
      (service_id, status, http_status, response_ms, detail, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id) DO UPDATE SET
        status=excluded.status, http_status=excluded.http_status, response_ms=excluded.response_ms,
        detail=excluded.detail, checked_at=excluded.checked_at`);
    const hourly = env.DB.prepare(`INSERT INTO service_check_hourly
      (service_id, bucket_start, checks, online_checks, degraded_checks, offline_checks, response_ms_total, max_response_ms)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id, bucket_start) DO UPDATE SET
        checks=service_check_hourly.checks+1,
        online_checks=service_check_hourly.online_checks+excluded.online_checks,
        degraded_checks=service_check_hourly.degraded_checks+excluded.degraded_checks,
        offline_checks=service_check_hourly.offline_checks+excluded.offline_checks,
        response_ms_total=service_check_hourly.response_ms_total+excluded.response_ms_total,
        max_response_ms=CASE
          WHEN excluded.max_response_ms IS NULL THEN service_check_hourly.max_response_ms
          WHEN service_check_hourly.max_response_ms IS NULL THEN excluded.max_response_ms
          ELSE MAX(service_check_hourly.max_response_ms, excluded.max_response_ms)
        END`);
    const statements = [];
    for (const check of checks) {
      const values = [check.serviceId, check.status, check.httpStatus, check.responseMs, check.detail, check.checkedAt];
      statements.push(raw.bind(...values), latest.bind(...values));
      statements.push(hourly.bind(check.serviceId, serviceCheckHour(check.checkedAt), check.status==='online'?1:0,
        check.status==='degraded'?1:0, check.status==='offline'?1:0, Number(check.responseMs || 0), check.responseMs));
    }
    await env.DB.batch(statements);
  }
  const retentionCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const rollupCutoff = new Date(Date.now() - 32 * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM service_checks WHERE checked_at < ?').bind(retentionCutoff),
    env.DB.prepare('DELETE FROM service_check_hourly WHERE bucket_start < ?').bind(rollupCutoff)
  ]);
  return checks;
}

async function newestCheckTime(env) {
  const row = await env.DB.prepare('SELECT checked_at FROM service_check_latest ORDER BY checked_at DESC LIMIT 1').first();
  return row?.checked_at || null;
}

async function serviceSnapshot(env) {
  await ensureControlCatalog(env.DB);
  const statsSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  statsSince.setUTCMinutes(0, 0, 0);
  const [controls, latest, stats] = await Promise.all([
    env.DB.prepare('SELECT * FROM service_controls').all(),
    env.DB.prepare('SELECT * FROM service_check_latest').all(),
    env.DB.prepare(`SELECT service_id,
        SUM(checks) AS checks,
        SUM(online_checks) AS online_checks,
        SUM(degraded_checks) AS degraded_checks,
        SUM(offline_checks) AS offline_checks,
        ROUND(CASE WHEN SUM(checks) > 0 THEN CAST(SUM(response_ms_total) AS REAL) / SUM(checks) ELSE NULL END) AS avg_response_ms,
        MAX(max_response_ms) AS max_response_ms
      FROM service_check_hourly
      WHERE bucket_start >= ?
      GROUP BY service_id`)
      .bind(statsSince.toISOString()).all()
  ]);
  const controlById = new Map(controls.results.map(row => [row.service_id, row]));
  const latestById = new Map(latest.results.map(row => [row.service_id, row]));
  const statsById = new Map(stats.results.map(row => [row.service_id, row]));
  return SERVICE_CATALOG.map(service => {
    const control = controlById.get(service.id);
    const check = latestById.get(service.id);
    const metric = statsById.get(service.id);
    const checks = Number(metric?.checks || 0);
    const availableChecks = Number(metric?.online_checks || 0) + Number(metric?.degraded_checks || 0);
    return {
      id: service.id, name: service.name, domain: service.domain, url: service.url, group: service.group,
      state: control?.state || service.defaultState,
      monitorEnabled: Boolean(control?.monitor_enabled), note: control?.note || '', updatedAt: control?.updated_at || '',
      latest: check ? { status: check.status, httpStatus: check.http_status, responseTime: check.response_ms,
        detail: check.detail || '', checkedAt: check.checked_at } : null,
      stats24h: {
        checks,
        availabilityPercent: checks ? Math.round((availableChecks / checks) * 10000) / 100 : null,
        averageResponseTime: metric?.avg_response_ms ?? null,
        maxResponseTime: metric?.max_response_ms ?? null,
        online: Number(metric?.online_checks || 0), degraded: Number(metric?.degraded_checks || 0),
        offline: Number(metric?.offline_checks || 0)
      }
    };
  });
}

async function overview(env) {
  await ensureControlCatalog(env.DB);
  const newest = await newestCheckTime(env);
  const stale = !newest || Date.now() - new Date(newest).getTime() > 12 * 60 * 1000;
  if (stale) await runChecks(env);

  const services = await serviceSnapshot(env);
  const monitored = services.filter(service => service.state === 'active' && service.monitorEnabled && service.latest);
  const summary = {
    total: monitored.length,
    online: monitored.filter(service => service.latest.status === 'online').length,
    degraded: monitored.filter(service => service.latest.status === 'degraded').length,
    offline: monitored.filter(service => service.latest.status === 'offline').length
  };
  const stateSummary = {
    active: services.filter(service => service.state === 'active').length,
    planned: services.filter(service => service.state === 'planned').length,
    paused: services.filter(service => service.state === 'paused').length,
    monitored: services.filter(service => service.monitorEnabled).length
  };
  const sites = monitored.map(service => ({
    id: service.id,
    name: service.name,
    domain: service.domain,
    url: service.url,
    status: service.latest.status,
    httpStatus: service.latest.httpStatus,
    responseTime: service.latest.responseTime,
    checkedAt: service.latest.checkedAt,
    availability24h: service.stats24h.availabilityPercent,
    averageResponse24h: service.stats24h.averageResponseTime
  }));
  return {
    schemaVersion: 5,
    generatedAt: new Date().toISOString(),
    summary,
    states: stateSummary,
    sites,
    services
  };
}

async function evolutionSnapshot(env, force = false) {
  if (force) await runChecks(env);
  const controlOverview = await overview(env);
  const live = analyzeServiceFleet(controlOverview, {
    sourceUrl: 'https://admin.ekodi.kr/#ai-ops'
  });
  await persistEvolutionReport(env.DB, live);
  const [recommendations, store] = await Promise.all([
    listEvolutionRecommendations(env.DB, { limit: 100 }),
    evolutionStoreSummary(env.DB)
  ]);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: 'verification_first_security_native_self_evolving',
    live,
    store,
    recommendations
  };
}

async function handleControl(request, env) {
  if (!env.DB) return controlJson({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  await ensureControlCatalog(env.DB);

  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/overview`) {
    return controlJson(await overview(env), 200, auth.response.headers);
  }

  if (request.method === 'GET' && path === PUBLIC_SITE_PREFIX) {
    return controlJson({ sites: await publicSiteSnapshot(env) }, 200, auth.response.headers);
  }

  const publicSiteMatch = path.match(/^\/api\/control\/public-sites\/([a-z0-9-]+)$/);
  if (publicSiteMatch && request.method === 'PUT') {
    const siteId = publicSiteMatch[1];
    const catalog = PUBLIC_SITE_BY_ID.get(siteId);
    if (!catalog) return controlJson({ error: '관리 대상 공개 사이트가 아닙니다.' }, 404, auth.response.headers);
    const body = await readJson(request);
    if (!body || typeof body !== 'object') return controlJson({ error: '공개 사이트 설정 형식을 확인해 주세요.' }, 400, auth.response.headers);
    const publicStatus = String(body.publicStatus || catalog.defaultPublicStatus).trim();
    const displayType = String(body.maintenanceDisplayType || catalog.defaultMaintenanceDisplayType).trim();
    const redirectMode = String(body.redirectMode || catalog.defaultRedirectMode).trim();
    if (!VALID_PUBLIC_STATUSES.has(publicStatus)) return controlJson({ error: '공개 상태는 public 또는 maintenance 중 하나여야 합니다.' }, 400, auth.response.headers);
    if (!VALID_MAINTENANCE_DISPLAY_TYPES.has(displayType)) return controlJson({ error: '임시페이지 방식은 default 또는 url 중 하나여야 합니다.' }, 400, auth.response.headers);
    if (!VALID_REDIRECT_MODES.has(redirectMode)) return controlJson({ error: '연결 방식은 button 또는 auto 중 하나여야 합니다.' }, 400, auth.response.headers);
    const title = String(body.maintenanceTitle || catalog.defaultMaintenanceTitle).trim().slice(0, 80) || catalog.defaultMaintenanceTitle;
    const message = String(body.maintenanceMessage || catalog.defaultMaintenanceMessage).trim().slice(0, 300) || catalog.defaultMaintenanceMessage;
    const redirectUrl = validPublicRedirectUrl(body.maintenanceRedirectUrl);
    if (displayType === 'url' && !redirectUrl) return controlJson({ error: '지정 주소 연결 방식에는 올바른 http 또는 https 주소가 필요합니다.' }, 400, auth.response.headers);
    const adminId = await adminIdForSession(env, auth.session);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE public_site_controls
      SET public_status = ?, maintenance_display_type = ?, maintenance_redirect_url = ?, maintenance_title = ?, maintenance_message = ?, redirect_mode = ?, updated_at = ?, updated_by = ?
      WHERE site_id = ?`)
      .bind(publicStatus, displayType, redirectUrl, title, message, redirectMode, updatedAt, adminId, siteId).run();
    await writeAudit(env, auth.session, 'public_site.update', catalog.domain, JSON.stringify({ publicStatus, displayType, redirectMode, redirectUrl }));
    const sites = await publicSiteSnapshot(env);
    return controlJson({ site: sites.find(item => item.id === siteId) }, 200, auth.response.headers);
  }

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/evolution`) {
    return controlJson(await evolutionSnapshot(env), 200, auth.response.headers);
  }

  if (request.method === 'POST' && path === `${CONTROL_PREFIX}/evolution/check`) {
    const snapshot = await evolutionSnapshot(env, true);
    await writeAudit(env, auth.session, 'evolution.check', 'platform', 'manual platform evolution analysis');
    return controlJson(snapshot, 200, auth.response.headers);
  }

  if (request.method === 'POST' && path === `${CONTROL_PREFIX}/evolution/technology/evaluate`) {
    const body = await readJson(request);
    if (!body || typeof body !== 'object') {
      return controlJson({ error: '기술 후보 형식을 확인해 주세요.' }, 400, auth.response.headers);
    }
    const recommendation = evaluateTechnologyCandidate(body);
    const report = {
      schemaVersion: 1,
      generatedAt: recommendation.verifiedAt,
      recommendations: [recommendation]
    };
    await persistEvolutionReport(env.DB, report);
    await writeAudit(
      env,
      auth.session,
      'evolution.technology.evaluate',
      recommendation.target,
      JSON.stringify({ id: recommendation.id, score: recommendation.score, evidenceGrade: recommendation.evidenceGrade })
    );
    return controlJson({ recommendation }, 200, auth.response.headers);
  }

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/cloudflare-accounts`) {
    return controlJson(await cloudflareAccountSnapshot(env), 200, auth.response.headers);
  }

  if (request.method === 'POST' && path === `${CONTROL_PREFIX}/cloudflare-accounts/check`) {
    const snapshot = await cloudflareAccountSnapshot(env, true);
    await writeAudit(env, auth.session, 'cloudflare.accounts.check', 'platform', 'manual account and subservice health check');
    return controlJson(snapshot, 200, auth.response.headers);
  }

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/remote/devices`) {
    await writeAudit(env, auth.session, 'remote.devices.list', 'remote-power', 'remote power inventory viewed');
    return controlJson({ ok: true, ...remotePowerSnapshot(env) }, 200, auth.response.headers);
  }

  const remoteWakeMatch = path.match(/^\/api\/control\/remote\/devices\/([a-z0-9-]+)\/wake$/);
  if (remoteWakeMatch && request.method === 'POST') {
    const deviceId = remoteWakeMatch[1];
    const result = await requestRemoteWake(env, deviceId);
    await writeAudit(env, auth.session, 'remote.device.wake', `remote-power:${deviceId}`, JSON.stringify({ status: result.status, code: result.body?.code || '', ok: Boolean(result.body?.ok) }));
    return controlJson(result.body, result.status, auth.response.headers);
  }

  if (request.method === 'POST' && path === `${CONTROL_PREFIX}/check`) {
    await runChecks(env);
    await writeAudit(env, auth.session, 'service.check', 'platform', 'manual service health check');
    return controlJson(await overview(env), 200, auth.response.headers);
  }

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/services`) {
    return controlJson({ services: await serviceSnapshot(env) }, 200, auth.response.headers);
  }

  const serviceMatch = path.match(/^\/api\/control\/services\/([a-z0-9-]+)$/);
  if (serviceMatch && request.method === 'PUT') {
    const serviceId = serviceMatch[1];
    const service = SERVICE_BY_ID.get(serviceId);
    if (!service) return controlJson({ error: '관리 대상 서비스가 아닙니다.' }, 404, auth.response.headers);
    const body = await readJson(request);
    if (!body || typeof body !== 'object') return controlJson({ error: '서비스 설정 형식을 확인해 주세요.' }, 400, auth.response.headers);
    const state = String(body.state || '').trim();
    if (!VALID_STATES.has(state)) return controlJson({ error: '서비스 상태는 planned, active, paused 중 하나여야 합니다.' }, 400, auth.response.headers);
    const monitorEnabled = Boolean(body.monitorEnabled);
    const note = String(body.note || '').trim().slice(0, 500);
    const adminId = await adminIdForSession(env, auth.session);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE service_controls
      SET state = ?, monitor_enabled = ?, note = ?, updated_at = ?, updated_by = ?
      WHERE service_id = ?`)
      .bind(state, monitorEnabled ? 1 : 0, note, updatedAt, adminId, serviceId).run();
    await writeAudit(env, auth.session, 'service.update', service.domain, JSON.stringify({ state, monitorEnabled, note }));
    const services = await serviceSnapshot(env);
    return controlJson({ service: services.find(item => item.id === serviceId) }, 200, auth.response.headers);
  }

  const historyMatch = path.match(/^\/api\/control\/services\/([a-z0-9-]+)\/history$/);
  if (historyMatch && request.method === 'GET') {
    const serviceId = historyMatch[1];
    if (!SERVICE_BY_ID.has(serviceId)) return controlJson({ error: '관리 대상 서비스가 아닙니다.' }, 404, auth.response.headers);
    const hours = Math.max(1, Math.min(168, Math.trunc(Number(url.searchParams.get('hours')) || 24)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare(`SELECT status, http_status, response_ms, detail, checked_at
      FROM service_checks
      WHERE service_id = ? AND checked_at >= ?
      ORDER BY checked_at DESC
      LIMIT 1000`).bind(serviceId, since).all();
    return controlJson({ serviceId, hours, checks: rows.results.map(row => ({
      status: row.status,
      httpStatus: row.http_status,
      responseTime: row.response_ms,
      detail: row.detail || '',
      checkedAt: row.checked_at
    })) }, 200, auth.response.headers);
  }

  return controlJson({ error: 'Control API endpoint not found' }, 404, auth.response.headers);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicDomainResponse = await handlePublicDomainRequest(request, env);
    if (publicDomainResponse) return publicDomainResponse;
    if (url.pathname.startsWith('/api/mail/control')) {
      try {
        const response = await handleMailControl(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Mail control API error', error);
        return new Response(JSON.stringify({ error: '메일 관리 API 처리 중 오류가 발생했습니다.', code: 'MAIL_CONTROL_ERROR' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
        });
      }
    }
    if (request.method === 'OPTIONS') return authWorker.fetch(request, env, ctx);
    if (url.pathname.startsWith(CONTROL_PREFIX)) {
      try {
        return await handleControl(request, env);
      } catch (error) {
        console.error('Control API error', error);
        return controlJson({ error: '통합 운영 API 처리 중 오류가 발생했습니다.', code: 'CONTROL_API_ERROR' }, 500);
      }
    }
    return authWorker.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      await Promise.all([
        runChecks(env),
        cloudflareAccountSnapshot(env)
      ]);
      await evolutionSnapshot(env);
    })().catch(error => console.error('Scheduled service, account, or evolution check failed', error)));
  }
};
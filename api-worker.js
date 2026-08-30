import authWorker from './auth-worker.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { remotePowerSnapshot, requestRemoteWake } from './remote-power-control.js';

// Provider service registry only. Customer organizations and their sites are managed as
// customer tenants/workspaces through the customer directory, never as EKODI services.
const SERVICE_CATALOG = [
  { id: 'root', name: 'EKODI Root', domain: 'ekodi.kr', url: 'https://ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'admin', name: 'EKODI Control Center', domain: 'admin.ekodi.kr', url: 'https://admin.ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'api', name: 'EKODI API', domain: 'api.ekodi.kr', url: 'https://api.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: false },
  { id: 'biz', name: '에코디비즈', domain: 'biz.ekodi.kr', url: 'https://biz.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'trade', name: 'EKODI Global Trading', domain: 'trade.ekodi.kr', url: 'https://trade.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'mall', name: '에코디몰', domain: 'mall.ekodi.kr', url: 'https://mall.ekodi.kr', group: 'business', defaultState: 'active', defaultMonitor: true },
  { id: 'pay', name: '에코디결제', domain: 'pay.ekodi.kr', url: 'https://pay.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'books', name: '에코디북스', domain: 'books.ekodi.kr', url: 'https://books.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'lab', name: '에코디연구소', domain: 'lab.ekodi.kr', url: 'https://lab.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'edu', name: '에코디교육', domain: 'edu.ekodi.kr', url: 'https://edu.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'media', name: '에코디미디어', domain: 'media.ekodi.kr', url: 'https://media.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'church', name: '에코디교회', domain: 'church.ekodi.kr', url: 'https://church.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'community', name: '커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'social', name: 'EKODI Social', domain: 'social.ekodi.kr', url: 'https://social.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: true }
];

const SERVICE_BY_ID = new Map(SERVICE_CATALOG.map(service => [service.id, service]));
const VALID_STATES = new Set(['planned', 'active', 'paused']);
const CONTROL_PREFIX = '/api/control';
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

async function ensureControlSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS service_controls (
      service_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'planned',
      monitor_enabled INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      updated_by INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS service_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      response_ms INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_service_checks_service_time ON service_checks(service_id, checked_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_service_checks_time ON service_checks(checked_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_environment_checks (
      environment TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      host TEXT NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      response_ms INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL,
      PRIMARY KEY (environment, service_id)
    )`)
  ]);

  const now = new Date().toISOString();
  const seed = db.prepare(`INSERT OR IGNORE INTO service_controls
    (service_id, state, monitor_enabled, note, updated_at)
    VALUES (?, ?, ?, '', ?)`);
  await db.batch(SERVICE_CATALOG.map(service => seed.bind(
    service.id,
    service.defaultState,
    service.defaultMonitor ? 1 : 0,
    now
  )));
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
  await ensureControlSchema(env.DB);
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
  await ensureControlSchema(env.DB);
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

async function runChecks(env) {
  await ensureControlSchema(env.DB);
  const controls = await env.DB.prepare('SELECT * FROM service_controls').all();
  const byId = new Map(controls.results.map(row => [row.service_id, row]));
  const targets = SERVICE_CATALOG.filter(service => {
    const control = byId.get(service.id);
    return control?.state === 'active' && Boolean(control?.monitor_enabled);
  });

  const checks = await Promise.all(targets.map(probeService));
  if (checks.length) {
    const insert = env.DB.prepare(`INSERT INTO service_checks
      (service_id, status, http_status, response_ms, detail, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    await env.DB.batch(checks.map(check => insert.bind(
      check.serviceId,
      check.status,
      check.httpStatus,
      check.responseMs,
      check.detail,
      check.checkedAt
    )));
  }
  const retentionCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await env.DB.prepare('DELETE FROM service_checks WHERE checked_at < ?').bind(retentionCutoff).run();
  return checks;
}

async function newestCheckTime(env) {
  const row = await env.DB.prepare('SELECT MAX(checked_at) AS checked_at FROM service_checks').first();
  return row?.checked_at || null;
}

async function serviceSnapshot(env) {
  await ensureControlSchema(env.DB);
  const [controls, latest, stats] = await Promise.all([
    env.DB.prepare('SELECT * FROM service_controls').all(),
    env.DB.prepare(`SELECT c.* FROM service_checks c
      INNER JOIN (
        SELECT service_id, MAX(id) AS max_id
        FROM service_checks
        GROUP BY service_id
      ) latest ON latest.max_id = c.id`).all(),
    env.DB.prepare(`SELECT service_id,
        COUNT(*) AS checks,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online_checks,
        SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) AS degraded_checks,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline_checks,
        ROUND(AVG(response_ms)) AS avg_response_ms,
        MAX(response_ms) AS max_response_ms
      FROM service_checks
      WHERE checked_at >= ?
      GROUP BY service_id`)
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).all()
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
      id: service.id,
      name: service.name,
      domain: service.domain,
      url: service.url,
      group: service.group,
      state: control?.state || service.defaultState,
      monitorEnabled: Boolean(control?.monitor_enabled),
      note: control?.note || '',
      updatedAt: control?.updated_at || '',
      latest: check ? {
        status: check.status,
        httpStatus: check.http_status,
        responseTime: check.response_ms,
        detail: check.detail || '',
        checkedAt: check.checked_at
      } : null,
      stats24h: {
        checks,
        availabilityPercent: checks ? Math.round((availableChecks / checks) * 10000) / 100 : null,
        averageResponseTime: metric?.avg_response_ms ?? null,
        maxResponseTime: metric?.max_response_ms ?? null,
        online: Number(metric?.online_checks || 0),
        degraded: Number(metric?.degraded_checks || 0),
        offline: Number(metric?.offline_checks || 0)
      }
    };
  });
}

async function overview(env) {
  await ensureControlSchema(env.DB);
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

async function handleControl(request, env) {
  if (!env.DB) return controlJson({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  await ensureControlSchema(env.DB);

  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/overview`) {
    return controlJson(await overview(env), 200, auth.response.headers);
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
    ctx.waitUntil(Promise.all([
      runChecks(env),
      cloudflareAccountSnapshot(env)
    ]).catch(error => console.error('Scheduled service or Cloudflare account check failed', error)));
  }
};

import authWorker from './auth-worker.js';

const ADMIN_PREFIX = '/api/control/wake';
const AGENT_PREFIX = '/api/wake-agent';
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const GATEWAY_ONLINE_MS = 90 * 1000;
const DEVICE_ONLINE_MS = 90 * 1000;
const DEVICE_WAKE_ELIGIBLE_AGE_MS = 3 * 60 * 1000;
const DEFAULT_WAKE_TTL_MS = 10 * 60 * 1000;

function json(data, status = 200, request, env) {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  const origin = request?.headers?.get('origin') || '';
  const allowed = new Set(String(env?.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-headers', 'authorization,content-type,x-ekodi-wake-gateway-id');
    headers.set('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
    headers.set('access-control-max-age', '600');
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function safeText(value, max = 120) { return String(value ?? '').trim().slice(0, max); }
function parseJson(value, fallback = {}) { try { return JSON.parse(value || '{}'); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes); crypto.getRandomValues(data);
  return [...data].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function gatewayStatus(row) {
  if (!row || row.revoked_at || !row.enabled) return 'disabled';
  if (!row.last_seen_at) return 'enrolled';
  return Date.now() - Date.parse(row.last_seen_at) <= GATEWAY_ONLINE_MS ? 'online' : 'offline';
}
function deviceOnline(row) {
  return Boolean(row?.last_seen_at && Date.now() - Date.parse(row.last_seen_at) <= DEVICE_ONLINE_MS && !row.revoked_at);
}
function macAddress(value) {
  const normalized = safeText(value, 32).replace(/-/g, ':').toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized) ? normalized : '';
}
function ipv4(value) {
  const text = safeText(value, 64);
  const parts = text.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? text : '';
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS device_wake_gateway_enrollments (
      id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, created_by INTEGER, used_at TEXT, gateway_id TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_wake_gateways (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      capabilities_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT, enrolled_at TEXT NOT NULL, enrolled_by INTEGER, revoked_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_wake_profiles (
      device_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
      auto_wake_for_jobs INTEGER NOT NULL DEFAULT 0, resume_jobs INTEGER NOT NULL DEFAULT 1,
      gateway_id TEXT NOT NULL DEFAULT '', mac_address TEXT NOT NULL DEFAULT '',
      broadcast_address TEXT NOT NULL DEFAULT '255.255.255.255', wol_port INTEGER NOT NULL DEFAULT 9,
      strategy TEXT NOT NULL DEFAULT 'wol', boot_timeout_seconds INTEGER NOT NULL DEFAULT 300,
      updated_at TEXT NOT NULL, updated_by INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_wake_requests (
      id TEXT PRIMARY KEY, device_id TEXT NOT NULL, gateway_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', reason TEXT NOT NULL DEFAULT 'admin',
      continue_jobs INTEGER NOT NULL DEFAULT 1, requested_at TEXT NOT NULL, requested_by INTEGER,
      claimed_at TEXT, sent_at TEXT, online_at TEXT, expires_at TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}'
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_wake_requests_gateway_queue ON device_wake_requests(gateway_id, status, requested_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_wake_requests_device_time ON device_wake_requests(device_id, requested_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_wake_gateways_seen ON device_wake_gateways(last_seen_at DESC)'),
  ]);
}

async function adminSession(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}
async function adminId(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}
async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, safeText(detail, 500), nowIso()).run();
}

async function deviceRow(env, deviceId) {
  return env.DB.prepare(`SELECT d.*, m.device_type, m.management_mode, m.location_label,
      e.enabled AS execution_enabled, e.device_group
    FROM device_registry d
    LEFT JOIN device_management_profiles m ON m.device_id=d.id
    LEFT JOIN device_execution_profiles e ON e.device_id=d.id
    WHERE d.id=? LIMIT 1`).bind(deviceId).first();
}
function desktopEligible(row) {
  if (!row || row.revoked_at || String(row.device_type || 'pc') !== 'pc') return false;
  const settings = parseJson(row.settings_json, {});
  const diagnostics = parseJson(row.diagnostics_json, {});
  const system = diagnostics.system || settings?.health?.system || {};
  return system.isPortable !== true && system.deviceClass !== 'portable';
}

async function gatewayAuth(request, env) {
  const gatewayId = safeText(request.headers.get('x-ekodi-wake-gateway-id'), 100);
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!gatewayId || !token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT * FROM device_wake_gateways WHERE id=? AND token_hash=? AND revoked_at IS NULL AND enabled=1')
    .bind(gatewayId, hash).first();
  return row || null;
}

async function profileView(env, row) {
  const gateway = row.gateway_id ? await env.DB.prepare('SELECT * FROM device_wake_gateways WHERE id=?').bind(row.gateway_id).first() : null;
  return {
    deviceId:row.device_id, enabled:Boolean(row.enabled), autoWakeForJobs:Boolean(row.auto_wake_for_jobs),
    resumeJobs:Boolean(row.resume_jobs), gatewayId:row.gateway_id || '', macAddress:row.mac_address || '',
    broadcastAddress:row.broadcast_address || '255.255.255.255', wolPort:Number(row.wol_port || 9),
    strategy:row.strategy || 'wol', bootTimeoutSeconds:Number(row.boot_timeout_seconds || 300),
    gatewayStatus:gatewayStatus(gateway), updatedAt:row.updated_at,
  };
}

async function snapshot(env) {
  const [profiles, gateways, requests] = await Promise.all([
    env.DB.prepare('SELECT * FROM device_wake_profiles ORDER BY updated_at DESC').all(),
    env.DB.prepare('SELECT id,label,capabilities_json,enabled,last_seen_at,enrolled_at,revoked_at FROM device_wake_gateways ORDER BY enrolled_at DESC').all(),
    env.DB.prepare('SELECT * FROM device_wake_requests ORDER BY requested_at DESC LIMIT 50').all(),
  ]);
  const profileItems = [];
  for (const row of profiles.results || []) profileItems.push(await profileView(env, row));
  return {
    generatedAt:nowIso(), profiles:profileItems,
    gateways:(gateways.results || []).map(row => ({
      id:row.id, label:row.label, status:gatewayStatus(row), enabled:Boolean(row.enabled),
      capabilities:parseJson(row.capabilities_json, {}), lastSeenAt:row.last_seen_at || null, enrolledAt:row.enrolled_at,
    })),
    requests:(requests.results || []).map(row => ({
      id:row.id, deviceId:row.device_id, gatewayId:row.gateway_id, status:row.status, reason:row.reason,
      continueJobs:Boolean(row.continue_jobs), requestedAt:row.requested_at, claimedAt:row.claimed_at || null,
      sentAt:row.sent_at || null, onlineAt:row.online_at || null, expiresAt:row.expires_at,
      result:parseJson(row.result_json, {}),
    })),
    policy:{ desktopOnly:true, laptopExcluded:true, adminAuthorizationRequired:true, defaultStrategy:'wol' },
  };
}

async function configureDevice(request, env, session, deviceId) {
  const device = await deviceRow(env, deviceId);
  if (!device) return json({ error:'등록된 기기를 찾을 수 없습니다.' }, 404, request, env);
  if (!desktopEligible(device)) return json({ error:'원격 전원 복구는 데스크톱 PC만 허용됩니다.', code:'DESKTOP_ONLY' }, 409, request, env);
  const body = await readJson(request);
  if (!body) return json({ error:'올바른 JSON 요청이 필요합니다.' }, 400, request, env);
  const enabled = Boolean(body.enabled);
  const autoWake = Boolean(body.autoWakeForJobs);
  const resumeJobs = body.resumeJobs !== false;
  const gatewayId = safeText(body.gatewayId, 100);
  const mac = macAddress(body.macAddress);
  const broadcast = ipv4(body.broadcastAddress || '255.255.255.255');
  const port = Math.max(1, Math.min(65535, Math.trunc(Number(body.wolPort) || 9)));
  const timeout = Math.max(60, Math.min(900, Math.trunc(Number(body.bootTimeoutSeconds) || 300)));
  if (enabled && (!gatewayId || !mac || !broadcast)) return json({ error:'활성화하려면 Wake Gateway, MAC 주소, 브로드캐스트 주소가 필요합니다.' }, 400, request, env);
  if (gatewayId) {
    const gateway = await env.DB.prepare('SELECT id FROM device_wake_gateways WHERE id=? AND revoked_at IS NULL').bind(gatewayId).first();
    if (!gateway) return json({ error:'Wake Gateway를 찾을 수 없습니다.' }, 404, request, env);
  }
  const actor = await adminId(env, session); const now = nowIso();
  await env.DB.prepare(`INSERT INTO device_wake_profiles
    (device_id,enabled,auto_wake_for_jobs,resume_jobs,gateway_id,mac_address,broadcast_address,wol_port,strategy,boot_timeout_seconds,updated_at,updated_by)
    VALUES (?,?,?,?,?,?,?,?, 'wol',?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET enabled=excluded.enabled,auto_wake_for_jobs=excluded.auto_wake_for_jobs,
    resume_jobs=excluded.resume_jobs,gateway_id=excluded.gateway_id,mac_address=excluded.mac_address,
    broadcast_address=excluded.broadcast_address,wol_port=excluded.wol_port,strategy='wol',
    boot_timeout_seconds=excluded.boot_timeout_seconds,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(deviceId, enabled ? 1 : 0, autoWake ? 1 : 0, resumeJobs ? 1 : 0, gatewayId, mac, broadcast, port, timeout, now, actor).run();
  await audit(env, session, 'device.wake.profile.update', deviceId, `enabled=${enabled}; autoWake=${autoWake}; gateway=${gatewayId || '-'}`);
  const row = await env.DB.prepare('SELECT * FROM device_wake_profiles WHERE device_id=?').bind(deviceId).first();
  return json({ profile:await profileView(env, row) }, 200, request, env);
}

async function queueWake(env, deviceId, actorId, { reason='admin', continueJobs=true } = {}) {
  const device = await deviceRow(env, deviceId);
  if (!desktopEligible(device)) return { error:'DESKTOP_ONLY' };
  if (deviceOnline(device)) return { alreadyOnline:true };
  const profile = await env.DB.prepare('SELECT * FROM device_wake_profiles WHERE device_id=? AND enabled=1').bind(deviceId).first();
  if (!profile) return { error:'WAKE_NOT_ENABLED' };
  const gateway = await env.DB.prepare('SELECT * FROM device_wake_gateways WHERE id=?').bind(profile.gateway_id).first();
  if (gatewayStatus(gateway) !== 'online') return { error:'WAKE_GATEWAY_OFFLINE' };
  const existing = await env.DB.prepare(`SELECT id,status FROM device_wake_requests WHERE device_id=? AND status IN ('queued','claimed','sent') ORDER BY requested_at DESC LIMIT 1`).bind(deviceId).first();
  if (existing) return { requestId:existing.id, status:existing.status, duplicate:true };
  const id = `wake_${crypto.randomUUID()}`; const requestedAt = nowIso();
  const expiresAt = new Date(Date.now() + Math.max(DEFAULT_WAKE_TTL_MS, Number(profile.boot_timeout_seconds || 300) * 1000 + 120000)).toISOString();
  await env.DB.prepare(`INSERT INTO device_wake_requests
    (id,device_id,gateway_id,status,reason,continue_jobs,requested_at,requested_by,expires_at)
    VALUES (?,?,?,'queued',?,?,?,?,?)`)
    .bind(id, deviceId, profile.gateway_id, safeText(reason, 120), continueJobs ? 1 : 0, requestedAt, actorId, expiresAt).run();
  return { requestId:id, status:'queued', expiresAt };
}

async function handleAdmin(request, env) {
  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === ADMIN_PREFIX) return json(await snapshot(env), 200, request, env);
  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/gateways/enrollments`) {
    const actor = await adminId(env, auth.session); const code = randomToken(12); const id = `wge_${crypto.randomUUID()}`; const now = nowIso();
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString();
    await env.DB.prepare(`INSERT INTO device_wake_gateway_enrollments (id,code_hash,expires_at,created_at,created_by) VALUES (?,?,?,?,?)`)
      .bind(id, await sha256(code), expiresAt, now, actor).run();
    await audit(env, auth.session, 'device.wake.gateway.enrollment.create', id, '10 minute one-time enrollment');
    return json({ enrollment:{ id, code, expiresAt } }, 201, request, env);
  }
  const config = path.match(/^\/api\/control\/wake\/devices\/([^/]+)$/);
  if (config && request.method === 'PUT') return configureDevice(request, env, auth.session, decodeURIComponent(config[1]));
  const wake = path.match(/^\/api\/control\/wake\/devices\/([^/]+)\/wake$/);
  if (wake && request.method === 'POST') {
    const body = await readJson(request);
    if (!body?.confirmed) return json({ error:'전원 켜기는 관리자 확인이 필요합니다.', code:'WAKE_CONFIRMATION_REQUIRED' }, 409, request, env);
    const deviceId = decodeURIComponent(wake[1]); const actor = await adminId(env, auth.session);
    const result = await queueWake(env, deviceId, actor, { reason:safeText(body.reason || 'admin', 120), continueJobs:body.continueJobs !== false });
    if (result.error === 'DESKTOP_ONLY') return json({ error:'데스크톱 PC만 원격 전원 복구할 수 있습니다.' }, 409, request, env);
    if (result.error === 'WAKE_NOT_ENABLED') return json({ error:'이 기기의 원격 전원 허용이 꺼져 있습니다.' }, 409, request, env);
    if (result.error === 'WAKE_GATEWAY_OFFLINE') return json({ error:'Wake Gateway가 오프라인입니다. 같은 네트워크의 항상 켜진 Gateway가 필요합니다.' }, 409, request, env);
    await audit(env, auth.session, 'device.wake.request', deviceId, `request=${result.requestId || 'already-online'}; reason=${safeText(body.reason || 'admin', 120)}`);
    return json(result, result.alreadyOnline ? 200 : 202, request, env);
  }
  return json({ error:'Wake Control API 경로를 찾을 수 없습니다.' }, 404, request, env);
}

async function enrollGateway(request, env) {
  const body = await readJson(request);
  const code = safeText(body?.code, 80); const label = safeText(body?.label || 'Wake Gateway', 120);
  if (!code || !label) return json({ error:'등록 코드와 Gateway 이름이 필요합니다.' }, 400, request, env);
  const hash = await sha256(code);
  const enrollment = await env.DB.prepare('SELECT * FROM device_wake_gateway_enrollments WHERE code_hash=? AND used_at IS NULL AND expires_at>?').bind(hash, nowIso()).first();
  if (!enrollment) return json({ error:'등록 코드가 만료되었거나 이미 사용되었습니다.' }, 401, request, env);
  const gatewayId = `wg_${crypto.randomUUID()}`; const token = randomToken(32); const now = nowIso();
  const capabilities = body?.capabilities && typeof body.capabilities === 'object' ? body.capabilities : { wol:true };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO device_wake_gateways (id,label,token_hash,capabilities_json,enabled,last_seen_at,enrolled_at,enrolled_by) VALUES (?,?,?,?,1,?,?,?)`)
      .bind(gatewayId, label, await sha256(token), JSON.stringify(capabilities).slice(0, 4000), now, now, enrollment.created_by),
    env.DB.prepare('UPDATE device_wake_gateway_enrollments SET used_at=?,gateway_id=? WHERE id=?').bind(now, gatewayId, enrollment.id),
  ]);
  return json({ gateway:{ id:gatewayId, token, label, apiBase:new URL(request.url).origin } }, 201, request, env);
}

async function handleAgent(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === `${AGENT_PREFIX}/enroll`) return enrollGateway(request, env);
  const gateway = await gatewayAuth(request, env);
  if (!gateway) return json({ error:'Wake Gateway 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'POST' && path === `${AGENT_PREFIX}/heartbeat`) {
    await env.DB.prepare('UPDATE device_wake_gateways SET last_seen_at=? WHERE id=?').bind(nowIso(), gateway.id).run();
    return json({ ok:true, serverTime:nowIso() }, 200, request, env);
  }
  if (request.method === 'GET' && path === `${AGENT_PREFIX}/requests/next`) {
    const now = nowIso();
    await env.DB.prepare(`UPDATE device_wake_requests SET status='expired',result_json='{"message":"wake request expired"}' WHERE gateway_id=? AND status IN ('queued','claimed') AND expires_at<?`).bind(gateway.id, now).run();
    const requestRow = await env.DB.prepare(`SELECT r.*,p.mac_address,p.broadcast_address,p.wol_port,p.strategy,p.boot_timeout_seconds
      FROM device_wake_requests r JOIN device_wake_profiles p ON p.device_id=r.device_id
      WHERE r.gateway_id=? AND r.status='queued' AND r.expires_at>? ORDER BY r.requested_at ASC LIMIT 1`).bind(gateway.id, now).first();
    if (!requestRow) return json({ request:null }, 200, request, env);
    const claim = await env.DB.prepare(`UPDATE device_wake_requests SET status='claimed',claimed_at=? WHERE id=? AND status='queued'`).bind(now, requestRow.id).run();
    if (!claim.meta?.changes) return json({ request:null }, 200, request, env);
    return json({ request:{ id:requestRow.id, deviceId:requestRow.device_id, strategy:requestRow.strategy, macAddress:requestRow.mac_address,
      broadcastAddress:requestRow.broadcast_address, port:Number(requestRow.wol_port || 9), bootTimeoutSeconds:Number(requestRow.boot_timeout_seconds || 300), expiresAt:requestRow.expires_at } }, 200, request, env);
  }
  const resultMatch = path.match(/^\/api\/wake-agent\/requests\/([^/]+)\/result$/);
  if (resultMatch && request.method === 'POST') {
    const id = decodeURIComponent(resultMatch[1]); const body = await readJson(request); const now = nowIso();
    const row = await env.DB.prepare('SELECT * FROM device_wake_requests WHERE id=? AND gateway_id=?').bind(id, gateway.id).first();
    if (!row) return json({ error:'Wake 요청을 찾을 수 없습니다.' }, 404, request, env);
    const success = Boolean(body?.success); const result = JSON.stringify({ message:safeText(body?.message, 300), sentAt:now }).slice(0, 1000);
    await env.DB.prepare(`UPDATE device_wake_requests SET status=?,sent_at=?,result_json=? WHERE id=?`).bind(success ? 'sent' : 'failed', success ? now : null, result, id).run();
    return json({ ok:true, status:success ? 'sent' : 'failed' }, 200, request, env);
  }
  return json({ error:'Wake Gateway API 경로를 찾을 수 없습니다.' }, 404, request, env);
}

async function markOnlineRequests(env) {
  const rows = await env.DB.prepare(`SELECT r.id,r.device_id,r.requested_at,d.last_seen_at FROM device_wake_requests r
    JOIN device_registry d ON d.id=r.device_id WHERE r.status IN ('claimed','sent') ORDER BY r.requested_at ASC LIMIT 50`).all();
  const now = nowIso();
  for (const row of rows.results || []) {
    if (row.last_seen_at && Date.parse(row.last_seen_at) >= Date.parse(row.requested_at)) {
      await env.DB.prepare(`UPDATE device_wake_requests SET status='online',online_at=? WHERE id=? AND status IN ('claimed','sent')`).bind(now, row.id).run();
    }
  }
}

async function autoWakeQueuedJobs(env) {
  const groups = await env.DB.prepare(`SELECT DISTINCT target_group FROM device_jobs WHERE status='queued' ORDER BY priority DESC LIMIT 20`).all();
  for (const groupRow of groups.results || []) {
    const group = safeText(groupRow.target_group || 'general', 80);
    const candidates = await env.DB.prepare(`SELECT d.*,m.device_type,e.device_group,e.enabled AS execution_enabled,p.*
      FROM device_registry d
      JOIN device_execution_profiles e ON e.device_id=d.id
      LEFT JOIN device_management_profiles m ON m.device_id=d.id
      JOIN device_wake_profiles p ON p.device_id=d.id
      WHERE e.enabled=1 AND e.device_group=? AND p.enabled=1 AND p.auto_wake_for_jobs=1 AND d.revoked_at IS NULL`).bind(group).all();
    for (const row of candidates.results || []) {
      if (!desktopEligible(row)) continue;
      if (deviceOnline(row)) break;
      if (row.last_seen_at && Date.now() - Date.parse(row.last_seen_at) < DEVICE_WAKE_ELIGIBLE_AGE_MS) continue;
      const gateway = await env.DB.prepare('SELECT * FROM device_wake_gateways WHERE id=?').bind(row.gateway_id).first();
      if (gatewayStatus(gateway) !== 'online') continue;
      const pending = await env.DB.prepare(`SELECT id FROM device_wake_requests WHERE device_id=? AND status IN ('queued','claimed','sent') LIMIT 1`).bind(row.id).first();
      if (!pending) await queueWake(env, row.id, null, { reason:`queued-job:${group}`, continueJobs:Boolean(row.resume_jobs) });
      break;
    }
  }
}

export async function runWakeOrchestration(env) {
  if (!env?.DB?.prepare) return { status:'database_unavailable' };
  await ensureSchema(env.DB); const now = nowIso();
  await env.DB.prepare(`UPDATE device_wake_requests SET status='expired',result_json='{"message":"boot timeout"}' WHERE status IN ('queued','claimed','sent') AND expires_at<?`).bind(now).run();
  await markOnlineRequests(env);
  await autoWakeQueuedJobs(env);
  return { status:'ok', checkedAt:now };
}

export async function handleDeviceWakeControl(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ADMIN_PREFIX) && !path.startsWith(AGENT_PREFIX)) return null;
  if (!env.DB) return json({ error:'Wake Control 데이터베이스가 연결되지 않았습니다.' }, 503, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ 'cache-control':'no-store' } });
  await ensureSchema(env.DB);
  return path.startsWith(ADMIN_PREFIX) ? handleAdmin(request, env) : handleAgent(request, env);
}

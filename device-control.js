import authWorker from './auth-worker.js';

const ADMIN_PREFIX = '/api/control/devices';
const AGENT_PREFIX = '/api/device-agent';
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const DEVICE_ONLINE_MS = 90 * 1000;
const DEVICE_STALE_MS = 10 * 60 * 1000;
const COMMAND_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const COMMAND_TYPES = new Set([
  'power.always_on',
  'power.presentation',
  'power.normal',
  'power.restore',
  'lock.resume_off',
  'lock.resume_on',
  'autologon.open',
]);

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization,content-type,x-ekodi-device-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function json(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeaders(request, env),
    },
  });
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS device_enrollments (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by INTEGER,
      used_at TEXT,
      device_id TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_registry (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      platform TEXT NOT NULL,
      hostname TEXT NOT NULL DEFAULT '',
      os_version TEXT NOT NULL DEFAULT '',
      agent_version TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL UNIQUE,
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      settings_json TEXT NOT NULL DEFAULT '{}',
      last_seen_at TEXT,
      enrolled_at TEXT NOT NULL,
      enrolled_by INTEGER,
      revoked_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued',
      issued_at TEXT NOT NULL,
      issued_by INTEGER,
      claimed_at TEXT,
      completed_at TEXT,
      result_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (device_id) REFERENCES device_registry(id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_enrollments_expiry ON device_enrollments(expires_at, used_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_registry_last_seen ON device_registry(last_seen_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_commands_queue ON device_commands(device_id, status, issued_at)'),
  ]);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 16) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const sessionRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await authWorker.fetch(sessionRequest, env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function adminId(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session);
  await env.DB.prepare(`INSERT INTO audit_logs
    (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

function safeText(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function safeJsonObject(value, max = 8000, fallback = '{}') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const encoded = JSON.stringify(value);
  return encoded.length <= max ? encoded : fallback;
}

function statusFor(lastSeenAt, revokedAt) {
  if (revokedAt) return 'revoked';
  if (!lastSeenAt) return 'enrolled';
  const age = Date.now() - new Date(lastSeenAt).getTime();
  if (age <= DEVICE_ONLINE_MS) return 'online';
  if (age <= DEVICE_STALE_MS) return 'stale';
  return 'offline';
}

function serializeDevice(row) {
  return {
    id: row.id,
    label: row.label,
    platform: row.platform,
    hostname: row.hostname,
    osVersion: row.os_version,
    agentVersion: row.agent_version,
    capabilities: parseJson(row.capabilities_json),
    settings: parseJson(row.settings_json),
    lastSeenAt: row.last_seen_at,
    enrolledAt: row.enrolled_at,
    revokedAt: row.revoked_at,
    status: statusFor(row.last_seen_at, row.revoked_at),
  };
}

async function authenticateDevice(request, env) {
  const deviceId = safeText(request.headers.get('x-ekodi-device-id'), 100);
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!deviceId || !token) return null;
  const tokenHash = await sha256(token);
  const device = await env.DB.prepare(`SELECT * FROM device_registry
    WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`)
    .bind(deviceId, tokenHash).first();
  return device || null;
}

async function listDevices(env) {
  const [devices, commandRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM device_registry ORDER BY enrolled_at DESC').all(),
    env.DB.prepare(`SELECT id, device_id, command_type, status, issued_at, claimed_at, completed_at, result_json
      FROM device_commands ORDER BY issued_at DESC LIMIT 100`).all(),
  ]);
  const commandsByDevice = new Map();
  for (const command of commandRows.results || []) {
    if (!commandsByDevice.has(command.device_id)) commandsByDevice.set(command.device_id, []);
    const entries = commandsByDevice.get(command.device_id);
    if (entries.length < 5) entries.push({
      id: command.id,
      type: command.command_type,
      status: command.status,
      issuedAt: command.issued_at,
      claimedAt: command.claimed_at,
      completedAt: command.completed_at,
      result: parseJson(command.result_json),
    });
  }
  return (devices.results || []).map(row => ({
    ...serializeDevice(row),
    recentCommands: commandsByDevice.get(row.id) || [],
  }));
}

async function handleAdmin(request, env) {
  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  const path = new URL(request.url).pathname;

  if (request.method === 'GET' && path === ADMIN_PREFIX) {
    return json({ devices: await listDevices(env), generatedAt: new Date().toISOString() }, 200, request, env);
  }

  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/enrollment`) {
    const body = await readJson(request) || {};
    const label = safeText(body.label || '새 Windows PC', 80);
    const enrollmentCode = `EKD-${randomHex(10).toUpperCase()}`;
    const codeHash = await sha256(enrollmentCode);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ENROLLMENT_TTL_MS).toISOString();
    const actorId = await adminId(env, auth.session);
    await env.DB.prepare(`INSERT INTO device_enrollments
      (id, code_hash, expires_at, created_at, created_by)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(`enr_${crypto.randomUUID()}`, codeHash, expiresAt, now.toISOString(), actorId).run();
    await env.DB.prepare('DELETE FROM device_enrollments WHERE used_at IS NOT NULL OR expires_at < ?')
      .bind(new Date(Date.now() - 86400000).toISOString()).run();
    await audit(env, auth.session, 'device.enrollment.create', 'device', label);
    return json({ enrollmentCode, label, expiresAt }, 201, request, env);
  }

  const commandMatch = path.match(/^\/api\/control\/devices\/([^/]+)\/commands$/);
  if (request.method === 'POST' && commandMatch) {
    const deviceId = decodeURIComponent(commandMatch[1]);
    const body = await readJson(request) || {};
    const commandType = safeText(body.type, 80);
    if (!COMMAND_TYPES.has(commandType)) {
      return json({ error: '허용되지 않은 기기 명령입니다.', code: 'DEVICE_COMMAND_NOT_ALLOWED' }, 400, request, env);
    }
    const device = await env.DB.prepare('SELECT id, label, revoked_at FROM device_registry WHERE id = ?').bind(deviceId).first();
    if (!device || device.revoked_at) return json({ error: '사용 가능한 기기를 찾을 수 없습니다.' }, 404, request, env);
    const actorId = await adminId(env, auth.session);
    const commandId = `cmd_${crypto.randomUUID()}`;
    const issuedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO device_commands
      (id, device_id, command_type, payload_json, status, issued_at, issued_by)
      VALUES (?, ?, ?, '{}', 'queued', ?, ?)`)
      .bind(commandId, deviceId, commandType, issuedAt, actorId).run();
    await audit(env, auth.session, 'device.command.issue', deviceId, `${device.label}: ${commandType}`);
    return json({ command: { id: commandId, deviceId, type: commandType, status: 'queued', issuedAt } }, 202, request, env);
  }

  const revokeMatch = path.match(/^\/api\/control\/devices\/([^/]+)\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    const deviceId = decodeURIComponent(revokeMatch[1]);
    const now = new Date().toISOString();
    const result = await env.DB.prepare('UPDATE device_registry SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .bind(now, deviceId).run();
    if (!result.meta?.changes) return json({ error: '기기를 찾을 수 없거나 이미 해제되었습니다.' }, 404, request, env);
    await env.DB.prepare(`UPDATE device_commands SET status = 'cancelled', completed_at = ?
      WHERE device_id = ? AND status IN ('queued','claimed')`).bind(now, deviceId).run();
    await audit(env, auth.session, 'device.revoke', deviceId, 'device access revoked');
    return json({ ok: true, deviceId, revokedAt: now }, 200, request, env);
  }

  return json({ error: 'Device Control 관리자 API 경로를 찾을 수 없습니다.' }, 404, request, env);
}

async function enrollAgent(request, env) {
  const body = await readJson(request) || {};
  const code = safeText(body.enrollmentCode, 100);
  if (!code) return json({ error: '등록 코드가 필요합니다.' }, 400, request, env);
  const codeHash = await sha256(code);
  const enrollment = await env.DB.prepare(`SELECT * FROM device_enrollments
    WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(codeHash, new Date().toISOString()).first();
  if (!enrollment) return json({ error: '등록 코드가 유효하지 않거나 만료되었습니다.', code: 'ENROLLMENT_INVALID' }, 401, request, env);

  const platform = safeText(body.platform || 'windows', 40).toLowerCase();
  if (platform !== 'windows') return json({ error: '현재 MVP는 Windows Agent만 등록할 수 있습니다.' }, 400, request, env);
  const hostname = safeText(body.hostname, 120);
  const label = safeText(body.label || hostname || 'Windows PC', 80);
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const deviceId = `dev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const capabilities = safeJsonObject(body.capabilities, 4000);
  const agentVersion = safeText(body.agentVersion || '1.0.0', 40);
  const osVersion = safeText(body.osVersion, 120);

  const claim = await env.DB.prepare(`UPDATE device_enrollments
    SET used_at = ?, device_id = ?
    WHERE id = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(now, deviceId, enrollment.id, now).run();
  if (!claim.meta?.changes) {
    return json({ error: '등록 코드가 이미 사용되었거나 만료되었습니다.', code: 'ENROLLMENT_ALREADY_CLAIMED' }, 409, request, env);
  }

  try {
    await env.DB.prepare(`INSERT INTO device_registry
      (id, label, platform, hostname, os_version, agent_version, token_hash, capabilities_json, settings_json, last_seen_at, enrolled_at, enrolled_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`)
      .bind(deviceId, label, platform, hostname, osVersion, agentVersion, tokenHash, capabilities, now, now, enrollment.created_by).run();
  } catch (error) {
    console.error('Device enrollment registry insert failed', error);
    return json({ error: '기기 등록 저장에 실패했습니다. 새 등록 코드를 발급해 주세요.', code: 'DEVICE_ENROLLMENT_STORE_FAILED' }, 500, request, env);
  }

  return json({ deviceId, deviceToken: token, label, apiBase: new URL(request.url).origin }, 201, request, env);
}

async function heartbeat(request, env, device) {
  const body = await readJson(request) || {};
  const now = new Date().toISOString();
  const capabilities = body.capabilities && typeof body.capabilities === 'object'
    ? safeJsonObject(body.capabilities, 4000, device.capabilities_json)
    : device.capabilities_json;
  const settings = body.settings && typeof body.settings === 'object'
    ? safeJsonObject(body.settings, 8000, device.settings_json)
    : device.settings_json;
  await env.DB.prepare(`UPDATE device_registry
    SET hostname = ?, os_version = ?, agent_version = ?, capabilities_json = ?, settings_json = ?, last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL`)
    .bind(
      safeText(body.hostname || device.hostname, 120),
      safeText(body.osVersion || device.os_version, 120),
      safeText(body.agentVersion || device.agent_version, 40),
      capabilities,
      settings,
      now,
      device.id,
    ).run();
  return json({ ok: true, serverTime: now }, 200, request, env);
}

async function nextCommand(request, env, device) {
  const staleClaim = new Date(Date.now() - COMMAND_CLAIM_TIMEOUT_MS).toISOString();
  await env.DB.prepare(`UPDATE device_commands
    SET status = 'queued', claimed_at = NULL
    WHERE device_id = ? AND status = 'claimed' AND claimed_at < ?`)
    .bind(device.id, staleClaim).run();

  const command = await env.DB.prepare(`SELECT * FROM device_commands
    WHERE device_id = ? AND status = 'queued'
    ORDER BY issued_at ASC LIMIT 1`).bind(device.id).first();
  if (!command) return json({ command: null }, 200, request, env);
  const claimedAt = new Date().toISOString();
  const claim = await env.DB.prepare(`UPDATE device_commands SET status = 'claimed', claimed_at = ?
    WHERE id = ? AND status = 'queued'`).bind(claimedAt, command.id).run();
  if (!claim.meta?.changes) return json({ command: null }, 200, request, env);
  return json({
    command: {
      id: command.id,
      type: command.command_type,
      payload: parseJson(command.payload_json),
      issuedAt: command.issued_at,
      claimedAt,
    },
  }, 200, request, env);
}

async function commandResult(request, env, device, commandId) {
  const body = await readJson(request) || {};
  const success = body.success === true;
  const status = success ? 'succeeded' : 'failed';
  const completedAt = new Date().toISOString();
  const result = body.result && typeof body.result === 'object'
    ? parseJson(safeJsonObject(body.result, 8000), {})
    : { message: safeText(body.message, 300) };
  const update = await env.DB.prepare(`UPDATE device_commands
    SET status = ?, completed_at = ?, result_json = ?
    WHERE id = ? AND device_id = ? AND status = 'claimed'`)
    .bind(status, completedAt, JSON.stringify(result), commandId, device.id).run();
  if (!update.meta?.changes) return json({ error: '처리 중인 명령을 찾을 수 없습니다.' }, 404, request, env);
  return json({ ok: true, commandId, status, completedAt }, 200, request, env);
}

async function handleAgent(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === `${AGENT_PREFIX}/enroll`) return enrollAgent(request, env);

  const device = await authenticateDevice(request, env);
  if (!device) return json({ error: '기기 인증에 실패했습니다.', code: 'DEVICE_AUTH_REQUIRED' }, 401, request, env);

  if (request.method === 'POST' && path === `${AGENT_PREFIX}/heartbeat`) return heartbeat(request, env, device);
  if (request.method === 'GET' && path === `${AGENT_PREFIX}/commands/next`) return nextCommand(request, env, device);

  const resultMatch = path.match(/^\/api\/device-agent\/commands\/([^/]+)\/result$/);
  if (request.method === 'POST' && resultMatch) {
    return commandResult(request, env, device, decodeURIComponent(resultMatch[1]));
  }
  return json({ error: 'Device Agent API 경로를 찾을 수 없습니다.' }, 404, request, env);
}

export async function handleDeviceControl(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ADMIN_PREFIX) && !path.startsWith(AGENT_PREFIX)) return null;
  if (!env.DB) return json({ error: 'Device Control 데이터베이스가 연결되지 않았습니다.' }, 503, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  await ensureSchema(env.DB);
  if (path.startsWith(ADMIN_PREFIX)) return handleAdmin(request, env);
  return handleAgent(request, env);
}

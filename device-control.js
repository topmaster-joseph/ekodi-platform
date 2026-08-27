import authWorker from './auth-worker.js';

const ADMIN_PREFIX = '/api/control/devices';
const AGENT_PREFIX = '/api/device-agent';
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const DEVICE_ONLINE_MS = 90 * 1000;
const DEVICE_STALE_MS = 10 * 60 * 1000;
const COMMAND_CLAIM_TIMEOUT_MS = 60 * 60 * 1000;
const JOB_ASSIGNMENT_TIMEOUT_MS = 65 * 60 * 1000;

const COMMAND_POLICIES = Object.freeze({
  'power.always_on': { risk: 'maintain' },
  'power.presentation': { risk: 'maintain' },
  'power.normal': { risk: 'maintain' },
  'power.restore': { risk: 'maintain' },
  'lock.resume_off': { risk: 'maintain' },
  'lock.resume_on': { risk: 'maintain' },
  'autologon.open': { risk: 'privileged', confirm: true },
  'diagnostics.collect': { risk: 'observe' },
  'network.diagnose': { risk: 'observe' },
  'printers.diagnose': { risk: 'observe' },
  'startup.scan': { risk: 'observe' },
  'startup.disable': { risk: 'maintain', confirm: true, payload: 'startup-item' },
  'startup.restore': { risk: 'maintain', confirm: true, payload: 'startup-item' },
  'maintenance.temp_cleanup': { risk: 'maintain', confirm: true },
  'updates.scan': { risk: 'observe' },
  'updates.install': { risk: 'privileged', confirm: true },
  'profile.workstation.apply': { risk: 'maintain', confirm: true },
  'profile.workstation.restore': { risk: 'maintain', confirm: true },
  'agent.self_update': { risk: 'maintain', confirm: true },
});

const DIAGNOSTIC_SECTIONS = Object.freeze({
  'network.diagnose': 'network',
  'printers.diagnose': 'printers',
  'startup.scan': 'startup',
  'updates.scan': 'updates',
});

const COMMAND_CAPABILITIES = Object.freeze({
  'diagnostics.collect': 'diagnostics',
  'network.diagnose': 'networkDiagnostics',
  'printers.diagnose': 'printerDiagnostics',
  'startup.scan': 'startupManagement',
  'maintenance.temp_cleanup': 'storageMaintenance',
  'updates.scan': 'windowsUpdate',
  'updates.install': 'windowsUpdate',
  'profile.workstation.apply': 'workstationProfile',
  'profile.workstation.restore': 'workstationProfile',
});

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
      diagnostics_json TEXT NOT NULL DEFAULT '{}',
      diagnostics_at TEXT,
      profile_name TEXT NOT NULL DEFAULT '',
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
    db.prepare(`CREATE TABLE IF NOT EXISTS device_execution_profiles (
      device_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      device_group TEXT NOT NULL DEFAULT 'general',
      max_concurrency INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by INTEGER,
      FOREIGN KEY (device_id) REFERENCES device_registry(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS device_jobs (
      id TEXT PRIMARY KEY,
      command_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      tenant_id TEXT NOT NULL DEFAULT '',
      target_group TEXT NOT NULL DEFAULT 'general',
      priority INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'queued',
      requested_at TEXT NOT NULL,
      requested_by INTEGER,
      assigned_device_id TEXT,
      assigned_command_id TEXT,
      assigned_at TEXT,
      completed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_enrollments_expiry ON device_enrollments(expires_at, used_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_registry_last_seen ON device_registry(last_seen_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_commands_queue ON device_commands(device_id, status, issued_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_device_jobs_queue ON device_jobs(status, priority DESC, requested_at)'),
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
  try { return await request.json(); } catch { return null; }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
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

function sanitizeCommandPayload(type, rawPayload) {
  const policy = COMMAND_POLICIES[type];
  if (!policy?.payload) return {};
  if (policy.payload === 'startup-item') {
    const itemId = safeText(rawPayload?.itemId, 80).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(itemId)) throw new Error('STARTUP_ITEM_INVALID');
    return { itemId };
  }
  return {};
}

function statusFor(lastSeenAt, revokedAt) {
  if (revokedAt) return 'revoked';
  if (!lastSeenAt) return 'enrolled';
  const age = Date.now() - new Date(lastSeenAt).getTime();
  if (age <= DEVICE_ONLINE_MS) return 'online';
  if (age <= DEVICE_STALE_MS) return 'stale';
  return 'offline';
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deviceHealth(settings = {}, diagnostics = {}) {
  const light = settings.health || {};
  const system = diagnostics.system || light.system || {};
  const storage = diagnostics.storage || light.storage || {};
  const network = diagnostics.network || {};
  const printers = diagnostics.printers || {};
  const startup = diagnostics.startup || {};
  const updates = diagnostics.updates || {};
  let score = 100;
  const recommendations = [];

  const cpu = numberOrNull(system.cpuLoadPct);
  const memory = numberOrNull(system.memoryUsedPct);
  const volumes = Array.isArray(storage.volumes) ? storage.volumes : [];
  const freeValues = volumes.map(volume => numberOrNull(volume.freePct)).filter(value => value !== null);
  const minFree = freeValues.length ? Math.min(...freeValues) : null;
  const pending = numberOrNull(updates.pendingCount) || 0;
  const startupCount = numberOrNull(startup.count) || 0;
  const printerIssues = numberOrNull(printers.issueCount) || 0;

  if (cpu !== null && cpu >= 90) score -= 15;
  else if (cpu !== null && cpu >= 75) score -= 7;
  if (memory !== null && memory >= 90) score -= 20;
  else if (memory !== null && memory >= 80) score -= 10;
  if (minFree !== null && minFree <= 10) score -= 25;
  else if (minFree !== null && minFree <= 20) score -= 10;
  if (network.apiReachable === false || network.dnsOk === false) score -= 20;
  if (printerIssues > 0) score -= Math.min(10, printerIssues * 3);
  if (pending > 0) score -= Math.min(15, pending * 2);

  if (minFree !== null && minFree <= 20) recommendations.push({
    level: minFree <= 10 ? 'high' : 'medium',
    title: '저장공간 정리가 필요합니다.',
    detail: `가장 여유가 적은 드라이브의 남은 공간이 ${Math.round(minFree)}%입니다.`,
    action: 'maintenance.temp_cleanup',
  });
  if (memory !== null && memory >= 80) recommendations.push({
    level: memory >= 90 ? 'high' : 'medium',
    title: '메모리 사용량이 높습니다.',
    detail: `현재 메모리 사용률이 약 ${Math.round(memory)}%입니다. 전체 진단으로 원인을 더 확인하세요.`,
    action: 'diagnostics.collect',
  });
  if (pending > 0) recommendations.push({
    level: 'medium',
    title: 'Windows 업데이트가 대기 중입니다.',
    detail: `${pending}개의 소프트웨어 업데이트가 확인되었습니다. 자동 재부팅 없이 설치할 수 있습니다.`,
    action: 'updates.install',
  });
  if (startupCount >= 12) recommendations.push({
    level: 'low',
    title: '시작 프로그램이 많습니다.',
    detail: `${startupCount}개의 시작 항목이 감지되었습니다. 필요한 항목만 남길 수 있습니다.`,
    action: 'startup.scan',
  });
  if (network.apiReachable === false || network.dnsOk === false) recommendations.push({
    level: 'high',
    title: '네트워크 연결을 점검해야 합니다.',
    detail: 'DNS 또는 EKODI API 연결 확인에 실패했습니다.',
    action: 'network.diagnose',
  });
  if (printerIssues > 0) recommendations.push({
    level: 'medium',
    title: '프린터 상태 확인이 필요합니다.',
    detail: `${printerIssues}개의 프린터 또는 인쇄 대기열 문제가 감지되었습니다.`,
    action: 'printers.diagnose',
  });
  if (settings.protocolRegistered === false) recommendations.push({
    level: 'low',
    title: '원클릭 PC 연결 기능을 업데이트할 수 있습니다.',
    detail: 'EKODI 전용 연결 프로토콜이 아직 등록되지 않았습니다.',
    action: 'agent.self_update',
  });

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    label: score >= 90 ? '좋음' : score >= 75 ? '관찰' : score >= 55 ? '주의' : '점검 필요',
    recommendations: recommendations.slice(0, 6),
  };
}

function summarizeCommandResult(result = {}) {
  const summary = {};
  for (const key of ['message', 'freedMB', 'pendingCount', 'installedCount', 'failedCount', 'rebootRequired', 'profile']) {
    if (result[key] !== undefined) summary[key] = result[key];
  }
  return summary;
}

function serializeDevice(row) {
  const settings = parseJson(row.settings_json);
  const diagnostics = parseJson(row.diagnostics_json);
  return {
    id: row.id,
    label: row.label,
    platform: row.platform,
    hostname: row.hostname,
    osVersion: row.os_version,
    agentVersion: row.agent_version,
    capabilities: parseJson(row.capabilities_json),
    settings,
    diagnostics,
    diagnosticsAt: row.diagnostics_at,
    profileName: row.profile_name || '',
    health: deviceHealth(settings, diagnostics),
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
  return await env.DB.prepare(`SELECT * FROM device_registry
    WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`)
    .bind(deviceId, tokenHash).first() || null;
}

async function listDevices(env) {
  const [devices, commandRows, profiles] = await Promise.all([
    env.DB.prepare('SELECT * FROM device_registry ORDER BY enrolled_at DESC').all(),
    env.DB.prepare(`SELECT id, device_id, command_type, status, issued_at, claimed_at, completed_at, result_json
      FROM device_commands ORDER BY issued_at DESC LIMIT 120`).all(),
    env.DB.prepare('SELECT * FROM device_execution_profiles').all(),
  ]);
  const profileByDevice = new Map((profiles.results || []).map(row => [row.device_id, row]));
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
      result: summarizeCommandResult(parseJson(command.result_json)),
    });
  }
  return (devices.results || []).map(row => {
    const profile = profileByDevice.get(row.id);
    return {
      ...serializeDevice(row),
      execution: {
        enabled: profile?.enabled === 1,
        group: profile?.device_group || 'general',
        maxConcurrency: profile?.max_concurrency || 1,
      },
      recentCommands: commandsByDevice.get(row.id) || [],
    };
  });
}

async function listJobs(env) {
  const rows = await env.DB.prepare(`SELECT id, command_type, tenant_id, target_group, priority, status,
    requested_at, assigned_device_id, assigned_at, completed_at, attempts, last_error
    FROM device_jobs ORDER BY requested_at DESC LIMIT 100`).all();
  return (rows.results || []).map(row => ({
    id: row.id, type: row.command_type, tenantId: row.tenant_id, targetGroup: row.target_group,
    priority: row.priority, status: row.status, requestedAt: row.requested_at,
    assignedDeviceId: row.assigned_device_id, assignedAt: row.assigned_at,
    completedAt: row.completed_at, attempts: row.attempts, lastError: row.last_error,
  }));
}

async function reconcileJobs(env) {
  const timeout = new Date(Date.now() - JOB_ASSIGNMENT_TIMEOUT_MS).toISOString();
  await env.DB.prepare(`UPDATE device_jobs SET status = 'queued', assigned_device_id = NULL,
    assigned_command_id = NULL, assigned_at = NULL, last_error = '기기 응답 시간 초과로 재배정'
    WHERE status = 'assigned' AND assigned_at < ? AND attempts < 3`).bind(timeout).run();
  await env.DB.prepare(`UPDATE device_jobs SET status = 'failed', completed_at = ?, last_error = '최대 재시도 횟수 초과'
    WHERE status = 'assigned' AND assigned_at < ? AND attempts >= 3`).bind(new Date().toISOString(), timeout).run();

  const jobs = await env.DB.prepare(`SELECT * FROM device_jobs WHERE status = 'queued'
    ORDER BY priority DESC, requested_at ASC LIMIT 20`).all();
  for (const job of jobs.results || []) {
    const requiredCapability = COMMAND_CAPABILITIES[job.command_type] || '';
    const candidates = await env.DB.prepare(`SELECT r.*, p.device_group, p.max_concurrency,
      (SELECT COUNT(*) FROM device_commands c WHERE c.device_id = r.id AND c.status IN ('queued','claimed')) AS active_count
      FROM device_registry r JOIN device_execution_profiles p ON p.device_id = r.id
      WHERE r.revoked_at IS NULL AND p.enabled = 1 AND p.device_group = ? AND r.last_seen_at >= ?
      ORDER BY active_count ASC, r.last_seen_at DESC`)
      .bind(job.target_group, new Date(Date.now() - DEVICE_ONLINE_MS).toISOString()).all();
    const device = (candidates.results || []).find(row => {
      const capabilities = parseJson(row.capabilities_json);
      const system = parseJson(row.settings_json)?.health?.system || {};
      return Number(row.active_count || 0) < Number(row.max_concurrency || 1)
        && system.autoExecutionEligible === true
        && system.isPortable === false
        && (!requiredCapability || capabilities[requiredCapability] === true);
    });
    if (!device) continue;
    const now = new Date().toISOString();
    const commandId = `cmd_${crypto.randomUUID()}`;
    const claim = await env.DB.prepare(`UPDATE device_jobs SET status = 'assigned', assigned_device_id = ?,
      assigned_command_id = ?, assigned_at = ?, attempts = attempts + 1
      WHERE id = ? AND status = 'queued'`).bind(device.id, commandId, now, job.id).run();
    if (!claim.meta?.changes) continue;
    await env.DB.prepare(`INSERT INTO device_commands
      (id, device_id, command_type, payload_json, status, issued_at, issued_by)
      VALUES (?, ?, ?, ?, 'queued', ?, ?)`)
      .bind(commandId, device.id, job.command_type, job.payload_json, now, job.requested_by).run();
  }
}

async function handleAdmin(request, env) {
  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  const path = new URL(request.url).pathname;

  if (request.method === 'GET' && path === ADMIN_PREFIX) {
    await reconcileJobs(env);
    return json({ devices: await listDevices(env), jobs: await listJobs(env), generatedAt: new Date().toISOString() }, 200, request, env);
  }

  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/jobs`) {
    const body = await readJson(request) || {};
    const commandType = safeText(body.type, 80);
    const policy = COMMAND_POLICIES[commandType];
    if (!policy) return json({ error: '자동 배정할 수 없는 작업입니다.', code: 'DEVICE_JOB_NOT_ALLOWED' }, 400, request, env);
    if (policy.confirm && body.confirmed !== true) return json({ error: '이 작업은 관리자 확인이 필요합니다.', code: 'DEVICE_JOB_CONFIRM_REQUIRED' }, 409, request, env);
    let payload = {};
    try { payload = sanitizeCommandPayload(commandType, body.payload || {}); }
    catch { return json({ error: '작업 인자가 유효하지 않습니다.', code: 'DEVICE_JOB_PAYLOAD_INVALID' }, 400, request, env); }
    const targetGroup = safeText(body.targetGroup || 'general', 60).toLowerCase();
    const tenantId = safeText(body.tenantId, 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(targetGroup)) return json({ error: '기기 그룹이 유효하지 않습니다.' }, 400, request, env);
    const priority = Math.max(1, Math.min(100, Number(body.priority) || 50));
    const actorId = await adminId(env, auth.session);
    const jobId = `job_${crypto.randomUUID()}`;
    const requestedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO device_jobs
      (id, command_type, payload_json, tenant_id, target_group, priority, status, requested_at, requested_by)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
      .bind(jobId, commandType, JSON.stringify(payload), tenantId, targetGroup, priority, requestedAt, actorId).run();
    await audit(env, auth.session, 'device.job.create', jobId, `${commandType} → ${targetGroup} [${policy.risk}]`);
    await reconcileJobs(env);
    return json({ job: { id: jobId, type: commandType, targetGroup, priority, status: 'queued', requestedAt } }, 202, request, env);
  }

  const policyMatch = path.match(/^\/api\/control\/devices\/([^/]+)\/execution-policy$/);
  if (request.method === 'POST' && policyMatch) {
    const deviceId = decodeURIComponent(policyMatch[1]);
    const body = await readJson(request) || {};
    if (body.confirmed !== true) return json({ error: '실행 정책 변경은 관리자 확인이 필요합니다.' }, 409, request, env);
    const device = await env.DB.prepare('SELECT id, label FROM device_registry WHERE id = ? AND revoked_at IS NULL').bind(deviceId).first();
    if (!device) return json({ error: '기기를 찾을 수 없습니다.' }, 404, request, env);
    const enabled = body.enabled === true ? 1 : 0;
    if (enabled) {
      const eligibility = await env.DB.prepare('SELECT settings_json FROM device_registry WHERE id = ?').bind(deviceId).first();
      const system = parseJson(eligibility?.settings_json)?.health?.system || {};
      if (system.autoExecutionEligible !== true || system.isPortable !== false) {
        return json({ error: '노트북·휴대형 기기 또는 유형을 확인하지 못한 기기는 자동 작업 노드로 사용할 수 없습니다.', code: 'PORTABLE_DEVICE_NOT_ELIGIBLE' }, 409, request, env);
      }
    }
    const group = safeText(body.group || 'general', 60).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(group)) return json({ error: '기기 그룹이 유효하지 않습니다.' }, 400, request, env);
    const maxConcurrency = Math.max(1, Math.min(4, Number(body.maxConcurrency) || 1));
    const now = new Date().toISOString();
    const actorId = await adminId(env, auth.session);
    await env.DB.prepare(`INSERT INTO device_execution_profiles
      (device_id, enabled, device_group, max_concurrency, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET enabled=excluded.enabled, device_group=excluded.device_group,
      max_concurrency=excluded.max_concurrency, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .bind(deviceId, enabled, group, maxConcurrency, now, actorId).run();
    await audit(env, auth.session, 'device.execution.policy', deviceId, `${device.label}: ${enabled ? 'enabled' : 'disabled'} / ${group} / ${maxConcurrency}`);
    return json({ ok: true, deviceId, execution: { enabled: Boolean(enabled), group, maxConcurrency } }, 200, request, env);
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
    return json({ enrollmentCode, label, expiresAt, protocolUrl: `ekodi-device://enroll?code=${encodeURIComponent(enrollmentCode)}` }, 201, request, env);
  }

  const commandMatch = path.match(/^\/api\/control\/devices\/([^/]+)\/commands$/);
  if (request.method === 'POST' && commandMatch) {
    const deviceId = decodeURIComponent(commandMatch[1]);
    const body = await readJson(request) || {};
    const commandType = safeText(body.type, 80);
    const policy = COMMAND_POLICIES[commandType];
    if (!policy) return json({ error: '허용되지 않은 기기 명령입니다.', code: 'DEVICE_COMMAND_NOT_ALLOWED' }, 400, request, env);
    if (policy.confirm && body.confirmed !== true) {
      return json({ error: '이 작업은 관리자 확인이 필요합니다.', code: 'DEVICE_COMMAND_CONFIRM_REQUIRED' }, 409, request, env);
    }
    let payload = {};
    try { payload = sanitizeCommandPayload(commandType, body.payload || {}); }
    catch { return json({ error: '기기 명령 인자가 유효하지 않습니다.', code: 'DEVICE_COMMAND_PAYLOAD_INVALID' }, 400, request, env); }

    const device = await env.DB.prepare('SELECT id, label, revoked_at FROM device_registry WHERE id = ?').bind(deviceId).first();
    if (!device || device.revoked_at) return json({ error: '사용 가능한 기기를 찾을 수 없습니다.' }, 404, request, env);
    const actorId = await adminId(env, auth.session);
    const commandId = `cmd_${crypto.randomUUID()}`;
    const issuedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO device_commands
      (id, device_id, command_type, payload_json, status, issued_at, issued_by)
      VALUES (?, ?, ?, ?, 'queued', ?, ?)`)
      .bind(commandId, deviceId, commandType, JSON.stringify(payload), issuedAt, actorId).run();
    await audit(env, auth.session, 'device.command.issue', deviceId, `${device.label}: ${commandType} [${policy.risk}]`);
    return json({ command: { id: commandId, deviceId, type: commandType, risk: policy.risk, status: 'queued', issuedAt } }, 202, request, env);
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
  if (platform !== 'windows') return json({ error: '현재 버전은 Windows Agent만 등록할 수 있습니다.' }, 400, request, env);
  const hostname = safeText(body.hostname, 120);
  const label = safeText(body.label || hostname || 'Windows PC', 80);
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const deviceId = `dev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const capabilities = safeJsonObject(body.capabilities, 5000);
  const agentVersion = safeText(body.agentVersion || '2.0.0', 40);
  const osVersion = safeText(body.osVersion, 120);

  const claim = await env.DB.prepare(`UPDATE device_enrollments
    SET used_at = ?, device_id = ?
    WHERE id = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(now, deviceId, enrollment.id, now).run();
  if (!claim.meta?.changes) return json({ error: '등록 코드가 이미 사용되었거나 만료되었습니다.', code: 'ENROLLMENT_ALREADY_CLAIMED' }, 409, request, env);

  try {
    await env.DB.prepare(`INSERT INTO device_registry
      (id, label, platform, hostname, os_version, agent_version, token_hash, capabilities_json, settings_json, diagnostics_json, profile_name, last_seen_at, enrolled_at, enrolled_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', '', ?, ?, ?)`)
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
    ? safeJsonObject(body.capabilities, 5000, device.capabilities_json)
    : device.capabilities_json;
  const settings = body.settings && typeof body.settings === 'object'
    ? safeJsonObject(body.settings, 10000, device.settings_json)
    : device.settings_json;
  const profileName = safeText(body.profileName || parseJson(settings).workstationProfile || device.profile_name, 80);
  await env.DB.prepare(`UPDATE device_registry
    SET hostname = ?, os_version = ?, agent_version = ?, capabilities_json = ?, settings_json = ?, profile_name = ?, last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL`)
    .bind(
      safeText(body.hostname || device.hostname, 120),
      safeText(body.osVersion || device.os_version, 120),
      safeText(body.agentVersion || device.agent_version, 40),
      capabilities,
      settings,
      profileName,
      now,
      device.id,
    ).run();
  return json({ ok: true, serverTime: now }, 200, request, env);
}

async function nextCommand(request, env, device) {
  await reconcileJobs(env);
  const staleClaim = new Date(Date.now() - COMMAND_CLAIM_TIMEOUT_MS).toISOString();
  await env.DB.prepare(`UPDATE device_commands SET status = 'queued', claimed_at = NULL
    WHERE device_id = ? AND status = 'claimed' AND claimed_at < ?`).bind(device.id, staleClaim).run();
  const command = await env.DB.prepare(`SELECT * FROM device_commands
    WHERE device_id = ? AND status = 'queued' ORDER BY issued_at ASC LIMIT 1`).bind(device.id).first();
  if (!command) return json({ command: null }, 200, request, env);
  const claimedAt = new Date().toISOString();
  const claim = await env.DB.prepare(`UPDATE device_commands SET status = 'claimed', claimed_at = ?
    WHERE id = ? AND status = 'queued'`).bind(claimedAt, command.id).run();
  if (!claim.meta?.changes) return json({ command: null }, 200, request, env);
  return json({ command: {
    id: command.id,
    type: command.command_type,
    payload: parseJson(command.payload_json),
    issuedAt: command.issued_at,
    claimedAt,
  } }, 200, request, env);
}

function mergeDiagnosticResult(device, commandType, result) {
  if (commandType === 'diagnostics.collect' && result.diagnostics && typeof result.diagnostics === 'object') {
    return result.diagnostics;
  }
  const current = parseJson(device.diagnostics_json);
  const section = DIAGNOSTIC_SECTIONS[commandType];
  if (section && result[section] && typeof result[section] === 'object') current[section] = result[section];
  if (result.storage && typeof result.storage === 'object') current.storage = result.storage;
  if (result.system && typeof result.system === 'object') current.system = result.system;
  current.generatedAt = new Date().toISOString();
  return current;
}

async function commandResult(request, env, device, commandId) {
  const command = await env.DB.prepare(`SELECT command_type FROM device_commands
    WHERE id = ? AND device_id = ? AND status = 'claimed'`).bind(commandId, device.id).first();
  if (!command) return json({ error: '처리 중인 명령을 찾을 수 없습니다.' }, 404, request, env);

  const body = await readJson(request) || {};
  const success = body.success === true;
  const status = success ? 'succeeded' : 'failed';
  const completedAt = new Date().toISOString();
  const result = body.result && typeof body.result === 'object'
    ? parseJson(safeJsonObject(body.result, 24000), {})
    : { message: safeText(body.message, 300) };
  const update = await env.DB.prepare(`UPDATE device_commands
    SET status = ?, completed_at = ?, result_json = ?
    WHERE id = ? AND device_id = ? AND status = 'claimed'`)
    .bind(status, completedAt, safeJsonObject(result, 24000), commandId, device.id).run();
  if (!update.meta?.changes) return json({ error: '처리 중인 명령을 찾을 수 없습니다.' }, 404, request, env);

  if (success) {
    const diagnostics = mergeDiagnosticResult(device, command.command_type, result);
    const diagnosticsJson = safeJsonObject(diagnostics, 30000, device.diagnostics_json || '{}');
    const settingsJson = result.settings && typeof result.settings === 'object'
      ? safeJsonObject(result.settings, 10000, device.settings_json || '{}')
      : device.settings_json;
    const profileName = safeText(result.profile || result.settings?.workstationProfile || device.profile_name, 80);
    await env.DB.prepare(`UPDATE device_registry
      SET diagnostics_json = ?, diagnostics_at = ?, settings_json = ?, profile_name = ?
      WHERE id = ? AND revoked_at IS NULL`)
      .bind(diagnosticsJson, completedAt, settingsJson, profileName, device.id).run();
  }
  const job = await env.DB.prepare('SELECT id, attempts FROM device_jobs WHERE assigned_command_id = ?').bind(commandId).first();
  if (job) {
    if (success) {
      await env.DB.prepare(`UPDATE device_jobs SET status = 'succeeded', completed_at = ?, last_error = '' WHERE id = ?`)
        .bind(completedAt, job.id).run();
    } else if (Number(job.attempts || 0) < 3) {
      await env.DB.prepare(`UPDATE device_jobs SET status = 'queued', assigned_device_id = NULL,
        assigned_command_id = NULL, assigned_at = NULL, last_error = ? WHERE id = ?`)
        .bind(safeText(result.message || '기기 작업 실패로 재배정', 300), job.id).run();
    } else {
      await env.DB.prepare(`UPDATE device_jobs SET status = 'failed', completed_at = ?, last_error = ? WHERE id = ?`)
        .bind(completedAt, safeText(result.message || '기기 작업 실패', 300), job.id).run();
    }
  }
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
  if (request.method === 'POST' && resultMatch) return commandResult(request, env, device, decodeURIComponent(resultMatch[1]));
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

import authWorker from './auth-worker.js';

const ADMIN_PREFIX = '/api/control/hybrid-execution';
const AGENT_NEXT_PATH = '/api/device-agent/commands/next';
const ONLINE_MS = 90 * 1000;
const ASSIGNMENT_MS = 2 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_PAYLOAD_BYTES = 16 * 1024;

const TASK_POLICIES = Object.freeze({
  'power.always_on': { capability:'powerProfiles', risk:'maintain' },
  'power.presentation': { capability:'powerProfiles', risk:'maintain' },
  'power.normal': { capability:'powerProfiles', risk:'maintain' },
  'power.restore': { capability:'restore', risk:'maintain' },
  'lock.resume_off': { capability:'resumeLock', risk:'maintain' },
  'lock.resume_on': { capability:'resumeLock', risk:'maintain' },
  'autologon.open': { capability:'autologonLocalConsent', risk:'privileged', confirm:true },
  'diagnostics.collect': { capability:'diagnostics', risk:'observe' },
  'network.diagnose': { capability:'networkDiagnostics', risk:'observe' },
  'printers.diagnose': { capability:'printerDiagnostics', risk:'observe' },
  'startup.scan': { capability:'startupManagement', risk:'observe' },
  'startup.disable': { capability:'startupManagement', risk:'maintain', confirm:true, payload:'startup-item' },
  'startup.restore': { capability:'startupManagement', risk:'maintain', confirm:true, payload:'startup-item' },
  'maintenance.temp_cleanup': { capability:'storageMaintenance', risk:'maintain', confirm:true },
  'updates.scan': { capability:'windowsUpdate', risk:'observe' },
  'updates.install': { capability:'windowsUpdate', risk:'privileged', confirm:true },
  'profile.workstation.apply': { capability:'workstationProfile', risk:'maintain', confirm:true },
  'profile.workstation.restore': { capability:'workstationProfile', risk:'maintain', confirm:true },
  'agent.self_update': { capability:'protocolLaunch', risk:'maintain', confirm:true },
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });
}

function safeText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function safeJson(value, max = MAX_PAYLOAD_BYTES, fallback = '{}') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const encoded = JSON.stringify(value);
  return encoded.length <= max ? encoded : fallback;
}

function safeGroup(value) {
  const group = safeText(value || 'default', 64).toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(group) ? group : 'default';
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function sanitizeCapabilities(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(item => safeText(item, 48)).filter(item => /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(item)))].slice(0, 20);
}

function sanitizePayload(type, rawPayload) {
  const policy = TASK_POLICIES[type];
  if (!policy) throw new Error('TASK_NOT_ALLOWED');
  if (!policy.payload) return {};
  if (policy.payload === 'startup-item') {
    const itemId = safeText(rawPayload?.itemId, 80).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(itemId)) throw new Error('PAYLOAD_INVALID');
    return { itemId };
  }
  return {};
}

function capabilitiesObject(row) {
  const value = parseJson(row?.capabilities_json, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function currentLoad(row) {
  const settings = parseJson(row?.settings_json, {});
  const system = settings?.health?.system || {};
  const cpu = Number(system.cpuLoadPct);
  const memory = Number(system.memoryUsedPct);
  const samples = [cpu, memory].filter(Number.isFinite).map(n => Math.max(0, Math.min(100, n)));
  return samples.length ? Math.round(Math.max(...samples)) : 0;
}

function nodeSupports(node, job) {
  const caps = parseJson(node.capabilities_json, {});
  const required = new Set([
    TASK_POLICIES[job.task_type]?.capability,
    ...sanitizeCapabilities(parseJson(job.required_capabilities_json, [])),
  ].filter(Boolean));
  return [...required].every(cap => caps?.[cap] === true);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

async function adminId(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  try {
    const id = await adminId(env, session);
    await env.DB.prepare(`INSERT INTO audit_logs
      (admin_id, action, resource, detail, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(id, action, resource, safeText(detail, 500), new Date().toISOString()).run();
  } catch (error) {
    console.warn('Hybrid execution audit write failed', error);
  }
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_nodes (
      device_id TEXT PRIMARY KEY,
      auto_execute INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      device_group TEXT NOT NULL DEFAULT 'default',
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      current_load INTEGER NOT NULL DEFAULT 0,
      max_concurrency INTEGER NOT NULL DEFAULT 1,
      last_heartbeat_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES device_registry(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_jobs (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 50,
      device_group TEXT,
      required_capabilities_json TEXT NOT NULL DEFAULT '[]',
      assigned_device_id TEXT,
      last_device_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      lease_expires_at TEXT,
      not_before_at TEXT,
      result_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (assigned_device_id) REFERENCES device_registry(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      device_id TEXT,
      event_type TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES hybrid_execution_jobs(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      updated_at TEXT NOT NULL,
      updated_by INTEGER
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_hybrid_jobs_queue ON hybrid_execution_jobs(status, priority DESC, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_hybrid_jobs_device ON hybrid_execution_jobs(assigned_device_id, status, lease_expires_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_hybrid_nodes_ready ON hybrid_execution_nodes(auto_execute, enabled, last_heartbeat_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_hybrid_events_job ON hybrid_execution_events(job_id, created_at DESC)'),
  ]);
}

async function readFabricSettings(env) {
  const row = await env.DB.prepare('SELECT enabled, updated_at, updated_by FROM hybrid_execution_settings WHERE id=1').first();
  return {
    enabled: row ? Number(row.enabled) === 1 : true,
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null,
  };
}

async function event(env, jobId, deviceId, eventType, detail = {}) {
  await env.DB.prepare(`INSERT INTO hybrid_execution_events
    (job_id, device_id, event_type, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(jobId, deviceId || null, eventType, safeJson(detail, 6000), new Date().toISOString()).run();
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

async function syncNode(env, device) {
  const now = new Date().toISOString();
  const load = currentLoad(device);
  const capabilitiesJson = safeJson(capabilitiesObject(device), 6000);
  await env.DB.prepare(`INSERT INTO hybrid_execution_nodes
    (device_id, auto_execute, enabled, device_group, capabilities_json, current_load, max_concurrency, last_heartbeat_at, created_at, updated_at)
    VALUES (?, 0, 1, 'default', ?, ?, 1, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      capabilities_json = excluded.capabilities_json,
      current_load = excluded.current_load,
      last_heartbeat_at = excluded.last_heartbeat_at,
      updated_at = excluded.updated_at`)
    .bind(device.id, capabilitiesJson, load, device.last_seen_at || now, now, now).run();
}

async function requeueExpired(env) {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare(`SELECT id, assigned_device_id, status, attempt_count, max_attempts
    FROM hybrid_execution_jobs
    WHERE status IN ('assigned','leased') AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
    ORDER BY lease_expires_at ASC LIMIT 100`).bind(now).all();

  for (const job of expired.results || []) {
    if (job.status === 'leased' && Number(job.attempt_count) >= Number(job.max_attempts)) {
      const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
        SET status='failed', last_device_id=assigned_device_id, assigned_device_id=NULL, lease_expires_at=NULL,
            last_error='lease_expired', updated_at=?, completed_at=?
        WHERE id=? AND status='leased' AND lease_expires_at < ?`)
        .bind(now, now, job.id, now).run();
      if (update.meta?.changes) await event(env, job.id, job.assigned_device_id, 'failed', { reason:'lease_expired', terminal:true });
      continue;
    }

    const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='pending', last_device_id=assigned_device_id, assigned_device_id=NULL, lease_expires_at=NULL,
          last_error=?, updated_at=?
      WHERE id=? AND status=? AND lease_expires_at < ?`)
      .bind(job.status === 'leased' ? 'lease_expired' : 'assignment_expired', now, job.id, job.status, now).run();
    if (update.meta?.changes) await event(env, job.id, job.assigned_device_id, 'requeued', { reason:job.status === 'leased' ? 'lease_expired' : 'assignment_expired' });
  }
}

async function readyNodes(env) {
  const cutoff = new Date(Date.now() - ONLINE_MS).toISOString();
  const rows = await env.DB.prepare(`SELECT n.*, d.label, d.hostname, d.platform, d.revoked_at, d.last_seen_at
    FROM hybrid_execution_nodes n
    JOIN device_registry d ON d.id = n.device_id
    WHERE n.auto_execute = 1 AND n.enabled = 1 AND d.revoked_at IS NULL
      AND d.last_seen_at IS NOT NULL AND d.last_seen_at >= ?
    ORDER BY n.current_load ASC, d.last_seen_at DESC, n.device_id ASC`).bind(cutoff).all();
  return rows.results || [];
}

async function activeCounts(env) {
  const rows = await env.DB.prepare(`SELECT assigned_device_id AS device_id, COUNT(*) AS active_count
    FROM hybrid_execution_jobs
    WHERE status IN ('assigned','leased') AND assigned_device_id IS NOT NULL
    GROUP BY assigned_device_id`).all();
  return new Map((rows.results || []).map(row => [row.device_id, Number(row.active_count) || 0]));
}

async function assignPending(env) {
  await requeueExpired(env);
  const fabric = await readFabricSettings(env);
  if (!fabric.enabled) return;
  const nodes = await readyNodes(env);
  if (!nodes.length) return;

  const counts = await activeCounts(env);
  const now = new Date().toISOString();
  const jobs = await env.DB.prepare(`SELECT * FROM hybrid_execution_jobs
    WHERE status='pending' AND (not_before_at IS NULL OR not_before_at <= ?)
    ORDER BY priority DESC, created_at ASC LIMIT 40`).bind(now).all();

  for (const job of jobs.results || []) {
    const group = job.device_group ? safeGroup(job.device_group) : '';
    let candidates = nodes.filter(node => {
      if (group && safeGroup(node.device_group) !== group) return false;
      const active = counts.get(node.device_id) || 0;
      if (active >= Math.max(1, Number(node.max_concurrency) || 1)) return false;
      return nodeSupports(node, job);
    });
    if (!candidates.length) continue;

    const alternatives = candidates.filter(node => node.device_id !== job.last_device_id);
    if (alternatives.length) candidates = alternatives;
    candidates.sort((a, b) => {
      const aActive = counts.get(a.device_id) || 0;
      const bActive = counts.get(b.device_id) || 0;
      const aScore = Number(a.current_load || 0) + (aActive / Math.max(1, Number(a.max_concurrency) || 1)) * 100;
      const bScore = Number(b.current_load || 0) + (bActive / Math.max(1, Number(b.max_concurrency) || 1)) * 100;
      if (aScore !== bScore) return aScore - bScore;
      const heartbeat = String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || ''));
      return heartbeat || String(a.device_id).localeCompare(String(b.device_id));
    });

    const chosen = candidates[0];
    const expires = new Date(Date.now() + ASSIGNMENT_MS).toISOString();
    const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='assigned', assigned_device_id=?, lease_expires_at=?, updated_at=?
      WHERE id=? AND status='pending'`)
      .bind(chosen.device_id, expires, now, job.id).run();
    if (update.meta?.changes) {
      counts.set(chosen.device_id, (counts.get(chosen.device_id) || 0) + 1);
      await event(env, job.id, chosen.device_id, 'assigned', {
        priority:Number(job.priority) || 0,
        currentLoad:Number(chosen.current_load) || 0,
        deviceGroup:chosen.device_group,
      });
    }
  }
}

async function claimAssigned(env, deviceId) {
  const node = await env.DB.prepare(`SELECT auto_execute, enabled FROM hybrid_execution_nodes WHERE device_id=?`).bind(deviceId).first();
  if (!node || Number(node.auto_execute) !== 1 || Number(node.enabled) !== 1) return null;

  const now = new Date().toISOString();
  const job = await env.DB.prepare(`SELECT * FROM hybrid_execution_jobs
    WHERE assigned_device_id=? AND status='assigned' AND lease_expires_at >= ?
    ORDER BY priority DESC, created_at ASC LIMIT 1`).bind(deviceId, now).first();
  if (!job) return null;
  if (Number(job.attempt_count) >= Number(job.max_attempts)) {
    await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='failed', last_error='attempt_limit_reached', completed_at=?, updated_at=?
      WHERE id=? AND status='assigned'`).bind(now, now, job.id).run();
    await event(env, job.id, deviceId, 'failed', { reason:'attempt_limit_reached', terminal:true });
    return null;
  }

  const leaseExpiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  const claim = await env.DB.prepare(`UPDATE hybrid_execution_jobs
    SET status='leased', attempt_count=attempt_count+1, lease_expires_at=?, updated_at=?
    WHERE id=? AND assigned_device_id=? AND status='assigned'`)
    .bind(leaseExpiresAt, now, job.id, deviceId).run();
  if (!claim.meta?.changes) return null;
  await event(env, job.id, deviceId, 'leased', { leaseExpiresAt, attempt:Number(job.attempt_count) + 1 });
  return {
    id:job.id,
    type:job.task_type,
    payload:parseJson(job.payload_json, {}),
    issuedAt:job.created_at,
    claimedAt:now,
  };
}

export async function claimHybridFallback(request, env) {
  if (request.method !== 'GET' || new URL(request.url).pathname !== AGENT_NEXT_PATH) return null;
  if (!env.DB) return json({ command:null }, 200);
  await ensureSchema(env.DB);
  const device = await authenticateDevice(request, env);
  if (!device) return json({ error:'기기 인증에 실패했습니다.', code:'DEVICE_AUTH_REQUIRED' }, 401);
  await syncNode(env, device);
  const fabric = await readFabricSettings(env);
  if (!fabric.enabled) return json({ command:null, execution:{ enabled:false } }, 200);
  await assignPending(env);
  return json({ command:await claimAssigned(env, device.id), execution:{ enabled:true } }, 200);
}

export async function handleHybridAgentResult(request, env, commandId) {
  if (!String(commandId || '').startsWith('hyb_')) return null;
  if (!env.DB) return json({ error:'하이브리드 실행 데이터베이스가 연결되지 않았습니다.' }, 503);
  await ensureSchema(env.DB);
  const device = await authenticateDevice(request, env);
  if (!device) return json({ error:'기기 인증에 실패했습니다.', code:'DEVICE_AUTH_REQUIRED' }, 401);

  const job = await env.DB.prepare(`SELECT * FROM hybrid_execution_jobs
    WHERE id=? AND assigned_device_id=? AND status='leased'`).bind(commandId, device.id).first();
  if (!job) return json({ error:'처리 중인 하이브리드 작업을 찾을 수 없습니다.' }, 404);

  const body = await readJson(request) || {};
  const success = body.success === true;
  const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result)
    ? parseJson(safeJson(body.result, 24000), {})
    : { message:safeText(body.message, 300) };
  const now = new Date().toISOString();

  if (success) {
    const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='completed', result_json=?, last_error='', lease_expires_at=NULL,
          updated_at=?, completed_at=?
      WHERE id=? AND assigned_device_id=? AND status='leased'`)
      .bind(safeJson(result, 24000), now, now, commandId, device.id).run();
    if (!update.meta?.changes) return json({ error:'작업 상태가 이미 변경되었습니다.' }, 409);
    await event(env, commandId, device.id, 'completed', { attempt:Number(job.attempt_count) || 1 });
    return json({ ok:true, commandId, status:'completed', completedAt:now }, 200);
  }

  const errorMessage = safeText(result.message || body.message || 'agent_reported_failure', 500);
  if (Number(job.attempt_count) < Number(job.max_attempts)) {
    const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='pending', last_device_id=assigned_device_id, assigned_device_id=NULL,
          lease_expires_at=NULL, last_error=?, result_json=?, updated_at=?
      WHERE id=? AND assigned_device_id=? AND status='leased'`)
      .bind(errorMessage, safeJson(result, 24000), now, commandId, device.id).run();
    if (!update.meta?.changes) return json({ error:'작업 상태가 이미 변경되었습니다.' }, 409);
    await event(env, commandId, device.id, 'requeued', { reason:'agent_failure', attempt:Number(job.attempt_count) || 1 });
    await assignPending(env);
    return json({ ok:true, commandId, status:'pending', retrying:true }, 202);
  }

  const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
    SET status='failed', last_device_id=assigned_device_id, assigned_device_id=NULL,
        lease_expires_at=NULL, last_error=?, result_json=?, updated_at=?, completed_at=?
    WHERE id=? AND assigned_device_id=? AND status='leased'`)
    .bind(errorMessage, safeJson(result, 24000), now, now, commandId, device.id).run();
  if (!update.meta?.changes) return json({ error:'작업 상태가 이미 변경되었습니다.' }, 409);
  await event(env, commandId, device.id, 'failed', { reason:'agent_failure', terminal:true, attempt:Number(job.attempt_count) || 1 });
  return json({ ok:true, commandId, status:'failed', completedAt:now }, 200);
}

async function listDashboard(env) {
  await requeueExpired(env);
  const fabric = await readFabricSettings(env);
  const [nodeRows, jobRows, eventRows] = await Promise.all([
    env.DB.prepare(`SELECT n.*, d.label, d.hostname, d.platform, d.agent_version, d.last_seen_at AS device_last_seen_at,
      d.revoked_at,
      (SELECT COUNT(*) FROM hybrid_execution_jobs j
       WHERE j.assigned_device_id=n.device_id AND j.status IN ('assigned','leased')) AS active_jobs
      FROM hybrid_execution_nodes n
      JOIN device_registry d ON d.id=n.device_id
      ORDER BY d.last_seen_at DESC, d.label ASC`).all(),
    env.DB.prepare(`SELECT id, task_type, status, priority, device_group, required_capabilities_json,
      assigned_device_id, last_device_id, attempt_count, max_attempts, lease_expires_at,
      last_error, created_at, updated_at, completed_at
      FROM hybrid_execution_jobs ORDER BY created_at DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT id, job_id, device_id, event_type, detail_json, created_at
      FROM hybrid_execution_events ORDER BY id DESC LIMIT 100`).all(),
  ]);

  const cutoff = Date.now() - ONLINE_MS;
  const nodes = (nodeRows.results || []).map(row => ({
    deviceId:row.device_id,
    label:row.label,
    hostname:row.hostname,
    platform:row.platform,
    agentVersion:row.agent_version,
    online:Boolean(!row.revoked_at && row.device_last_seen_at && new Date(row.device_last_seen_at).getTime() >= cutoff),
    autoExecute:Number(row.auto_execute) === 1,
    enabled:Number(row.enabled) === 1,
    deviceGroup:row.device_group,
    capabilities:parseJson(row.capabilities_json, {}),
    currentLoad:Number(row.current_load) || 0,
    maxConcurrency:Number(row.max_concurrency) || 1,
    activeJobs:Number(row.active_jobs) || 0,
    lastHeartbeatAt:row.last_heartbeat_at,
    deviceLastSeenAt:row.device_last_seen_at,
    revoked:Boolean(row.revoked_at),
  }));
  const jobs = (jobRows.results || []).map(row => ({
    id:row.id,
    taskType:row.task_type,
    status:row.status,
    priority:Number(row.priority) || 0,
    deviceGroup:row.device_group,
    requiredCapabilities:parseJson(row.required_capabilities_json, []),
    assignedDeviceId:row.assigned_device_id,
    lastDeviceId:row.last_device_id,
    attemptCount:Number(row.attempt_count) || 0,
    maxAttempts:Number(row.max_attempts) || MAX_ATTEMPTS,
    leaseExpiresAt:row.lease_expires_at,
    lastError:row.last_error,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    completedAt:row.completed_at,
  }));
  const events = (eventRows.results || []).map(row => ({
    id:row.id, jobId:row.job_id, deviceId:row.device_id, type:row.event_type,
    detail:parseJson(row.detail_json, {}), createdAt:row.created_at,
  }));
  return {
    fabric,
    nodes, jobs, events,
    summary:{
      onlineNodes:nodes.filter(node => node.online).length,
      autoNodes:nodes.filter(node => node.online && node.enabled && node.autoExecute).length,
      pendingJobs:jobs.filter(job => job.status === 'pending').length,
      activeJobs:jobs.filter(job => ['assigned','leased'].includes(job.status)).length,
      failedJobs:jobs.filter(job => job.status === 'failed').length,
    },
    generatedAt:new Date().toISOString(),
  };
}

async function handleAdmin(request, env) {
  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  const path = new URL(request.url).pathname;

  if (request.method === 'GET' && (path === ADMIN_PREFIX || path === `${ADMIN_PREFIX}/dashboard`)) {
    const dashboard = await listDashboard(env);
    dashboard.fabric.canManage = auth.session.role === 'super_admin';
    return json(dashboard, 200);
  }

  if (request.method === 'PATCH' && path === `${ADMIN_PREFIX}/settings`) {
    if (auth.session.role !== 'super_admin') {
      return json({ error:'실행 인프라 전체 정책은 최고관리자만 변경할 수 있습니다.', code:'EXECUTION_FABRIC_SUPER_ADMIN_REQUIRED' }, 403);
    }
    const body = await readJson(request) || {};
    if (typeof body.enabled !== 'boolean') return json({ error:'실행 인프라 가동 여부가 필요합니다.' }, 400);
    if (body.confirmed !== true) {
      return json({ error:'실행 인프라 전체 정책 변경은 관리자 확인이 필요합니다.', code:'EXECUTION_FABRIC_CONFIRM_REQUIRED' }, 409);
    }
    const now = new Date().toISOString();
    const actorId = await adminId(env, auth.session);
    const enabled = body.enabled ? 1 : 0;
    await env.DB.prepare(`INSERT INTO hybrid_execution_settings (id, enabled, updated_at, updated_by)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .bind(enabled, now, actorId).run();

    if (!enabled) {
      const assigned = await env.DB.prepare(`SELECT id, assigned_device_id FROM hybrid_execution_jobs
        WHERE status='assigned'`).all();
      await env.DB.prepare(`UPDATE hybrid_execution_jobs
        SET status='pending', last_device_id=assigned_device_id, assigned_device_id=NULL,
            lease_expires_at=NULL, last_error='fabric_paused', updated_at=?
        WHERE status='assigned'`).bind(now).run();
      for (const job of assigned.results || []) {
        await event(env, job.id, job.assigned_device_id, 'requeued', { reason:'fabric_paused' });
      }
    } else {
      await assignPending(env);
    }

    await audit(env, auth.session, 'hybrid.fabric.update', 'execution-fabric', enabled ? 'enabled' : 'paused');
    return json({ ok:true, fabric:{ enabled:Boolean(enabled), updatedAt:now, updatedBy:actorId } }, 200);
  }

  const nodeMatch = path.match(/^\/api\/control\/hybrid-execution\/nodes\/([^/]+)$/);
  if (request.method === 'PATCH' && nodeMatch) {
    const deviceId = decodeURIComponent(nodeMatch[1]);
    const body = await readJson(request) || {};
    const node = await env.DB.prepare('SELECT * FROM hybrid_execution_nodes WHERE device_id=?').bind(deviceId).first();
    if (!node) return json({ error:'하이브리드 실행 노드를 찾을 수 없습니다.' }, 404);
    const autoExecute = typeof body.autoExecute === 'boolean' ? (body.autoExecute ? 1 : 0) : Number(node.auto_execute);
    const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : Number(node.enabled);
    const deviceGroup = Object.hasOwn(body, 'deviceGroup') ? safeGroup(body.deviceGroup) : node.device_group;
    const maxConcurrency = Object.hasOwn(body, 'maxConcurrency')
      ? clampInt(body.maxConcurrency, 1, 8, Number(node.max_concurrency) || 1)
      : Number(node.max_concurrency) || 1;
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE hybrid_execution_nodes
      SET auto_execute=?, enabled=?, device_group=?, max_concurrency=?, updated_at=?
      WHERE device_id=?`)
      .bind(autoExecute, enabled, deviceGroup, maxConcurrency, now, deviceId).run();
    await audit(env, auth.session, 'hybrid.node.update', deviceId,
      JSON.stringify({ autoExecute:Boolean(autoExecute), enabled:Boolean(enabled), deviceGroup, maxConcurrency }));
    if (!autoExecute || !enabled) {
      const assigned = await env.DB.prepare(`SELECT id FROM hybrid_execution_jobs
        WHERE assigned_device_id=? AND status='assigned'`).bind(deviceId).all();
      await env.DB.prepare(`UPDATE hybrid_execution_jobs
        SET status='pending', last_device_id=assigned_device_id, assigned_device_id=NULL,
            lease_expires_at=NULL, last_error='node_disabled', updated_at=?
        WHERE assigned_device_id=? AND status='assigned'`).bind(now, deviceId).run();
      for (const job of assigned.results || []) await event(env, job.id, deviceId, 'requeued', { reason:'node_disabled' });
    }
    await assignPending(env);
    return json({ ok:true, deviceId, autoExecute:Boolean(autoExecute), enabled:Boolean(enabled), deviceGroup, maxConcurrency }, 200);
  }

  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/jobs`) {
    const body = await readJson(request) || {};
    const taskType = safeText(body.taskType, 80);
    const policy = TASK_POLICIES[taskType];
    if (!policy) return json({ error:'허용되지 않은 하이브리드 작업입니다.', code:'HYBRID_TASK_NOT_ALLOWED' }, 400);
    if (policy.confirm && body.confirmed !== true) {
      return json({ error:'이 작업은 관리자 확인이 필요합니다.', code:'HYBRID_TASK_CONFIRM_REQUIRED' }, 409);
    }
    let payload;
    try { payload = sanitizePayload(taskType, body.payload || {}); }
    catch { return json({ error:'하이브리드 작업 인자가 유효하지 않습니다.', code:'HYBRID_TASK_PAYLOAD_INVALID' }, 400); }
    const priority = clampInt(body.priority, 0, 100, 50);
    const deviceGroup = body.deviceGroup ? safeGroup(body.deviceGroup) : null;
    const requiredCapabilities = sanitizeCapabilities(body.requiredCapabilities);
    if (!requiredCapabilities.includes(policy.capability)) requiredCapabilities.push(policy.capability);
    const maxAttempts = clampInt(body.maxAttempts, 1, MAX_ATTEMPTS, MAX_ATTEMPTS);
    const notBeforeAt = body.notBeforeAt && Number.isFinite(Date.parse(body.notBeforeAt))
      ? new Date(body.notBeforeAt).toISOString()
      : null;
    const now = new Date().toISOString();
    const actorId = await adminId(env, auth.session);
    const jobId = `hyb_${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO hybrid_execution_jobs
      (id, task_type, payload_json, status, priority, device_group, required_capabilities_json,
       attempt_count, max_attempts, not_before_at, result_json, last_error, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, 0, ?, ?, '{}', '', ?, ?, ?)`)
      .bind(jobId, taskType, safeJson(payload), priority, deviceGroup, JSON.stringify(requiredCapabilities),
        maxAttempts, notBeforeAt, actorId, now, now).run();
    await event(env, jobId, null, 'created', { taskType, priority, deviceGroup, maxAttempts, risk:policy.risk });
    await audit(env, auth.session, 'hybrid.job.create', jobId, `${taskType} [${policy.risk}]`);
    await assignPending(env);
    const created = await env.DB.prepare(`SELECT id, task_type, status, priority, assigned_device_id,
      attempt_count, max_attempts, created_at FROM hybrid_execution_jobs WHERE id=?`).bind(jobId).first();
    return json({ job:created }, 202);
  }

  const cancelMatch = path.match(/^\/api\/control\/hybrid-execution\/jobs\/([^/]+)\/cancel$/);
  if (request.method === 'POST' && cancelMatch) {
    const jobId = decodeURIComponent(cancelMatch[1]);
    const now = new Date().toISOString();
    const update = await env.DB.prepare(`UPDATE hybrid_execution_jobs
      SET status='cancelled', last_device_id=assigned_device_id, assigned_device_id=NULL,
          lease_expires_at=NULL, updated_at=?, completed_at=?
      WHERE id=? AND status IN ('pending','assigned')`).bind(now, now, jobId).run();
    if (!update.meta?.changes) return json({ error:'취소 가능한 작업을 찾을 수 없습니다.' }, 409);
    await event(env, jobId, null, 'cancelled', { by:'admin' });
    await audit(env, auth.session, 'hybrid.job.cancel', jobId, 'cancelled before lease');
    return json({ ok:true, jobId, status:'cancelled' }, 200);
  }

  return json({ error:'하이브리드 실행 관리자 API 경로를 찾을 수 없습니다.' }, 404);
}

export async function handleHybridExecution(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ADMIN_PREFIX)) return null;
  if (!env.DB) return json({ error:'하이브리드 실행 데이터베이스가 연결되지 않았습니다.' }, 503);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status:204,
      headers:{
        'access-control-allow-methods':'GET,POST,PATCH,OPTIONS',
        'access-control-allow-headers':'authorization,content-type',
        'cache-control':'no-store',
      },
    });
  }
  await ensureSchema(env.DB);
  return handleAdmin(request, env);
}

export const HYBRID_EXECUTION_POLICY = Object.freeze({
  maxAttempts:MAX_ATTEMPTS,
  newNodesAutoExecute:false,
  globalExecutionGate:true,
  pauseKeepsLeasedJobsRunning:true,
  arbitraryShell:false,
  taskTypes:Object.keys(TASK_POLICIES),
});

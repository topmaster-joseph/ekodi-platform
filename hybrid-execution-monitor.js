import authWorker from './auth-worker.js';

const MONITOR_PATH = '/api/control/hybrid-execution/monitor';
const NODE_STALE_MS = 5 * 60 * 1000;
const BACKLOG_MS = 15 * 60 * 1000;
const FAILURE_WINDOW_MS = 30 * 60 * 1000;
const MONITOR_STALE_MS = 12 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 8000;

const INCIDENT_KEYS = Object.freeze([
  'no_ready_nodes',
  'stale_auto_nodes',
  'pending_backlog',
  'recent_failures',
  'requeue_churn',
  'control_health_failed',
  'admin_hybrid_asset_missing',
]);

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

function safeText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function safeJson(value, max = 12000) {
  try {
    const encoded = JSON.stringify(value && typeof value === 'object' ? value : {});
    return encoded.length <= max ? encoded : '{}';
  } catch {
    return '{}';
  }
}

function num(row, key = 'count') {
  return Number(row?.[key]) || 0;
}

async function readFabricEnabled(db) {
  try {
    const row = await db.prepare('SELECT enabled FROM hybrid_execution_settings WHERE id=1').first();
    return row ? Number(row.enabled) === 1 : true;
  } catch {
    return true;
  }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

async function ensureMonitorSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_incidents (
      incident_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resolved_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hybrid_execution_monitor_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'unknown',
      open_incidents INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT NOT NULL DEFAULT '{}',
      last_run_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_hybrid_incidents_status ON hybrid_execution_incidents(status, severity, last_seen_at DESC)'),
  ]);
}

async function upsertIncident(db, incident, now) {
  await db.prepare(`INSERT INTO hybrid_execution_incidents
    (incident_key, category, severity, title, detail_json, status, occurrence_count, first_seen_at, last_seen_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, 'open', 1, ?, ?, NULL)
    ON CONFLICT(incident_key) DO UPDATE SET
      category=excluded.category,
      severity=excluded.severity,
      title=excluded.title,
      detail_json=excluded.detail_json,
      status='open',
      occurrence_count=CASE WHEN hybrid_execution_incidents.status='resolved' THEN 1 ELSE hybrid_execution_incidents.occurrence_count + 1 END,
      first_seen_at=CASE WHEN hybrid_execution_incidents.status='resolved' THEN excluded.first_seen_at ELSE hybrid_execution_incidents.first_seen_at END,
      last_seen_at=excluded.last_seen_at,
      resolved_at=NULL`)
    .bind(
      incident.key,
      incident.category,
      incident.severity,
      safeText(incident.title, 160),
      safeJson(incident.detail || {}),
      now,
      now,
    ).run();
}

async function resolveIncident(db, key, now) {
  await db.prepare(`UPDATE hybrid_execution_incidents
    SET status='resolved', resolved_at=?, last_seen_at=?
    WHERE incident_key=? AND status='open'`)
    .bind(now, now, key).run();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers:{ 'cache-control':'no-cache', 'user-agent':'EKODI-Hybrid-Watchdog/1.0' },
      cache:'no-store',
      signal:controller.signal,
    });
    const text = await response.text();
    return { ok:response.ok, status:response.status, text:text.slice(0, 200000) };
  } catch (error) {
    return { ok:false, status:0, text:'', error:safeText(error?.message || error, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function externalProductionChecks(env) {
  if (String(env.ENVIRONMENT || '').toLowerCase() !== 'production') {
    return { skipped:true, controlHealth:true, adminHybridAsset:true };
  }

  const [health, asset] = await Promise.all([
    fetchText('https://api.ekodi.kr/health'),
    fetchText('https://admin.ekodi.kr/device-control-admin.js'),
  ]);

  let controlHealth = false;
  if (health.ok) {
    try { controlHealth = JSON.parse(health.text)?.ok === true; }
    catch { controlHealth = /"ok"\s*:\s*true/.test(health.text); }
  }
  const adminHybridAsset = asset.ok
    && asset.text.includes('EKODI HYBRID EXECUTION')
    && asset.text.includes('/api/control/hybrid-execution/dashboard');

  return {
    skipped:false,
    controlHealth,
    controlHealthStatus:health.status,
    controlHealthError:health.error || '',
    adminHybridAsset,
    adminAssetStatus:asset.status,
    adminAssetError:asset.error || '',
  };
}

async function collectSignals(env, nowMs) {
  const staleCutoff = new Date(nowMs - NODE_STALE_MS).toISOString();
  const backlogCutoff = new Date(nowMs - BACKLOG_MS).toISOString();
  const failureCutoff = new Date(nowMs - FAILURE_WINDOW_MS).toISOString();
  const fabricEnabled = await readFabricEnabled(env.DB);

  const [configuredAuto, onlineAuto, staleAutoRows, backlog, failures, requeues, external] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count
      FROM hybrid_execution_nodes n
      JOIN device_registry d ON d.id=n.device_id
      WHERE n.auto_execute=1 AND n.enabled=1 AND d.revoked_at IS NULL`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count
      FROM hybrid_execution_nodes n
      JOIN device_registry d ON d.id=n.device_id
      WHERE n.auto_execute=1 AND n.enabled=1 AND d.revoked_at IS NULL
        AND d.last_seen_at IS NOT NULL AND d.last_seen_at>=?`).bind(staleCutoff).first(),
    env.DB.prepare(`SELECT n.device_id, d.label, d.hostname, d.last_seen_at
      FROM hybrid_execution_nodes n
      JOIN device_registry d ON d.id=n.device_id
      WHERE n.auto_execute=1 AND n.enabled=1 AND d.revoked_at IS NULL
        AND (d.last_seen_at IS NULL OR d.last_seen_at<?)
      ORDER BY d.last_seen_at ASC LIMIT 20`).bind(staleCutoff).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count, MIN(created_at) AS oldest
      FROM hybrid_execution_jobs
      WHERE status='pending' AND created_at<?`).bind(backlogCutoff).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count
      FROM hybrid_execution_jobs
      WHERE status='failed' AND completed_at IS NOT NULL AND completed_at>=?`).bind(failureCutoff).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count
      FROM hybrid_execution_events
      WHERE event_type='requeued' AND created_at>=?`).bind(failureCutoff).first(),
    externalProductionChecks(env),
  ]);

  return {
    fabricEnabled,
    configuredAutoNodes:num(configuredAuto),
    onlineAutoNodes:num(onlineAuto),
    staleAutoNodes:(staleAutoRows.results || []).map(row => ({
      deviceId:row.device_id,
      label:row.label || row.hostname || row.device_id,
      lastSeenAt:row.last_seen_at,
    })),
    backlogCount:num(backlog),
    backlogOldest:backlog?.oldest || null,
    recentFailures:num(failures),
    recentRequeues:num(requeues),
    external,
    thresholds:{
      nodeStaleMinutes:NODE_STALE_MS / 60000,
      backlogMinutes:BACKLOG_MS / 60000,
      failureWindowMinutes:FAILURE_WINDOW_MS / 60000,
    },
  };
}

function incidentsForSignals(signals) {
  const incidents = [];

  if (signals.fabricEnabled && signals.configuredAutoNodes > 0 && signals.onlineAutoNodes === 0) {
    incidents.push({
      key:'no_ready_nodes', category:'nodes', severity:'critical',
      title:'자동 실행 노드가 모두 오프라인입니다.',
      detail:{ configured:signals.configuredAutoNodes, stale:signals.staleAutoNodes },
    });
  }

  if (signals.fabricEnabled && signals.staleAutoNodes.length > 0) {
    incidents.push({
      key:'stale_auto_nodes', category:'nodes', severity:'warning',
      title:`자동 실행 노드 ${signals.staleAutoNodes.length}대의 heartbeat가 지연되었습니다.`,
      detail:{ nodes:signals.staleAutoNodes },
    });
  }

  if (signals.fabricEnabled && signals.backlogCount > 0) {
    incidents.push({
      key:'pending_backlog', category:'queue', severity:signals.backlogCount >= 5 ? 'critical' : 'warning',
      title:`15분 이상 대기 중인 작업이 ${signals.backlogCount}건 있습니다.`,
      detail:{ count:signals.backlogCount, oldest:signals.backlogOldest },
    });
  }

  if (signals.recentFailures >= 3) {
    incidents.push({
      key:'recent_failures', category:'jobs', severity:signals.recentFailures >= 6 ? 'critical' : 'warning',
      title:`최근 30분 작업 실패가 ${signals.recentFailures}건 발생했습니다.`,
      detail:{ count:signals.recentFailures },
    });
  }

  if (signals.recentRequeues >= 5) {
    incidents.push({
      key:'requeue_churn', category:'scheduler', severity:'warning',
      title:`최근 30분 재배정이 ${signals.recentRequeues}회 발생했습니다.`,
      detail:{ count:signals.recentRequeues },
    });
  }

  if (!signals.external.skipped && !signals.external.controlHealth) {
    incidents.push({
      key:'control_health_failed', category:'production', severity:'critical',
      title:'운영 Control API health 검증에 실패했습니다.',
      detail:{ status:signals.external.controlHealthStatus, error:signals.external.controlHealthError },
    });
  }

  if (!signals.external.skipped && !signals.external.adminHybridAsset) {
    incidents.push({
      key:'admin_hybrid_asset_missing', category:'production', severity:'critical',
      title:'운영 관리자 Hybrid Execution 자산 검증에 실패했습니다.',
      detail:{ status:signals.external.adminAssetStatus, error:signals.external.adminAssetError },
    });
  }

  return incidents;
}

async function monitorSnapshot(env) {
  await ensureMonitorSchema(env.DB);
  const [state, incidentRows] = await Promise.all([
    env.DB.prepare('SELECT status, open_incidents, detail_json, last_run_at FROM hybrid_execution_monitor_state WHERE id=1').first(),
    env.DB.prepare(`SELECT incident_key, category, severity, title, detail_json, status,
      occurrence_count, first_seen_at, last_seen_at, resolved_at
      FROM hybrid_execution_incidents
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        last_seen_at DESC LIMIT 30`).all(),
  ]);

  const incidents = (incidentRows.results || []).map(row => ({
    key:row.incident_key,
    category:row.category,
    severity:row.severity,
    title:row.title,
    detail:parseJson(row.detail_json, {}),
    status:row.status,
    occurrenceCount:Number(row.occurrence_count) || 0,
    firstSeenAt:row.first_seen_at,
    lastSeenAt:row.last_seen_at,
    resolvedAt:row.resolved_at,
  }));

  return {
    status:state?.status || 'unknown',
    openIncidents:Number(state?.open_incidents) || incidents.filter(item => item.status === 'open').length,
    lastRunAt:state?.last_run_at || null,
    signals:parseJson(state?.detail_json, {}),
    incidents,
  };
}

export async function runHybridExecutionMonitor(env) {
  if (!env?.DB) return { status:'unavailable', openIncidents:0, lastRunAt:null, signals:{}, incidents:[] };
  await ensureMonitorSchema(env.DB);

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const signals = await collectSignals(env, nowMs);
  const active = incidentsForSignals(signals);
  const activeKeys = new Set(active.map(item => item.key));

  for (const incident of active) await upsertIncident(env.DB, incident, now);
  for (const key of INCIDENT_KEYS) {
    if (!activeKeys.has(key)) await resolveIncident(env.DB, key, now);
  }

  const status = active.some(item => item.severity === 'critical') ? 'critical'
    : active.length ? 'degraded' : 'healthy';
  await env.DB.prepare(`INSERT INTO hybrid_execution_monitor_state
    (id, status, open_incidents, detail_json, last_run_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      open_incidents=excluded.open_incidents,
      detail_json=excluded.detail_json,
      last_run_at=excluded.last_run_at`)
    .bind(status, active.length, safeJson(signals), now).run();

  if (active.length) {
    console.warn('Hybrid execution watchdog incidents', active.map(item => `${item.severity}:${item.key}`).join(','));
  }
  return monitorSnapshot(env);
}

export async function handleHybridExecutionMonitor(request, env) {
  const path = new URL(request.url).pathname;
  if (path !== MONITOR_PATH) return null;
  if (!env?.DB) return json({ error:'하이브리드 감시 데이터베이스가 연결되지 않았습니다.' }, 503);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status:204,
      headers:{
        'access-control-allow-methods':'GET,OPTIONS',
        'access-control-allow-headers':'authorization,content-type',
        'cache-control':'no-store',
      },
    });
  }
  if (request.method !== 'GET') return json({ error:'지원하지 않는 감시 API 메서드입니다.' }, 405);

  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  await ensureMonitorSchema(env.DB);
  const state = await env.DB.prepare('SELECT last_run_at FROM hybrid_execution_monitor_state WHERE id=1').first();
  const lastRunMs = state?.last_run_at ? Date.parse(state.last_run_at) : 0;
  if (!lastRunMs || Date.now() - lastRunMs > MONITOR_STALE_MS) {
    return json(await runHybridExecutionMonitor(env), 200);
  }
  return json(await monitorSnapshot(env), 200);
}

export const HYBRID_EXECUTION_MONITOR_POLICY = Object.freeze({
  nodeStaleMinutes:NODE_STALE_MS / 60000,
  backlogMinutes:BACKLOG_MS / 60000,
  failureWindowMinutes:FAILURE_WINDOW_MS / 60000,
  incidentKeys:INCIDENT_KEYS,
  externalProductionChecks:true,
});

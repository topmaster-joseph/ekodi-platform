const DEVICE_ONLINE_MS = 90 * 1000;
const DEVICE_WAKE_ELIGIBLE_AGE_MS = 3 * 60 * 1000;
const GATEWAY_ONLINE_MS = 90 * 1000;
const DEFAULT_WAKE_TTL_MS = 10 * 60 * 1000;
const MAX_AUTO_WAKE_PER_GROUP = 4;

function safeText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function normalizeGroup(value) {
  const group = safeText(value || 'general', 60).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,59}$/.test(group) ? group : 'general';
}

function onlineAt(lastSeenAt, windowMs) {
  const seen = Date.parse(lastSeenAt || '');
  return Number.isFinite(seen) && Date.now() - seen <= windowMs;
}

function deviceOnline(row) {
  return Boolean(!row?.revoked_at && onlineAt(row?.device_last_seen_at || row?.last_seen_at, DEVICE_ONLINE_MS));
}

function verifiedDesktop(row) {
  if (!row || row.revoked_at || String(row.device_type || 'pc') !== 'pc') return false;
  const settings = parseJson(row.settings_json, {});
  const diagnostics = parseJson(row.diagnostics_json, {});
  const system = diagnostics.system || settings?.health?.system || {};
  return system.autoExecutionEligible === true
    && system.isPortable === false
    && system.deviceClass !== 'portable';
}

function gatewayOnline(row) {
  return Boolean(row?.gateway_enabled && !row?.gateway_revoked_at
    && onlineAt(row?.gateway_last_seen_at, GATEWAY_ONLINE_MS));
}

async function rows(env, sql, ...bindings) {
  try {
    const result = await env.DB.prepare(sql).bind(...bindings).all();
    return result.results || [];
  } catch {
    return [];
  }
}

function addDemand(map, group, count, source) {
  const demand = Math.max(0, Number(count) || 0);
  if (!demand) return;
  const key = normalizeGroup(group);
  const item = map.get(key) || { group:key, demandCount:0, sources:[] };
  item.demandCount += demand;
  if (!item.sources.includes(source)) item.sources.push(source);
  map.set(key, item);
}

export async function collectLocalWakeDemands(env) {
  if (!env?.DB?.prepare) return [];
  const demands = new Map();
  const [deviceJobs, hybridJobs, aiJobs] = await Promise.all([
    rows(env, `SELECT COALESCE(NULLIF(target_group,''),'general') AS device_group, COUNT(*) AS demand_count
      FROM device_jobs WHERE status='queued' GROUP BY COALESCE(NULLIF(target_group,''),'general')`),
    rows(env, `SELECT COALESCE(NULLIF(device_group,''),'general') AS device_group, COUNT(*) AS demand_count
      FROM hybrid_execution_jobs WHERE status='pending' GROUP BY COALESCE(NULLIF(device_group,''),'general')`),
    rows(env, `SELECT 'general' AS device_group, COUNT(*) AS demand_count
      FROM ai_control_jobs
      WHERE provider_id LIKE 'node:%' AND (state='queued' OR (state='leased' AND lease_until IS NOT NULL AND lease_until < ?))`,
      new Date().toISOString()),
  ]);
  for (const row of deviceJobs) addDemand(demands, row.device_group, row.demand_count, 'device-jobs');
  for (const row of hybridJobs) addDemand(demands, row.device_group, row.demand_count, 'hybrid-execution');
  for (const row of aiJobs) addDemand(demands, row.device_group, row.demand_count, 'ai-account-node');
  return [...demands.values()];
}

async function wakeCandidates(env, group) {
  return rows(env, `SELECT d.id,d.label,d.hostname,d.settings_json,d.diagnostics_json,d.revoked_at,
      d.last_seen_at AS device_last_seen_at,COALESCE(m.device_type,'pc') AS device_type,
      e.device_group,e.enabled AS execution_enabled,p.enabled AS wake_enabled,
      p.auto_wake_for_jobs,p.resume_jobs,p.gateway_id,p.boot_timeout_seconds,
      g.enabled AS gateway_enabled,g.revoked_at AS gateway_revoked_at,g.last_seen_at AS gateway_last_seen_at
    FROM device_registry d
    JOIN device_execution_profiles e ON e.device_id=d.id
    LEFT JOIN device_management_profiles m ON m.device_id=d.id
    JOIN device_wake_profiles p ON p.device_id=d.id
    LEFT JOIN device_wake_gateways g ON g.id=p.gateway_id
    WHERE e.enabled=1 AND e.device_group=? AND p.enabled=1 AND p.auto_wake_for_jobs=1
      AND d.revoked_at IS NULL`, normalizeGroup(group));
}

async function pendingWake(env, deviceId) {
  const pending = await rows(env, `SELECT id,status FROM device_wake_requests
    WHERE device_id=? AND status IN ('queued','claimed','sent') ORDER BY requested_at DESC LIMIT 1`, deviceId);
  return pending[0] || null;
}

async function insertWake(env, row, source) {
  const existing = await pendingWake(env, row.id);
  if (existing) return { deviceId:row.id, requestId:existing.id, status:existing.status, duplicate:true };
  const id = `wake_${crypto.randomUUID()}`;
  const requestedAt = new Date().toISOString();
  const timeoutMs = Math.max(DEFAULT_WAKE_TTL_MS, Number(row.boot_timeout_seconds || 300) * 1000 + 120000);
  const expiresAt = new Date(Date.now() + timeoutMs).toISOString();
  await env.DB.prepare(`INSERT INTO device_wake_requests
    (id,device_id,gateway_id,status,reason,continue_jobs,requested_at,requested_by,expires_at)
    VALUES (?,?,?,'queued',?,?,?,NULL,?)`)
    .bind(id, row.id, row.gateway_id, safeText(`auto:${source}`, 120), row.resume_jobs ? 1 : 0, requestedAt, expiresAt).run();
  return { deviceId:row.id, requestId:id, status:'queued', expiresAt };
}

export async function requestLocalWake(env, { group='general', demandCount=1, source='local-work' } = {}) {
  if (!env?.DB?.prepare) return { status:'database_unavailable', requested:[] };
  const candidates = (await wakeCandidates(env, group)).filter(verifiedDesktop);
  const online = candidates.filter(deviceOnline);
  if (online.length) return { status:'online_capacity_available', online:online.map(row => row.id), requested:[] };

  const offline = candidates.filter(row => {
    if (!gatewayOnline(row)) return false;
    const seen = Date.parse(row.device_last_seen_at || '');
    return !Number.isFinite(seen) || Date.now() - seen >= DEVICE_WAKE_ELIGIBLE_AGE_MS;
  }).sort((a, b) => Date.parse(b.device_last_seen_at || 0) - Date.parse(a.device_last_seen_at || 0));

  const wakeCount = Math.min(MAX_AUTO_WAKE_PER_GROUP, Math.max(1, Number(demandCount) || 1), offline.length);
  const requested = [];
  for (const row of offline.slice(0, wakeCount)) requested.push(await insertWake(env, row, source));
  return {
    status:requested.length ? 'wake_requested' : 'no_eligible_gateway',
    group:normalizeGroup(group),
    demandCount:Math.max(1, Number(demandCount) || 1),
    requested,
  };
}

export async function requestWakeForQueuedLocalWork(env) {
  const demands = await collectLocalWakeDemands(env);
  const results = [];
  for (const demand of demands) {
    results.push(await requestLocalWake(env, {
      group:demand.group,
      demandCount:demand.demandCount,
      source:demand.sources.join('+') || 'queued-local-work',
    }));
  }
  return { demands, results };
}

export const LOCAL_WAKE_POLICY = Object.freeze({
  verifiedDesktopOnly:true,
  wakeOnlyWhenNoOnlineCapacity:true,
  maxAutoWakePerGroup:MAX_AUTO_WAKE_PER_GROUP,
  gatewayOnlineSeconds:GATEWAY_ONLINE_MS / 1000,
});

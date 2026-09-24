function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function text(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeStatus(value) {
  const status = text(value, 40).toLowerCase();
  return ['online','degraded','offline'].includes(status) ? status : 'unknown';
}

function fresh(checkedAt, nowMs, maxAgeMs) {
  const at = Date.parse(String(checkedAt || ''));
  return Number.isFinite(at) && nowMs >= at && nowMs - at <= maxAgeMs;
}

function project(row = {}, nowMs, maxAgeMs) {
  return freeze({
    status: normalizeStatus(row.status),
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    responseTime: row.response_ms == null ? null : Number(row.response_ms),
    checkedAt: text(row.checked_at, 80) || null,
    fresh: fresh(row.checked_at, nowMs, maxAgeMs),
  });
}

export function buildPlatformServiceObservations(latestRows = [], historyRows = [], options = {}) {
  const nowMs = Date.parse(String(options.now || '')) || Date.now();
  const maxAgeMs = Math.max(60_000, Number(options.maxAgeMs) || 15 * 60_000);
  const current = {};
  const previous = {};
  const latestTime = new Map();

  for (const row of Array.isArray(latestRows) ? latestRows : []) {
    const id = text(row?.service_id, 100);
    if (!id) continue;
    current[id] = project(row, nowMs, maxAgeMs);
    latestTime.set(id, String(row.checked_at || ''));
  }

  for (const row of Array.isArray(historyRows) ? historyRows : []) {
    const id = text(row?.service_id, 100);
    if (!id || previous[id]) continue;
    const newest = latestTime.get(id);
    if (newest && String(row.checked_at || '') >= newest) continue;
    previous[id] = project(row, nowMs, maxAgeMs);
  }

  return freeze({
    current: { services: current },
    previous: { services: previous },
    summary: {
      observedServices: Object.keys(current).length,
      historicalServices: Object.keys(previous).length,
      online: Object.values(current).filter(item => item.status === 'online').length,
      degraded: Object.values(current).filter(item => item.status === 'degraded').length,
      offline: Object.values(current).filter(item => item.status === 'offline').length,
      stale: Object.values(current).filter(item => item.fresh === false).length,
    },
  });
}

export async function collectPlatformRuntimeObservations(input, baseCurrent = {}, basePrevious = {}, options = {}) {
  const db = input?.DB || input;
  if (!db?.prepare) return freeze({
    current: { ...baseCurrent, services: {} },
    previous: { ...basePrevious, services: {} },
    summary: { available: false, reason: 'service_health_db_unavailable', observedServices: 0, historicalServices: 0 },
  });

  let latestRows = [];
  let historyRows = [];
  try {
    const [latest, history] = await Promise.all([
      db.prepare('SELECT service_id, status, http_status, response_ms, checked_at FROM service_check_latest ORDER BY checked_at DESC').all(),
      db.prepare('SELECT service_id, status, http_status, response_ms, checked_at FROM service_checks ORDER BY checked_at DESC LIMIT 1000').all(),
    ]);
    latestRows = latest?.results || [];
    historyRows = history?.results || [];
  } catch {
    return freeze({
      current: { ...baseCurrent, services: {} },
      previous: { ...basePrevious, services: {} },
      summary: { available: false, reason: 'service_health_tables_unavailable', observedServices: 0, historicalServices: 0 },
    });
  }

  const observed = buildPlatformServiceObservations(latestRows, historyRows, options);
  return freeze({
    current: { ...baseCurrent, ...observed.current },
    previous: { ...basePrevious, ...observed.previous },
    summary: { available: true, ...observed.summary },
  });
}

export const EKODI_PLATFORM_OBSERVER = Object.freeze({
  version: '1.0.0',
  owner: 'ekodi-orchestrator',
  source: 'existing-control-center-service-health-ledger',
  arbitraryUrlFetch: false,
  directMutation: false,
  historyReuse: true,
});

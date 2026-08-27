import authWorker from './auth-worker.js';

const SYSTEM_HEALTH_PATH = '/api/control/system-health';
const SYSTEM_HEALTH_CODE_PATH = '/api/control/system-health/code';
const SYSTEM_HEALTH_CODE_SCHEMA = 1;
const CODE_HEALTH_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/system-health-data/system-health-code-report.json';

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

function looksLikeMissingTable(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('no such table') || message.includes('system_usage_daily') || message.includes('system_usage_state');
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeCodeHealth(report) {
  if (!report || Number(report.schemaVersion) !== SYSTEM_HEALTH_CODE_SCHEMA) throw new Error('지원하지 않는 Code Health 스키마입니다.');
  const dimensions = Object.fromEntries(Object.entries(report.dimensions || {}).map(([key, item]) => [key, { weight:Number(item?.weight || 0), score:Number(item?.score || 0), status:String(item?.status || 'unknown'), detail:String(item?.detail || '') }]));
  const technicalDebt = Array.isArray(report.technicalDebt) ? report.technicalDebt.slice(0, 24).map(item => ({ id:String(item?.id || ''), severity:String(item?.severity || 'info'), category:String(item?.category || ''), title:String(item?.title || ''), detail:String(item?.detail || ''), recommendation:String(item?.recommendation || ''), evidence:Array.isArray(item?.evidence) ? item.evidence.slice(0, 8).map(String) : [] })) : [];
  return { schemaVersion:SYSTEM_HEALTH_CODE_SCHEMA, generatedAt:report.generatedAt || null, repository:String(report.repository || ''), branch:String(report.branch || ''), head:String(report.head || ''), overallScore:numberOrNull(report.overallScore), status:String(report.status || 'unknown'), thresholds:report.thresholds || {}, dimensions, metrics:report.metrics || {}, technicalDebt, cadence:report.cadence || {}, maintenancePolicy:Array.isArray(report.maintenancePolicy) ? report.maintenancePolicy.map(String) : [], privacy:{ publicSummaryOnly:true, secretsIncluded:false, rawLogsIncluded:false } };
}

async function fetchCodeHealthSnapshot() {
  const response = await fetch(CODE_HEALTH_URL, { headers:{ accept:'application/json' }, cache:'no-store' });
  if (!response.ok) throw new Error('Code Health snapshot HTTP ' + response.status);
  return sanitizeCodeHealth(await response.json());
}

export async function handleSystemHealthControl(request, env) {
  const url = new URL(request.url);
  if (![SYSTEM_HEALTH_PATH, SYSTEM_HEALTH_CODE_PATH].includes(url.pathname) || request.method !== 'GET') return null;

  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;

  if (url.pathname === SYSTEM_HEALTH_CODE_PATH) {
    try { return json(await fetchCodeHealthSnapshot(), 200, auth.response.headers); }
    catch (error) {
      console.error('System Health code snapshot error', error);
      return json({ error:'Code & Architecture Health 스냅샷을 읽지 못했습니다.', code:'SYSTEM_HEALTH_CODE_UNAVAILABLE' }, 503, auth.response.headers);
    }
  }

  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, auth.response.headers);
  const days = url.searchParams.get('days') === '30' ? 30 : 7;

  try {
    const [usage, state] = await Promise.all([
      env.DB.prepare(`SELECT day, requests, bandwidth_bytes, cached_requests, cached_bytes,
          unique_visitors, threats, collected_at
        FROM system_usage_daily
        WHERE source = 'cloudflare'
        ORDER BY day DESC
        LIMIT ?`).bind(days).all(),
      env.DB.prepare(`SELECT source, status, last_attempt_at, last_success_at, message
        FROM system_usage_state WHERE source = 'cloudflare' LIMIT 1`).first()
    ]);

    const series = (usage.results || []).reverse().map(row => ({
      day: row.day,
      requests: Number(row.requests || 0),
      bandwidthBytes: Number(row.bandwidth_bytes || 0),
      cachedRequests: Number(row.cached_requests || 0),
      cachedBytes: Number(row.cached_bytes || 0),
      uniqueVisitors: numberOrNull(row.unique_visitors),
      threats: Number(row.threats || 0),
      collectedAt: row.collected_at || null
    }));
    const latest = series.at(-1) || null;
    const requestTotal = series.reduce((sum, row) => sum + row.requests, 0);
    const bandwidthTotal = series.reduce((sum, row) => sum + row.bandwidthBytes, 0);
    const cachedRequestTotal = series.reduce((sum, row) => sum + row.cachedRequests, 0);

    return json({
      schemaVersion: 1,
      days,
      source: 'cloudflare',
      timeBasis: 'UTC daily aggregates',
      billingMetric: false,
      state: state ? {
        status: state.status,
        lastAttemptAt: state.last_attempt_at,
        lastSuccessAt: state.last_success_at,
        message: state.message || ''
      } : {
        status: 'pending',
        lastAttemptAt: null,
        lastSuccessAt: null,
        message: '첫 Analytics 집계를 기다리는 중입니다.'
      },
      summary: {
        latest,
        requestTotal,
        bandwidthTotal,
        cacheRequestPercent: requestTotal ? Math.round((cachedRequestTotal / requestTotal) * 1000) / 10 : null
      },
      series
    }, 200, auth.response.headers);
  } catch (error) {
    if (looksLikeMissingTable(error)) {
      return json({
        schemaVersion: 1,
        days,
        source: 'cloudflare',
        timeBasis: 'UTC daily aggregates',
        billingMetric: false,
        state: {
          status: 'pending',
          lastAttemptAt: null,
          lastSuccessAt: null,
          message: 'System Health 집계 스키마 적용을 기다리는 중입니다.'
        },
        summary: { latest: null, requestTotal: 0, bandwidthTotal: 0, cacheRequestPercent: null },
        series: []
      }, 200, auth.response.headers);
    }
    console.error('System Health control error', error);
    return json({ error: 'System Health 데이터를 읽지 못했습니다.', code: 'SYSTEM_HEALTH_READ_ERROR' }, 500, auth.response.headers);
  }
}

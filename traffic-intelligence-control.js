import authWorker from './auth-worker.js';
import {
  TRAFFIC_CLASSIFIER_VERSION,
  isAllowedTelemetryOrigin,
  trafficSiteIdForHost,
  normalizeTrafficHost,
} from './traffic-intelligence.js';

const VISIT_PATH = '/api/telemetry/visit';
const ADMIN_PATH = '/api/control/traffic-intelligence';
const encoder = new TextEncoder();

function responseHeaders(origin = '') {
  const headers = new Headers({
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'vary':'Origin',
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, origin = '') {
  const headers = responseHeaders(origin);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

function safeSiteId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : '';
}
async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method:'GET', headers:request.headers
  }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

async function sessionHash(day, host, sid) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${day}|${host}|${sid}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function telemetryOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin || !isAllowedTelemetryOrigin(origin, env.ALLOWED_ORIGINS || '')) return '';
  return origin;
}

async function handleVisit(request, env) {
  const origin = telemetryOrigin(request, env);
  if (!origin) return json({ error:'허용되지 않은 Origin입니다.', code:'TELEMETRY_ORIGIN_FORBIDDEN' }, 403);
  if (request.method === 'OPTIONS') {
    const headers = responseHeaders(origin);
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '86400');
    return new Response(null, { status:204, headers });
  }
  if (request.method !== 'POST') return json({ error:'POST만 허용됩니다.' }, 405, origin);
  if (!env.DB?.prepare) return new Response(null, { status:204, headers:responseHeaders(origin) });
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error:'Telemetry payload가 너무 큽니다.' }, 413, origin);
    const body = raw ? JSON.parse(raw) : {};
    const sid = String(body?.sid || '').trim();
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(sid)) return json({ error:'유효한 세션 식별자가 필요합니다.' }, 400, origin);

    const host = normalizeTrafficHost(new URL(origin).hostname);
    const mappedSite = safeSiteId(trafficSiteIdForHost(host));
    const siteId = mappedSite || safeSiteId(body?.site_id) || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const countryRaw = String(request.cf?.country || request.headers.get('cf-ipcountry') || 'XX').toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'XX';
    const hash = await sessionHash(day, host, sid);
    const now = new Date().toISOString();

    await env.DB.prepare(`INSERT OR IGNORE INTO traffic_human_sessions
      (day, host, site_id, session_hash, country, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(day, host, siteId, hash, country, now).run();
    return new Response(null, { status:204, headers:responseHeaders(origin) });
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (message.includes('no such table')) {
      console.warn('Traffic telemetry schema pending');
      return new Response(null, { status:204, headers:responseHeaders(origin) });
    }
    console.error('Traffic telemetry write error', error);
    return new Response(null, { status:204, headers:responseHeaders(origin) });
  }
}

function missingTrafficSchema(error) {
  const message = String(error?.message || error).toLowerCase();
  return message.includes('no such table') || message.includes('traffic_intelligence_') || message.includes('traffic_human_sessions');
}
function baseAggregate(key = '') {
  return {
    key,
    requestTotal:0,
    searchBotRequests:0,
    ekodiInternalRequests:0,
    otherBotRequests:0,
    unclassifiedRequests:0,
    humanSessions:0,
  };
}

function addTraffic(target, row) {
  target.requestTotal += Number(row.request_total || 0);
  target.searchBotRequests += Number(row.search_bot_requests || 0);
  target.ekodiInternalRequests += Number(row.ekodi_internal_requests || 0);
  target.otherBotRequests += Number(row.other_bot_requests || 0);
  target.unclassifiedRequests += Number(row.unclassified_requests || 0);
}

function finalizeAggregate(target) {
  const classified = target.searchBotRequests + target.ekodiInternalRequests + target.otherBotRequests;
  return {
    ...target,
    classifiedCoveragePercent:target.requestTotal ? Math.round((classified / target.requestTotal) * 1000) / 10 : 0,
  };
}

async function handleAdmin(request, env) {
  if (request.method !== 'GET') return null;
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  if (!env.DB?.prepare) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.' }, 503);

  const url = new URL(request.url);
  const days = url.searchParams.get('days') === '30' ? 30 : 7;
  const selectedSite = safeSiteId(url.searchParams.get('site'));
  const modifier = `-${days - 1} day`;
  try {
    const [traffic, humans, state] = await Promise.all([
      env.DB.prepare(`SELECT day, zone_name, host, site_id, request_total,
          search_bot_requests, ekodi_internal_requests, other_bot_requests,
          unclassified_requests, classifier_version, collected_at
        FROM traffic_intelligence_daily
        WHERE day >= date('now', ?)
        ORDER BY day ASC, host ASC`).bind(modifier).all(),
      env.DB.prepare(`SELECT day, host, site_id, country, COUNT(*) sessions
        FROM traffic_human_sessions
        WHERE day >= date('now', ?)
        GROUP BY day, host, site_id, country
        ORDER BY day ASC, host ASC`).bind(modifier).all(),
      env.DB.prepare(`SELECT source, status, last_attempt_at, last_success_at,
          zone_count, host_count, message, classifier_version
        FROM traffic_intelligence_state WHERE source='cloudflare' LIMIT 1`).first(),
    ]);

    const trafficRows = (traffic.results || []).filter(row => !selectedSite || row.site_id === selectedSite);
    const humanRows = (humans.results || []).filter(row => !selectedSite || row.site_id === selectedSite);
    const summary = baseAggregate('summary');
    const byDay = new Map();
    const bySite = new Map();
    const byCountry = new Map();

    for (const row of trafficRows) {
      addTraffic(summary, row);
      const day = byDay.get(row.day) || baseAggregate(row.day);
      addTraffic(day, row); byDay.set(row.day, day);
      const siteKey = row.site_id || trafficSiteIdForHost(row.host) || row.host;
      const site = bySite.get(siteKey) || { ...baseAggregate(siteKey), siteId:siteKey, hosts:new Set() };
      site.hosts.add(row.host); addTraffic(site, row); bySite.set(siteKey, site);
    }

    for (const row of humanRows) {
      const sessions = Number(row.sessions || 0);
      summary.humanSessions += sessions;
      const day = byDay.get(row.day) || baseAggregate(row.day);
      day.humanSessions += sessions; byDay.set(row.day, day);
      const siteKey = row.site_id || trafficSiteIdForHost(row.host) || row.host;
      const site = bySite.get(siteKey) || { ...baseAggregate(siteKey), siteId:siteKey, hosts:new Set() };
      site.hosts.add(row.host); site.humanSessions += sessions; bySite.set(siteKey, site);
      byCountry.set(row.country || 'XX', (byCountry.get(row.country || 'XX') || 0) + sessions);
    }
    const sites = [...bySite.values()].map(item => finalizeAggregate({
      ...item,
      hosts:[...item.hosts].sort(),
    })).sort((a, b) => b.requestTotal - a.requestTotal || b.humanSessions - a.humanSessions);
    const series = [...byDay.values()].map(finalizeAggregate).sort((a, b) => a.key.localeCompare(b.key));
    const countries = [...byCountry.entries()].map(([country, sessions]) => ({ country, sessions }))
      .sort((a, b) => b.sessions - a.sessions).slice(0, 20);

    return json({
      schemaVersion:1,
      classifierVersion:state?.classifier_version || TRAFFIC_CLASSIFIER_VERSION,
      days,
      selectedSite:selectedSite || null,
      timeBasis:'UTC daily aggregates',
      privacy:{
        rawIpStored:false,
        rawUserAgentStored:false,
        requestPathStored:false,
        humanSessionIdentifier:'daily rotating browser id, SHA-256 truncated before storage',
      },
      state:state ? {
        status:state.status,
        lastAttemptAt:state.last_attempt_at,
        lastSuccessAt:state.last_success_at,
        zoneCount:Number(state.zone_count || 0),
        hostCount:Number(state.host_count || 0),
        message:state.message || '',
      } : { status:'pending', lastAttemptAt:null, lastSuccessAt:null, zoneCount:0, hostCount:0, message:'첫 Traffic Intelligence 집계를 기다리는 중입니다.' },
      summary:finalizeAggregate(summary),
      sites,
      series,
      humanCountries:countries,
      notes:[
        '실사용자는 개인 식별이 아닌 일일 브라우저 세션 신호입니다.',
        '검색·AI 크롤러와 EKODI 내부 자동화는 User-Agent 신호로 분류합니다.',
        '확실하지 않은 요청은 사람으로 추정하지 않고 미분류로 남깁니다.'
      ]
    });
  } catch (error) {
    if (missingTrafficSchema(error)) {
      return json({
        schemaVersion:1, classifierVersion:TRAFFIC_CLASSIFIER_VERSION, days,
        selectedSite:selectedSite || null,
        state:{ status:'pending', message:'Traffic Intelligence 스키마 적용을 기다리는 중입니다.' },
        summary:finalizeAggregate(baseAggregate('summary')), sites:[], series:[], humanCountries:[]
      });
    }
    console.error('Traffic Intelligence admin read error', error);
    return json({ error:'Traffic Intelligence 데이터를 읽지 못했습니다.', code:'TRAFFIC_INTELLIGENCE_READ_ERROR' }, 500);
  }
}

export async function handleTrafficIntelligence(request, env) {
  const path = new URL(request.url).pathname;
  if (path === VISIT_PATH) return handleVisit(request, env);
  if (path === ADMIN_PATH) return handleAdmin(request, env);
  return null;
}

import { writeFile } from 'node:fs/promises';
import {
  TRAFFIC_CLASSIFIER_VERSION,
  classifyTrafficUserAgent,
  trafficSiteIdForHost,
  normalizeTrafficHost,
  classifiedCoveragePercent,
} from '../traffic-intelligence.js';

const outputPath = process.argv[2] || '/tmp/ekodi-traffic-intelligence.sql';
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const zoneAllowlist = new Set(String(process.env.EKODI_TRAFFIC_ZONE_ALLOWLIST || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
const cfApi = 'https://api.cloudflare.com/client/v4';
const now = new Date();

function sqlText(value) {
  return `'${String(value ?? '').replaceAll("'", "''").slice(0, 500)}'`;
}

function schemaSql() {
  return `CREATE TABLE IF NOT EXISTS traffic_intelligence_daily (
  day TEXT NOT NULL, zone_name TEXT NOT NULL, host TEXT NOT NULL, site_id TEXT NOT NULL DEFAULT '',
  request_total INTEGER NOT NULL DEFAULT 0, search_bot_requests INTEGER NOT NULL DEFAULT 0,
  ekodi_internal_requests INTEGER NOT NULL DEFAULT 0, other_bot_requests INTEGER NOT NULL DEFAULT 0,
  unclassified_requests INTEGER NOT NULL DEFAULT 0, classified_coverage_percent REAL NOT NULL DEFAULT 0,
  classifier_version TEXT NOT NULL, collected_at TEXT NOT NULL,
  PRIMARY KEY (day, zone_name, host)
);`;
}
function supportSchemaSql() {
  return `${schemaSql()}
CREATE INDEX IF NOT EXISTS idx_traffic_intelligence_day ON traffic_intelligence_daily(day DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_intelligence_site ON traffic_intelligence_daily(site_id, day DESC);
CREATE TABLE IF NOT EXISTS traffic_human_sessions (
  day TEXT NOT NULL, host TEXT NOT NULL, site_id TEXT NOT NULL DEFAULT '',
  session_hash TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'XX', first_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, host, session_hash)
);
CREATE INDEX IF NOT EXISTS idx_traffic_human_day ON traffic_human_sessions(day DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_human_site ON traffic_human_sessions(site_id, day DESC);
CREATE TABLE IF NOT EXISTS traffic_intelligence_state (
  source TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', last_attempt_at TEXT,
  last_success_at TEXT, zone_count INTEGER NOT NULL DEFAULT 0, host_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '', classifier_version TEXT NOT NULL DEFAULT ''
);`;
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`${cfApi}${path}`, {
    ...init,
    headers:{ authorization:`Bearer ${apiToken}`, accept:'application/json',
      ...(init.body ? { 'content-type':'application/json' } : {}), ...(init.headers || {}) }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.[0]?.message || `Cloudflare API HTTP ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}
async function resolveZones() {
  const payload = await cloudflare(`/zones?per_page=50&status=active&account.id=${encodeURIComponent(accountId)}`);
  return (payload.result || [])
    .filter(zone => zone?.id && zone?.name)
    .filter(zone => !zoneAllowlist.size || zoneAllowlist.has(String(zone.name).toLowerCase()))
    .map(zone => ({ id:String(zone.id), name:String(zone.name).toLowerCase() }));
}

async function graphQlRows(query, field) {
  const payload = await cloudflare('/graphql', { method:'POST', body:JSON.stringify({ query }) });
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Cloudflare GraphQL Analytics 조회 오류');
  const rows = payload.data?.viewer?.zones?.[0]?.[field];
  if (!Array.isArray(rows)) throw new Error(`Cloudflare GraphQL 응답에 ${field} 데이터가 없습니다.`);
  return rows;
}

function dailyWindow() {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 86400000);
  return {
    day:start.toISOString().slice(0, 10),
    start:start.toISOString(),
    end:end.toISOString(),
  };
}

async function queryHostTotals(zoneId, start, end) {
  const query = `query EKODITrafficHosts { viewer { zones(filter:{zoneTag:"${zoneId}"}) {
    httpRequestsAdaptiveGroups(limit:1000, filter:{datetime_geq:"${start}", datetime_lt:"${end}"}, orderBy:[count_DESC]) {
      count dimensions { clientRequestHTTPHost }
    }
  } } }`;
  return graphQlRows(query, 'httpRequestsAdaptiveGroups');
}
async function queryUserAgents(zoneId, start, end) {
  const query = `query EKODITrafficUA { viewer { zones(filter:{zoneTag:"${zoneId}"}) {
    httpRequestsAdaptiveGroups(limit:5000, filter:{datetime_geq:"${start}", datetime_lt:"${end}"}, orderBy:[count_DESC]) {
      count dimensions { clientRequestHTTPHost userAgent }
    }
  } } }`;
  return graphQlRows(query, 'httpRequestsAdaptiveGroups');
}

function ensureBucket(map, host) {
  const key = normalizeTrafficHost(host);
  if (!key) return null;
  if (!map.has(key)) map.set(key, {
    requestTotal:0,
    searchBotRequests:0,
    ekodiInternalRequests:0,
    otherBotRequests:0,
    unclassifiedRequests:0,
  });
  return map.get(key);
}

function addKnown(bucket, count, category) {
  const value = Math.max(0, Math.round(Number(count) || 0));
  if (category === 'search_bot') bucket.searchBotRequests += value;
  else if (category === 'ekodi_internal') bucket.ekodiInternalRequests += value;
  else if (category === 'other_bot') bucket.otherBotRequests += value;
}

function reconcileBucket(bucket, total) {
  bucket.requestTotal = Math.max(0, Math.round(Number(total) || 0));
  let known = bucket.searchBotRequests + bucket.ekodiInternalRequests + bucket.otherBotRequests;
  if (known > bucket.requestTotal && known > 0) {
    const scale = bucket.requestTotal / known;
    bucket.searchBotRequests = Math.round(bucket.searchBotRequests * scale);
    bucket.ekodiInternalRequests = Math.round(bucket.ekodiInternalRequests * scale);
    bucket.otherBotRequests = Math.max(0, bucket.requestTotal - bucket.searchBotRequests - bucket.ekodiInternalRequests);
    known = bucket.searchBotRequests + bucket.ekodiInternalRequests + bucket.otherBotRequests;
  }
  bucket.unclassifiedRequests = Math.max(0, bucket.requestTotal - known);
  return bucket;
}
async function writeFailure(message) {
  const attemptedAt = now.toISOString();
  const sql = `${supportSchemaSql()}
INSERT INTO traffic_intelligence_state
  (source, status, last_attempt_at, last_success_at, zone_count, host_count, message, classifier_version)
VALUES ('cloudflare', 'error', ${sqlText(attemptedAt)}, NULL, 0, 0, ${sqlText(message)}, ${sqlText(TRAFFIC_CLASSIFIER_VERSION)})
ON CONFLICT(source) DO UPDATE SET
  status=excluded.status, last_attempt_at=excluded.last_attempt_at,
  message=excluded.message, classifier_version=excluded.classifier_version;
`;
  await writeFile(outputPath, sql, 'utf8');
}

async function collectZone(zone, window) {
  const [hostRows, uaRows] = await Promise.all([
    queryHostTotals(zone.id, window.start, window.end),
    queryUserAgents(zone.id, window.start, window.end),
  ]);
  const buckets = new Map();
  for (const row of hostRows) {
    const host = normalizeTrafficHost(row?.dimensions?.clientRequestHTTPHost || zone.name);
    const bucket = ensureBucket(buckets, host);
    if (bucket) bucket.requestTotal = Math.max(0, Math.round(Number(row?.count) || 0));
  }
  for (const row of uaRows) {
    const host = normalizeTrafficHost(row?.dimensions?.clientRequestHTTPHost || zone.name);
    const bucket = ensureBucket(buckets, host);
    if (!bucket) continue;
    const classification = classifyTrafficUserAgent(row?.dimensions?.userAgent || '');
    addKnown(bucket, row?.count, classification.category);
  }
  for (const [host, bucket] of buckets) reconcileBucket(bucket, bucket.requestTotal);
  return buckets;
}
async function main() {
  if (!apiToken || !accountId) {
    await writeFailure('Cloudflare Traffic Intelligence 수집용 자격정보가 설정되지 않았습니다.');
    throw new Error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  }

  try {
    const zones = await resolveZones();
    const window = dailyWindow();
    const collectedAt = now.toISOString();
    const statements = [supportSchemaSql()];
    let hostCount = 0;

    for (const zone of zones) {
      const buckets = await collectZone(zone, window);
      hostCount += buckets.size;
      for (const [host, bucket] of buckets) {
        const siteId = trafficSiteIdForHost(host);
        const coverage = classifiedCoveragePercent(bucket);
        statements.push(`INSERT INTO traffic_intelligence_daily
  (day, zone_name, host, site_id, request_total, search_bot_requests,
   ekodi_internal_requests, other_bot_requests, unclassified_requests,
   classified_coverage_percent, classifier_version, collected_at)
VALUES (${sqlText(window.day)}, ${sqlText(zone.name)}, ${sqlText(host)}, ${sqlText(siteId)},
  ${bucket.requestTotal}, ${bucket.searchBotRequests}, ${bucket.ekodiInternalRequests},
  ${bucket.otherBotRequests}, ${bucket.unclassifiedRequests}, ${coverage},
  ${sqlText(TRAFFIC_CLASSIFIER_VERSION)}, ${sqlText(collectedAt)})
ON CONFLICT(day, zone_name, host) DO UPDATE SET
  site_id=excluded.site_id, request_total=excluded.request_total,
  search_bot_requests=excluded.search_bot_requests,
  ekodi_internal_requests=excluded.ekodi_internal_requests,
  other_bot_requests=excluded.other_bot_requests,
  unclassified_requests=excluded.unclassified_requests,
  classified_coverage_percent=excluded.classified_coverage_percent,
  classifier_version=excluded.classifier_version, collected_at=excluded.collected_at;`);
      }
    }
    statements.push(`INSERT INTO traffic_intelligence_state
  (source, status, last_attempt_at, last_success_at, zone_count, host_count, message, classifier_version)
VALUES ('cloudflare', 'ok', ${sqlText(collectedAt)}, ${sqlText(collectedAt)}, ${zones.length}, ${hostCount},
  ${sqlText(`${window.day} · ${zones.length}개 Zone · ${hostCount}개 Host 분류 완료`)}, ${sqlText(TRAFFIC_CLASSIFIER_VERSION)})
ON CONFLICT(source) DO UPDATE SET
  status=excluded.status, last_attempt_at=excluded.last_attempt_at,
  last_success_at=excluded.last_success_at, zone_count=excluded.zone_count,
  host_count=excluded.host_count, message=excluded.message,
  classifier_version=excluded.classifier_version;`);
    statements.push("DELETE FROM traffic_intelligence_daily WHERE day < date('now', '-90 day');");
    statements.push("DELETE FROM traffic_human_sessions WHERE day < date('now', '-35 day');");
    await writeFile(outputPath, `${statements.join('\n')}\n`, 'utf8');
    console.log(`Prepared Traffic Intelligence for ${zones.length} zones / ${hostCount} hosts (${window.day}).`);
  } catch (error) {
    const rawMessage = String(error?.message || error).slice(0, 400);
    const message = rawMessage.includes('zone.analytics.read')
      ? 'Cloudflare Analytics Read 권한이 없어 Traffic Intelligence를 수집하지 못했습니다.'
      : rawMessage;
    await writeFailure(message);
    throw new Error(message);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

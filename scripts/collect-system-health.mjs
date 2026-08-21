import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[2] || '/tmp/ekodi-system-health.sql';
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const serviceName = String(process.env.EKODI_SITE_WORKER_SERVICE || 'shy-thunder-39a4').trim();
const canonicalHost = String(process.env.EKODI_CANONICAL_HOST || 'admin.ekodi.kr').trim();
const cfApi = 'https://api.cloudflare.com/client/v4';
const now = new Date();

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function sqlText(value) {
  return `'${String(value ?? '').replaceAll("'", "''").slice(0, 500)}'`;
}

function schemaSql() {
  return `CREATE TABLE IF NOT EXISTS system_usage_daily (
  day TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'cloudflare',
  requests INTEGER NOT NULL DEFAULT 0,
  bandwidth_bytes INTEGER NOT NULL DEFAULT 0,
  cached_requests INTEGER NOT NULL DEFAULT 0,
  cached_bytes INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER,
  threats INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_usage_daily_day ON system_usage_daily(day DESC);
CREATE TABLE IF NOT EXISTS system_usage_state (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  message TEXT NOT NULL DEFAULT ''
);`;
}

async function writeFailure(message) {
  const attemptedAt = now.toISOString();
  const sql = `${schemaSql()}
INSERT INTO system_usage_state (source, status, last_attempt_at, last_success_at, message)
VALUES ('cloudflare', 'error', ${sqlText(attemptedAt)}, NULL, ${sqlText(message)})
ON CONFLICT(source) DO UPDATE SET
  status = excluded.status,
  last_attempt_at = excluded.last_attempt_at,
  message = excluded.message;
`;
  await writeFile(outputPath, sql, 'utf8');
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`${cfApi}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.[0]?.message || `Cloudflare API HTTP ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

async function resolveZoneId() {
  const payload = await cloudflare(`/accounts/${encodeURIComponent(accountId)}/workers/domains?service=${encodeURIComponent(serviceName)}`);
  const item = (payload.result || []).find(entry => entry.hostname === canonicalHost && entry.service === serviceName);
  if (!item?.zone_id) throw new Error(`Cloudflare zone ID를 ${canonicalHost} 연결정보에서 찾지 못했습니다.`);
  return item.zone_id;
}

async function queryDailyUsage(zoneId) {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(yesterday.getTime() - 29 * 86400000);
  const startDay = isoDay(start);
  const endDay = isoDay(yesterday);
  const safeZone = zoneId.replaceAll('"', '\\"');
  const query = `query EKODISystemUsage {
    viewer {
      zones(filter: { zoneTag: "${safeZone}" }) {
        httpRequests1dGroups(
          limit: 31
          filter: { date_geq: "${startDay}", date_leq: "${endDay}" }
          orderBy: [date_ASC]
        ) {
          dimensions { date }
          sum { requests bytes cachedRequests cachedBytes threats }
          uniq { uniques }
        }
      }
    }
  }`;

  const payload = await cloudflare('/graphql', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Cloudflare GraphQL Analytics 조회 오류');
  const rows = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
  if (!Array.isArray(rows)) throw new Error('Cloudflare GraphQL Analytics 응답에 일별 사용량이 없습니다.');
  return rows;
}

async function main() {
  if (!apiToken || !accountId) {
    await writeFailure('Cloudflare Analytics 수집용 자격정보가 설정되지 않았습니다.');
    throw new Error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  }

  try {
    const zoneId = await resolveZoneId();
    const rows = await queryDailyUsage(zoneId);
    const collectedAt = now.toISOString();
    const statements = [schemaSql()];

    for (const row of rows) {
      const day = String(row?.dimensions?.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const sum = row.sum || {};
      const uniq = row.uniq || {};
      const values = {
        requests: Math.max(0, Number(sum.requests) || 0),
        bandwidth: Math.max(0, Number(sum.bytes) || 0),
        cachedRequests: Math.max(0, Number(sum.cachedRequests) || 0),
        cachedBytes: Math.max(0, Number(sum.cachedBytes) || 0),
        uniques: Number.isFinite(Number(uniq.uniques)) ? Math.max(0, Number(uniq.uniques)) : null,
        threats: Math.max(0, Number(sum.threats) || 0)
      };
      statements.push(`INSERT INTO system_usage_daily
  (day, source, requests, bandwidth_bytes, cached_requests, cached_bytes, unique_visitors, threats, collected_at)
VALUES
  (${sqlText(day)}, 'cloudflare', ${values.requests}, ${values.bandwidth}, ${values.cachedRequests}, ${values.cachedBytes}, ${values.uniques === null ? 'NULL' : values.uniques}, ${values.threats}, ${sqlText(collectedAt)})
ON CONFLICT(day) DO UPDATE SET
  source = excluded.source,
  requests = excluded.requests,
  bandwidth_bytes = excluded.bandwidth_bytes,
  cached_requests = excluded.cached_requests,
  cached_bytes = excluded.cached_bytes,
  unique_visitors = excluded.unique_visitors,
  threats = excluded.threats,
  collected_at = excluded.collected_at;`);
    }

    statements.push(`INSERT INTO system_usage_state (source, status, last_attempt_at, last_success_at, message)
VALUES ('cloudflare', 'ok', ${sqlText(collectedAt)}, ${sqlText(collectedAt)}, ${sqlText(`${rows.length}일 집계 완료`)})
ON CONFLICT(source) DO UPDATE SET
  status = excluded.status,
  last_attempt_at = excluded.last_attempt_at,
  last_success_at = excluded.last_success_at,
  message = excluded.message;`);
    statements.push("DELETE FROM system_usage_daily WHERE day < date('now', '-90 day');");
    await writeFile(outputPath, `${statements.join('\n')}\n`, 'utf8');
    console.log(`Prepared ${rows.length} Cloudflare daily aggregate rows (${outputPath}).`);
  } catch (error) {
    const rawMessage = String(error?.message || error).slice(0, 400);
    const message = rawMessage.includes('zone.analytics.read')
      ? 'Cloudflare Analytics Read 권한이 없어 트래픽 집계를 수집하지 못했습니다.'
      : rawMessage;
    await writeFailure(message);
    throw new Error(message);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

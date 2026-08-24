import { readFileSync } from 'node:fs';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const marketingTenants = JSON.parse(
  readFileSync(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8')
);

const INFRA_SITES = [
  ['root', 'EKODI Root', 'ekodi.kr'],
  ['admin', 'EKODI Admin', 'admin.ekodi.kr'],
  ['auth', 'EKODI Auth', 'auth.ekodi.kr'],
  ['ai-gateway', 'EKODI AI Gateway', 'ai.ekodi.kr'],
  ['api', 'EKODI API', 'api.ekodi.kr', 'https://api.ekodi.kr/health'],
  ['finance', 'EKODI Finance API', 'finance-api.ekodi.kr', 'https://finance-api.ekodi.kr/health'],
  ['marketing-publish-api', 'Marketing Publishing API', 'marketing-publish-api.ekodi.kr', 'https://marketing-publish-api.ekodi.kr/health'],
  ['shell-js', 'EKODI Shell JS', 'shell.ekodi.kr', 'https://shell.ekodi.kr/shell.js'],
  ['shell-workspace', 'EKODI Workspace CSS', 'shell.ekodi.kr', 'https://shell.ekodi.kr/workspace.css']
];

const SERVICE_SITES = EKODI_SERVICE_MANIFEST.services
  .filter(service => service.state !== 'planned')
  .map(service => [
    service.id,
    service.name,
    new URL(service.url).hostname,
    service.url
  ]);

const MARKETING_TENANT_SITES = marketingTenants.tenants.map(row => [
  `marketing-tenant-${row.tenant}`,
  `${row.name} Marketing AI`,
  row.domain,
  `https://${row.domain}${row.landingPath || '/'}`
]);

const MARKETING_ALIAS_SITES = marketingTenants.tenants.flatMap(row =>
  (row.legacyDomains || []).map((domain, index) => [
    `marketing-alias-${row.tenant}-${index + 1}`,
    `${row.name} legacy alias`,
    domain,
    `https://${domain}/`
  ])
);

const EXTRA_SITES = [
  ['mission', '에코디선교회', 'youtube.com/@ekodicommunity', 'https://youtube.com/@ekodicommunity']
];

function uniqueSites(sites) {
  const seen = new Set();
  return sites.filter(site => {
    const key = `${site[0]}|${site[3] || `https://${site[2]}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const SITE_DEFINITIONS = Object.freeze(uniqueSites([
  ...INFRA_SITES,
  ...SERVICE_SITES,
  ...MARKETING_TENANT_SITES,
  ...MARKETING_ALIAS_SITES,
  ...EXTRA_SITES
]));

export function classifyStatus(httpStatus, responseTime) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 400) return 'offline';
  return responseTime > 2000 ? 'degraded' : 'online';
}

export async function checkSite(
  [id, name, domain, targetUrl],
  { fetchImpl = fetch, clock = () => performance.now(), now = () => new Date() } = {}
) {
  const url = targetUrl || `https://${domain}`;
  const started = clock();
  const checkedAt = now().toISOString();

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'EKODI-Monitor/3.0' }
    });
    await response.body?.cancel();
    const responseTime = Math.round(clock() - started);
    return {
      id,
      name,
      domain,
      url,
      status: classifyStatus(response.status, responseTime),
      httpStatus: response.status,
      responseTime,
      checkedAt,
      error: null
    };
  } catch (error) {
    return {
      id,
      name,
      domain,
      url,
      status: 'offline',
      httpStatus: null,
      responseTime: Math.round(clock() - started),
      checkedAt,
      error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error)
    };
  }
}

export function buildPayload(results, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    summary: {
      total: results.length,
      online: results.filter(site => site.status === 'online').length,
      degraded: results.filter(site => site.status === 'degraded').length,
      offline: results.filter(site => site.status === 'offline').length
    },
    sites: results
  };
}

function operationalSignature(payload) {
  return JSON.stringify((payload?.sites || []).map(site => ({
    id: site.id,
    status: site.status,
    httpStatus: site.httpStatus,
    error: site.error
  })));
}

export function shouldPublish(previous, next, now = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!previous?.generatedAt || operationalSignature(previous) !== operationalSignature(next)) return true;
  const previousTime = Date.parse(previous.generatedAt);
  return !Number.isFinite(previousTime) || now - previousTime >= maxAgeMs;
}

import { readFileSync } from 'node:fs';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const marketingTenants = JSON.parse(
  readFileSync(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8')
);

const INFRA_SITES = [
  ['root', 'EKODI Root', 'ekodi.kr'],
  ['admin', 'EKODI Admin', 'admin.ekodi.kr'],
  ['auth', 'EKODI Auth', 'auth.ekodi.kr'],
  ['auth-client-js', 'EKODI Auth Client', 'auth.ekodi.kr', 'https://auth.ekodi.kr/client-auth.js'],
  ['auth-router-js', 'EKODI Auth Router', 'auth.ekodi.kr', 'https://auth.ekodi.kr/auth-router.js'],
  ['ai-gateway', 'EKODI AI Gateway', 'ai.ekodi.kr'],
  ['api', 'EKODI API', 'api.ekodi.kr', 'https://api.ekodi.kr/health'],
  ['finance', 'EKODI Finance API', 'finance-api.ekodi.kr', 'https://finance-api.ekodi.kr/health'],
  ['marketing-publish-api', 'Marketing Publishing API', 'marketing-publish-api.ekodi.kr', 'https://marketing-publish-api.ekodi.kr/health'],
  ['shell-js', 'EKODI Shell JS', 'shell.ekodi.kr', 'https://shell.ekodi.kr/shell.js'],
  ['shell-workspace', 'EKODI Workspace CSS', 'shell.ekodi.kr', 'https://shell.ekodi.kr/workspace.css']
];

const COMMUNITY_CONNECT_SITES = [
  ['community-health', 'EKODI Community Health', 'community.ekodi.kr', 'https://community.ekodi.kr/health'],
  ['community-connect', 'EKODI Connect', 'community.ekodi.kr', 'https://community.ekodi.kr/connect/'],
  ['community-connect-app', 'EKODI Connect App', 'community.ekodi.kr', 'https://community.ekodi.kr/connect/app.js'],
  [
    'connect-api-auth-gate',
    'EKODI Connect API Auth Gate',
    'renzehysxirjilvdxacv.supabase.co',
    'https://renzehysxirjilvdxacv.supabase.co/functions/v1/connect-api/health',
    [401]
  ]
];

const BUSINESS_CHAIN_SITES = [
  ['business-health', 'Business OS Health', 'business.ekodi.kr', 'https://business.ekodi.kr/health'],
  ['business-config', 'Business OS Runtime Config', 'business.ekodi.kr', 'https://business.ekodi.kr/config.js'],
  ['business-workspaces', 'Business OS Workspaces', 'business.ekodi.kr', 'https://business.ekodi.kr/api/workspaces'],
  ['business-auth-entry', 'Business OS Auth Entry', 'auth.ekodi.kr', 'https://auth.ekodi.kr/?site=business&return_to=https%3A%2F%2Fbusiness.ekodi.kr%2F'],
  ['business-auth-module', 'Business OS Auth Module', 'auth.ekodi.kr', 'https://auth.ekodi.kr/business-auth.js?v=20260824-business-resume-1'],
  ['business-biz', 'EKODIBIZ Business Hub', 'biz.ekodi.kr', 'https://biz.ekodi.kr/'],
  ['business-pay', 'EKODI Business Pay', 'pay.biz.ekodi.kr', 'https://pay.biz.ekodi.kr/'],
  ['business-mail', 'EKODI Business Mail', 'mail.biz.ekodi.kr', 'https://mail.biz.ekodi.kr/'],
  ['business-trade', 'EKODI Business Trade', 'trade.biz.ekodi.kr', 'https://trade.biz.ekodi.kr/']
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

const MARKETING_PUBLIC_SITES = marketingTenants.tenants
  .filter(row => row.publicSiteDomain && row.visibility !== 'private')
  .map(row => [
    `marketing-public-${row.tenant}`,
    `${row.name} public site`,
    row.publicSiteDomain,
    `https://${row.publicSiteDomain}/`
  ]);

const MARKETING_PRIVATE_SITES = marketingTenants.tenants
  .filter(row => row.privateSiteDomain && row.visibility === 'private')
  .map(row => [
    `marketing-private-${row.tenant}`,
    `${row.name} private site`,
    row.privateSiteDomain,
    `https://${row.privateSiteDomain}/`
  ]);

const MARKETING_ALIAS_SITES = marketingTenants.tenants.flatMap(row =>
  (row.legacyDomains || []).map((domain, index) => [
    `marketing-alias-${row.tenant}-${index + 1}`,
    `${row.name} legacy alias`,
    domain,
    `https://${domain}/`
  ])
);

// These are intentionally still marked planned in the service manifest, but their
// public endpoints are already live and therefore remain part of operational checks.
const LIVE_PRELAUNCH_SITES = [
  ['prelaunch-mail', 'EKODI Mail', 'mail.ekodi.kr', 'https://mail.ekodi.kr/'],
  ['prelaunch-live', 'EKODI Live', 'live.ekodi.kr', 'https://live.ekodi.kr/'],
  ['prelaunch-cloud', 'EKODI Cloud', 'cloud.ekodi.kr', 'https://cloud.ekodi.kr/']
];

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
  ...COMMUNITY_CONNECT_SITES,
  ...BUSINESS_CHAIN_SITES,
  ...SERVICE_SITES,
  ...MARKETING_TENANT_SITES,
  ...MARKETING_PUBLIC_SITES,
  ...MARKETING_PRIVATE_SITES,
  ...MARKETING_ALIAS_SITES,
  ...LIVE_PRELAUNCH_SITES,
  ...EXTRA_SITES
]));

export function classifyStatus(httpStatus, responseTime) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 400) return 'offline';
  return responseTime > 2000 ? 'degraded' : 'online';
}

function classifyExpectedStatus(httpStatus, responseTime, expectedStatuses) {
  if (!Array.isArray(expectedStatuses) || expectedStatuses.length === 0) {
    return classifyStatus(httpStatus, responseTime);
  }
  if (!expectedStatuses.includes(httpStatus)) return 'offline';
  return responseTime > 2000 ? 'degraded' : 'online';
}

export async function checkSite(
  [id, name, domain, targetUrl, expectedStatuses],
  { fetchImpl = fetch, clock = () => performance.now(), now = () => new Date() } = {}
) {
  const url = targetUrl || `https://${domain}`;
  const started = clock();
  const checkedAt = now().toISOString();

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'EKODI-Monitor/3.2' }
    });
    await response.body?.cancel();
    const responseTime = Math.round(clock() - started);
    return {
      id,
      name,
      domain,
      url,
      status: classifyExpectedStatus(response.status, responseTime, expectedStatuses),
      httpStatus: response.status,
      responseTime,
      checkedAt,
      expectedStatuses: Array.isArray(expectedStatuses) ? [...expectedStatuses] : null,
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
      expectedStatuses: Array.isArray(expectedStatuses) ? [...expectedStatuses] : null,
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

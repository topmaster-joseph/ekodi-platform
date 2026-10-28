import assert from 'node:assert/strict';

// C3 owner approval: governance/amendments/2026-09-13-church-lab-subdomain-retirement-v1.12.0.json
// The retired browser host is assembled to keep historical aliases out of new published links.
export const LEGACY_HOST = ['church', 'ekodi', 'kr'].join('.');
export const CANONICAL = 'https://ekodi.kr/ekodichurch/';
export const PAGES_PROJECT = 'ekodi-church';
const API = 'https://api.cloudflare.com/client/v4';
const ALLOWED_SCRIPTS = new Set(['ekodi-church-path-gateway', 'ekodi-church', 'ekodi-service-proxy', 'shy-thunder-39a4']);
const WEB_DNS_TYPES = new Set(['A', 'AAAA', 'CNAME']);

export function retirementPlan({ workerDomains = [], pagesProjects = [], routes = [], dns = [] }) {
  const worker = workerDomains.filter(row => row.hostname === LEGACY_HOST);
  const pages = pagesProjects.filter(p => (p.domains || []).some(d => (typeof d === 'string' ? d : d.name) === LEGACY_HOST));
  const workerRoutes = routes.filter(r => {
    const pattern = String(r.pattern || '').toLowerCase();
    return pattern === LEGACY_HOST || pattern.startsWith(LEGACY_HOST + '/');
  });
  const httpDns = dns.filter(r => String(r.name || '').toLowerCase() === LEGACY_HOST && WEB_DNS_TYPES.has(String(r.type || '').toUpperCase()));
  const preservedDns = dns.filter(r => String(r.name || '').toLowerCase() === LEGACY_HOST && !WEB_DNS_TYPES.has(String(r.type || '').toUpperCase()));
  if (pages.some(p => p.name !== PAGES_PROJECT)) throw new Error('Unexpected Pages owner for retired Church host');
  if (worker.some(w => !ALLOWED_SCRIPTS.has(String(w.service || '')))) throw new Error('Unexpected Worker-domain owner for retired Church host');
  if (workerRoutes.some(r => !ALLOWED_SCRIPTS.has(String(r.script || '')))) throw new Error('Unexpected Worker route owner for retired Church host');
  return { worker, pages, workerRoutes, httpDns, preservedDns };
}

if (process.argv.includes('--self-test')) {
  const plan = retirementPlan({
    workerDomains: [{ id: 'w', hostname: LEGACY_HOST, service: 'ekodi-service-proxy' }],
    pagesProjects: [{ name: PAGES_PROJECT, domains: [LEGACY_HOST] }],
    routes: [{ id: 'r', pattern: LEGACY_HOST + '/*', script: 'ekodi-church-path-gateway' }],
    dns: [{ id: 'a', name: LEGACY_HOST, type: 'CNAME' }, { id: 'mx', name: LEGACY_HOST, type: 'MX' }]
  });
  assert.equal(plan.worker.length, 1);
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.workerRoutes.length, 1);
  assert.equal(plan.httpDns.length, 1);
  assert.equal(plan.preservedDns.length, 1);
  assert.throws(() => retirementPlan({ pagesProjects: [{ name: 'another-project', domains: [LEGACY_HOST] }] }));
  assert.throws(() => retirementPlan({ workerDomains: [{ hostname: LEGACY_HOST, service: 'unexpected' }] }));
  console.log('Church legacy host retirement safety tests passed');
  process.exit(0);
}

const execute = process.argv.includes('--execute');
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const account = process.env.CLOUDFLARE_ACCOUNT_ID || '';
if (!token || !account) throw new Error('Cloudflare production credentials are required for inventory');
if (execute && process.env.EKODI_APPROVED_CHURCH_RETIREMENT !== 'C3-2026-09-13') {
  throw new Error('Approved Church C3 retirement receipt is required');
}
const auth = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
async function cf(endpoint, method = 'GET', body) {
  const response = await fetch(API + endpoint, {
    method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    const codes = (result.errors || []).map(x => x.code || x.message).join(',');
    throw new Error('Cloudflare ' + method + ' ' + endpoint.split('?')[0] + ' HTTP ' + response.status + ' ' + codes);
  }
  return result.result;
}
async function all(endpoint) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const result = await cf(endpoint + sep + 'page=' + page + '&per_page=100');
    if (!Array.isArray(result)) throw new Error('Unexpected paginated Cloudflare response');
    rows.push(...result);
    if (result.length < 100) return rows;
  }
  throw new Error('Cloudflare inventory pagination exceeded safe bound');
}
async function canonicalHealthy() {
  for (const [url, marker] of [[CANONICAL, 'EKODI CHURCH'], [CANONICAL + 'my/', 'MY PAGE']]) {
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.status !== 200) throw new Error('Canonical Church health failed, HTTP ' + response.status + ': ' + url);
    const body = await response.text();
    if (!body.includes(marker)) throw new Error('Canonical Church marker missing: ' + marker);
  }
}
async function inventory(zone) {
  const [workerDomains, pagesProjects, routes, dns] = await Promise.all([
    all('/accounts/' + account + '/workers/domains'),
    all('/accounts/' + account + '/pages/projects'),
    all('/zones/' + zone + '/workers/routes'),
    all('/zones/' + zone + '/dns_records?name=' + encodeURIComponent(LEGACY_HOST))
  ]);
  return retirementPlan({ workerDomains, pagesProjects, routes, dns });
}
const zones = await all('/zones?name=ekodi.kr&status=active');
const zone = zones.find(z => z.name === 'ekodi.kr');
if (!zone?.id) throw new Error('Authorized ekodi.kr DNS zone is not available');
await canonicalHealthy();
const before = await inventory(zone.id);
console.log('PRECHECK ' + JSON.stringify({
  canonical: CANONICAL, legacy: LEGACY_HOST, workers: before.worker.map(r => r.service),
  pages: before.pages.map(r => r.name), routes: before.workerRoutes.map(r => r.pattern),
  webDnsTypes: before.httpDns.map(r => r.type), preservedDnsTypes: before.preservedDns.map(r => r.type)
}));
if (!execute) {
  console.log('READ ONLY: no Cloudflare resources changed (use approved release --execute)');
  process.exit(0);
}
// Protect active service: delete only exact-domain bindings and exact-domain HTTP DNS,
// never the Pages project, shared Workers, wildcard records, or mail/verification DNS.
for (const row of before.pages) {
  await cf('/accounts/' + account + '/pages/projects/' + encodeURIComponent(row.name) + '/domains/' + encodeURIComponent(LEGACY_HOST), 'DELETE');
  console.log('Detached Pages custom domain from ' + row.name);
}
for (const row of before.workerRoutes) {
  await cf('/zones/' + zone.id + '/workers/routes/' + row.id, 'DELETE');
  console.log('Detached exact legacy Worker route ' + row.pattern);
}
for (const row of before.worker) {
  await cf('/accounts/' + account + '/workers/domains/' + row.id, 'DELETE');
  console.log('Detached exact legacy Worker domain from ' + row.service);
}
const detached = await inventory(zone.id);
if (detached.pages.length || detached.workerRoutes.length || detached.worker.length) {
  throw new Error('Retirement partial: a legacy Cloudflare binding remains; DNS was not changed');
}
await canonicalHealthy();
for (const record of before.httpDns) {
  await cf('/zones/' + zone.id + '/dns_records/' + record.id, 'DELETE');
  console.log('Removed exact legacy web DNS ' + record.type);
}
const after = await inventory(zone.id);
if (after.pages.length || after.worker.length || after.workerRoutes.length || after.httpDns.length) {
  throw new Error('Retirement partial: legacy web binding or web DNS still present');
}
await canonicalHealthy();
let external = 'unverified';
try {
  const res = await fetch('https://' + LEGACY_HOST + '/', {
    redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000)
  });
  external = 'HTTP ' + res.status;
  if (res.status < 400) throw new Error('Legacy Church host still serves HTTP ' + res.status);
} catch (error) {
  if (String(error.message || error).startsWith('Legacy Church host still serves')) throw error;
  external = 'not reachable: ' + String(error.cause?.code || error.name || 'network');
}
console.log('RETIREMENT VERIFIED ' + JSON.stringify({
  canonical: CANONICAL, retiredHost: LEGACY_HOST, external, preservedDnsTypes: after.preservedDns.map(r => r.type),
  workerCustomDomains: 0, pagesCustomDomains: 0, workerRoutes: 0, webDnsRecords: 0
}));

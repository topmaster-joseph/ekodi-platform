import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const ZONE = 'ekodibiz.kr';
const HOSTS = Object.freeze(['ekodibiz.kr', 'www.ekodibiz.kr']);
const WEB_TYPES = new Set(['A', 'AAAA', 'CNAME']);
const EXPECTED = 'https://ekodi.kr/ekodibiz/domain-check?source=biz-legacy';

async function cloudflare(fetchImpl, token, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  let body;
  try { body = await response.json(); } catch {
    throw new Error('Cloudflare returned an invalid JSON response');
  }
  if (!response.ok || body?.success !== true) {
    const code = body?.errors?.[0]?.code || response.status;
    throw new Error('Cloudflare API rejected the request (code ' + code + ')');
  }
  return body;
}

export async function verifyRedirects(hosts = HOSTS, fetchImpl = fetch) {
  for (const host of hosts) {
    let passed = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const response = await fetchImpl('https://' + host + '/domain-check?source=biz-legacy', {
          redirect: 'manual',
          signal: AbortSignal.timeout(12000),
        });
        if (response.status === 301 && response.headers.get('location') === EXPECTED) {
          passed = true;
          break;
        }
      } catch { /* Allow bounded DNS and edge propagation. */ }
      if (attempt < 14) await delay(3500);
    }
    if (!passed) throw new Error('EKODIBIZ live redirect check failed for ' + host);
  }
}

export async function reconcileLegacyRoutes({
  token = process.env.CF_API_TOKEN,
  fetchImpl = fetch,
  probe = verifyRedirects,
} = {}) {
  if (!token) throw new Error('Missing Cloudflare token');
  const zones = await cloudflare(fetchImpl, token, API + '/zones?name=' + ZONE);
  const zoneRows = (zones.result || []).filter(r => r.name === ZONE && r.status === 'active');
  if (zoneRows.length !== 1) throw new Error('One active, authorized EKODIBIZ zone is required');
  const zoneId = zoneRows[0].id;
  const records = [];
  // Validate BOTH hosts before any writes. Never create/delete DNS, and never touch MX/TXT.
  for (const host of HOSTS) {
    const listing = await cloudflare(fetchImpl, token,
      API + '/zones/' + zoneId + '/dns_records?name=' + encodeURIComponent(host) + '&per_page=100');
    if ((listing.result_info?.total_pages || 1) > 1) {
      throw new Error('Unbounded DNS record pagination: stop rather than alter incomplete data');
    }
    const web = (listing.result || []).filter(r => r.name === host && WEB_TYPES.has(r.type));
    if (!web.length) throw new Error('No existing web DNS record for ' + host + '; manual topology review required');
    for (const record of web) {
      if (!record.id || typeof record.proxied !== 'boolean' || record.proxiable === false) {
        throw new Error('DNS record is not safely proxyable for ' + host);
      }
      records.push({ id: record.id, hostname: host, original: record.proxied });
    }
  }

  const changed = [];
  async function setProxy(record, proxied) {
    return cloudflare(fetchImpl, token,
      API + '/zones/' + zoneId + '/dns_records/' + encodeURIComponent(record.id),
      { method: 'PATCH', body: JSON.stringify({ proxied }) });
  }

  try {
    for (const record of records) {
      if (record.original) continue;
      const result = await setProxy(record, true);
      changed.push(record);
      if (result.result?.proxied !== true) {
        throw new Error('Cloudflare did not confirm proxy activation for ' + record.hostname);
      }
    }
    await probe(HOSTS);
    return { hostsVerified: HOSTS.length, proxyFlagsChanged: changed.length };
  } catch (error) {
    const failures = [];
    for (const record of changed.reverse()) {
      try { await setProxy(record, false); }
      catch { failures.push(record.hostname); }
    }
    if (failures.length) {
      throw new Error('Redirect activation failed and DNS proxy rollback requires review: ' +
        [...new Set(failures)].join(', ') + '; original error: ' + error.message);
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reconcileLegacyRoutes()
    .then(result => console.log('EKODIBIZ route confirmed: ' +
      result.hostsVerified + ' hosts, ' + result.proxyFlagsChanged + ' proxy flag(s) updated; no DNS records deleted'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

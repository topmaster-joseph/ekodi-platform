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

export async function verifyRedirects(hosts = HOSTS, fetchImpl = fetch, options = {}) {
  // Existing public DNS answers can remain cached for 300 seconds after orange-cloud
  // activation. Bound retries past the DNS TTL without leaving proxy changes active
  // indefinitely on a failed deployment.
  const attempts = options.attempts ?? 105;
  const intervalMs = options.intervalMs ?? 4000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 8000;
  const maxElapsedMs = options.maxElapsedMs ?? 420000;
  for (const host of hosts) {
    let passed = false;
    let lastObservation = 'no response';
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetchImpl('https://' + host + '/domain-check?source=biz-legacy', {
          redirect: 'manual',
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        const location = response.headers.get('location') || '(missing)';
        lastObservation = 'HTTP ' + response.status + ', location=' + location;
        if (response.status === 301 && location === EXPECTED) {
          passed = true;
          console.info('EKODIBIZ redirect live-verified for ' + host +
            ' (attempt ' + attempt + '/' + attempts + ')');
          break;
        }
      } catch (error) {
        // Display only a bounded, non-secret error class for diagnostic evidence.
        const code = String(error?.cause?.code || error?.code || error?.name || 'fetch_error');
        lastObservation = 'fetch error class=' + code.slice(0, 60);
      }
      if (attempt === 1 || attempt % 15 === 0) {
        console.info('EKODIBIZ DNS/TLS propagation check for ' + host +
          ' (' + attempt + '/' + attempts + '): ' + lastObservation);
      }
      // A hard wall-clock deadline ensures both hosts and DNS rollback fit
      // inside the guarded 20-minute deployment job, even with slow TLS errors.
      if (Date.now() - startedAt >= maxElapsedMs) break;
      if (attempt < attempts) await delay(intervalMs);
    }
    if (!passed) throw new Error('EKODIBIZ live redirect check failed for ' + host +
      ' after ' + attempts + ' attempts. Last observation: ' + lastObservation);
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
    console.info('Web DNS proxy reconciliation: ' + changed.length + ' flag(s) activated; ' +
      'MX/TXT records untouched. Checking public HTTPS 301 after DNS propagation.');
    await probe(HOSTS);
    return { hostsVerified: HOSTS.length, proxyFlagsChanged: changed.length };
  } catch (error) {
    const failures = [];
    for (const record of changed.reverse()) {
      try { await setProxy(record, false); }
      catch { failures.push(record.hostname); }
    }
    console.error('Redirect verification did not pass. Rollback attempted for ' +
      changed.length + ' changed web proxy flag(s).');
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

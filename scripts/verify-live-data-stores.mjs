#!/usr/bin/env node
/**
 * Independent, bounded, read-only public D1 runtime verification.
 * Response bodies, citizen posts, database IDs and secrets are never logged.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTERNAL = 'https://seonammedi.kr';
const INTERNAL = 'https://ekodi.kr/seonammedi';

function checks(scope) {
  const list = [
    { name: 'external-health', url: EXTERNAL + '/board/health', type: 'health', status: 200 },
    { name: 'external-posts', url: EXTERNAL + '/board/api/posts', type: 'posts', status: 200 },
  ];
  if (scope === 'full') list.push(
    { name: 'internal-health', url: INTERNAL + '/board/health', type: 'health', status: 200 },
    { name: 'internal-posts', url: INTERNAL + '/board/api/posts', type: 'posts', status: 200 },
    { name: 'external-finance', url: EXTERNAL + '/board/api/finance', type: 'collection', status: 200 },
    { name: 'external-notices', url: EXTERNAL + '/board/api/notices', type: 'collection', status: 200 },
    { name: 'anonymous-admin-denied', url: EXTERNAL + '/board/api/admin/finance', type: 'forbidden', status: 403 },
  );
  return list;
}

export function validatePublicProbeBody(type, body) {
  if (!body || typeof body !== 'object') return false;
  if (type === 'health') return body.ok === true && body.service === 'independent-board' &&
    body.storage === 'independent-board-d1' && body.db === true &&
    body.files === true && body.queue === 'ready' && body.rateLimiter === true;
  if (type === 'posts') return body.ok === true && body.storage === 'independent-board-d1' &&
    Array.isArray(body.items);
  if (type === 'collection') return body.ok === true && body.storage === 'independent-board-d1';
  return false;
}

export async function verifyLiveDataStores({ fetchImpl = fetch, scope = 'lite', timeoutMs = 7000 } = {}) {
  if (!['lite', 'full'].includes(scope)) throw new Error('Unsupported read-only verification scope');
  const report = {
    policy: 'EKODI-DATA-STORE-TOPOLOGY-001',
    checkedAt: new Date().toISOString(), scope,
    resourceIdentityConfirmed: false, // Public checks cannot verify Cloudflare resource UUID.
    backupRestoreVerified: false,      // A read-only health check is not a restore drill.
    ok: true, circuitOpen: false, probes: [],
  };
  for (const check of checks(scope)) {
    let status = 0, error = '';
    try {
      const result = await fetchImpl(check.url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = result.status;
      if (status === 429 || status === 1027) {
        report.circuitOpen = true;
        error = 'quota-protection';
      } else if (status !== check.status) {
        error = 'unexpected-http-status';
      } else if (check.type !== 'forbidden') {
        const mediaType = result.headers.get('content-type') || '';
        if (!mediaType.includes('application/json')) error = 'unexpected-content-type';
        else {
          const body = await result.json().catch(() => null);
          if (!validatePublicProbeBody(check.type, body)) error = 'unexpected-payload';
        }
      }
    } catch {
      error = 'probe-unreachable';
    }
    report.probes.push({ name: check.name, status, ok: !error, ...(error ? { error } : {}) });
    if (error) report.ok = false;
    if (report.circuitOpen) break;
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const getOption = key => process.argv.find(a => a.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
  const scope = getOption('scope') || 'lite';
  const output = getOption('output');
  try {
    const report = await verifyLiveDataStores({ scope });
    const formatted = JSON.stringify(report, null, 2) + '\n';
    if (output) await writeFile(output, formatted, 'utf8');
    // No source content or private values in the report.
    process.stdout.write(formatted);
    if (!report.ok) process.exitCode = 1;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'probe-configuration-invalid', message: e.message }));
    process.exitCode = 1;
  }
}

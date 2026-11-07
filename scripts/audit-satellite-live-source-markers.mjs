/**
 * Public, read-only release marker audit for two satellite cutovers.
 * A matching marker proves public source provenance only, not provider bindings,
 * access controls, Git backup integrity, rollback or repository deletion readiness.
 *
 * Usage: node scripts/audit-satellite-live-source-markers.mjs
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CANONICAL_SOURCE = 'topmaster-joseph/ekodi-platform';
export const PUBLIC_MARKER_TARGETS = Object.freeze([
  Object.freeze({
    service: 'church',
    retiredRepository: 'topmaster-joseph/ekodi-church',
    contract: 'ekodi.church-release.v2',
    urls: Object.freeze(['https://ekodi.kr/ekodichurch/church-release.json']),
    requirePayloadHash: true
  }),
  Object.freeze({
    service: 'lab',
    retiredRepository: 'topmaster-joseph/ekodi-site',
    contract: 'ekodi.lab-release.v1',
    urls: Object.freeze([
      'https://ekodi.kr/ekodilab/lab-release.json',
      'https://ekodilab.pages.dev/lab-release.json'
    ]),
    requirePayloadHash: false
  })
]);

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MARKER_BYTES = 4096;

function examineMarker(target, marker) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return 'marker-is-not-an-object';
  if (marker.contract !== target.contract) return 'contract-is-not-approved-canonical-version';
  if (marker.sourceRepository !== CANONICAL_SOURCE) return 'live-source-is-not-canonical-platform';
  if (!SHA40.test(marker.sourceSha || '')) return 'invalid-source-sha';
  if (target.requirePayloadHash && !SHA256.test(marker.payloadSha256 || '')) return 'missing-or-invalid-payload-sha256';
  return null;
}

async function fetchMarker(url, fetcher) {
  // No caller-controlled URLs, credentials, redirects or private APIs.
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });
  if (!response?.ok) throw new Error('http-' + String(response?.status ?? 'no-response'));
  const contentType = response.headers?.get?.('content-type') || '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|\s*$)/i.test(contentType)) {
    throw new Error('non-json-content-type');
  }
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_MARKER_BYTES) throw new Error('marker-too-large');
  try { return JSON.parse(body); }
  catch { throw new Error('invalid-json'); }
}

export async function auditSatelliteLiveSourceMarkers({ fetcher = fetch, targets = PUBLIC_MARKER_TARGETS } = {}) {
  // Injected targets support offline tests, never external CLI or provider discovery.
  const services = [];
  for (const target of targets) {
    const observations = [];
    for (const url of target.urls) {
      try {
        const marker = await fetchMarker(url, fetcher);
        const failure = examineMarker(target, marker);
        observations.push({
          url,
          verified: failure === null,
          failure,
          contract: typeof marker?.contract === 'string' ? marker.contract : null,
          sourceRepository: typeof marker?.sourceRepository === 'string' ? marker.sourceRepository : null,
          sourceSha: typeof marker?.sourceSha === 'string' ? marker.sourceSha : null,
          payloadSha256: typeof marker?.payloadSha256 === 'string' ? marker.payloadSha256 : null
        });
      } catch (error) {
        observations.push({url, verified: false, failure: String(error?.message || 'fetch-failed')});
      }
    }
    const valid = observations.length === target.urls.length && observations.every(item => item.verified);
    const matchingSha = valid && observations.every(item => item.sourceSha === observations[0].sourceSha);
    const matchingPayload = valid && observations.every(item => item.payloadSha256 === observations[0].payloadSha256);
    const sourceMarkerVerified = Boolean(valid && matchingSha && matchingPayload);
    const blocker = !valid ? 'unverified-or-legacy-production-marker'
      : !matchingSha || !matchingPayload ? 'canonical-pages-marker-mismatch'
      : null;
    services.push({
      service: target.service,
      retiredRepository: target.retiredRepository,
      sourceMarkerVerified,
      blocker,
      observations,
      cloudflareDeploymentBindingVerified: false,
      independentRollbackVerified: false,
      immutableOffsiteRestoreVerified: false,
      repositoryDeletionAuthorized: false
    });
  }
  return {
    contract: 'ekodi.satellite-live-source-marker-audit.v1',
    mode: 'public-read-only',
    canonicalRepository: CANONICAL_SOURCE,
    checkedAt: new Date().toISOString(),
    doesNotVerify: ['provider-deployment-binding', 'full-git-backup', 'rollback', 'tenant-access', 'approval'],
    readyForRepositoryDeletion: false,
    services,
    errors: services.filter(item => !item.sourceMarkerVerified).map(item => item.service + ':' + item.blocker)
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  auditSatelliteLiveSourceMarkers().then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

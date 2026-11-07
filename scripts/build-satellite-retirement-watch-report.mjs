/**
 * Combine immutable source-registry retirement state with public release-marker
 * observations. This never certifies deletion: neither source markers nor this
 * repository include privileged provider/backup/rollback/human-gate evidence.
 *
 * CLI: node scripts/build-satellite-retirement-watch-report.mjs
 *         <retirement.json> <markers.json> [--markdown]
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT = 'ekodi.satellite-retirement-watch.v1';
const RETIREMENT_POLICY = 'SOURCE-REPO-RETIREMENT-001';
const MARKER_CONTRACT = 'ekodi.satellite-live-source-marker-audit.v1';
const CANONICAL_REPO = 'topmaster-joseph/ekodi-platform';
const validRepo = s => typeof s === 'string' && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s);
const requireState = (condition, reason) => {
  if (!condition) throw new Error('satellite-watch-invalid-evidence:' + reason);
};

export function buildSatelliteRetirementWatchReport(retirement, markers) {
  requireState(retirement?.policyId === RETIREMENT_POLICY, 'retirement-policy');
  requireState(retirement?.mode === 'read-only-retirement-gate', 'retirement-mutation-mode');
  requireState(retirement?.canonicalRepository === CANONICAL_REPO, 'retirement-canonical-repo');
  requireState(retirement?.deletionCompleted === false && retirement?.deletionExecutableByThisTool === false,
    'retirement-mutation-authority');
  requireState(Array.isArray(retirement?.errors) && retirement.errors.length === 0, 'retirement-audit-errors');
  requireState(Array.isArray(retirement?.repositories) && retirement.repositories.length > 0,
    'retirement-repositories-missing');
  requireState(Number.isInteger(retirement.registeredSatelliteRepositories) &&
    retirement.registeredSatelliteRepositories === retirement.repositories.length, 'registry-count-mismatch');
  requireState(markers?.contract === MARKER_CONTRACT && markers?.mode === 'public-read-only',
    'marker-contract-or-mode');
  requireState(markers?.canonicalRepository === CANONICAL_REPO &&
    markers?.readyForRepositoryDeletion === false, 'marker-deletion-readiness');
  requireState(Array.isArray(markers.services) && Array.isArray(markers.errors), 'marker-services-missing');
  requireState(typeof markers.checkedAt === 'string' && Number.isFinite(Date.parse(markers.checkedAt)),
    'marker-observation-time');

  const byRepo = new Map();
  for (const row of retirement.repositories) {
    requireState(validRepo(row?.repository) && row.repository !== CANONICAL_REPO, 'retired-repository-id');
    requireState(!byRepo.has(row.repository), 'duplicate-retirement-repository');
    requireState(typeof row.stage === 'string' && typeof row.readiness === 'string', 'retirement-row-shape');
    requireState(['retain', 'external-owner-review-required'].includes(row.readiness) &&
      row.performedDeletion === false &&
      (row.readiness !== 'external-owner-review-required' ||
        (row.deleteRequested === true && row.stage === 'deletion-review' &&
          row.needsManualDeletionAction === true)),
      'retirement-not-in-readonly-review-state');
    requireState(Array.isArray(row.missingEvidence), 'missing-evidence-array');
    byRepo.set(row.repository, row);
  }
  const markersByRepo = new Map();
  for (const entry of markers.services) {
    requireState(validRepo(entry?.retiredRepository) && byRepo.has(entry.retiredRepository),
      'unregistered-source-marker');
    requireState(!markersByRepo.has(entry.retiredRepository), 'duplicate-source-marker');
    requireState(typeof entry.sourceMarkerVerified === 'boolean' &&
      typeof entry.service === 'string' && Array.isArray(entry.observations),
      'marker-row-shape');
    requireState(entry.repositoryDeletionAuthorized === false &&
      entry.cloudflareDeploymentBindingVerified === false &&
      entry.independentRollbackVerified === false &&
      entry.immutableOffsiteRestoreVerified === false,
      'marker-claims-unsupported-authority');
    requireState(!entry.sourceMarkerVerified || entry.blocker === null,
      'contradictory-marker-status');
    markersByRepo.set(entry.retiredRepository, entry);
  }

  const expectedMarkerErrors = markers.services.filter(entry => !entry.sourceMarkerVerified)
    .map(entry => entry.service + ':' + entry.blocker);
  requireState(markers.errors.length === expectedMarkerErrors.length &&
    markers.errors.every((item, index) => item === expectedMarkerErrors[index]),
    'marker-errors-drift');

  const rows = retirement.repositories.map(row => {
    const marker = markersByRepo.get(row.repository);
    const sourceMarkerStatus = marker
      ? (marker.sourceMarkerVerified ? 'public-canonical-marker-verified' : 'legacy-or-unverified')
      : 'not-observed-by-public-marker-audit';
    return {
      repository: row.repository,
      stage: row.stage,
      sourceMarkerStatus,
      observedService: marker?.service || null,
      observedPublicSourceSha: marker?.sourceMarkerVerified
        ? (marker.observations[0]?.sourceSha || null) : null,
      publicMarkerBlocker: marker?.blocker || null,
      missingEvidenceInCurrentAudit: [...row.missingEvidence],
      // No offsite Git, provider secrets/bindings, tenant E2E, rollback or Human Gate evidence
      // is present in the public markers or source-controlled static registry.
      deletionReadiness: row.readiness,
      deletionAuthorized: false,
      deletionExecuted: false
    };
  });
  const count = status => rows.filter(x => x.sourceMarkerStatus === status).length;
  return {
    contract: CONTRACT,
    mode: 'read-only-evidence-report',
    canonicalRepository: CANONICAL_REPO,
    markerObservedAt: markers.checkedAt,
    totalRegisteredSatellites: rows.length,
    publicCanonicalMarkerVerified: count('public-canonical-marker-verified'),
    publicLegacyOrUnverified: count('legacy-or-unverified'),
    noPublicMarkerObservation: count('not-observed-by-public-marker-audit'),
    ownerReviewCandidatesPendingHumanGate: rows.filter(x => x.deletionReadiness === 'external-owner-review-required').length,
    independentlyVerifiedOffsiteHistoryAndRestore: false,
    privilegedCloudflareDeploymentBindingsChecked: false,
    tenantRoleAndFinancialIsolationVerified: false,
    independentRollbackVerified: false,
    scopedIrreversibleOwnerAuthorizationRecorded: false,
    repositoryDeletionReady: false,
    anyRepositoryDeleted: false,
    rows
  };
}

export function renderSatelliteRetirementWatchMarkdown(report) {
  const tick = String.fromCharCode(96);
  const rows = report.rows.map(row =>
    '| ' + tick + row.repository + tick + ' | ' + tick + row.stage + tick + ' | ' + tick + row.sourceMarkerStatus + tick + ' | ' + tick + row.deletionReadiness + tick + ' |');
  return [
    '## EKODI satellite migration: read-only observation',
    '',
    'Public markers observed: ' + report.markerObservedAt,
    'Registered legacy repositories: **' + report.totalRegisteredSatellites + '**. Public canonical source markers verified: **' + report.publicCanonicalMarkerVerified + '**. Legacy/unverified markers: **' + report.publicLegacyOrUnverified + '**. Not covered by public marker audit: **' + report.noPublicMarkerObservation + '**.',
    '',
    '| Existing repository | Registry stage | Public marker only | Deletion |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '**No repository deletion authorized or executed.** Public source markers and this audit do not verify live Cloudflare owner bindings, immutable independent offsite Git history, restore drills, cross-tenant/financial isolation, authenticated PC/mobile regressions, independent rollback, release approval receipts or repository-scoped irreversible owner Human Gate.',
    '',
    'A GitHub Actions SUCCESS for this workflow certifies only that the read-only observation ran and produced a report; it does **not** mean migration or repository retirement passed.',
    ''
  ].join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [retirementPath, markerPath, mode] = process.argv.slice(2);
  if (!retirementPath || !markerPath || (mode && mode !== '--markdown')) {
    console.error('Usage: build-satellite-retirement-watch-report.mjs <retirement.json> <markers.json> [--markdown]');
    process.exitCode = 2;
  } else {
    try {
      const [retirement, markers] = await Promise.all([
        readFile(retirementPath, 'utf8').then(JSON.parse),
        readFile(markerPath, 'utf8').then(JSON.parse)
      ]);
      const report = buildSatelliteRetirementWatchReport(retirement, markers);
      process.stdout.write((mode === '--markdown'
        ? renderSatelliteRetirementWatchMarkdown(report)
        : JSON.stringify(report, null, 2)) + '\n');
    } catch (error) {
      console.error(error?.message || 'satellite-watch-audit-failed');
      process.exitCode = 1;
    }
  }
}

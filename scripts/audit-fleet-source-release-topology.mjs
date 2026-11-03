import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = async name => JSON.parse((await readFile(new URL('../' + name, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));

const pathOf = value => {
  const v = String(value || '').trim();
  const match = v.match(/^https:\/\/ekodi\.kr(\/[^?#]*)?(?:[?#]|$)/i);
  if (!match) return null;
  const raw = match[1] || '/';
  return raw.length > 1 ? raw.replace(/\/+$/, '') : '/';
};

const groupByPath = entries => {
  const byPath = new Map();
  for (const item of entries) {
    const path = item.canonicalPath;
    if (!path) continue;
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(item.id);
  }
  return byPath;
};

export function auditFleetSourceReleaseTopology({ ecosystem, lifecycle, boundaries, repositories }) {
  const errors = [];
  const notices = [];
  const services = Array.isArray(ecosystem?.services) ? ecosystem.services : null;
  const workspaceSites = Array.isArray(lifecycle?.existingWorkspaceSites) ? lifecycle.existingWorkspaceSites : null;
  const units = boundaries?.platforms && typeof boundaries.platforms === 'object' && !Array.isArray(boundaries.platforms)
    ? boundaries.platforms : null;
  const repos = Array.isArray(repositories?.repositories) ? repositories.repositories : null;
  if (!services) errors.push('missing ecosystem services registry');
  if (!workspaceSites) errors.push('missing lifecycle workspace sites registry');
  if (!units) errors.push('missing release boundary registry');
  if (!repos) errors.push('missing source repository registry');
  if (!repositories?.canonicalPlatformRepository) errors.push('missing canonical repository identifier');

  const recordSet = (items, kind) => {
    const seen = new Set();
    return (items || []).map(item => {
      const id = String(item?.id || '').trim();
      if (!id || seen.has(id)) errors.push(kind + ': missing or duplicate id ' + (id || '(empty)'));
      seen.add(id);
      const canonicalPath = pathOf(kind === 'service' ? item?.url : item?.canonicalUrl);
      if (!canonicalPath) errors.push(kind + ': noncanonical or absent EKODI path for ' + id);
      return {
        id,
        canonicalPath,
        ...(kind === 'service'
          ? { publicationStatus: String(item?.status || 'unknown'), productionVerifiedInRegistry: item?.productionVerified === true }
          : { migrationState: String(item?.migrationState || 'unknown'), sourceRuntimeHint: String(item?.runtime || 'unknown') })
      };
    });
  };

  const serviceItems = recordSet(services, 'service');
  const workspaceItems = recordSet(workspaceSites, 'workspace');
  const unitEntries = Object.entries(units || {});
  const directUnitIds = new Set(unitEntries.map(([id]) => id));
  const serviceWithoutMatchingUnitId = serviceItems.filter(s => !directUnitIds.has(s.id)).map(s => s.id);
  const workspaceWithoutMatchingUnitId = workspaceItems.filter(s => !directUnitIds.has(s.id)).map(s => s.id);
  // A service or workspace may use a shared runtime; unmatched IDs are not failures.
  if (serviceWithoutMatchingUnitId.length) notices.push('Services with no directly matching unit need owner evidence; some may be aliased/shared');
  if (workspaceWithoutMatchingUnitId.length) notices.push('Workspace sites are not expected to have one deployment unit each');
  const commonPaths = [];
  const wsPaths = groupByPath(workspaceItems);
  const servicePaths = groupByPath(serviceItems);
  for (const [path, wsIds] of wsPaths) {
    if (servicePaths.has(path)) commonPaths.push({ canonicalPath: path, workspaceIds: wsIds, serviceIds: servicePaths.get(path) });
  }
  const satelliteRepositories = (repos || [])
    .filter(item => item.name !== repositories?.canonicalPlatformRepository)
    .map(item => ({
      repository: String(item.name || ''),
      registeredRole: String(item.role || 'unknown'),
      writePolicy: String(item.mutationMode || 'unknown'),
      requiredAction: item.role === 'unclassified-satellite'
        ? 'verify ownership before any write'
        : 'review source ownership, dependencies and contractual rights before migration',
      migrationVerified: false
    }));
  const warnings = [];
  const knownSatelliteNames = new Set();
  for (const item of satelliteRepositories) {
    if (!item.repository || knownSatelliteNames.has(item.repository)) errors.push('invalid or duplicate satellite repository ' + item.repository);
    knownSatelliteNames.add(item.repository);
    if (item.writePolicy.startsWith('blocked')) warnings.push('write-blocked satellite ' + item.repository);
  }
  if ((repos || []).filter(item => item.name === repositories?.canonicalPlatformRepository && item.role === 'canonical-platform').length !== 1) {
    errors.push('exactly one canonical platform repository required');
  }
  errors.push(...[
    ...Array.from(servicePaths, ([path, ids]) => ({ path, ids })).filter(group => group.ids.length > 1).map(group => 'duplicate service path ' + group.path),
    ...Array.from(wsPaths, ([path, ids]) => ({ path, ids })).filter(group => group.ids.length > 1).map(group => 'duplicate workspace path ' + group.path)
  ]);
  return {
    contract: 'ekodi.fleet-source-release-topology-audit.v1',
    mode: 'read-only-static-inventory',
    sourceOfTruth: repositories?.canonicalPlatformRepository || null,
    inventoryScope: {
      serviceRegistry: 'config/ecosystem-services.json',
      workspaceRegistry: 'config/site-lifecycle-registry.json',
      releaseBoundaryRegistry: 'platform-boundaries.json',
      repositoryRegistry: 'config/repository-source-of-truth.json',
      liveProviderBindingsChecked: false,
      dynamicWorkspaceSitesChecked: false,
      productionBehaviorChecked: false
    },
    totals: {
      registeredServices: serviceItems.length,
      registeredWorkspaceSites: workspaceItems.length,
      registeredReleaseBoundaries: unitEntries.length,
      registeredSourceRepositories: (repos || []).length,
      registeredSatelliteRepositories: satelliteRepositories.length
    },
    serviceInventory: serviceItems.map(s => ({
      ...s,
      directReleaseBoundaryId: directUnitIds.has(s.id) ? s.id : null
    })),
    workspaceInventory: workspaceItems.map(s => ({
      ...s,
      directReleaseBoundaryId: directUnitIds.has(s.id) ? s.id : null
    })),
    knownOverlappingCanonicalPaths: commonPaths,
    releaseUnitInventory: unitEntries.map(([id, item]) => ({
      id,
      kind: String(item.kind || 'unknown'),
      declaredSourcePaths: Array.isArray(item.source) ? item.source : [],
      deployWorkflow: item.deployWorkflow || null,
      ownerOfProduction: 'unverified-from-static-registry'
    })),
    satelliteSourceReview: satelliteRepositories,
    noDirectUnitIdForServices: serviceWithoutMatchingUnitId,
    noDirectUnitIdForWorkspaces: workspaceWithoutMatchingUnitId,
    globalMigrationComplete: false,
    warnings,
    notices,
    errors
  };
}

export async function auditCurrentFleetSourceReleaseTopology() {
  const [ecosystem, lifecycle, boundaries, repositories] = await Promise.all([
    readJson('config/ecosystem-services.json'),
    readJson('config/site-lifecycle-registry.json'),
    readJson('platform-boundaries.json'),
    readJson('config/repository-source-of-truth.json')
  ]);
  return auditFleetSourceReleaseTopology({ ecosystem, lifecycle, boundaries, repositories });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  auditCurrentFleetSourceReleaseTopology().then(report => {
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = async relative => JSON.parse((await readFile(new URL('../' + relative, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));

// Read-only inventory. A repo is NOT a release unit; a release unit is NOT a tenant.
export function auditSourceDeploymentBoundaries(boundaries, registry) {
  const errors = [];
  if (!boundaries || boundaries.version !== 1 || !boundaries.platforms || typeof boundaries.platforms !== 'object') {
    errors.push('platform boundary registry missing or invalid');
  }
  if (!registry || registry.status !== 'enforced' || typeof registry.canonicalPlatformRepository !== 'string') {
    errors.push('canonical repository registry missing or invalid');
  }
  const units = Object.entries(boundaries?.platforms || {});
  const workflows = new Set();
  const boundaryIds = [];
  for (const [id, unit] of units) {
    boundaryIds.push(id);
    if (!Array.isArray(unit?.source) || !unit.source.length || unit.source.some(path => typeof path !== 'string' || !path.trim())) {
      errors.push(id + ': missing source ownership');
    }
    if (typeof unit?.deployWorkflow !== 'string' || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(unit.deployWorkflow)) {
      errors.push(id + ': missing guarded workflow reference');
    } else {
      workflows.add(unit.deployWorkflow);
    }
  }
  const repos = registry?.repositories || [];
  if (!Array.isArray(repos)) {
    errors.push('repositories is not an array');
  }
  const allRepos = Array.isArray(repos) ? repos : [];
  const canonical = allRepos.filter(repo => repo.name === registry?.canonicalPlatformRepository && repo.role === 'canonical-platform');
  if (canonical.length !== 1) errors.push('exactly one canonical platform repository must be registered');
  const satellites = allRepos.filter(repo => repo.name !== registry?.canonicalPlatformRepository);
  return {
    contract: 'ekodi.source-independent-release-audit.v1',
    mode: 'read-only-inventory',
    canonicalRepository: registry?.canonicalPlatformRepository || null,
    registeredReleaseBoundaries: boundaryIds.length,
    registeredReleaseBoundaryIds: boundaryIds.sort(),
    distinctDeploymentWorkflows: workflows.size,
    registeredSatelliteRepositories: satellites.map(repo => ({name:repo.name, role:repo.role, mutationMode:repo.mutationMode})),
    undecidedSourceClassification: satellites.filter(repo => repo.role === 'unclassified-satellite').map(repo => repo.name),
    // Site/workspace inventory is a separate authoritative tenant registry.
    allTenantSitesAudited: false,
    allSatellitesMigrated: satellites.length === 0,
    errors
  };
}

export async function auditCurrentSourceDeploymentBoundaries() {
  const [boundaries, registry] = await Promise.all([
    readJson('platform-boundaries.json'),
    readJson('config/repository-source-of-truth.json')
  ]);
  return auditSourceDeploymentBoundaries(boundaries, registry);
}

async function main() {
  const result = await auditCurrentSourceDeploymentBoundaries();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

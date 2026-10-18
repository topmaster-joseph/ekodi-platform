// EKODI unified asset inventory — read-only projection (issue #3805, Gen10 P1).
//
// This module never mutates its inputs, never writes files, never performs
// network I/O and never infers health. It projects the existing authoritative
// registries into one read model and emits non-mutating consistency findings.
// Each registry keeps its own authority; this projection may not become one
// (DATA-OWNERSHIP-001 `projectionMayBecomeCanonicalAuthority: false`).

export const ASSET_INVENTORY_SCHEMA_VERSION = 1;
export const ASSET_STATUS_UNKNOWN = 'unknown';

const CANONICAL_HOST = 'ekodi.kr';
const PUBLIC_LIFECYCLES = new Set(['live']);

const SEVERITY = Object.freeze({ info: 'info', warn: 'warn', error: 'error' });

function parseUrl(value) {
  try {
    return new URL(String(value || ''));
  } catch {
    return null;
  }
}

function canonicalPathOf(value) {
  const url = parseUrl(value);
  if (!url) return '';
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return host === CANONICAL_HOST ? path : `//${host}${path === '/' ? '' : path}`;
}

function hostOf(value) {
  const url = parseUrl(value);
  return url ? url.hostname.toLowerCase() : '';
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return value;
}

function asset({ kind, id, ownerBoundary, canonicalPath = '', runtimeAlias = [], lifecycle, dataBoundary = '', dependencyIds = [], visibility, evidenceRef }) {
  return {
    assetId: `${kind}:${id}`,
    kind,
    ownerBoundary,
    canonicalPath,
    runtimeAlias: [...new Set(runtimeAlias.filter(Boolean))].sort(),
    lifecycle,
    visibility,
    dataBoundary,
    dependencyIds: [...dependencyIds],
    healthProbe: null,
    // P1 never probes. Without fresh evidence an asset is UNKNOWN, never healthy.
    status: ASSET_STATUS_UNKNOWN,
    observedAt: null,
    evidenceRef,
  };
}

function servicesFromEcosystem(ecosystem) {
  return (ecosystem?.services || []).map((service) => asset({
    kind: 'service',
    id: service.id,
    ownerBoundary: service.id,
    canonicalPath: canonicalPathOf(service.url),
    lifecycle: service.status || 'unknown',
    visibility: PUBLIC_LIFECYCLES.has(service.status) && service.productionVerified === true ? 'public' : 'non-public',
    evidenceRef: `config/ecosystem-services.json#services[id=${service.id}]`,
  }));
}

function sitesFromLifecycle(lifecycle) {
  return (lifecycle?.existingWorkspaceSites || []).map((site) => asset({
    kind: 'site',
    id: site.id,
    ownerBoundary: site.runtime || site.class || 'workspace',
    canonicalPath: canonicalPathOf(site.canonicalUrl),
    runtimeAlias: (site.legacyAliases || []).map(hostOf),
    lifecycle: site.migrationState || 'unknown',
    // Workspace identity (workspace_id) is intentionally not projected here.
    visibility: 'workspace',
    evidenceRef: `config/site-lifecycle-registry.json#existingWorkspaceSites[id=${site.id}]`,
  }));
}

function modulesFromBoundaries(boundaries) {
  return Object.entries(boundaries?.platforms || {}).map(([id, platform]) => asset({
    kind: 'module',
    id,
    ownerBoundary: platform.kind || 'platform',
    runtimeAlias: (platform.domains || []).filter((domain) => domain !== CANONICAL_HOST),
    lifecycle: 'declared',
    visibility: 'internal',
    dataBoundary: typeof platform.database === 'string' ? platform.database : '',
    evidenceRef: `platform-boundaries.json#platforms.${id}`,
  }));
}

function coresFromRoutes(routeRegistry) {
  return (routeRegistry?.canonical || []).map((id) => asset({
    kind: 'core',
    id,
    ownerBoundary: 'core_system',
    canonicalPath: `/${id}`,
    lifecycle: 'declared',
    visibility: 'internal',
    evidenceRef: `platform-route-registry.js#PLATFORM_ROUTE_REGISTRY.canonical[${id}]`,
  }));
}

/**
 * Classify one difference between the legacy `service-registry.json` and the
 * catalog `config/ecosystem-services.json`. Never suggests deletion/rewrite.
 */
export function classifyServiceUrlDifference({ id, registryHref, ecosystemService, legacyHostPaths = {} }) {
  if (!ecosystemService) {
    return {
      code: 'not_in_public_catalog',
      severity: SEVERITY.info,
      note: 'Present in service-registry only; may be an intentional private/core boundary (e.g. admin). Do not promote to public catalog.',
    };
  }
  const ecosystemPath = canonicalPathOf(ecosystemService.url);
  const registryPath = canonicalPathOf(registryHref);
  if (registryPath === ecosystemPath) {
    return { code: 'consistent', severity: SEVERITY.info, note: '' };
  }
  const host = hostOf(registryHref);
  const aliasTarget = legacyHostPaths[host];
  if (aliasTarget && aliasTarget === ecosystemPath) {
    return {
      code: 'legacy_alias_resolves_to_canonical',
      severity: SEVERITY.warn,
      note: `${host} is a registered legacy host for ${aliasTarget}; service-registry still points at the alias.`,
    };
  }
  if (aliasTarget) {
    return {
      code: 'legacy_alias_target_mismatch',
      severity: SEVERITY.warn,
      note: `${host} maps to ${aliasTarget} but the catalog canonical is ${ecosystemPath}; needs verification.`,
    };
  }
  return {
    code: 'unmapped_url_difference',
    severity: SEVERITY.warn,
    note: `${registryHref} has no registered legacy mapping; needs verification.`,
  };
}

function serviceRegistryFindings({ serviceRegistry, ecosystem, legacyHostPaths }) {
  const catalog = new Map((ecosystem?.services || []).map((service) => [service.id, service]));
  const findings = [];
  for (const entry of serviceRegistry?.services || []) {
    const ecosystemService = catalog.get(entry.id);
    const result = classifyServiceUrlDifference({ id: entry.id, registryHref: entry.href, ecosystemService, legacyHostPaths });
    if (result.code === 'consistent') continue;
    findings.push({
      code: result.code,
      severity: result.severity,
      subject: `service:${entry.id}`,
      observed: { serviceRegistry: entry.href, ecosystemCatalog: ecosystemService?.url ?? null },
      note: result.note,
      evidenceRef: ['service-registry.json', 'config/ecosystem-services.json'],
      mutation: 'none',
    });
  }
  return findings;
}

function structuralFindings(assets) {
  const findings = [];
  const seen = new Map();
  for (const item of assets) {
    if (seen.has(item.assetId)) {
      findings.push({
        code: 'duplicate_asset_id',
        severity: SEVERITY.error,
        subject: item.assetId,
        observed: { evidenceRefs: [seen.get(item.assetId), item.evidenceRef] },
        note: 'Two authoritative entries share one id inside the same kind.',
        evidenceRef: [seen.get(item.assetId), item.evidenceRef],
        mutation: 'none',
      });
    } else {
      seen.set(item.assetId, item.evidenceRef);
    }
  }
  const byPath = new Map();
  for (const item of assets) {
    if (!item.canonicalPath) continue;
    const list = byPath.get(item.canonicalPath) || [];
    list.push(item.assetId);
    byPath.set(item.canonicalPath, list);
  }
  for (const [path, ids] of byPath) {
    const kinds = new Set(ids.map((id) => id.split(':')[0]));
    if (ids.length > 1 && kinds.size === ids.length) {
      // A service and its workspace site sharing a path is the expected layering.
      findings.push({ code: 'shared_canonical_path', severity: SEVERITY.info, subject: path, observed: { assetIds: ids.sort() }, note: 'Different asset kinds share one canonical path (expected layering; informational).', evidenceRef: [], mutation: 'none' });
    } else if (ids.length > 1) {
      findings.push({ code: 'canonical_path_collision', severity: SEVERITY.error, subject: path, observed: { assetIds: ids.sort() }, note: 'Same-kind assets claim one canonical path.', evidenceRef: [], mutation: 'none' });
    }
  }
  return findings;
}

/**
 * Build the read-only inventory. `observedAt` is the time the registries were
 * read, not a health observation.
 */
export function buildAssetInventory({ ecosystem, lifecycle, boundaries, routeRegistry, serviceRegistry, legacyHostPaths = {}, generatedAt = null } = {}) {
  const assets = [
    ...coresFromRoutes(routeRegistry),
    ...servicesFromEcosystem(ecosystem),
    ...sitesFromLifecycle(lifecycle),
    ...modulesFromBoundaries(boundaries),
  ];
  const findings = [
    ...structuralFindings(assets),
    ...serviceRegistryFindings({ serviceRegistry, ecosystem, legacyHostPaths }),
  ];
  const countBy = (key) => assets.reduce((acc, item) => ((acc[item[key]] = (acc[item[key]] || 0) + 1), acc), {});
  const report = {
    schemaVersion: ASSET_INVENTORY_SCHEMA_VERSION,
    mode: 'read-only',
    generatedAt,
    authority: 'projection-only; each source registry remains authoritative',
    summary: {
      assets: assets.length,
      byKind: countBy('kind'),
      byStatus: countBy('status'),
      publicServices: assets.filter((item) => item.kind === 'service' && item.visibility === 'public').length,
      findings: findings.length,
      findingsBySeverity: findings.reduce((acc, item) => ((acc[item.severity] = (acc[item.severity] || 0) + 1), acc), {}),
      serviceRegistryUrlDifferences: findings.filter((item) => item.subject.startsWith('service:') && item.code !== 'not_in_public_catalog').length,
    },
    assets,
    findings,
  };
  return freezeDeep(report);
}

export function hasBlockingFindings(report) {
  return report.findings.some((item) => item.severity === SEVERITY.error);
}

import { ADMIN_SERVICE_CATALOG, canonicalServiceAdminPath } from './admin-service-catalog.js';

export const ACCESS_SCOPE_TYPES = Object.freeze(['platform', 'service', 'workspace', 'person']);
const ACCESS_SCOPE_TYPE_SET = new Set(ACCESS_SCOPE_TYPES);
const SERVICE_BY_ID = new Map(ADMIN_SERVICE_CATALOG.map(item => [String(item.id).toLowerCase(), item]));

export const ACCESS_SCOPE_REGISTRY_CONTRACT = Object.freeze({
  version: 1,
  model: 'person-scope-role-capability',
  scopeTypes: ACCESS_SCOPE_TYPES,
  platformKey: 'ekodi',
  urlHierarchyGrantsAuthority: false,
  explicitDenyWins: true,
  workspaceIdentityMustBeStable: true,
  serviceCatalogSource: 'admin-service-catalog.js',
});

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeAccessScopeType(value) {
  const type = clean(value, 32).toLowerCase();
  return ACCESS_SCOPE_TYPE_SET.has(type) ? type : '';
}

export function normalizeAccessScopeKey(type, value) {
  const scopeType = normalizeAccessScopeType(type);
  const raw = clean(value, 180);
  if (!scopeType) return '';
  if (scopeType === 'platform') return raw && raw !== 'ekodi' ? '' : 'ekodi';
  if (scopeType === 'service') {
    const key = raw.toLowerCase();
    return SERVICE_BY_ID.has(key) ? key : '';
  }
  if (scopeType === 'workspace') {
    return /^[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$/.test(raw) ? raw : '';
  }
  if (scopeType === 'person') {
    return /^[A-Za-z0-9][A-Za-z0-9:@._-]{0,179}$/.test(raw) ? raw.toLowerCase() : '';
  }
  return '';
}

export function normalizeAccessScope(scope = {}) {
  const type = normalizeAccessScopeType(scope.type || scope.scope_type);
  const key = normalizeAccessScopeKey(type, scope.key || scope.scope_key);
  return type && key ? Object.freeze({ type, key }) : null;
}

export function accessScopeDirectory() {
  return Object.freeze([
    Object.freeze({ type: 'platform', key: 'ekodi', id: 'platform:ekodi', name: 'EKODI 전체', adminPath: '/admin', group: 'platform' }),
    ...ADMIN_SERVICE_CATALOG.map(item => Object.freeze({
      type: 'service',
      key: item.id,
      id: `service:${item.id}`,
      name: item.name,
      basePath: item.basePath,
      adminPath: canonicalServiceAdminPath(item.basePath),
      group: item.group,
    })),
  ]);
}

export function accessScopeDescriptor(scope = {}) {
  const normalized = normalizeAccessScope(scope);
  if (!normalized) return null;
  if (normalized.type === 'platform') return accessScopeDirectory()[0];
  if (normalized.type === 'service') {
    const item = SERVICE_BY_ID.get(normalized.key);
    return item ? Object.freeze({
      type: 'service', key: item.id, id: `service:${item.id}`, name: item.name,
      basePath: item.basePath, adminPath: canonicalServiceAdminPath(item.basePath), group: item.group,
    }) : null;
  }
  if (normalized.type === 'workspace') return Object.freeze({
    ...normalized, id: `workspace:${normalized.key}`, name: normalized.key, group: 'workspace', adminPath: null,
  });
  return Object.freeze({ ...normalized, id: `person:${normalized.key}`, name: normalized.key, group: 'person', adminPath: null });
}

export function serviceScopeForAdminPath(pathname = '') {
  const path = `/${clean(pathname, 320).replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  const match = ADMIN_SERVICE_CATALOG.find(item => canonicalServiceAdminPath(item.basePath) === path);
  return match ? Object.freeze({ type: 'service', key: match.id }) : null;
}

export function isCanonicalServiceScope(key = '') {
  return SERVICE_BY_ID.has(clean(key, 80).toLowerCase());
}

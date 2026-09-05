import { capabilityMatches, hasEkodiCapability } from './supabase/functions/_shared/ekodi-capability.js';

export { capabilityMatches, hasEkodiCapability } from './supabase/functions/_shared/ekodi-capability.js';

const ADMIN_ROLE_PRESETS = Object.freeze({
  super_admin: Object.freeze([
    'platform:*', 'workspace:*', 'service:*', 'ai:*', 'automation:*',
    'observe:*', 'admin:*', 'security:*', 'governance:*', 'deploy:*',
    'data:*', 'secrets:*',
  ]),
  operator: Object.freeze([
    'platform:read', 'workspace:read', 'workspace:manage',
    'service:read', 'service:operate',
    'ai:read', 'ai:operate',
    'automation:read', 'automation:operate',
    'observe:*',
  ]),
  viewer: Object.freeze([
    'platform:read', 'workspace:read', 'service:read',
    'ai:read', 'automation:read', 'observe:*',
  ]),
});

export const EKODI_ADMIN_ROLES = Object.freeze(Object.keys(ADMIN_ROLE_PRESETS));

export const EKODI_SENSITIVE_CAPABILITIES = Object.freeze([
  'admin:accounts.write',
  'security:policy.write',
  'secrets:write',
  'data:restore',
  'deploy:production',
  'deploy:rollback',
  'platform:emergency',
]);

const SENSITIVE = new Set(EKODI_SENSITIVE_CAPABILITIES);
const SCOPE_TYPES = new Set(['platform', 'workspace', 'service', 'person']);

const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);

export function normalizeEkodiScope(scope = {}) {
  const raw = typeof scope === 'string' ? { type: scope } : (scope || {});
  const type = SCOPE_TYPES.has(clean(raw.type, 40).toLowerCase()) ? clean(raw.type, 40).toLowerCase() : 'person';
  if (type === 'platform') return Object.freeze({ type: 'platform', id: 'global' });
  const id = clean(raw.id || raw.key, 240);
  return Object.freeze({ type, id });
}

export function scopeAllows(authorityScope = {}, resourceScope = {}) {
  const authority = normalizeEkodiScope(authorityScope);
  const resource = normalizeEkodiScope(resourceScope);
  if (authority.type === 'platform') return true;
  return authority.type === resource.type && Boolean(authority.id) && authority.id === resource.id;
}

export function adminCapabilitiesForRole(role = 'viewer') {
  const normalized = clean(role, 80).toLowerCase();
  return [...(ADMIN_ROLE_PRESETS[normalized] || ADMIN_ROLE_PRESETS.viewer)];
}

export function adminAuthorityForRole(role = 'viewer', {
  scope = { type: 'platform', id: 'global' },
  elevated = false,
  elevatedUntil = null,
  extraCapabilities = [],
  deniedCapabilities = [],
} = {}) {
  const normalizedRole = EKODI_ADMIN_ROLES.includes(clean(role, 80).toLowerCase())
    ? clean(role, 80).toLowerCase()
    : 'viewer';
  const capabilities = [...new Set([...adminCapabilitiesForRole(normalizedRole), ...extraCapabilities.map(value => clean(value, 180).toLowerCase()).filter(Boolean)])];
  const denied = [...new Set(deniedCapabilities.map(value => clean(value, 180).toLowerCase()).filter(Boolean))];
  return Object.freeze({
    kind: 'admin',
    role: normalizedRole,
    scope: normalizeEkodiScope(scope),
    capabilities: Object.freeze(capabilities),
    deniedCapabilities: Object.freeze(denied),
    elevated: Boolean(elevated),
    elevatedUntil: elevatedUntil || null,
  });
}

export function isSensitiveEkodiCapability(capability = '') {
  const value = clean(capability, 180).toLowerCase();
  return SENSITIVE.has(value);
}

export function authorizeEkodiAction({
  authority,
  requiredCapabilities = [],
  resourceScope = { type: 'platform', id: 'global' },
  requireElevation = false,
} = {}) {
  if (!authority) return Object.freeze({ allowed: false, code: 'AUTH_REQUIRED', missing: [] });
  if (!scopeAllows(authority.scope, resourceScope)) {
    return Object.freeze({ allowed: false, code: 'SCOPE_FORBIDDEN', missing: [] });
  }
  const required = requiredCapabilities.map(value => clean(value, 180).toLowerCase()).filter(Boolean);
  const missing = required.filter(capability => !hasEkodiCapability(authority.capabilities, capability, authority.deniedCapabilities));
  if (missing.length) return Object.freeze({ allowed: false, code: 'CAPABILITY_FORBIDDEN', missing: Object.freeze(missing) });
  const elevationNeeded = Boolean(requireElevation) || required.some(isSensitiveEkodiCapability);
  if (elevationNeeded && !authority.elevated) {
    return Object.freeze({ allowed: false, code: 'ELEVATION_REQUIRED', missing: [] });
  }
  return Object.freeze({ allowed: true, code: 'ALLOW', missing: [] });
}

export const EKODI_AUTHORIZATION_CONTRACT = Object.freeze({
  version: '1.0.0',
  model: 'identity-context-capability',
  explicitDenyWins: true,
  serverEnforced: true,
  contextSwitchGrantsAuthority: false,
  privilegedSessionMinutes: 15,
});

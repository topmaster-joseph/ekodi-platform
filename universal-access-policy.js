import { adminAuthorityForRole, normalizeEkodiScope } from './ekodi-authorization.js';
import { accessGrantExpired, normalizeGithubUsername, parseCapabilityList } from './access-governance.js';
import { normalizeAccessScope } from './access-scope-registry.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const UNIVERSAL_ACCESS_ROLES = Object.freeze({
  platform_admin: Object.freeze({ authorityRole: 'super_admin', scopeTypes: Object.freeze(['platform']) }),
  service_admin: Object.freeze({ authorityRole: 'operator', scopeTypes: Object.freeze(['service']), capabilities: Object.freeze(['service:access.read', 'service:access.review']) }),
  workspace_admin: Object.freeze({ authorityRole: 'operator', scopeTypes: Object.freeze(['workspace']), capabilities: Object.freeze(['workspace:access.read', 'workspace:access.review']) }),
  manager: Object.freeze({ authorityRole: 'operator', scopeTypes: Object.freeze(['service', 'workspace']) }),
  ai_manager: Object.freeze({ authorityRole: 'viewer', scopeTypes: Object.freeze(['service', 'workspace']), capabilities: Object.freeze(['ai:read', 'ai:operate']) }),
  external_developer: Object.freeze({
    authorityRole: 'viewer',
    scopeTypes: Object.freeze(['service', 'workspace']),
    principalType: 'external_collaborator',
    maxDays: 180,
    requiresGithub: true,
    requiresExpiry: true,
    capabilities: Object.freeze([
      'service:read', 'service:source.read', 'service:preview.read', 'service:logs.read', 'service:tests.run', 'service:pr.create',
      'workspace:read', 'workspace:source.read', 'workspace:preview.read', 'workspace:logs.read', 'workspace:tests.run', 'workspace:pr.create',
    ]),
    denied: Object.freeze(['admin:accounts.write', 'security:policy.write', 'secrets:*', 'data:private.*', 'data:finance.*', 'deploy:production', 'deploy:rollback', 'platform:emergency', 'service:access.review', 'workspace:access.review']),
  }),
  staff: Object.freeze({ authorityRole: 'viewer', scopeTypes: Object.freeze(['service', 'workspace']), capabilities: Object.freeze(['service:read', 'workspace:read']) }),
  viewer: Object.freeze({ authorityRole: 'viewer', scopeTypes: Object.freeze(['platform', 'service', 'workspace', 'person']) }),
});

export const UNIVERSAL_ACCESS_POLICY_CONTRACT = Object.freeze({
  version: 1,
  grantStore: 'access_scope_grants',
  authorizationEngine: 'ekodi-authorization.js',
  trustCapabilityGrammar: 'namespace:resource.action',
  explicitDenyWins: true,
  urlHierarchyGrantsAuthority: false,
  externalDeveloperProductionDeploy: false,
});

function clean(value, max = 320) { return String(value ?? '').trim().slice(0, max); }
function lower(value, max = 320) { return clean(value, max).toLowerCase(); }
function validEmail(value) { const email = lower(value, 254); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''; }

export function universalRolePreset(role = '') {
  return UNIVERSAL_ACCESS_ROLES[lower(role, 80)] || null;
}

export function universalGrantActive(grant, now = Date.now()) {
  if (!grant || Number(grant.enabled) !== 1) return false;
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) return false;
  return !accessGrantExpired(grant, nowDate);
}

export function validateUniversalGrant(input = {}, { now = Date.now() } = {}) {
  const errors = [];
  const email = validEmail(input.email);
  const role = lower(input.role, 80);
  const preset = universalRolePreset(role);
  const scope = normalizeAccessScope({ type: input.scopeType ?? input.scope_type, key: input.scopeKey ?? input.scope_key });
  const githubUsername = clean(input.githubUsername ?? input.github_username, 39).replace(/^@/, '');
  const expiresAt = clean(input.expiresAt ?? input.expires_at, 64);
  if (!email) errors.push('VALID_EMAIL_REQUIRED');
  if (!preset) errors.push('VALID_ROLE_REQUIRED');
  if (!scope) errors.push('VALID_SCOPE_REQUIRED');
  if (preset && scope && !preset.scopeTypes.includes(scope.type)) errors.push('ROLE_SCOPE_MISMATCH');
  if (preset?.requiresGithub && !normalizeGithubUsername(githubUsername)) errors.push('GITHUB_USERNAME_REQUIRED');
  let expiryMs = Number.NaN;
  if (expiresAt) expiryMs = Date.parse(expiresAt);
  if (preset?.requiresExpiry && !Number.isFinite(expiryMs)) errors.push('EXPIRY_REQUIRED');
  if (Number.isFinite(expiryMs)) {
    if (expiryMs <= now) errors.push('EXPIRY_MUST_BE_FUTURE');
    if (preset?.maxDays && expiryMs - now > preset.maxDays * DAY_MS) errors.push('EXPIRY_TOO_LONG');
  }
  const principalType = preset?.principalType || lower(input.principalType ?? input.principal_type, 40) || 'member';
  const capabilities = parseCapabilityList(input.capabilities ?? input.capabilities_json);
  const deniedCapabilities = parseCapabilityList(input.deniedCapabilities ?? input.denied_capabilities_json);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    value: Object.freeze({ email, role, scope, githubUsername, expiresAt: Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : '', principalType, capabilities, deniedCapabilities }),
  });
}

export function universalGrantAuthority(grant, { now = Date.now() } = {}) {
  if (!universalGrantActive(grant, now)) return null;
  const preset = universalRolePreset(grant.role);
  const scope = normalizeAccessScope({ type: grant.scope_type ?? grant.scopeType, key: grant.scope_key ?? grant.scopeKey });
  if (!preset || !scope || !preset.scopeTypes.includes(scope.type)) return null;
  const base = adminAuthorityForRole(preset.authorityRole, {
    scope: normalizeEkodiScope(scope),
    extraCapabilities: [...(preset.capabilities || []), ...parseCapabilityList(grant.capabilities_json ?? grant.capabilities)],
    deniedCapabilities: [...(preset.denied || []), ...parseCapabilityList(grant.denied_capabilities_json ?? grant.deniedCapabilities)],
  });
  return Object.freeze({
    ...base,
    role: String(grant.role || 'viewer'),
    grantId: clean(grant.id, 240),
    principalType: clean(grant.principal_type ?? grant.principalType, 40) || 'member',
    expiresAt: clean(grant.expires_at ?? grant.expiresAt, 64) || null,
  });
}

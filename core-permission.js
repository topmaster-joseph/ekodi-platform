import { serviceForId } from './ekodi-service-manifest.js';
import { canonicalCoreRole } from './ekodi-principal.js';

export const CORE_PERMISSION_POLICY = Object.freeze({
  version: '1.0.0',
  model: 'person-space-role-capability-resource',
  defaultDecision: 'deny',
  platformAdminTenantPolicy: 'explicit-delegation-required',
});

const ROLE_ACTIONS = Object.freeze({
  owner: new Set(['read','create','update','publish','manage-members','billing','delete']),
  admin: new Set(['read','create','update','publish','manage-members','billing','delete']),
  manager: new Set(['read','create','update','publish','manage-members']),
  marketer: new Set(['read','create','update','publish']),
  accountant: new Set(['read','billing']),
  staff: new Set(['read','create','update']),
  member: new Set(['read']),
  viewer: new Set(['read']),
});

const HIGH_IMPACT_ACTIONS = new Set(['delete','billing','manage-members']);

function decision(tier, reason, details = {}) {
  return Object.freeze({ tier, reason, policyVersion: CORE_PERMISSION_POLICY.version, ...details });
}

export function evaluateCorePermission({
  principal,
  serviceId,
  action = 'read',
  serviceCapability = '',
  targetScope = 'service',
  delegatedTenant = false,
  reversible = true,
} = {}) {
  const service = serviceForId(serviceId);
  if (!principal) return decision('deny', 'auth_required');
  if (!service) return decision('deny', 'unknown_service');
  if (service.state === 'planned') return decision('deny', 'service_not_active');

  const normalizedAction = String(action || 'read').trim().toLowerCase();
  const capability = String(serviceCapability || '').trim().toLowerCase();
  if (capability && !service.capabilities?.includes(capability)) {
    return decision('deny', 'service_capability_not_declared', { capability });
  }

  if (principal.kind === 'admin' && targetScope === 'tenant' && !delegatedTenant) {
    return decision('human_gate', 'platform_admin_tenant_delegation_required');
  }

  const role = canonicalCoreRole(principal.coreRole || principal.role, principal.kind);
  const allowed = ROLE_ACTIONS[role] || ROLE_ACTIONS.member;
  if (!allowed.has(normalizedAction)) return decision('deny', 'role_action_forbidden', { role, action: normalizedAction });

  if (HIGH_IMPACT_ACTIONS.has(normalizedAction) && reversible === false) {
    return decision('human_gate', 'irreversible_high_impact_action', { role, action: normalizedAction });
  }

  return decision('allow', 'role_and_service_contract_match', {
    role,
    action: normalizedAction,
    serviceId: service.id,
    targetScope,
    capability: capability || null,
  });
}

export function canCorePermission(input = {}) {
  return evaluateCorePermission(input).tier === 'allow';
}

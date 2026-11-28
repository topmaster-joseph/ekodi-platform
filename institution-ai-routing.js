// Planning-only institutional provider boundary. This module NEVER calls models.
// Do not treat configuration eligibility as live health or contractual entitlement.
const TENANT = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const PROVIDER = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const CAPABILITIES = new Set(['text', 'reasoning', 'review', 'code', 'vision']);
const SAFE_TASKS = new Set(['analysis', 'draft', 'document']);
const SAFE_CLASSES = new Set(['public', 'internal']);
const VALID_COST_CLASSES = new Set(['free-preferred', 'paid-opt-in', 'account-managed', 'provider-managed']);
const MAX_APPROVED_PROVIDERS = 8;

const coreOnly = reason => Object.freeze({
  mode: 'core_only', eligibleProviderIds: Object.freeze([]), plannedFailover: false,
  readyForLiveInvocation: false, externalCallsMade: 0, reason,
});

function policyForTenant(env, tenantId) {
  if (!TENANT.test(String(tenantId || ''))) throw Error('INVALID_TENANT');
  const raw = env?.INSTITUTION_AI_PROVIDER_POLICIES_JSON;
  if (typeof raw !== 'string' || raw.length > 65536) throw Error('INSTITUTION_ROUTING_NOT_CONFIGURED');
  let policies;
  try { policies = JSON.parse(raw); } catch { throw Error('INSTITUTION_ROUTING_NOT_CONFIGURED'); }
  if (!policies || typeof policies !== 'object' || Array.isArray(policies)) {
    throw Error('INSTITUTION_ROUTING_NOT_CONFIGURED');
  }
  return Object.hasOwn(policies, tenantId) ? policies[tenantId] : null;
}

export function planInstitutionProviderFallback(env, tenantId, record, providerStatus, capability = 'text') {
  // A request-supplied classification or institution ID is NEVER authoritative.
  // The caller must provide the stored, authenticated job record only.
  if (record?.tenantId !== tenantId || !TENANT.test(String(tenantId || ''))) {
    return coreOnly('SCOPE_MISMATCH');
  }
  if (!SAFE_TASKS.has(record?.taskType) || !SAFE_CLASSES.has(record?.classification)) {
    return coreOnly('EXTERNAL_TRANSFER_DENIED');
  }
  if (!['queued', 'processing'].includes(record?.status)) return coreOnly('JOB_NOT_ROUTABLE');
  if (!CAPABILITIES.has(capability)) return coreOnly('CAPABILITY_DENIED');
  if (String(env?.INSTITUTION_AI_PROVIDER_PLAN_ENABLED || '').trim().toLowerCase() !== 'true') {
    return coreOnly('PROVIDER_PLAN_DISABLED');
  }
  const policy = policyForTenant(env, tenantId);
  if (!policy || policy.status !== 'active' || policy.dataTransferApproved !== true) {
    return coreOnly('TENANT_PROVIDER_POLICY_DENIED');
  }
  if (!Array.isArray(policy.providers) || policy.providers.length === 0 ||
      policy.providers.length > MAX_APPROVED_PROVIDERS || !Array.isArray(providerStatus)) {
    return coreOnly('PROVIDER_LIST_INVALID');
  }
  // Invalid policy entries fail closed in their entirety, never skip to a
  // weaker default provider or accept a wildcard model.
  const approved = new Map();
  for (const entry of policy.providers) {
    if (!entry || !PROVIDER.test(String(entry.id || '')) ||
        typeof entry.model !== 'string' || !entry.model || entry.model === '*' ||
        !Array.isArray(entry.classifications) || !Array.isArray(entry.capabilities) ||
        !entry.classifications.length || !entry.capabilities.length ||
        !entry.classifications.every(x => SAFE_CLASSES.has(x)) ||
        !entry.capabilities.every(x => CAPABILITIES.has(x)) ||
        !VALID_COST_CLASSES.has(entry.costClass) ||
        entry.dataTransferApproved !== true || entry.tenantEntitlementVerified !== true ||
        approved.has(entry.id)) {
      return coreOnly('PROVIDER_POLICY_INVALID');
    }
    approved.set(entry.id, entry);
  }
  const registered = new Map();
  for (const status of providerStatus) {
    if (PROVIDER.test(String(status?.id || '')) && !registered.has(status.id)) registered.set(status.id, status);
  }
  const candidates = [];
  for (const entry of policy.providers) {
    const provider = registered.get(entry.id);
    if (!provider || provider.available !== true || provider.officialPath !== true ||
        provider.automationAllowed !== true || provider.model !== entry.model ||
        provider.costClass !== entry.costClass ||
        !Array.isArray(provider.capabilities) || !provider.capabilities.includes(capability) ||
        !entry.capabilities.includes(capability) ||
        !entry.classifications.includes(record.classification) ||
        provider.fundingSource === 'personal' || provider.resourceClass === 'personal-api') continue;
    // Billing approval is independent of service-provider entitlement.
    if (provider.costClass !== 'free-preferred' && policy.billingApproved !== true) continue;
    candidates.push(entry.id);
  }
  if (candidates.length === 0) return coreOnly('NO_APPROVED_PROVIDER');
  const selected = policy.allowFailover === true ? candidates : candidates.slice(0, 1);
  return Object.freeze({
    mode: 'configuration_only', eligibleProviderIds: Object.freeze([...selected]),
    plannedFailover: selected.length > 1, readyForLiveInvocation: false,
    externalCallsMade: 0, reason: 'NO_LIVE_EXECUTION_OR_HEALTH_PROOF',
  });
}

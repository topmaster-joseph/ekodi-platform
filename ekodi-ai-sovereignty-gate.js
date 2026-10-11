// EKODI AI reuse-first decision contract. Pure, provider-independent, fail-closed.
const COST = Object.freeze({ local: 0, free: 1, paid: 2 });
const safeText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const freeze = value => Object.freeze(value);

export function sanitizeAiConnectionStatus(connection = {}) {
  // Never echo arbitrary provider metadata or credentials.
  const id = safeText(connection.id, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(id)) throw new Error('invalid_provider_id');
  return freeze({
    id,
    connected: connection.available === true,
    authMethod: ['api-key', 'oauth', 'local', 'official-cli', 'service-account'].includes(connection.authMethod)
      ? connection.authMethod : 'unconfigured',
    expiresAt: /^\d{4}-\d\d-\d\dT/.test(String(connection.expiresAt || ''))
      ? safeText(connection.expiresAt, 40) : null,
    reauthenticationRequired: connection.reauthenticationRequired === true,
  });
}

export function chooseEkodiExecution(input = {}) {
  const risk = safeText(input.risk, 20).toLowerCase();
  const sensitive = input.sensitive === true;
  const requestedCapability = safeText(input.capabilityId, 120);
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  const reusable = capabilities.find(item => item?.id === requestedCapability &&
    item?.providerIndependent === true &&
    item?.verified === true &&
    item?.enabled === true &&
    item?.state === 'active' &&
    item?.executionContractVerified === true);
  if (reusable) return freeze({
    path: 'ekodi-capability',
    capabilityId: reusable.id,
    requiresExternalRequest: false,
    executionAuthorized: false,
    next: 'submit_to_orchestrator_policy_gate',
  });

  const providers = (Array.isArray(input.providers) ? input.providers : [])
    .filter(item => item && item.available === true && item.automationAllowed === true)
    .filter(item => !sensitive || item.trustClass === 'local')
    .filter(item => !['high', 'critical'].includes(risk) || item.trustClass === 'local')
    .filter(item => item.trustClass === 'local' ||
      ['free-preferred', 'shared-free', 'paid-opt-in'].includes(item.costClass))
    .filter(item => item.trustClass === 'local' || item.costClass !== 'paid-opt-in' || input.paidApproved === true)
    .map(item => ({
      id: safeText(item.id, 80),
      tier: item.trustClass === 'local' ? 'local' :
        item.costClass === 'paid-opt-in' ? 'paid' : 'free',
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 999,
    }))
    .filter(item => /^[a-z0-9][a-z0-9._-]{1,79}$/.test(item.id))
    .sort((a, b) => COST[a.tier] - COST[b.tier] || a.priority - b.priority || a.id.localeCompare(b.id));

  const candidate = providers[0];
  if (!candidate) return freeze({
    path: 'blocked',
    reason: sensitive ? 'no_trusted_local_provider' : 'no_eligible_provider',
    requiresExternalRequest: false,
    executionAuthorized: false,
  });
  return freeze({
    path: 'provider',
    providerId: candidate.id,
    tier: candidate.tier,
    requiresExternalRequest: candidate.tier !== 'local',
    executionAuthorized: false,
    next: 'submit_to_orchestrator_policy_gate',
  });
}

export function publicAiJobReceipt(input = {}) {
  // Strict allowlist prevents accidental storage/display of prompts or provider secrets.
  const status = ['queued', 'running', 'verified', 'failed', 'blocked'].includes(input.status)
    ? input.status : 'blocked';
  return freeze({
    taskId: safeText(input.taskId, 100),
    status,
    providerId: safeText(input.providerId, 80) || null,
    capabilityId: safeText(input.capabilityId, 120) || null,
    costUnits: Math.max(0, Number.isFinite(Number(input.costUnits)) ? Number(input.costUnits) : 0),
    productionVerified: input.productionVerified === true && status === 'verified',
  });
}

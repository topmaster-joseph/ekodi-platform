import { adaptBenefitRadarAssessment } from './jubilee-benefit-radar-adapter.js';
import { prepareJubileeConnection } from './jubilee-connection-service.js';
import { prepareJubileeFinancialCommitment } from './jubilee-financial-commitment.js';
import { evaluateJubileeRecommendation } from './jubilee-runtime.js';

const OPERATIONS = new Set([
  'evaluate',
  'adapt_support',
  'prepare_connection',
  'prepare_financial_commitment',
]);

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'provider_credentials',
  'providercredentials',
]);

export const JUBILEE_CAPABILITY_PROVIDER = Object.freeze({
  implementationId: 'ekodi-jubilee-core',
  capabilityId: 'jubilee-policy-gate',
  contractVersion: '1',
  providerType: 'ekodi-responsible',
  supportedOperations: Object.freeze([...OPERATIONS]),
  authorizationModel: 'capability-and-operation-scoped',
  dataHandling: 'minimum-purpose-bound-projection',
  healthContract: 'policy-readiness',
  timeoutPolicy: 'caller-deadline-bounded',
  fallbackDeclaration: 'fail-closed-or-human-review',
});

export function buildJubileeCapabilityRequest(input = {}) {
  const requestId = requiredRef(input.request_id || input.requestId, 'jubilee_provider_request_id_required');
  const capabilityId = String(input.capability_id || input.capabilityId || JUBILEE_CAPABILITY_PROVIDER.capabilityId).trim();
  if (capabilityId !== JUBILEE_CAPABILITY_PROVIDER.capabilityId) {
    throw new Error('jubilee_provider_capability_mismatch');
  }

  const operation = String(input.operation || '').trim();
  if (!OPERATIONS.has(operation)) throw new Error('jubilee_provider_operation_not_supported');

  const contextProjection = plainObject(input.context_projection || input.contextProjection);
  assertSafeProjection(contextProjection);
  const constraints = plainObject(input.constraints);

  return Object.freeze({
    request_id: requestId,
    capability_id: capabilityId,
    operation,
    context_projection: deepFreeze(structuredCloneSafe(contextProjection)),
    constraints: deepFreeze(structuredCloneSafe(constraints)),
    ...optionalEnvelopeFields(input),
  });
}

export async function executeJubileeCapabilityRequest(input = {}) {
  let envelope;
  try {
    envelope = buildJubileeCapabilityRequest(input);
  } catch (error) {
    return providerResponse(input.request_id || input.requestId, 'rejected', null, [safeCode(error)]);
  }
  try {
    let result;
    if (envelope.operation === 'evaluate') {
      result = evaluateJubileeRecommendation(envelope.context_projection);
    } else if (envelope.operation === 'adapt_support') {
      result = adaptBenefitRadarAssessment(envelope.context_projection);
    } else if (envelope.operation === 'prepare_connection') {
      result = await prepareJubileeConnection(envelope.context_projection);
    } else if (envelope.operation === 'prepare_financial_commitment') {
      result = prepareJubileeFinancialCommitment(envelope.context_projection);
    }
    return providerResponse(envelope.request_id, 'ok', result, []);
  } catch (error) {
    return providerResponse(envelope.request_id, 'rejected', null, [safeCode(error)]);
  }
}

function providerResponse(requestId, status, result, warnings) {
  return Object.freeze({
    request_id: safeRef(requestId),
    status,
    result,
    warnings: Object.freeze([...(warnings || [])]),
    provider_metadata: Object.freeze({
      implementation_id: JUBILEE_CAPABILITY_PROVIDER.implementationId,
      capability_id: JUBILEE_CAPABILITY_PROVIDER.capabilityId,
      contract_version: JUBILEE_CAPABILITY_PROVIDER.contractVersion,
    }),
  });
}
function assertSafeProjection(value, path = 'context_projection') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeProjection(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[-\s]/g, '_');
    if (FORBIDDEN_CONTEXT_KEYS.has(normalized)) {
      throw new Error(`jubilee_provider_forbidden_context_key:${path}.${key}`);
    }
    assertSafeProjection(child, `${path}.${key}`);
  }
}

function optionalEnvelopeFields(input) {
  const fields = {};
  const locale = String(input.locale || '').trim();
  if (locale && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)) fields.locale = locale;

  const deadline = Number(input.deadline_ms ?? input.deadlineMs);
  if (Number.isSafeInteger(deadline) && deadline > 0 && deadline <= 120000) fields.deadline_ms = deadline;

  const idempotency = safeRef(input.idempotency_key || input.idempotencyKey);
  if (idempotency) fields.idempotency_key = idempotency;

  return fields;
}
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requiredRef(value, code) {
  const ref = safeRef(value);
  if (!ref) throw new Error(code);
  return ref;
}

function safeRef(value) {
  const ref = String(value || '').trim();
  return /^[A-Za-z0-9:._-]{1,200}$/.test(ref) ? ref : null;
}

function safeCode(error) {
  return String(error?.message || 'jubilee_provider_error').slice(0, 240);
}

export async function executeAuthorizedJubileeCapabilityRequest(input = {}, authorization = {}) {
  let envelope;
  try {
    envelope = buildJubileeCapabilityRequest(input);
  } catch (error) {
    return Object.freeze({
      response: providerResponse(input.request_id || input.requestId, 'rejected', null, [safeCode(error)]),
      audit: null,
    });
  }

  const authorizationError = validateCoreAuthorization(envelope, authorization);
  if (authorizationError) {
    const response = providerResponse(envelope.request_id, 'rejected', null, [authorizationError]);
    return Object.freeze({
      response,
      audit: buildJubileeCapabilityAudit(envelope, response, authorization),
    });
  }

  const response = await executeJubileeCapabilityRequest(envelope);
  return Object.freeze({
    response,
    audit: buildJubileeCapabilityAudit(envelope, response, authorization),
  });
}
export function buildJubileeCapabilityAudit(envelope = {}, response = {}, authorization = {}) {
  return Object.freeze({
    request_id: safeRef(envelope.request_id),
    capability_id: JUBILEE_CAPABILITY_PROVIDER.capabilityId,
    operation: String(envelope.operation || '').trim(),
    status: String(response.status || 'error').trim(),
    workspace_id: safeRef(envelope.context_projection?.workspace_id),
    provider_implementation_id: JUBILEE_CAPABILITY_PROVIDER.implementationId,
    authorization_scope: 'capability-and-operation-scoped',
    actor_ref_hash: safeHash(authorization.actor_ref_hash || authorization.actorRefHash),
  });
}

function validateCoreAuthorization(envelope, authorization) {
  if (authorization?.allowed !== true) return 'jubilee_core_authorization_required';
  const capabilityId = String(
    authorization.capability_id || authorization.capabilityId || '',
  ).trim();
  if (capabilityId !== envelope.capability_id) return 'jubilee_core_capability_mismatch';

  const operations = Array.isArray(authorization.operations)
    ? authorization.operations.map(value => String(value || '').trim())
    : [String(authorization.operation || '').trim()].filter(Boolean);
  if (!operations.includes(envelope.operation)) return 'jubilee_core_operation_not_authorized';
  const requestedWorkspace = safeRef(envelope.context_projection?.workspace_id);
  const authorizedWorkspace = safeRef(
    authorization.workspace_id || authorization.workspaceId,
  );
  if (requestedWorkspace && authorizedWorkspace && requestedWorkspace !== authorizedWorkspace) {
    return 'jubilee_core_workspace_mismatch';
  }
  if (requestedWorkspace && !authorizedWorkspace) {
    return 'jubilee_core_workspace_authorization_required';
  }
  return null;
}

function safeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

import { evaluateJubileeRecommendation } from './jubilee-runtime.js';

/**
 * Shared Jubilee policy gate for Discovery, Mall, people/provider connection,
 * pricing and external agent adapters.
 *
 * The gate is deliberately vendor-neutral. Candidate discovery can come from
 * EKODI, public web search, MCP, A2A, REST/OpenAPI or another provider. The gate
 * only evaluates the resulting bounded candidate set and never performs a
 * purchase, message, reservation or other external side effect itself.
 */
export async function runJubileePolicyGate(input = {}, options = {}) {
  const result = evaluateJubileeRecommendation(input);
  const gate = toGateDecision(result);

  if (typeof options.audit === 'function') {
    await options.audit(buildGateAudit(input, result, gate));
  }

  return Object.freeze({
    ...gate,
    evaluation: result,
  });
}

/**
 * Authorize only a user-selected candidate already present in the completed
 * Jubilee choice set. This prevents callers from evaluating one set and then
 * executing a hidden or higher-margin candidate outside that set.
 */
export function authorizeJubileeSelection(gateResult, candidateId) {
  if (!gateResult || gateResult.actionable !== true) {
    return Object.freeze({
      allowed: false,
      reason: gateResult?.reason || 'jubilee_gate_not_actionable',
    });
  }

  const id = String(candidateId || '').trim();
  if (!id) return Object.freeze({ allowed: false, reason: 'candidate_id_required' });

  const choiceSet = Array.isArray(gateResult.evaluation?.choiceSet)
    ? gateResult.evaluation.choiceSet
    : [];
  const candidate = choiceSet.find(item => item.id === id);

  if (!candidate) {
    return Object.freeze({
      allowed: false,
      reason: 'candidate_not_in_jubilee_choice_set',
    });
  }

  return Object.freeze({
    allowed: true,
    reason: 'user_choice_within_jubilee_choice_set',
    candidate,
    policyVersion: gateResult.evaluation.policyVersion,
  });
}

function toGateDecision(result) {
  if (result.status === 'blocked') {
    return Object.freeze({
      actionable: false,
      reason: result.reason || 'jubilee_policy_blocked',
      nextAction: 'human_review',
    });
  }

  if (result.externalAlternativeLookupRequired) {
    return Object.freeze({
      actionable: false,
      reason: 'external_alternative_lookup_required',
      nextAction: 'discover_external_alternatives',
    });
  }

  if (result.status !== 'ready' || result.choiceSet.length === 0) {
    return Object.freeze({
      actionable: false,
      reason: result.reason || 'more_options_required',
      nextAction: 'discover_more_options',
    });
  }

  return Object.freeze({
    actionable: true,
    reason: 'jubilee_choice_ready',
    nextAction: 'present_choice_to_user',
  });
}

function buildGateAudit(input, result, gate) {
  const workspaceId = safeId(input.workspace_id || input.workspaceId);
  const purpose = safePurpose(input.purpose);

  return Object.freeze({
    workspaceId,
    purpose,
    policyVersion: result.policyVersion,
    decisionStatus: result.status,
    actionable: gate.actionable,
    nextAction: gate.nextAction,
    candidateCount: Array.isArray(input.candidates) ? input.candidates.length : 0,
    choiceCount: result.choiceSet.length,
    supportActionCount: result.supportActions.length,
    externalAlternativeLookupRequired: result.externalAlternativeLookupRequired,
    humanReviewRequired: result.humanReviewRequired,
    rulesTriggered: Object.freeze([...result.audit.rulesTriggered]),
    warningCount: result.audit.warnings.length,
  });
}

function safeId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  return /^[A-Za-z0-9:_-]{1,160}$/.test(id) ? id : null;
}

function safePurpose(value) {
  const purpose = String(value || 'recommendation').trim().toLowerCase();
  return /^[a-z0-9:_-]{1,80}$/.test(purpose) ? purpose : 'recommendation';
}

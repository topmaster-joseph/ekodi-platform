import { readFileSync } from 'node:fs';

const POLICY_URL = new URL('./config/ai-mission-governance.json', import.meta.url);
export const AI_MISSION_POLICY = JSON.parse(readFileSync(POLICY_URL, 'utf8'));

const HUMAN_GATE_AREAS = new Set(AI_MISSION_POLICY.actionTiers.human_gate.areas);
const FORBIDDEN_AREAS = new Set(AI_MISSION_POLICY.actionTiers.forbidden.areas);
const NON_NEGOTIABLES = new Set(AI_MISSION_POLICY.nonNegotiables);

export function getAgentPolicy(agentId) {
  return AI_MISSION_POLICY.agents[agentId] || null;
}

export function evaluateAgentAction(action = {}) {
  const {
    agentId,
    area,
    reversible = false,
    delegated = false,
    logged = false,
    verified = false,
    reducesUserRights = false,
    crossTenantPrivateData = false,
    violates = [],
  } = action;

  const agent = getAgentPolicy(agentId);
  if (!agent) {
    return decision('human_gate', 'unknown_agent', 'Unknown agents receive no implicit authority.');
  }

  const violation = violates.find(item => NON_NEGOTIABLES.has(item));
  if (violation || FORBIDDEN_AREAS.has(area)) {
    return decision('forbidden', violation || area, 'The requested action conflicts with a non-negotiable mission boundary.');
  }

  if (
    HUMAN_GATE_AREAS.has(area) ||
    reducesUserRights ||
    crossTenantPrivateData ||
    agent.mustEscalate?.includes(area)
  ) {
    return decision('human_gate', area || 'high_impact', 'A human steward must make this decision within delegated authority.');
  }

  if (reversible && delegated && logged && verified) {
    return decision('execute_reversible', area || 'bounded_action', 'Guarded execution is permitted inside the delegated, reversible scope.');
  }

  return decision('assist', area || 'insufficient_execution_evidence', 'AI may analyze or recommend, but execution requirements are not fully satisfied.');
}

export function canChiefOverride(result) {
  return !['human_gate', 'forbidden'].includes(result?.tier);
}

function decision(tier, reason, explanation) {
  return Object.freeze({ tier, reason, explanation });
}

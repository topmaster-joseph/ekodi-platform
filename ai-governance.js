import { readFileSync } from 'node:fs';
import { evaluateMissionAction, getRuntimeAgentPolicy, canChiefOverrideMissionDecision } from './ai-governance-runtime.js';

const POLICY_URL = new URL('./config/ai-mission-governance.json', import.meta.url);
export const AI_MISSION_POLICY = JSON.parse(readFileSync(POLICY_URL, 'utf8'));

export function getAgentPolicy(agentId) {
  return AI_MISSION_POLICY.agents[agentId] || getRuntimeAgentPolicy(agentId) || null;
}

export function evaluateAgentAction(action = {}) {
  return evaluateMissionAction(action);
}

export function canChiefOverride(result) {
  return canChiefOverrideMissionDecision(result);
}

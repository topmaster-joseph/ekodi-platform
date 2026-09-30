import { evaluateCorePermission } from './core-permission.js';

export const CORE_WORKFLOW_POLICY = Object.freeze({
  version: '1.0.0',
  model: 'service-owned-template-core-governed-transition',
  immutableHistory: true,
});

function normalizeStates(states = []) {
  return [...new Set((Array.isArray(states) ? states : []).map(v => String(v || '').trim()).filter(Boolean))];
}

export function defineCoreWorkflow({ id, serviceId, states = [], initialState, transitions = [] } = {}) {
  const normalizedStates = normalizeStates(states);
  const normalizedInitial = String(initialState || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(String(id || ''))) throw new TypeError('Invalid workflow id');
  if (!normalizedStates.includes(normalizedInitial)) throw new TypeError('Workflow initialState must exist in states');
  const normalizedTransitions = (Array.isArray(transitions) ? transitions : []).map(item => Object.freeze({
    from: String(item?.from || '').trim(),
    to: String(item?.to || '').trim(),
    action: String(item?.action || 'update').trim().toLowerCase(),
    capability: String(item?.capability || '').trim().toLowerCase(),
    humanGate: Boolean(item?.humanGate),
  }));
  for (const transition of normalizedTransitions) {
    if (!normalizedStates.includes(transition.from) || !normalizedStates.includes(transition.to)) {
      throw new TypeError(`Invalid workflow transition ${transition.from} -> ${transition.to}`);
    }
  }
  return Object.freeze({ id: String(id), serviceId: String(serviceId || '').trim().toLowerCase(), states: Object.freeze(normalizedStates), initialState: normalizedInitial, transitions: Object.freeze(normalizedTransitions) });
}

export function evaluateWorkflowTransition({ workflow, from, to, principal, targetScope = 'service', delegatedTenant = false, reversible = true } = {}) {
  if (!workflow) return Object.freeze({ tier: 'deny', reason: 'workflow_required', policyVersion: CORE_WORKFLOW_POLICY.version });
  const transition = workflow.transitions?.find(item => item.from === from && item.to === to);
  if (!transition) return Object.freeze({ tier: 'deny', reason: 'transition_not_declared', policyVersion: CORE_WORKFLOW_POLICY.version });
  if (transition.humanGate) return Object.freeze({ tier: 'human_gate', reason: 'workflow_human_gate', policyVersion: CORE_WORKFLOW_POLICY.version, transition });
  const permission = evaluateCorePermission({ principal, serviceId: workflow.serviceId, action: transition.action, serviceCapability: transition.capability, targetScope, delegatedTenant, reversible });
  return Object.freeze({ ...permission, workflowId: workflow.id, from, to });
}

export function createWorkflowEvent({ workflowId, serviceId, workspaceKey, from, to, actorId, reason = '', at = new Date().toISOString() } = {}) {
  return Object.freeze({ schemaVersion: 1, workflowId: String(workflowId || ''), serviceId: String(serviceId || ''), workspaceKey: String(workspaceKey || ''), from: String(from || ''), to: String(to || ''), actorId: String(actorId || ''), reason: String(reason || '').slice(0, 500), at });
}

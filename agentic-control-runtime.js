const MODEL_URL = new URL('./config/agentic-control-model.json', import.meta.url);
const ACTIONS_URL = new URL('./config/agentic-actions.json', import.meta.url);
const state = { model: null, actions: new Map(), error: null };

function uid(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return response.json();
}

async function bootstrap() {
  try {
    const [model, registry] = await Promise.all([loadJson(MODEL_URL), loadJson(ACTIONS_URL)]);
    state.model = model;
    state.actions = new Map((registry.actions || []).map(action => [action.id, Object.freeze(action)]));
    state.error = null;
    return snapshot();
  } catch (error) {
    state.model = null;
    state.actions = new Map();
    state.error = error;
    console.error('[EKODI Agentic Control] registry unavailable; mutating actions are fail-closed', error);
    return snapshot();
  }
}

function snapshot() {
  return Object.freeze({ ready: Boolean(state.model), actions: state.actions.size, error: state.error?.message || '' });
}

function action(id) {
  return state.actions.get(String(id || '').trim()) || null;
}

function policy(actionId) {
  const definition = action(actionId);
  if (definition) return Object.freeze({
    known: true,
    allowed: true,
    action: definition.id,
    risk: definition.risk,
    autonomy: definition.autonomy,
    approval: definition.approval,
    evidence: [...definition.evidence],
    rollback: definition.rollback || null,
    irreversible: definition.irreversible === true,
  });
  return Object.freeze({
    known: false,
    allowed: actionId === 'resource.inspect',
    action: String(actionId || ''),
    risk: actionId === 'resource.inspect' ? 'low' : 'critical',
    autonomy: actionId === 'resource.inspect' ? 'A0' : 'A3',
    approval: actionId === 'resource.inspect' ? 'none' : 'explicit_human',
    evidence: ['audit', 'trace'],
    rollback: null,
    irreversible: false,
    reason: state.error ? 'control_registry_unavailable' : 'unregistered_action',
  });
}

function createOperation({ actionId, target = null, requestedBy = null, input = null } = {}) {
  const decision = policy(actionId);
  const now = new Date().toISOString();
  return Object.freeze({
    apiVersion: 'ekodi.io/v1',
    kind: 'Operation',
    operation_id: uid('op'),
    trace_id: uid('trace'),
    requested_at: now,
    requested_by: requestedBy,
    action: actionId,
    target,
    input,
    policy: decision,
    state: decision.allowed ? (decision.approval === 'none' ? 'approved' : 'awaiting_approval') : 'cancelled',
    evidence: [],
  });
}

function verify(actionId, evidence = []) {
  const decision = policy(actionId);
  const valid = evidence.filter(item => item && item.ok === true).map(item => item.kind);
  const missing = decision.evidence.filter(kind => !valid.includes(kind));
  return Object.freeze({ verified: decision.known && missing.length === 0, required: decision.evidence, missing });
}

const ready = bootstrap();
const api = Object.freeze({ ready, snapshot, action, policy, createOperation, verify });
globalThis.EKODIAgenticControl = api;
export default api;

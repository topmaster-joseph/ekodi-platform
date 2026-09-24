function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  return value;
}

function nodeId(value) {
  return String(value || '').trim() || 'unknown';
}

export function buildPlatformDigitalTwin(input = {}) {
  const registry = input.registry || {};
  const reconciliation = input.reconciliation || {};
  const events = Array.isArray(input.events) ? input.events : [];
  const observed = input.observed || {};
  const nodes = new Map();
  const edges = [];

  const stateRank = Object.freeze({ compliant:1, unknown:2, drift:3 });
  const addNode = (id, type, data = {}) => {
    id = nodeId(id);
    const previous = nodes.get(id) || { id, type, data: {} };
    const previousState = previous.data?.state;
    const nextState = data?.state;
    const state = nextState && (!previousState || (stateRank[nextState] || 0) >= (stateRank[previousState] || 0)) ? nextState : previousState;
    nodes.set(id, { id, type: previous.type || type, data: { ...previous.data, ...data, ...(state ? { state } : {}) } });
  };
  const addEdge = (from, to, type) => edges.push({ from: nodeId(from), to: nodeId(to), type });

  addNode('platform:ekodi', 'platform', {
    generation: registry.generation || null,
    scaleTier: registry.scaleTier || null,
    convergencePct: reconciliation.summary?.convergencePct ?? null,
  });
  addNode('control:desired-state', 'control_engine', { status: 'active' });
  addNode('control:reconciler', 'control_engine', { status: 'active' });
  addNode('control:event-nervous-system', 'control_engine', { status: 'active' });
  addNode('control:digital-twin', 'control_engine', { status: 'active' });
  addNode('runtime:command-ledger', 'runtime', { role: 'durable-command-and-event-ledger' });
  addNode('authority:human-sovereign', 'authority', { role: 'final-human-authority' });
  for (const control of ['control:desired-state','control:reconciler','control:event-nervous-system','control:digital-twin']) addEdge('platform:ekodi', control, 'owns');

  for (const result of reconciliation.results || []) {
    const id = result.entityId || `rule:${result.ruleId}`;
    addNode(id, id.startsWith('service:') ? 'service' : id.startsWith('runtime:') ? 'runtime' : id.startsWith('routing:') ? 'routing' : 'platform_component', {
      state: result.status,
      ruleId: result.ruleId,
      observed: result.observed,
      expected: result.expected,
    });
    addEdge('control:reconciler', id, 'observes');
  }

  const serviceObservations = observed.services && typeof observed.services === 'object' ? observed.services : {};
  for (const [id, value] of Object.entries(serviceObservations)) {
    addNode(`service:${id}`, 'service', { observed: value });
    addEdge('platform:ekodi', `service:${id}`, 'contains');
  }

  for (const event of events) {
    const id = `event:${event.id}`;
    addNode(id, 'event', { route: event.route, severity: event.severity, ruleId: event.ruleId, transition: event.transition });
    addEdge(event.entityId || 'platform:ekodi', id, 'emits');
    addEdge(id, event.route === 'command_ledger' ? 'runtime:command-ledger' : event.route === 'human_gate' ? 'authority:human-sovereign' : 'control:reconciler', 'routes_to');
  }

  const driftNodes = [...nodes.values()].filter(item => item.data?.state === 'drift').length;
  const unknownNodes = [...nodes.values()].filter(item => item.data?.state === 'unknown').length;
  const health = driftNodes ? 'drift' : unknownNodes ? 'partially_observed' : 'converged';
  return freeze({
    schemaVersion: 1,
    twinId: 'EKODI-PLATFORM-DIGITAL-TWIN-001',
    generatedAt: input.now || reconciliation.evaluatedAt || new Date().toISOString(),
    health,
    sourceRegistry: registry.registryId || null,
    nodes: [...nodes.values()],
    edges,
    summary: {
      nodeCount: nodes.size,
      edgeCount: edges.length,
      driftNodes,
      unknownNodes,
      eventNodes: events.length,
      convergencePct: reconciliation.summary?.convergencePct ?? null,
    },
    authority: {
      humanSovereigntyFinal: true,
      directProductionMutation: false,
      providerOwnsAuthority: false,
    },
  });
}

export const EKODI_PLATFORM_DIGITAL_TWIN = Object.freeze({
  version: '1.0.0',
  owner: 'ekodi-orchestrator',
  role: 'read-model-not-authority-source',
  canonicalAuthorityRemainsExternal: true,
  directMutation: false,
});

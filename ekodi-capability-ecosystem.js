import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };
import workspacePacks from './config/workspace-packs.json' with { type: 'json' };

const RISK_RANK = Object.freeze({ low: 0, normal: 1, high: 2, critical: 3 });
const PROMOTION_STATES = new Set(['observed', 'pattern_found', 'candidate', 'sandboxed', 'verified', 'staged', 'active', 'quarantined']);
const freeze = value => Object.freeze(value);
const clean = (value, limit = 240) => String(value ?? '').trim().slice(0, limit);
const unique = values => [...new Set(values.filter(Boolean))];

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function goalTemplate(value) {
  return clean(value, 1200).toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '<email>')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<uuid>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}
function allCapabilities() {
  return [...(capabilityRegistry.capabilities || []), ...(capabilityRegistry.fabricCapabilities || [])];
}

function capabilityNode(item) {
  return freeze({
    id: item.id,
    kind: 'capability',
    name: item.name,
    domain: item.domain,
    ownerAgent: item.ownerAgent,
    actionTier: item.actionTier,
    maturity: item.maturity,
    tags: freeze([...(item.tags || [])]),
  });
}

export function buildCapabilityGraph() {
  const capabilities = allCapabilities().map(capabilityNode);
  const capabilityIds = new Set(capabilities.map(item => item.id));
  const packs = (workspacePacks.packs || []).map(pack => freeze({
    id: `pack:${pack.id}`,
    kind: 'pack',
    name: pack.name,
    signals: freeze([...(pack.signals || [])]),
  }));
  const edges = [];
  for (const pack of workspacePacks.packs || []) {
    for (const capabilityId of pack.capabilities || []) {
      if (capabilityIds.has(capabilityId)) edges.push(freeze({ from: `pack:${pack.id}`, to: capabilityId, relation: 'composes' }));
    }
  }
  return freeze({
    schemaVersion: 1,
    generationModel: 'ekodi-10g-capability-ecosystem',
    registryVersion: capabilityRegistry.version,
    nodeCount: capabilities.length + packs.length,
    capabilityCount: capabilities.length,
    packCount: packs.length,
    edgeCount: edges.length,
    capabilities: freeze(capabilities),
    packs: freeze(packs),
    edges: freeze(edges),
  });
}

export function getCapabilityNode(capabilityId) {
  const id = clean(capabilityId, 120);
  const item = allCapabilities().find(candidate => candidate.id === id);
  return item ? capabilityNode(item) : null;
}

export function getCapabilityGaps(capabilityIds = []) {
  const registered = new Set(allCapabilities().map(item => item.id));
  return freeze(unique((Array.isArray(capabilityIds) ? capabilityIds : [capabilityIds])
    .map(item => clean(item, 120))).filter(id => !registered.has(id)));
}

export function findReusableComposition(query = '', limit = 6) {
  const tokens = unique(clean(query, 1200).toLowerCase().split(/[^\p{L}\p{N}.-]+/u).filter(token => token.length >= 2));
  const scored = allCapabilities().map(item => {
    const tags = (item.tags || []).map(tag => String(tag).toLowerCase());
    const haystack = `${item.id} ${item.name} ${item.description} ${tags.join(' ')}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (tags.includes(token)) score += 4;
      if (item.id.includes(token)) score += 3;
      if (haystack.includes(token)) score += 1;
    }
    return { capability: capabilityNode(item), score };
  }).filter(item => item.score > 0);
  scored.sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id));
  return freeze(scored.slice(0, Math.max(1, Math.min(12, Number(limit) || 6))).map(item => freeze(item)));
}

export function buildExperienceRecord(input = {}, result = {}, metrics = {}) {
  const target = input.target && typeof input.target === 'object' ? input.target : {};
  const template = goalTemplate(input.goal || input.taskName || result.taskId || 'command');
  const capabilityIds = unique([
    target.capability,
    ...(Array.isArray(input.capabilityIds) ? input.capabilityIds : []),
  ].map(item => clean(item, 120)));
  const patternKey = clean(input.patternKey, 160)
    || (target.capability ? `capability:${clean(target.capability, 120)}` : '')
    || (target.service ? `service:${clean(target.service, 80)}:${fnv1a(template)}` : '')
    || `goal:${fnv1a(template)}`;
  const occurredAt = clean(metrics.occurredAt, 40) || new Date().toISOString();
  const state = clean(result.state || metrics.state || 'unknown', 40).toLowerCase();
  const risk = Object.hasOwn(RISK_RANK, clean(input.risk, 20).toLowerCase()) ? clean(input.risk, 20).toLowerCase() : 'normal';
  return freeze({
    schemaVersion: 1,
    id: `exp_${fnv1a(`${occurredAt}:${result.taskId || input.taskId || ''}:${patternKey}`)}`,
    taskId: clean(result.taskId || input.taskId || input.taskName, 120) || null,
    patternKey,
    goalFingerprint: fnv1a(template),
    source: clean(metrics.source || input.context?.source || 'ekodi-core', 60),
    risk,
    capabilityIds: freeze(capabilityIds),
    resultState: state,
    verified: result.evidence?.verified === true || metrics.verified === true || state === 'verified',
    costClass: clean(metrics.costClass, 30) || 'unknown',
    durationMs: Math.max(0, Math.trunc(Number(metrics.durationMs) || 0)),
    occurredAt,
  });
}
export function detectAutomationPatterns(records = [], options = {}) {
  const minOccurrences = Math.max(2, Math.min(50, Math.trunc(Number(options.minOccurrences) || 3)));
  const groups = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const key = clean(record?.patternKey, 160);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const patterns = [];
  for (const [patternKey, items] of groups) {
    if (items.length < minOccurrences) continue;
    const verifiedCount = items.filter(item => item.verified === true).length;
    const successRate = items.length ? verifiedCount / items.length : 0;
    const risk = items.reduce((highest, item) => {
      const candidate = Object.hasOwn(RISK_RANK, item.risk) ? item.risk : 'normal';
      return RISK_RANK[candidate] > RISK_RANK[highest] ? candidate : highest;
    }, 'low');
    const capabilityIds = unique(items.flatMap(item => Array.isArray(item.capabilityIds) ? item.capabilityIds : []));
    patterns.push(freeze({
      id: `pattern_${fnv1a(patternKey)}`,
      patternKey,
      occurrences: items.length,
      verifiedCount,
      successRate: Number(successRate.toFixed(4)),
      risk,
      capabilityIds: freeze(capabilityIds),
      state: 'pattern_found',
    }));
  }
  patterns.sort((a, b) => b.occurrences - a.occurrences || a.patternKey.localeCompare(b.patternKey));
  return freeze(patterns);
}
export function buildAutomationCandidate(pattern = {}) {
  const capabilityIds = unique((pattern.capabilityIds || []).map(item => clean(item, 120)));
  const gaps = getCapabilityGaps(capabilityIds);
  const risk = Object.hasOwn(RISK_RANK, pattern.risk) ? pattern.risk : 'normal';
  const existing = capabilityIds.filter(id => !gaps.includes(id));
  const steps = existing.length
    ? existing.map(capabilityId => freeze({ type: 'invoke_capability', capabilityId }))
    : [freeze({ type: 'capability_gap', patternKey: clean(pattern.patternKey, 160) })];
  const capabilityProposal = existing.length ? null : buildCapabilityProposal(pattern);
  return freeze({
    schemaVersion: 1,
    id: `automation_${fnv1a(pattern.patternKey || pattern.id || 'unknown')}`,
    kind: 'ekodi.automation.spec',
    state: 'candidate',
    patternKey: clean(pattern.patternKey, 160),
    evidence: freeze({
      occurrences: Math.max(0, Math.trunc(Number(pattern.occurrences) || 0)),
      verifiedCount: Math.max(0, Math.trunc(Number(pattern.verifiedCount) || 0)),
      observedSuccessRate: Math.max(0, Math.min(1, Number(pattern.successRate) || 0)),
    }),
    risk,
    steps: freeze(steps),
    capabilityGaps: gaps,
    capabilityProposal,
    productionMutation: false,
    authorityExpansion: false,
    proposalOnly: true,
    rollbackRequired: true,
    verificationRequired: true,
  });
}

export function buildCapabilityProposal(pattern = {}) {
  const patternKey = clean(pattern.patternKey || pattern.id, 160) || 'unknown';
  const suffix = fnv1a(patternKey);
  const highRisk = pattern.risk === 'high' || pattern.risk === 'critical';
  return freeze({
    schemaVersion: 1,
    id: `capability_proposal_${suffix}`,
    proposedCapabilityId: `automation.generated.${suffix}`,
    kind: 'ekodi.capability.proposal',
    state: 'candidate',
    sourcePattern: patternKey,
    contract: freeze({
      domain: 'core',
      ownerAgent: 'platform',
      actionTier: 'assist',
      maturity: 'contract',
      surfaces: freeze(['workspace']),
      providerIndependent: true,
    }),
    sandboxRequired: true,
    registryRegistrationRequired: true,
    humanGateRequired: highRisk,
    activationBlocked: true,
    registryMutationPerformed: false,
    authorityExpansion: false,
  });
}

export function evaluateAutomationCandidate(candidate = {}, evidence = {}) {
  const testCount = Math.max(0, Math.trunc(Number(evidence.testCount) || 0));
  const passed = Math.max(0, Math.trunc(Number(evidence.passed) || 0));
  const successRate = testCount ? Math.min(1, passed / testCount) : 0;
  const criticalRegressions = Math.max(0, Math.trunc(Number(evidence.criticalRegressions) || 0));
  const authorityExpansion = evidence.authorityExpansion === true || candidate.authorityExpansion === true;
  const rollbackDefined = evidence.rollbackDefined === true;
  const verificationDefined = evidence.verificationDefined === true;
  const highRisk = candidate.risk === 'high' || candidate.risk === 'critical';
  const verified = testCount >= 5
    && successRate >= 0.98
    && criticalRegressions === 0
    && !authorityExpansion
    && rollbackDefined
    && verificationDefined;
  return freeze({
    schemaVersion: 1,
    candidateId: clean(candidate.id, 120),
    state: verified ? 'verified' : 'sandboxed',
    verified,
    testCount,
    passed,
    successRate: Number(successRate.toFixed(4)),
    criticalRegressions,
    authorityExpansion,
    rollbackDefined,
    verificationDefined,
    promotion: verified ? (highRisk ? 'human_gate' : 'pr_required') : 'blocked',
    directProductionPromotion: false,
  });
}

export function assessCapabilityRuntime(metrics = {}) {
  const samples = Math.max(0, Math.trunc(Number(metrics.samples) || 0));
  const successes = Math.max(0, Math.trunc(Number(metrics.successes) || 0));
  const successRate = samples ? Math.min(1, successes / samples) : 1;
  const criticalFailures = Math.max(0, Math.trunc(Number(metrics.criticalFailures) || 0));
  const quarantine = samples >= 10 && (successRate < 0.9 || criticalFailures > 0);
  return freeze({
    state: quarantine ? 'quarantined' : 'active',
    samples,
    successes,
    successRate: Number(successRate.toFixed(4)),
    criticalFailures,
    rollbackRecommended: quarantine,
  });
}
export function nextCapabilityState(current, requested) {
  const from = clean(current, 40).toLowerCase() || 'observed';
  const to = clean(requested, 40).toLowerCase();
  if (!PROMOTION_STATES.has(from) || !PROMOTION_STATES.has(to)) return 'observed';
  const order = ['observed', 'pattern_found', 'candidate', 'sandboxed', 'verified', 'staged', 'active'];
  if (to === 'quarantined') return 'quarantined';
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  return toIndex <= fromIndex + 1 && toIndex >= fromIndex ? to : from;
}

export function getCapabilityEcosystemSummary(records = [], candidates = []) {
  const graph = buildCapabilityGraph();
  const patterns = detectAutomationPatterns(records);
  const states = {};
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const state = clean(candidate?.state, 40) || 'candidate';
    states[state] = (states[state] || 0) + 1;
  }
  return freeze({
    schemaVersion: 1,
    targetGeneration: 10,
    system: 'ekodi-capability-ecosystem',
    principle: 'integrated-responsibility-distributed-execution-standardized-connections',
    graph: freeze({
      registryVersion: graph.registryVersion,
      capabilityCount: graph.capabilityCount,
      packCount: graph.packCount,
      edgeCount: graph.edgeCount,
    }),
    experienceCount: Array.isArray(records) ? records.length : 0,
    automationPatternCount: patterns.length,
    candidateStates: freeze(states),
    productionAuthority: 'guarded-promotion-only',
    selfAuthorityExpansion: false,
  });
}

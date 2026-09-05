import { SOVEREIGN_AUTONOMY_POLICY } from './sovereign-autonomy-runtime.js';

const DEFAULT_LIMIT = 3;
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('ko-KR');
const unique = values => [...new Set(values)];

function requireCatalog(catalog = {}) {
  const registry = catalog.registry || catalog.capabilities || {};
  const capabilities = Array.isArray(registry.capabilities) ? registry.capabilities : [];
  const packs = Array.isArray(catalog.packs?.packs) ? catalog.packs.packs : [];
  return { registry, capabilities, packs, defaultPack: catalog.packs?.defaultPack || '' };
}

function executionMode(actionTier) {
  if (actionTier === 'observe') return 'automatic_observe';
  if (actionTier === 'assist') return 'automatic_assist';
  if (actionTier === 'execute_reversible') return 'autonomy_preflight';
  if (actionTier === 'human_gate') return 'sovereign_human_gate';
  if (actionTier === 'forbidden') return 'blocked';
  return 'unregistered';
}

export function scoreWorkspacePack({ text = '', audience = 'person' } = {}, pack = {}) {
  const query = normalize(text);
  const normalizedAudience = normalize(audience);
  const signals = Array.isArray(pack.signals) ? pack.signals : [];
  const audiences = Array.isArray(pack.audiences) ? pack.audiences : [];
  const matchedSignals = signals.filter(signal => query && query.includes(normalize(signal)));
  const audienceMatch = audiences.map(normalize).includes(normalizedAudience);
  return {
    packId: String(pack.id || ''),
    score: matchedSignals.length * 10 + (audienceMatch ? 2 : 0),
    matchedSignals,
    audienceMatch,
  };
}

export function recommendWorkspacePacks(input = {}, packsConfig = {}, options = {}) {
  const packs = Array.isArray(packsConfig.packs) ? packsConfig.packs : [];
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, 10));
  const ranked = packs
    .map(pack => ({ pack, ...scoreWorkspacePack(input, pack) }))
    .filter(item => item.matchedSignals.length > 0)
    .sort((a, b) => b.score - a.score || String(a.pack.id).localeCompare(String(b.pack.id), 'ko'))
    .slice(0, limit)
    .map(({ pack, score, matchedSignals, audienceMatch }) => ({
      id: pack.id,
      name: pack.name,
      score,
      matchedSignals,
      audienceMatch,
    }));

  if (ranked.length) return ranked;
  const fallback = packs.find(pack => pack.id === packsConfig.defaultPack) || packs[0];
  return fallback ? [{ id: fallback.id, name: fallback.name, score: 0, matchedSignals: [], audienceMatch: true }] : [];
}

export function resolveCapabilityIds(packIds = [], packsConfig = {}, requestedCapabilities = []) {
  const packs = Array.isArray(packsConfig.packs) ? packsConfig.packs : [];
  const selected = new Set(packIds);
  const fromPacks = packs
    .filter(pack => selected.has(pack.id))
    .flatMap(pack => Array.isArray(pack.capabilities) ? pack.capabilities : []);
  return unique([...fromPacks, ...requestedCapabilities].map(String).filter(Boolean));
}

export function buildIntentPlan(input = {}, catalog = {}, options = {}) {
  const { registry, capabilities, packs, defaultPack } = requireCatalog(catalog);
  const capabilityById = new Map(capabilities.map(capability => [capability.id, capability]));
  const explicitPackIds = Array.isArray(input.packIds) ? input.packIds.map(String) : [];
  const recommendations = explicitPackIds.length
    ? explicitPackIds.map(id => ({ id, score: null, matchedSignals: [], audienceMatch: null }))
    : recommendWorkspacePacks(input, { packs, defaultPack }, options);
  const packIds = unique(recommendations.map(item => item.id));
  const capabilityIds = resolveCapabilityIds(
    packIds,
    { packs },
    Array.isArray(input.requestedCapabilities) ? input.requestedCapabilities : [],
  );
  const resolved = capabilityIds.map(id => capabilityById.get(id)).filter(Boolean);
  const unresolved = capabilityIds.filter(id => !capabilityById.has(id));
  const steps = resolved.map(capability => Object.freeze({
    capabilityId: capability.id,
    ownerAgent: capability.ownerAgent,
    actionTier: capability.actionTier,
    executionMode: executionMode(capability.actionTier),
    maturity: capability.maturity,
    showroomServiceId: capability.showroom?.serviceId || null,
  }));
  const byTier = tier => resolved.filter(item => item.actionTier === tier).map(item => item.id);
  const showroomEntries = unique(resolved.map(capability => capability.showroom?.serviceId).filter(Boolean));

  return Object.freeze({
    schemaVersion: '2.0.0',
    contract: 'ekodi.intent-plan.v1',
    router: registry.intentPolicy?.router || 'deterministic_first',
    autonomyPolicyVersion: SOVEREIGN_AUTONOMY_POLICY.version,
    authorityContext: SOVEREIGN_AUTONOMY_POLICY.authorityContext,
    home: registry.surfacePolicy?.defaultHome || 'https://my.ekodi.kr',
    audience: normalize(input.audience || 'person'),
    packIds: Object.freeze(packIds),
    recommendations: Object.freeze(recommendations),
    capabilityIds: Object.freeze(resolved.map(capability => capability.id)),
    unresolvedCapabilityIds: Object.freeze(unresolved),
    steps: Object.freeze(steps),
    observeCapabilities: Object.freeze(byTier('observe')),
    assistCapabilities: Object.freeze(byTier('assist')),    reversibleCapabilities: Object.freeze(byTier('execute_reversible')),
    humanGateCapabilities: Object.freeze(byTier('human_gate')),
    forbiddenCapabilities: Object.freeze(byTier('forbidden')),
    showroomEntries: Object.freeze(showroomEntries),
    dedicatedSiteRecommended: input.dedicatedSite === true,
    principle: 'intent_to_registered_capability_before_service_or_provider',
  });
}

export const buildWorkspaceBlueprint = buildIntentPlan;

export function routeIntent(input = {}, catalog = {}, options = {}) {
  return buildIntentPlan(input, catalog, options);
}

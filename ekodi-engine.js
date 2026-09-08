import moduleRegistry from './config/ekodi-ai-module-registry.json' with { type: 'json' };
import { compileCapabilityContract } from './sovereign-capability-fabric.js';
import { buildEkodiCharacterExperience } from './ekodi-character-engine.js';

const freeze = value => Object.freeze(value);
const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLocaleLowerCase('ko-KR');
const unique = values => [...new Set(values.filter(Boolean))];

export const EKODI_ENGINE_POLICY = freeze({
  version: '1.0.0',
  id: 'ekodi-engine',
  name: 'EKODI Engine',
  currentFoundationGeneration: moduleRegistry.currentFoundationGeneration,
  northStarGeneration: moduleRegistry.northStarGeneration,
  cycle: freeze(['ecclesia', 'koinonia', 'diaspora', 'jubilee']),
  cycleKo: '모이고 → 연결되고 → 흩어져 → 살아내고 → 다시 모인다',
  userFacingAi: 'EKODI AI',
  characterEngine: 'ekodi-character-engine',
  character: 'ekodian',
  engagementPrimaryGoal: false,
  successSignal: 'return_with_story',
  providerIndependent: true,
  principle: 'context_to_capability_to_module_to_adapter_then_verified_action',
});

const MODULES = freeze((moduleRegistry.modules || []).map(module => freeze({ ...module })));
const MODULE_BY_ID = new Map(MODULES.map(module => [module.id, module]));
const CULTURE_MODULES = freeze(['knowledge.books', 'culture.music', 'culture.art', 'culture.video']);

function normalizeList(value) {
  return unique((Array.isArray(value) ? value : value ? [value] : []).map(lower));
}

function directSignalMatches(text, module) {
  const query = lower(text);
  return (module.signals || []).filter(signal => query && query.includes(lower(signal)));
}

function moduleAllowed(module, input, matchedSignals) {
  if (module.activation !== 'opt_in_or_direct') return true;
  const explicit = normalizeList(input.requestedModules).includes(module.id);
  const scriptureRequested = normalizeList(input.requestedMedia).includes('scripture');
  return explicit || scriptureRequested || input.includeBiblicalRoot === true || matchedSignals.length > 0;
}

function scoreModule(module, input = {}) {
  const matches = directSignalMatches(input.text, module);
  const requestedModules = normalizeList(input.requestedModules);
  const requestedMedia = normalizeList(input.requestedMedia);
  const currentMedia = lower(input.currentMedia);
  let score = matches.length * 10;
  if (requestedModules.includes(module.id)) score += 50;
  if ((module.mediaKinds || []).some(kind => requestedMedia.includes(lower(kind)))) score += 24;
  if (currentMedia && (module.mediaKinds || []).map(lower).includes(currentMedia)) score += 12;
  if (module.id === 'core.navigator') score += 1;
  if (module.id === 'life.reflection' && clean(input.text)) score += 2;
  return freeze({ module, score, matchedSignals: freeze(matches) });
}

export function resolveEkodiJourneyPhase(input = {}) {
  const explicit = lower(input.journeyState || input.phase);
  if (input.returning === true || input.returnWithStory === true || explicit === 'return') {
    return freeze({ phase: 'ecclesia', loopEvent: 'return_with_story', reason: 'returned_from_lived_experience' });
  }
  if (input.practiceInProgress === true || explicit === 'jubilee') {
    return freeze({ phase: 'jubilee', loopEvent: 'living', reason: 'practice_is_happening_outside_the_platform' });
  }
  if (input.readyToLive === true || explicit === 'diaspora' || (Number(input.contentConsumed || 0) >= 3 && input.reflectionCompleted === true)) {
    return freeze({ phase: 'diaspora', loopEvent: 'depart', reason: 'enough_input_to_choose_a_real_world_practice' });
  }
  if (input.connected === true || explicit === 'koinonia') {
    return freeze({ phase: 'koinonia', loopEvent: 'connect', reason: 'meaning_is_being_shared_with_people' });
  }
  return freeze({ phase: 'ecclesia', loopEvent: 'gather', reason: 'begin_from_question_and_meaning' });
}

export function selectEkodiSpecialistModules(input = {}, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || moduleRegistry.defaults.maxSuggestedModules) || 3, 6));
  const ranked = MODULES.map(module => scoreModule(module, input))
    .filter(item => moduleAllowed(item.module, input, item.matchedSignals))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.module.id.localeCompare(b.module.id));
  return freeze(ranked.slice(0, limit).map(item => freeze({
    id: item.module.id,
    name: item.module.name,
    domain: item.module.domain,
    serviceId: item.module.serviceId,
    ownerAgent: item.module.ownerAgent,
    capabilityIds: freeze([...(item.module.capabilityIds || [])]),
    score: item.score,
    matchedSignals: item.matchedSignals,
    reason: item.matchedSignals.length ? `matched:${item.matchedSignals.join(',')}` : 'contextual_default',
  })));
}

function capabilityProjection(selectedModules = []) {
  const ids = unique(selectedModules.flatMap(module => module.capabilityIds || []));
  return freeze(ids.map(id => {
    const contract = compileCapabilityContract(id);
    return freeze({
      id,
      registered: Boolean(contract),
      actionTier: contract?.actionTier || null,
      risk: contract?.risk || null,
      humanGate: contract?.humanGate ?? null,
    });
  }));
}

function mediaDoors(selectedModules = []) {
  const selected = new Set(selectedModules.map(module => module.id));
  return freeze(CULTURE_MODULES.map(id => {
    const module = MODULE_BY_ID.get(id);
    return freeze({
      moduleId: id,
      name: module?.name || id,
      mediaKinds: freeze([...(module?.mediaKinds || [])]),
      selected: selected.has(id),
    });
  }));
}

function nextMoveForPhase(phase, loopEvent) {
  if (loopEvent === 'return_with_story') return freeze({ primary: 'REFLECTION', secondary: freeze(['STORY', 'CIRCLE']) });
  if (phase === 'diaspora') return freeze({ primary: 'STOP', secondary: freeze(['PRACTICE']) });
  if (phase === 'jubilee') return freeze({ primary: 'STOP', secondary: freeze(['RETURN']) });
  if (phase === 'koinonia') return freeze({ primary: 'CIRCLE', secondary: freeze(['QUESTION', 'PRACTICE']) });
  return freeze({ primary: 'QUESTION', secondary: freeze(['CONTENT', 'PERSON']) });
}

function interventionFor(input, phase, loopEvent) {
  if (input.interruptionsDisabled === true || input.characterEnabled === false) return 'hidden';
  if (phase === 'jubilee') return 'hidden';
  if (phase === 'diaspora') return 'suggest';
  if (loopEvent === 'return_with_story') return 'converse';
  if (input.explicitRequest === true) return 'converse';
  return moduleRegistry.defaults.intervention || 'suggest';
}

function phaseModuleFilter(phase, modules) {
  if (phase !== 'diaspora' && phase !== 'jubilee') return modules;
  return modules.filter(module => ['core.navigator', 'life.reflection'].includes(module.id));
}

export function planEkodiExperience(input = {}) {
  const journey = resolveEkodiJourneyPhase(input);
  const selectedModules = freeze(phaseModuleFilter(
    journey.phase,
    selectEkodiSpecialistModules(input, { limit: input.maxModules }),
  ));
  const capabilities = capabilityProjection(selectedModules);
  const nextMove = nextMoveForPhase(journey.phase, journey.loopEvent);
  const intervention = interventionFor(input, journey.phase, journey.loopEvent);
  const primaryCapability = capabilities.find(item => item.registered)?.id || 'core.navigator';
  const character = buildEkodiCharacterExperience({
    phase: journey.phase,
    selectedModules,
    intervention,
    characterEnabled: input.characterEnabled,
    surface: input.surface || 'user',
    area: input.area || '',
    capabilityId: primaryCapability,
    decisionTier: 'assist',
  });

  return freeze({
    schemaVersion: 1,
    contract: 'ekodi.engine-experience-plan.v1',
    engine: EKODI_ENGINE_POLICY.id,
    journey,
    intervention,
    nextMove,
    selectedModules,
    capabilities,
    mediaDoors: mediaDoors(selectedModules),
    biblicalRoot: freeze({
      available: true,
      moduleId: 'scripture.bible',
      selected: selectedModules.some(module => module.id === 'scripture.bible'),
      policy: 'visible_when_directly_relevant_or_user_opens_deeper_root',
    }),
    character,
    agency: freeze({
      mayStop: true,
      mayIgnoreSuggestion: true,
      mayLeavePlatform: true,
      engagementMaximization: false,
    }),
    successSignal: EKODI_ENGINE_POLICY.successSignal,
  });
}

export function getEkodiEngineSummary() {
  const invalidCapabilities = [];
  for (const module of MODULES) {
    for (const capabilityId of module.capabilityIds || []) {
      if (!compileCapabilityContract(capabilityId)) invalidCapabilities.push(`${module.id}:${capabilityId}`);
    }
  }
  return freeze({
    ...EKODI_ENGINE_POLICY,
    moduleRegistryVersion: moduleRegistry.version,
    moduleCount: MODULES.length,
    modules: freeze(MODULES.map(module => freeze({
      id: module.id,
      domain: module.domain,
      serviceId: module.serviceId,
      activation: module.activation,
      capabilityIds: freeze([...(module.capabilityIds || [])]),
    }))),
    registryValid: invalidCapabilities.length === 0,
    invalidCapabilities: freeze(invalidCapabilities),
  });
}

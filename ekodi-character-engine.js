import { buildEkodianOperationSnapshot } from './ekodian-8g-runtime.js';

const freeze = value => Object.freeze(value);
const clean = value => String(value ?? '').trim().toLowerCase();

const PHASE_ROLE = freeze({
  ecclesia: 'curator',
  koinonia: 'connector',
  diaspora: 'sender',
  jubilee: 'companion',
});

const PHASE_EXPRESSION = freeze({
  ecclesia: 'curious',
  koinonia: 'welcoming',
  diaspora: 'quiet',
  jubilee: 'grounded',
});

const MODULE_MOTIF = freeze({
  'knowledge.books': 'book',
  'culture.music': 'music',
  'culture.art': 'art',
  'culture.video': 'video',
  'scripture.bible': 'scripture',
  'community.connector': 'people',
  'life.reflection': 'reflection',
  'business.stewardship': 'work',
  'finance.stewardship': 'stewardship',
  'core.navigator': 'compass',
});

export const EKODI_CHARACTER_ENGINE_POLICY = freeze({
  version: '1.0.0',
  id: 'ekodi-character-engine',
  characterId: 'ekodian',
  oneCharacterManyRoles: true,
  authority: 'expression_only',
  rules: freeze([
    'character_never_creates_authority',
    'one_ekodian_changes_role_without_character_sprawl',
    'critical_contexts_inherit_governed_hidden_presence',
    'diaspora_prefers_quiet_presence',
    'user_can_suppress_character_intervention',
  ]),
});
export function buildEkodiCharacterExperience(input = {}) {
  const phase = clean(input.phase) || 'ecclesia';
  const selectedModules = Array.isArray(input.selectedModules)
    ? input.selectedModules.map(item => typeof item === 'string' ? item : item?.id).filter(Boolean)
    : [];
  const primaryModule = selectedModules[0] || 'core.navigator';
  const intervention = clean(input.intervention) || 'suggest';
  const operation = buildEkodianOperationSnapshot({
    agentId: input.agentId || 'chief',
    capabilityId: input.capabilityId || 'core.navigator',
    decisionTier: input.decisionTier || 'assist',
    status: input.status || 'assist_only',
    area: input.area || '',
    surface: input.surface || 'user',
  });

  const governedPresence = operation.character.presence;
  const suppressed = input.characterEnabled === false || intervention === 'hidden';
  const presence = suppressed
    ? freeze({ level: 0, token: 'hidden', reason: 'user_or_engine_suppressed' })
    : governedPresence;

  return freeze({
    schemaVersion: 1,
    engine: EKODI_CHARACTER_ENGINE_POLICY.id,
    character: freeze({
      id: EKODI_CHARACTER_ENGINE_POLICY.characterId,
      name: 'EKODIAN',
      role: PHASE_ROLE[phase] || 'guide',
      expression: PHASE_EXPRESSION[phase] || 'calm',
      motif: MODULE_MOTIF[primaryModule] || 'compass',
      presence,
      sameCharacter: true,
    }),
    phase,
    intervention,
    authority: freeze({
      expressionOnly: true,
      operationAuthority: operation.authority,
      capability: operation.capability,
    }),
    principle: 'EKODIAN expresses governed context; it never invents authority.',
  });
}

export function getEkodiCharacterEngineSummary() {
  return freeze({
    ...EKODI_CHARACTER_ENGINE_POLICY,
    roles: freeze({ ...PHASE_ROLE }),
    expressions: freeze({ ...PHASE_EXPRESSION }),
    motifs: freeze({ ...MODULE_MOTIF }),
  });
}

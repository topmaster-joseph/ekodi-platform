import registry from '../config/ekodi-ai-module-registry.json' with { type:'json' };
import { EKODI_ENGINE_POLICY, getEkodiEngineSummary } from '../ekodi-engine.js';
import { getEkodiCharacterEngineSummary } from '../ekodi-character-engine.js';

const fail = message => { throw new Error(`EKODI Engine validation failed: ${message}`); };
const summary = getEkodiEngineSummary();
const character = getEkodiCharacterEngineSummary();
const modules = Array.isArray(registry.modules) ? registry.modules : [];
const ids = modules.map(module => String(module.id || '').trim());

if (!summary.registryValid) fail(`unknown capabilities: ${summary.invalidCapabilities.join(', ')}`);
if (ids.length !== new Set(ids).size) fail('module ids must be unique');
if (!ids.length) fail('at least one specialist module is required');
if (registry.engine !== EKODI_ENGINE_POLICY.id) fail('registry must bind to ekodi-engine');
if (registry.character !== 'ekodian') fail('registry character must be ekodian');
if (character.characterId !== 'ekodian') fail('Character Engine must expose one EKODIAN');
if (character.oneCharacterManyRoles !== true) fail('Character Engine must avoid character sprawl');
if (EKODI_ENGINE_POLICY.engagementPrimaryGoal !== false) fail('engagement may not become the primary goal');
if (EKODI_ENGINE_POLICY.successSignal !== 'return_with_story') fail('Return with Story must remain the primary impact signal');
if (EKODI_ENGINE_POLICY.cycle.join('>') !== 'ecclesia>koinonia>diaspora>jubilee') fail('canonical cycle drifted');

const bible = modules.find(module => module.id === 'scripture.bible');
if (!bible) fail('scripture.bible module is required');
if (bible.activation !== 'opt_in_or_direct') fail('Bible module must remain direct or deeper-root opt-in');
for (const module of modules) {
  if (!module.serviceId) fail(`${module.id} must declare serviceId`);
  if (!Array.isArray(module.capabilityIds) || !module.capabilityIds.length) fail(`${module.id} must declare capabilities`);
}

console.log(`EKODI Engine ${summary.version}: OK`);
console.log(`- ${summary.moduleCount} specialist modules bound to registered capabilities`);
console.log(`- cycle: ${EKODI_ENGINE_POLICY.cycleKo}`);
console.log('- EKODIAN is one contextual character; authority stays outside the Character Engine');
console.log('- engagement maximization is not a primary goal; Return with Story is preserved');

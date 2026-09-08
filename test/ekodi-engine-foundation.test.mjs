import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EKODI_ENGINE_POLICY,
  getEkodiEngineSummary,
  planEkodiExperience,
  resolveEkodiJourneyPhase,
  selectEkodiSpecialistModules,
} from '../ekodi-engine.js';
import {
  EKODI_CHARACTER_ENGINE_POLICY,
  buildEkodiCharacterExperience,
} from '../ekodi-character-engine.js';

test('EKODI Engine binds specialist modules only to registered capabilities', () => {
  const summary = getEkodiEngineSummary();
  assert.equal(summary.registryValid, true);
  assert.deepEqual(summary.invalidCapabilities, []);
  assert.equal(summary.currentFoundationGeneration, 2);
  assert.equal(summary.northStarGeneration, 8);
  assert.equal(summary.successSignal, 'return_with_story');
  assert.equal(summary.engagementPrimaryGoal, false);
  assert.ok(summary.moduleCount >= 9);
});

test('generic life question does not force Bible AI but keeps cultural doors open', () => {
  const plan = planEkodiExperience({ text: '성공이란 무엇일까?', explicitRequest: true });
  assert.equal(plan.journey.phase, 'ecclesia');
  assert.equal(plan.nextMove.primary, 'QUESTION');
  assert.equal(plan.biblicalRoot.selected, false);
  assert.equal(plan.biblicalRoot.available, true);
  assert.ok(plan.selectedModules.some(module => module.id === 'life.reflection'));
  assert.deepEqual(plan.mediaDoors.map(item => item.moduleId), [
    'knowledge.books', 'culture.music', 'culture.art', 'culture.video',
  ]);
});
test('media specialist modules activate from direct context', () => {
  const music = selectEkodiSpecialistModules({ text: '이 주제와 연결되는 음악을 듣고 싶어' });
  const art = selectEkodiSpecialistModules({ text: '이 질문을 미술 작품으로 바라보고 싶어' });
  const video = selectEkodiSpecialistModules({ text: '관련 다큐 영상도 보여줘' });
  assert.equal(music[0].id, 'culture.music');
  assert.equal(art[0].id, 'culture.art');
  assert.equal(video[0].id, 'culture.video');
});

test('Bible module opens on direct or explicit deeper-root context', () => {
  const direct = selectEkodiSpecialistModules({ text: '성경 말씀으로 더 깊이 보고 싶어' });
  const explicit = planEkodiExperience({
    text: '돈이 많으면 행복할까?',
    includeBiblicalRoot: true,
    requestedModules: ['scripture.bible'],
  });
  assert.ok(direct.some(module => module.id === 'scripture.bible'));
  assert.equal(explicit.biblicalRoot.selected, true);
});
test('Diaspora stops the content loop and sends the user toward practice', () => {
  const plan = planEkodiExperience({
    text: '성공에 대해 충분히 생각했어',
    readyToLive: true,
    contentConsumed: 4,
    reflectionCompleted: true,
  });
  assert.equal(plan.journey.phase, 'diaspora');
  assert.equal(plan.nextMove.primary, 'STOP');
  assert.deepEqual(plan.nextMove.secondary, ['PRACTICE']);
  assert.ok(plan.selectedModules.every(module => ['core.navigator', 'life.reflection'].includes(module.id)));
  assert.equal(plan.agency.engagementMaximization, false);
});

test('Jubilee is an outside-life state and character intervention becomes quiet', () => {
  const plan = planEkodiExperience({ text: '지금 실제로 해보는 중', practiceInProgress: true });
  assert.equal(plan.journey.phase, 'jubilee');
  assert.equal(plan.intervention, 'hidden');
  assert.equal(plan.nextMove.primary, 'STOP');
  assert.equal(plan.character.character.presence.token, 'hidden');
});

test('Return with Story closes the loop back into Ecclesia', () => {
  const phase = resolveEkodiJourneyPhase({ returning: true, returnWithStory: true });
  const plan = planEkodiExperience({ text: '해보니 내가 말을 많이 끊더라', returning: true, returnWithStory: true });
  assert.equal(phase.phase, 'ecclesia');
  assert.equal(phase.loopEvent, 'return_with_story');
  assert.equal(plan.nextMove.primary, 'REFLECTION');
  assert.ok(plan.nextMove.secondary.includes('STORY'));
});
test('Character Engine keeps one EKODIAN and inherits critical-context suppression', () => {
  const character = buildEkodiCharacterExperience({
    phase: 'koinonia',
    selectedModules: ['community.connector'],
    intervention: 'converse',
    area: 'payment',
  });
  assert.equal(EKODI_CHARACTER_ENGINE_POLICY.characterId, 'ekodian');
  assert.equal(EKODI_CHARACTER_ENGINE_POLICY.oneCharacterManyRoles, true);
  assert.equal(character.character.id, 'ekodian');
  assert.equal(character.character.sameCharacter, true);
  assert.equal(character.character.role, 'connector');
  assert.equal(character.character.presence.token, 'hidden');
  assert.equal(character.authority.expressionOnly, true);
});

test('canonical cycle is the engine-level operating loop', () => {
  assert.deepEqual(EKODI_ENGINE_POLICY.cycle, ['ecclesia', 'koinonia', 'diaspora', 'jubilee']);
  assert.match(EKODI_ENGINE_POLICY.cycleKo, /다시 모인다/);
});

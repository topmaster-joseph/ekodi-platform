import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTranslationChannels, budgetMode, planAdaptiveMedia, selectHealthyProvider } from '../src/realtime/adaptive-media.mjs';

test('broadcast viewers use HLS while interactive users stay WebRTC', () => {
  const plan = planAdaptiveMedia({ mode:'public_broadcast', interactiveUsers:4, viewers:800 });
  assert.equal(plan.interactiveDelivery, 'webrtc');
  assert.equal(plan.viewerDelivery, 'hls');
  assert.equal(plan.interactiveLimit, 6);
});

test('meeting stays WebRTC while inside interactive threshold', () => {
  const plan = planAdaptiveMedia({ mode:'meeting', interactiveUsers:8, viewers:0 });
  assert.equal(plan.viewerDelivery, 'webrtc');
  assert.equal(plan.interactiveLimit, 12);
});

test('translation only activates languages with listeners', () => {
  assert.deepEqual(activeTranslationChannels({
    sourceLanguage:'ko', requestedLanguages:['en','zh','vi','ko','EN'],
    listenerCounts:{ en:4, zh:0, vi:2, ko:20 }
  }), ['en','vi']);
});

test('conserve mode lowers video and recording cost without stopping original live', () => {
  const plan = planAdaptiveMedia({
    mode:'worship', viewers:300, recordingEnabled:true,
    budget:{ spent:86, limit:100 },
    translation:{ requestedLanguages:['en','zh'], listenerCounts:{ en:20, zh:0 } }
  });
  assert.equal(plan.budget.mode, 'conserve');
  assert.equal(plan.videoProfile, '720p');
  assert.equal(plan.recordingMode, 'program-only');
  assert.deepEqual(plan.translationChannels, ['en']);
  assert.ok(plan.actions.includes('prefer-hls-viewers'));
});

test('hard budget protects core live but blocks new premium actions', () => {
  const plan = planAdaptiveMedia({ mode:'commerce', viewers:50, recordingEnabled:true, budget:{ spent:100, limit:100 } });
  assert.equal(plan.budget.mode, 'hard');
  assert.equal(plan.videoProfile, '480p');
  assert.equal(plan.viewerDelivery, 'hls');
  assert.ok(plan.actions.includes('block-new-premium-actions'));
});

test('provider selection is health, capability and priority aware', () => {
  const provider = selectHealthyProvider([
    { key:'primary', enabled:true, healthy:false, priority:1, capabilities:['webrtc'] },
    { key:'fallback', enabled:true, healthy:true, priority:20, capabilities:['webrtc','hls'] },
    { key:'other', enabled:true, healthy:true, priority:10, capabilities:['recording'] }
  ], { capability:'webrtc' });
  assert.equal(provider.key, 'fallback');
});

test('budget mode is unlimited when no positive limit exists', () => {
  assert.deepEqual(budgetMode({ spent:999, limit:0 }), { mode:'normal', ratio:0 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { entitlementSnapshot, evaluateRealtimeRequest, resolveRealtimeTier } from '../src/realtime/entitlement.mjs';

test('anonymous viewers cannot host but public viewing stays outside host entitlement', () => {
  const snap = entitlementSnapshot({ authenticated:false });
  assert.equal(snap.tier, 'anonymous');
  assert.equal(snap.canHost, false);
  assert.equal(snap.loginRequired, true);
});

test('site administrators receive organization host tier immediately', () => {
  assert.equal(resolveRealtimeTier({ authenticated:true, authorizationRole:'admin' }), 'organization');
  const decision = evaluateRealtimeRequest({ tier:'organization', interactiveParticipants:40, languages:8, recording:true, multistream:true });
  assert.equal(decision.allowed, true);
});

test('free member gets bounded hosting and subscription guidance only when exceeded', () => {
  assert.equal(resolveRealtimeTier({ authenticated:true }), 'free');
  const included = evaluateRealtimeRequest({ tier:'free', interactiveParticipants:4, languages:2, durationMinutes:45, recording:true });
  assert.equal(included.allowed, true);
  const exceeded = evaluateRealtimeRequest({ tier:'free', interactiveParticipants:6, languages:3, multistream:true });
  assert.equal(exceeded.allowed, false);
  assert.equal(exceeded.requiresSubscription, true);
});
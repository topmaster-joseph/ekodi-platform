import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_ENTITLEMENT_POLICY,
  aiEntitlementDefinitions,
  authorizeAiCapability,
  buildAiEntitlementSnapshot,
} from '../ai-entitlement-engine.js';

function subs(entries = []) {
  return new Map(entries.map((row) => [row.site, row]));
}

test('AI entitlement manager is canonical My EKODI and shares exact capabilities across surfaces', () => {
  assert.equal(AI_ENTITLEMENT_POLICY.managerUrl, 'https://ekodi.kr/my/');
  assert.equal(AI_ENTITLEMENT_POLICY.capabilitySharing.sameCapabilitySameSubjectAcrossSurfaces, true);
  assert.equal(AI_ENTITLEMENT_POLICY.capabilitySharing.duplicatePurchaseForSameCapabilityForbidden, true);
  const marketing = aiEntitlementDefinitions().find((item) => item.key === 'business.marketing');
  assert.ok(marketing);
  assert.equal(marketing.scope, 'shared-capability');
  assert.ok(marketing.surfaces.some((surface) => surface.id === 'everyone-ai'));
  assert.ok(marketing.surfaces.some((surface) => surface.id === 'owning-service'));
});

test('authenticated non-paid capabilities receive the shared additional level', () => {
  const snapshot = buildAiEntitlementSnapshot({
    subject:{ id:'person', type:'person', name:'개인' },
    subscriptions:subs(),
    authenticated:true,
  });
  const documents = snapshot.capabilities.find((item) => item.key === 'core.documents');
  assert.ok(documents?.usableNow);
  assert.equal(documents.access.level, 'additional');
  assert.equal(documents.access.source, 'authenticated-member');
  assert.equal(authorizeAiCapability(snapshot, 'core.documents', 'additional').allowed, true);
  assert.equal(authorizeAiCapability(snapshot, 'core.documents', 'advanced').allowed, false);
});

test('Marketing commercial plans raise the same capability entitlement without changing unrelated services', () => {
  const pro = buildAiEntitlementSnapshot({
    subject:{ id:'workspace:sample', type:'workspace', name:'샘플 기관' },
    subscriptions:subs([{site:'marketing', plan_id:'pro', status:'active'}]),
    authenticated:true,
  });
  assert.equal(pro.capabilities.find((item) => item.key === 'business.marketing')?.access.level, 'advanced');
  assert.equal(pro.capabilities.find((item) => item.key === 'core.documents')?.access.level, 'additional');

  const auto = buildAiEntitlementSnapshot({
    subject:{ id:'workspace:sample', type:'workspace', name:'샘플 기관' },
    subscriptions:subs([{site:'marketing', plan_id:'auto', status:'active'}]),
    authenticated:true,
  });
  assert.equal(auto.capabilities.find((item) => item.key === 'business.marketing')?.access.level, 'automation');
  assert.equal(authorizeAiCapability(auto, 'business.marketing', 'automation').allowed, true);
});

test('preview capabilities never become executable merely because a subject has a subscription', () => {
  const snapshot = buildAiEntitlementSnapshot({
    subject:{ id:'person', type:'person', name:'개인' },
    subscriptions:subs([{site:'marketing', plan_id:'auto', status:'active'}]),
    authenticated:true,
  });
  const preview = snapshot.capabilities.find((item) => item.key === 'core.project');
  assert.ok(preview);
  assert.equal(preview.usableNow, false);
  assert.equal(preview.access.state, 'preview');
  assert.equal(authorizeAiCapability(snapshot, 'core.project', 'basic').allowed, false);
});

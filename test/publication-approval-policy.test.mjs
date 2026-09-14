import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicationDecision, isPublicPromotionApproved } from '../scripts/publication-approval-policy.mjs';

test('automatic push remains private by default', () => {
  const decision = resolvePublicationDecision({ GITHUB_EVENT_NAME: 'push', GITHUB_ACTOR: 'ci-bot' });
  assert.equal(decision.state, 'private');
  assert.equal(decision.approved, false);
  assert.equal(decision.mode, 'private-by-default');
  assert.equal(isPublicPromotionApproved({ GITHUB_EVENT_NAME: 'push' }), false);
});

test('pull request and schedule never imply public approval', () => {
  for (const eventName of ['pull_request', 'schedule', 'repository_dispatch', '']) {
    const decision = resolvePublicationDecision({ GITHUB_EVENT_NAME: eventName });
    assert.equal(decision.approved, false, eventName || 'local');
  }
});

test('manual workflow dispatch is administrator publication approval', () => {
  const decision = resolvePublicationDecision({ GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'topmaster-joseph' });
  assert.equal(decision.state, 'published');
  assert.equal(decision.approved, true);
  assert.equal(decision.mode, 'administrator-review');
});

test('emergency publication fails closed without an allowed reason', () => {
  const missing = resolvePublicationDecision({ GITHUB_EVENT_NAME: 'push', EKODI_EMERGENCY_PUBLISH: 'true' });
  assert.equal(missing.approved, false);
  assert.equal(missing.mode, 'emergency-denied');

  const invalid = resolvePublicationDecision({ GITHUB_EVENT_NAME: 'push', EKODI_EMERGENCY_PUBLISH: 'true', EKODI_EMERGENCY_REASON: 'convenience' });
  assert.equal(invalid.approved, false);
  assert.equal(invalid.mode, 'emergency-denied');
});

test('audited emergency reasons may authorize immediate publication', () => {
  for (const reason of ['security-patch', 'legal-notice', 'incident-recovery']) {
    const decision = resolvePublicationDecision({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_ACTOR: 'release-admin',
      EKODI_EMERGENCY_PUBLISH: 'true',
      EKODI_EMERGENCY_REASON: reason,
    });
    assert.equal(decision.approved, true, reason);
    assert.equal(decision.mode, 'emergency');
    assert.equal(decision.reason, reason);
  }
});

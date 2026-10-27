import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_AUTHOR_PLANS, resolveAuthorCapability, assessNewAuthorProject, DIALOGUE_STAGES, nextAuthorConversationStep, canSubmitToPublisher } from '../publishing/human/author-plans.js';

const identity = { verified: true, personId: 'person-1', verifiedChiefAdmin: false, publisherEditorScope: false };
const free = { planId: 'free' };
const paid1 = { verified: true, status: 'active', planId: 'writer1', personId: 'person-1' };
const paid3 = { verified: true, status: 'active', planId: 'writer3', personId: 'person-1' };
const req = (entitlement, existing = [], requestKey = 'request-1', requestedMode = 'human') =>
  assessNewAuthorProject({ identity, entitlement, existing, month: '2026-11', requestKey, requestedMode });

test('proposed plans are KRW 0, 100000 and 150000 with 1 or 3 new projects monthly', () => {
  assert.deepEqual(
    Object.values(HUMAN_AUTHOR_PLANS).map(x => [x.id,x.monthlyPriceKrw,x.monthlyNewProjects]),
    [['free',0,1],['writer1',100000,1],['writer3',150000,3]]);
  assert.ok(Object.values(HUMAN_AUTHOR_PLANS).every(x => x.status === 'proposed'));
});

test('free plan supports simple writing, not human editorial or sale-ready publishing', () => {
  const capability = resolveAuthorCapability(identity, free);
  assert.equal(capability.kind, 'member_author');
  assert.equal(capability.canStartHuman, false);
  assert.equal(capability.canUseEditorialAutomation, false);
  assert.equal(capability.saleReadyProduction, false);
  assert.equal(req(free).reason, 'paid_plan_required');
  assert.equal(req(free, [], 'simple-1', 'simple').allowed, true);
});

test('active paid subscriptions allow 1 or 3 projects but do not grant operator powers', () => {
  assert.equal(req(paid1).allowed, true);
  assert.equal(req(paid3).allowed, true);
  const capability = resolveAuthorCapability(identity, paid3);
  assert.equal(capability.canUseEditorialAutomation, false);
  assert.equal(capability.monthlyNewProjects, 3);
  assert.equal(req({ ...paid3, status: 'past_due' }).reason, 'active_server_entitlement_required');
  assert.equal(req({ ...paid3, personId: 'another-person' }).reason, 'active_server_entitlement_required');
  assert.equal(resolveAuthorCapability({ verified: false, personId: 'person-1' }, paid3).allowed, false);
});

test('publisher editor is a server-verified scope and cannot use member quota bypass', () => {
  const user = { ...identity, verifiedChiefAdmin: true, publisherEditorScope: true };
  const c = resolveAuthorCapability(user, null);
  assert.equal(c.kind, 'publisher_editor');
  assert.equal(c.canUseEditorialAutomation, true);
  assert.equal(assessNewAuthorProject({ identity: user, entitlement: null, month: '2026-11', existing: [], requestKey: 'x', requestedMode: 'human' }).reason, 'publisher_must_use_separate_editorial_queue');
  assert.equal(resolveAuthorCapability({ ...identity, verifiedChiefAdmin: true }, paid1).kind, 'member_author');
});

test('same idempotency key replays, distinct project beyond quota is blocked', () => {
  const existing = [{ personId: 'person-1', projectId: 'book-a', requestKey: 'seed', month: '2026-11', status: 'drafting' }];
  const replay = req(paid1, existing, 'seed');
  assert.equal(replay.allowed, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.existingProjectId, 'book-a');
  assert.equal(req(paid1, existing, 'other').reason, 'monthly_project_limit_reached');
  assert.equal(req(paid3, existing, 'other').allowed, true);
  const old = [{ ...existing[0], month: '2026-10', status: 'completed' }];
  assert.equal(req(paid1, old, 'new').allowed, true);
});

test('author conversation requires author input across stages', () => {
  assert.equal(DIALOGUE_STAGES.length, 8);
  assert.equal(nextAuthorConversationStep({ completedStages: [] }).stage, 'intent');
  assert.equal(nextAuthorConversationStep({ completedStages: ['intent','lived-context'] }).stage, 'tension');
  assert.equal(nextAuthorConversationStep({ completedStages: DIALOGUE_STAGES.map(x => x.id) }).stage, 'ready-for-publisher-review');
});

test('interview completion is not legal authorization to sell', () => {
  const project = { finalDigest: 'sha256:1', authorApproval: { approved: true, digest: 'sha256:1' },
    completedStages: DIALOGUE_STAGES.map(x => x.id), rightsAttested: true,
    humanEditingComplete: true, editorialAccessibilityReviewed: true };
  assert.equal(canSubmitToPublisher(project), true);
  assert.equal(canSubmitToPublisher({ ...project, finalDigest: 'sha256:changed' }), false);
  assert.equal(canSubmitToPublisher({ ...project, rightsAttested: false }), false);
  assert.equal(canSubmitToPublisher({ ...project, editorialAccessibilityReviewed: false }), false);
});

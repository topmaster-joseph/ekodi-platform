import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getControlPlaneContract,
  normalizeControlPlaneEvent,
  planControlPlaneJob,
  validateControlPlaneEvent,
} from '../cognitive-control-plane.js';

function mallEvent(overrides = {}) {
  return normalizeControlPlaneEvent({
    event_id: 'evt-mall-001',
    event_type: 'mall.product.promotion.requested',
    event_version: 1,
    workspace_id: 'workspace-mall',
    source: { service_id: 'ekodi-mall', adapter_id: 'mall.growth-loop' },
    actor: { type: 'system', id: 'growth-loop' },
    subject: { type: 'product', id: 'product-001' },
    correlation_id: 'campaign-001',
    payload: { title: '테스트 상품', public_url: 'https://ekodi.kr/mall' },
    ...overrides,
  }, '2026-09-02T00:00:00.000Z');
}

test('publishes an explicit provider-neutral control-plane contract', () => {
  const contract = getControlPlaneContract();
  assert.equal(contract.version, '1.0.0');
  assert.equal(contract.executionModel, 'modular_monolith_with_explicit_capability_adapters');
  assert.equal(contract.credentialPolicy, 'credentials_are_external_to_event_and_job_payloads');
  assert.ok(contract.supportedEvents.includes('mall.product.promotion.requested'));
  assert.ok(contract.capabilities.includes('media.render.short_video'));
});

test('normalizes and validates the first EKODI Mall promotion event', () => {
  const event = mallEvent();
  const validation = validateControlPlaneEvent(event);
  assert.equal(validation.ok, true);
  assert.equal(event.workspaceId, 'workspace-mall');
  assert.equal(event.source.serviceId, 'ekodi-mall');
  assert.equal(event.subject.id, 'product-001');
});

test('rejects credentials and provider secrets from the event bus', () => {
  const event = mallEvent({ payload: { refresh_token: 'must-not-enter-control-plane' } });
  const validation = validateControlPlaneEvent(event);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'CONTROL_EVENT_SECRET_FORBIDDEN');
});

test('plans Mall promotion as reusable capabilities with a human gate before public publishing', () => {
  const event = mallEvent();
  const job = planControlPlaneJob(event, '2026-09-02T00:00:01.000Z');
  assert.equal(job.goal, 'promote_product');
  assert.equal(job.workspaceId, 'workspace-mall');
  assert.equal(job.status, 'ready_for_executor');
  assert.equal(job.governance.tier, 'execute_reversible');
  assert.deepEqual(job.steps.map(step => step.capability), [
    'campaign.compose',
    'media.render.short_video',
    'publisher.youtube.private',
    'analytics.observe',
    'publisher.youtube.public',
  ]);
  assert.equal(job.steps[2].approvalRequired, false);
  assert.equal(job.steps[4].approvalRequired, true);
  assert.equal(job.steps[4].status, 'awaiting_human');
});

test('rejects unsupported events rather than granting implicit authority', () => {
  const event = mallEvent({ event_type: 'unknown.service.do-anything' });
  const validation = validateControlPlaneEvent(event);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'CONTROL_EVENT_UNSUPPORTED');
});

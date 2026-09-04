import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requiresServiceTruth,
  normalizeServiceTruth,
  resolveServiceTruth,
  buildVerifiedServiceContext
} from '../service-truth-gateway.js';

const now = Date.parse('2026-09-04T09:00:00Z');
const mall = {
  id: 'mall',
  name: '에코디몰',
  domain: 'ekodi.kr/ekodibiz/mall',
  url: 'https://ekodi.kr/ekodibiz/mall',
  group: 'business',
  state: 'active',
  monitorEnabled: true,
  latest: {
    status: 'online',
    httpStatus: 200,
    responseTime: 120,
    checkedAt: '2026-09-04T08:58:00Z'
  }
};

test('detects truth-required EKODI question', () => {
  assert.equal(requiresServiceTruth('에코디몰 주소가 뭐야?'), true);
  assert.equal(requiresServiceTruth('오늘 점심 뭐 먹지?'), false);
});

test('fresh online evidence becomes operational', () => {
  const truth = normalizeServiceTruth(mall, { nowMs: now });
  assert.equal(truth.runtimeState, 'operational');
  assert.equal(truth.canonicalUrl, 'https://ekodi.kr/ekodibiz/mall');
  assert.equal(truth.confidence, 'high');
});

test('stale runtime evidence becomes unverified', () => {
  const truth = normalizeServiceTruth({
    ...mall,
    latest: { ...mall.latest, checkedAt: '2026-09-04T08:00:00Z' }
  }, { nowMs: now });
  assert.equal(truth.runtimeState, 'unverified');
  assert.equal(truth.evidence.fresh, false);
});

test('planned service remains declared, not operational', () => {
  const truth = normalizeServiceTruth({ ...mall, state: 'planned', latest: null }, { nowMs: now });
  assert.equal(truth.runtimeState, 'declared');
});

test('resolves by service name and creates model context', () => {
  const truth = resolveServiceTruth([mall], '에코디몰', { nowMs: now });
  const context = buildVerifiedServiceContext(truth);
  assert.equal(context.verified, true);
  assert.equal(context.service.id, 'mall');
});

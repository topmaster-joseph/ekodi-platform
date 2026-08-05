import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayload, checkSite, classifyStatus, shouldPublish } from '../src/monitor-lib.mjs';

test('classifyStatus maps response health consistently', () => {
  assert.equal(classifyStatus(200, 100), 'online');
  assert.equal(classifyStatus(301, 2001), 'degraded');
  assert.equal(classifyStatus(404, 10), 'offline');
  assert.equal(classifyStatus(null, 10), 'offline');
});

test('buildPayload summarizes all states', () => {
  const payload = buildPayload([
    { status: 'online' },
    { status: 'degraded' },
    { status: 'offline' }
  ], '2026-08-05T00:00:00.000Z');
  assert.deepEqual(payload.summary, { total: 3, online: 1, degraded: 1, offline: 1 });
});

test('checkSite uses an injected fetch implementation', async () => {
  const ticks = [100, 240];
  const result = await checkSite(['mall', 'Mall', 'example.com'], {
    fetchImpl: async () => ({ status: 204, body: null }),
    clock: () => ticks.shift(),
    now: () => new Date('2026-08-05T00:00:00.000Z')
  });
  assert.equal(result.status, 'online');
  assert.equal(result.responseTime, 140);
});

test('shouldPublish ignores timing jitter but publishes state changes and refreshes stale data', () => {
  const base = {
    generatedAt: '2026-08-05T00:00:00.000Z',
    sites: [{ id: 'mall', status: 'online', httpStatus: 200, responseTime: 100, error: null }]
  };
  const jitter = {
    generatedAt: '2026-08-05T00:10:00.000Z',
    sites: [{ id: 'mall', status: 'online', httpStatus: 200, responseTime: 900, error: null }]
  };
  const offline = {
    ...jitter,
    sites: [{ id: 'mall', status: 'offline', httpStatus: 503, responseTime: 50, error: null }]
  };

  assert.equal(shouldPublish(base, jitter, Date.parse('2026-08-05T01:00:00.000Z')), false);
  assert.equal(shouldPublish(base, offline, Date.parse('2026-08-05T01:00:00.000Z')), true);
  assert.equal(shouldPublish(base, jitter, Date.parse('2026-08-05T07:00:00.000Z')), true);
});

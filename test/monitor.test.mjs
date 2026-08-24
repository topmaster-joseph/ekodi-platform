import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayload, checkSite, classifyStatus, shouldPublish, SITE_DEFINITIONS } from '../scripts/monitor-lib.mjs';

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

test('monitor covers activated services, shared infrastructure, private Marketing sites and aliases without prelaunch duplication', () => {
  const byId = new Map(SITE_DEFINITIONS.map(site => [site[0], site]));
  assert.equal(byId.get('auth')?.[2], 'auth.ekodi.kr');
  assert.equal(byId.get('ai-gateway')?.[2], 'ai.ekodi.kr');
  assert.equal(byId.get('shell-js')?.[3], 'https://shell.ekodi.kr/shell.js');
  assert.equal(byId.get('marketing-publish-api')?.[3], 'https://marketing-publish-api.ekodi.kr/health');
  assert.equal(byId.get('publishing')?.[2], 'publishing.ekodi.kr');
  assert.equal(byId.get('books')?.[2], 'books.ekodi.kr');
  assert.equal(byId.get('mail')?.[2], 'mail.ekodi.kr');
  assert.equal(byId.get('live')?.[2], 'live.ekodi.kr');
  assert.equal(byId.get('cloud')?.[2], 'cloud.ekodi.kr');
  assert.equal(byId.get('insurance')?.[2], 'ins.ekodi.kr');
  assert.equal(byId.get('media')?.[2], 'media.ekodi.kr');
  assert.equal(byId.has('prelaunch-mail'), false);
  assert.equal(byId.has('prelaunch-live'), false);
  assert.equal(byId.has('prelaunch-cloud'), false);
  assert.equal(byId.get('marketing-tenant-jadam')?.[2], 'jadam.ai.ekodi.kr');
  assert.equal(byId.get('marketing-tenant-pizzamaru')?.[2], 'pizzamaru.ai.ekodi.kr');
  assert.equal(byId.get('marketing-tenant-yogurt')?.[2], 'yogurt.ai.ekodi.kr');
  assert.equal(byId.get('marketing-tenant-cgma')?.[3], 'https://cgma.ai.ekodi.kr/market-ai');
  assert.equal(byId.get('marketing-private-cgma')?.[2], 'cgma.ekodi.kr');
  assert.equal(byId.has('marketing-public-cgma'), false);
  assert.ok([...byId.keys()].some(id => id.startsWith('marketing-alias-jadam-')));
  assert.ok(SITE_DEFINITIONS.length >= 46);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevotionStudio } from '../src/service.js';
import { createMemoryRepository } from '../src/adapters/memory-repository.js';
import { createDevotionStudioHttpHandler } from '../src/http-handler.js';

const fixedClock = () => new Date('2026-09-01T00:00:00.000Z');
const makeIdFactory = () => { let n = 0; return () => `id-${++n}`; };
const batch = workspace_id => ({
  workspace_id,
  batch_key: '2026-09',
  title: 'September devotionals',
  items: [
    { id: '01', passage: '신명기 14:22-29' },
    { id: '02', passage: '신명기 15:1-11' }
  ],
  publication_targets: [
    { id: 'channel-a', kind: 'youtube', config_ref: 'youtube:channel-a' }
  ]
});

test('core isolates batches by immutable workspace_id', async () => {
  const repository = createMemoryRepository();
  const service = createDevotionStudio({ repository, clock: fixedClock, idFactory: makeIdFactory() });
  await service.putBatch(batch('workspace-a'));
  await service.putBatch({ ...batch('workspace-b'), title: 'Different tenant' });
  assert.equal((await service.getBatch({ workspace_id: 'workspace-a', batch_key: '2026-09' })).title, 'September devotionals');
  assert.equal((await service.getBatch({ workspace_id: 'workspace-b', batch_key: '2026-09' })).title, 'Different tenant');
});

test('render request fails closed until a renderer adapter is connected', async () => {
  const repository = createMemoryRepository();
  const service = createDevotionStudio({ repository, clock: fixedClock, idFactory: makeIdFactory() });
  await service.putBatch(batch('workspace-a'));
  await assert.rejects(
    service.queueRender({ workspace_id: 'workspace-a', batch_key: '2026-09' }),
    error => error?.code === 'RENDERER_NOT_CONNECTED'
  );
});

test('render dispatch receives generic batch data and no organization assumptions', async () => {
  const repository = createMemoryRepository();
  const calls = [];
  const renderer = { ready: () => true, dispatch: async payload => calls.push(payload) };
  const service = createDevotionStudio({ repository, renderer, clock: fixedClock, idFactory: makeIdFactory() });
  await service.putBatch(batch('workspace-a'));
  const job = await service.queueRender({ workspace_id: 'workspace-a', batch_key: '2026-09' });
  assert.equal(job.status, 'queued');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].snapshot.workspace_id, 'workspace-a');
});

test('publication scheduling is target-driven and fails closed without publisher adapter', async () => {
  const repository = createMemoryRepository();
  const service = createDevotionStudio({ repository, clock: fixedClock, idFactory: makeIdFactory() });
  await service.putBatch(batch('workspace-a'));
  await assert.rejects(
    service.schedulePublication({ workspace_id: 'workspace-a', batch_key: '2026-09', target_id: 'channel-a', publish_at: '2026-09-02T06:00:00+09:00' }),
    error => error?.code === 'PUBLISHER_NOT_CONNECTED'
  );
});

test('HTTP interface uses service auth independent of EKODI admin auth implementation', async () => {
  const repository = createMemoryRepository();
  const service = createDevotionStudio({ repository, clock: fixedClock, idFactory: makeIdFactory() });
  const handle = createDevotionStudioHttpHandler({ service, serviceKey: 'test-key' });
  const denied = await handle(new Request('https://studio.example/v1/batches/2026-09?workspace_id=workspace-a'));
  assert.equal(denied.status, 401);
  const put = await handle(new Request('https://studio.example/v1/batches/2026-09', {
    method: 'PUT',
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: JSON.stringify(batch('workspace-a'))
  }));
  assert.equal(put.status, 200);
});

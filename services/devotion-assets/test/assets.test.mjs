import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssetService } from '../src/service.js';
import { createFilesystemStore } from '../src/adapters/filesystem-store.js';
import { createHttpStorageGateway } from '../src/adapters/http-storage-gateway.js';

async function withTempStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'ekodi-devotion-assets-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('filesystem store round-trips data and metadata', async () => {
  await withTempStore(async dir => {
    const service = createAssetService({ store: createFilesystemStore({ baseDir: dir }) });
    const put = await service.put({ workspace_id: 'workspace-a', asset_key: 'voice/01.wav', data: Buffer.from('hello'), mime_type: 'audio/wav', metadata: { kind: 'voice' } });
    assert.equal(put.size, 5);
    const got = await service.get({ workspace_id: 'workspace-a', asset_key: 'voice/01.wav' });
    assert.equal(got.data.toString(), 'hello');
    assert.equal(got.mime_type, 'audio/wav');
    assert.deepEqual(got.metadata, { kind: 'voice' });
  });
});

test('filesystem store returns null for missing assets', async () => {
  await withTempStore(async dir => {
    const service = createAssetService({ store: createFilesystemStore({ baseDir: dir }) });
    assert.equal(await service.get({ workspace_id: 'workspace-a', asset_key: 'missing.wav' }), null);
  });
});

test('filesystem store isolates identical asset_keys across two workspace_ids', async () => {
  await withTempStore(async dir => {
    const service = createAssetService({ store: createFilesystemStore({ baseDir: dir }) });
    await service.put({ workspace_id: 'workspace-a', asset_key: 'render.json', data: Buffer.from('A') });
    await service.put({ workspace_id: 'workspace-b', asset_key: 'render.json', data: Buffer.from('B') });
    assert.equal((await service.get({ workspace_id: 'workspace-a', asset_key: 'render.json' })).data.toString(), 'A');
    assert.equal((await service.get({ workspace_id: 'workspace-b', asset_key: 'render.json' })).data.toString(), 'B');
  });
});

test('filesystem store rejects path-traversal attempts in asset_key and workspace_id', async () => {
  await withTempStore(async dir => {
    const service = createAssetService({ store: createFilesystemStore({ baseDir: dir }) });
    await assert.rejects(service.put({ workspace_id: 'workspace-a', asset_key: '../../etc/passwd', data: Buffer.from('x') }));
    await assert.rejects(service.put({ workspace_id: '..', asset_key: 'a', data: Buffer.from('x') }));
    await assert.rejects(service.get({ workspace_id: 'workspace-a', asset_key: '../secret' }));
  });
});

test('asset service fails closed when the store adapter is not connected', async () => {
  const service = createAssetService({ store: { ready: () => false } });
  await assert.rejects(service.put({ workspace_id: 'workspace-a', asset_key: 'a', data: Buffer.from('x') }), error => error?.code === 'ASSET_STORE_NOT_CONNECTED');
  await assert.rejects(service.get({ workspace_id: 'workspace-a', asset_key: 'a' }), error => error?.code === 'ASSET_STORE_NOT_CONNECTED');
});

test('HTTP storage-gateway adapter speaks a generic provider-neutral object contract', async () => {
  const calls = [];
  const fakeObjects = new Map();
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const parsed = new URL(url);
    const [, , , workspaceId, assetKey] = parsed.pathname.split('/').map(decodeURIComponent);
    const key = `${workspaceId}::${assetKey}`;
    if (init.method === 'PUT') {
      fakeObjects.set(key, { data: Buffer.from(init.body), mimeType: init.headers['content-type'], metadata: init.headers['x-asset-metadata'] });
      return new Response(JSON.stringify({ size: init.body.length, stored_at: '2026-09-01T00:00:00.000Z', etag: 'abc' }), { status: 200 });
    }
    if (init.method === 'GET') {
      const stored = fakeObjects.get(key);
      if (!stored) return new Response(null, { status: 404 });
      return new Response(stored.data, { status: 200, headers: { 'content-type': stored.mimeType, 'x-asset-metadata': stored.metadata } });
    }
    throw new Error('unexpected method');
  };
  const gateway = createHttpStorageGateway({ endpoint: 'https://gateway.example', token: 'tok', fetchImpl });
  const put = await gateway.put({ workspace_id: 'workspace-a', asset_key: 'voice/01.wav', data: Buffer.from('hello'), mime_type: 'audio/wav', metadata: { kind: 'voice' } });
  assert.equal(put.size, 5);
  assert.equal(put.etag, 'abc');
  assert.match(calls[0].url, /\/v1\/objects\/workspace-a\/voice%2F01\.wav$/);
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');

  const got = await gateway.get({ workspace_id: 'workspace-a', asset_key: 'voice/01.wav' });
  assert.equal(got.data.toString(), 'hello');
  assert.deepEqual(got.metadata, { kind: 'voice' });

  const missing = await gateway.get({ workspace_id: 'workspace-a', asset_key: 'nope.wav' });
  assert.equal(missing, null);
});

test('HTTP storage-gateway adapter fails closed with no endpoint configured', async () => {
  const gateway = createHttpStorageGateway({ endpoint: '' });
  assert.equal(gateway.ready(), false);
  await assert.rejects(gateway.put({ workspace_id: 'a', asset_key: 'b', data: Buffer.from('x') }), error => error?.code === 'ASSET_STORE_NOT_CONNECTED');
});

test('assets core contains no Google Drive SDK, YouTube, or tenant-specific dependency', async () => {
  const fs = await import('node:fs/promises');
  const serviceSource = await fs.readFile(new URL('../src/service.js', import.meta.url), 'utf8');
  const fsStoreSource = await fs.readFile(new URL('../src/adapters/filesystem-store.js', import.meta.url), 'utf8');
  const gatewaySource = await fs.readFile(new URL('../src/adapters/http-storage-gateway.js', import.meta.url), 'utf8');
  for (const source of [serviceSource, fsStoreSource, gatewaySource]) {
    assert.doesNotMatch(source, /에코디교회|에코디선교회|googleapis\.com\/drive|google-auth-library|googleapis|YouTube|auth-worker/i);
  }
});

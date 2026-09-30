import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DataPlaneBoundaryError,
  ProviderNotConfiguredError,
  ProviderRegistry,
  assertWorkspaceId,
  createDataPlane,
  readThroughWorkspaceCache,
  validateDataPlanePolicy,
  workspaceScopedKey,
} from '../data-plane.js';
import {
  createD1DatabaseAdapter,
  createGoogleDriveFileStorageAdapter,
  createKvCacheAdapter,
  createR2FileStorageAdapter,
} from '../data-plane-adapters.js';

const policy = JSON.parse(await readFile(new URL('../config/data-plane-contract.json', import.meta.url), 'utf8'));

function noopDatabase() {
  return { read: async () => null, write: async () => null };
}
function noopFile() {
  return { get: async () => null, put: async () => null, delete: async () => null };
}
function memoryCache() {
  const values = new Map();
  return {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => values.set(key, value),
    delete: async key => values.delete(key),
  };
}
function fullRegistry() {
  return new ProviderRegistry()
    .register({ id: 'd1-core', kind: 'database', adapter: noopDatabase() })
    .register({ id: 'd1-workspace', kind: 'database', adapter: noopDatabase() })
    .register({ id: 'postgres-workspace', kind: 'database', adapter: noopDatabase() })
    .register({ id: 'google-drive-workspace', kind: 'file', adapter: noopFile() })
    .register({ id: 'r2-public', kind: 'file', adapter: noopFile() })
    .register({ id: 'kv-hot', kind: 'cache', adapter: memoryCache() });
}

test('machine-readable policy enforces the long-term traffic invariants', () => {
  assert.equal(validateDataPlanePolicy(policy), true);
  assert.equal(policy.principles.workspaceIdentityField, 'workspace_id');
  assert.equal(policy.principles.crossWorkspaceFallback, false);
  assert.equal(policy.trafficProtection.databaseBypassTargetPercent >= 95, true);
  assert.equal(policy.trafficProtection.publicRequestMayReachCoreDatabase, false);
});

test('workspace identity is mandatory, bounded and stable for scoped keys', () => {
  assert.equal(assertWorkspaceId('org:cgma-01'), 'org:cgma-01');
  assert.throws(() => assertWorkspaceId(''), DataPlaneBoundaryError);
  assert.throws(() => assertWorkspaceId('../other'), DataPlaneBoundaryError);
  const a = workspaceScopedKey('org:a', 'menu', 'main');
  const b = workspaceScopedKey('org:b', 'menu', 'main');
  assert.notEqual(a, b);
  assert.match(a, /^workspace:/);
});

test('workspace-scoped data cannot route without workspace_id', () => {
  const plane = createDataPlane({ policy, registry: fullRegistry() });
  assert.throws(
    () => plane.route({ accountProfile: 'production-core', dataClass: 'workspace-record' }),
    error => error instanceof DataPlaneBoundaryError && error.code === 'invalid_workspace_id',
  );
});

test('production-public cannot route to core or workspace database', () => {
  const plane = createDataPlane({ policy, registry: fullRegistry() });
  assert.throws(
    () => plane.route({ accountProfile: 'production-public', dataClass: 'core-record' }),
    error => error instanceof DataPlaneBoundaryError && error.code === 'account_data_class_denied',
  );
  assert.throws(
    () => plane.route({ accountProfile: 'production-public', dataClass: 'workspace-record', workspaceId: 'org:a' }),
    error => error instanceof DataPlaneBoundaryError && error.code === 'account_data_class_denied',
  );
  const publicAsset = plane.route({ accountProfile: 'production-public', dataClass: 'public-asset' });
  assert.equal(publicAsset.providerId, 'r2-public');
});

test('provider routing fails closed and never silently crosses to another provider', () => {
  const registry = new ProviderRegistry().register({ id: 'd1-core', kind: 'database', adapter: noopDatabase() });
  const plane = createDataPlane({ policy, registry });
  assert.throws(
    () => plane.route({ accountProfile: 'production-core', dataClass: 'workspace-record', workspaceId: 'org:a' }),
    error => error instanceof ProviderNotConfiguredError && error.providerId === 'd1-workspace',
  );
});

test('workspace override changes only the explicitly selected workspace and data class', () => {
  const plane = createDataPlane({
    policy,
    registry: fullRegistry(),
    workspaceOverrides: { 'org:large': { 'workspace-record': 'postgres-workspace' } },
  });
  assert.equal(
    plane.route({ accountProfile: 'production-core', dataClass: 'workspace-record', workspaceId: 'org:large' }).providerId,
    'postgres-workspace',
  );
  assert.equal(
    plane.route({ accountProfile: 'production-core', dataClass: 'workspace-record', workspaceId: 'org:small' }).providerId,
    'd1-workspace',
  );
});

test('cache keys isolate workspaces and read-through avoids repeated origin reads', async () => {
  const cache = memoryCache();
  let loads = 0;
  const first = await readThroughWorkspaceCache({
    workspaceId: 'org:a', namespace: 'services', key: 'catalog', cache,
    loader: async () => { loads += 1; return { value: 1 }; },
  });
  const second = await readThroughWorkspaceCache({
    workspaceId: 'org:a', namespace: 'services', key: 'catalog', cache,
    loader: async () => { loads += 1; return { value: 2 }; },
  });
  assert.equal(first.source, 'origin');
  assert.equal(second.source, 'cache');
  assert.equal(loads, 1);
  assert.deepEqual(second.value, { value: 1 });
});

test('D1 adapter uses injected binding and does not own credentials', async () => {
  const calls = [];
  const binding = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            all: async () => { calls.push(['read', sql, params]); return { results: [] }; },
            run: async () => { calls.push(['write', sql, params]); return { success: true }; },
          };
        },
        all: async () => { calls.push(['read', sql, []]); return { results: [] }; },
        run: async () => { calls.push(['write', sql, []]); return { success: true }; },
      };
    },
  };
  const adapter = createD1DatabaseAdapter(binding);
  await adapter.read({ sql: 'SELECT * FROM x WHERE workspace_id = ?', params: ['org:a'] });
  await adapter.write({ sql: 'UPDATE x SET value = ? WHERE workspace_id = ?', params: ['v', 'org:a'] });
  assert.deepEqual(calls[0], ['read', 'SELECT * FROM x WHERE workspace_id = ?', ['org:a']]);
  assert.equal(calls[1][0], 'write');
});

test('KV and R2 adapters keep provider bindings injected and portable', async () => {
  const kvOps = [];
  const kv = createKvCacheAdapter({
    get: async key => { kvOps.push(['get', key]); return null; },
    put: async (key, value) => kvOps.push(['put', key, value]),
    delete: async key => kvOps.push(['delete', key]),
  });
  await kv.set('workspace:test:item', { ok: true });
  assert.match(kvOps[0][1], /^ekodi:/);

  const r2Ops = [];
  const r2 = createR2FileStorageAdapter({
    get: async key => { r2Ops.push(['get', key]); return null; },
    put: async (key, value) => r2Ops.push(['put', key, value]),
    delete: async key => r2Ops.push(['delete', key]),
  });
  await r2.put('/assets/a.png', 'x');
  assert.equal(r2Ops[0][1], 'public/assets/a.png');
});

test('Google Drive adapter refuses activation without a server-side transport', () => {
  assert.throws(
    () => createGoogleDriveFileStorageAdapter(),
    error => error instanceof ProviderNotConfiguredError && error.providerId === 'google-drive-workspace',
  );
});

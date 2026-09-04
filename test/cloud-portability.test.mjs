import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DataPlaneBoundaryError,
  ProviderNotConfiguredError,
  ProviderRegistry,
  createDataPlane,
  validateDataPlanePolicy,
} from '../data-plane.js';
import {
  createGoogleCloudSqlPostgresAdapter,
  createGoogleCloudStorageAdapter,
  createS3CompatibleFileStorageAdapter,
} from '../data-plane-adapters.js';

const policy = JSON.parse(await readFile(new URL('../config/data-plane-contract.json', import.meta.url), 'utf8'));
const cloudPolicy = JSON.parse(await readFile(new URL('../config/cloud-portability-policy.json', import.meta.url), 'utf8'));

test('Portable Cloud First policy is machine-enforced', () => {
  assert.equal(validateDataPlanePolicy(policy), true);
  assert.equal(cloudPolicy.mode, 'portable-cloud-first');
  assert.equal(cloudPolicy.principles.cloudProvidersAreReplaceableInfrastructure, true);
  assert.equal(cloudPolicy.principles.activeActiveMultiCloudDefault, false);
  assert.equal(policy.providers['gcp-cloud-sql-postgres'].portability.runtimeContract, 'postgresql');
  assert.equal(policy.providers['gcs-object'].activation, 'optional-provider');
});test('canonical data cannot default to provider-bound infrastructure', () => {
  const unsafe = structuredClone(policy);
  unsafe.providers['locked-db'] = {
    adapterKind: 'database',
    provider: 'example-locked-db',
    scope: 'workspace',
    portability: {
      class: 'provider-bound',
      runtimeContract: 'vendor-only',
      dataExit: 'manual-redesign',
      canonicalDataAllowed: false,
    },
  };
  unsafe.dataClasses['workspace-record'].defaultProvider = 'locked-db';
  assert.throws(
    () => validateDataPlanePolicy(unsafe),
    error => error instanceof DataPlaneBoundaryError && /Canonical data class/.test(error.message),
  );
});

test('Google Cloud SQL adapter exposes PostgreSQL through the EKODI database contract', async () => {
  const calls = [];
  const adapter = createGoogleCloudSqlPostgresAdapter({
    query: async (text, values, meta) => { calls.push([text, values, meta]); return { rows: [] }; },
  });
  await adapter.read({ text: 'select 1 where workspace_id = $1', values: ['org:a'] });
  assert.equal(calls[0][2].mode, 'read');
  assert.throws(
    () => createGoogleCloudSqlPostgresAdapter(),
    error => error instanceof ProviderNotConfiguredError && error.providerId === 'gcp-cloud-sql-postgres',
  );
});test('Google Cloud Storage and S3-compatible storage share the EKODI object contract', async () => {
  const operations = [];
  const transport = {
    get: async key => { operations.push(['get', key]); return null; },
    put: async (key, value) => { operations.push(['put', key, value]); return { key }; },
    delete: async key => { operations.push(['delete', key]); },
  };
  const gcs = createGoogleCloudStorageAdapter({ transport, prefix: 'gcs' });
  const s3 = createS3CompatibleFileStorageAdapter({ transport, prefix: 's3' });
  await gcs.put('/a.txt', 'A');
  await s3.put('/b.txt', 'B');
  assert.deepEqual(operations[0].slice(0, 2), ['put', 'gcs/a.txt']);
  assert.deepEqual(operations[1].slice(0, 2), ['put', 's3/b.txt']);
});

test('workspace provider override can select Google Cloud without changing canonical workspace identity', () => {
  const db = createGoogleCloudSqlPostgresAdapter({ query: async () => ({ rows: [] }) });
  const registry = new ProviderRegistry().register({ id: 'gcp-cloud-sql-postgres', kind: 'database', adapter: db });
  const plane = createDataPlane({
    policy,
    registry,
    workspaceOverrides: { 'org:gcp-test': { 'workspace-record': 'gcp-cloud-sql-postgres' } },
  });
  const route = plane.route({ accountProfile: 'production-core', dataClass: 'workspace-record', workspaceId: 'org:gcp-test' });
  assert.equal(route.workspaceId, 'org:gcp-test');
  assert.equal(route.providerId, 'gcp-cloud-sql-postgres');
  assert.equal(route.providerPortability.runtimeContract, 'postgresql');
});

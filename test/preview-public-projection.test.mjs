import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicPreviewProjection } from '../preview-public-projection.js';

test('public preview projection is a strict safe whitelist', () => {
  const now = Date.parse('2026-09-08T07:30:00Z');
  const overview = {
    generatedAt:'2026-09-08T07:29:30Z',
    services:[{
      id:'biz', latest:{ status:'online', checkedAt:'2026-09-08T07:29:00Z' },
      database:'secret-db', source:['private.js'], deployWorkflow:'private.yml', note:'private note',
    }],
  };
  const result = buildPublicPreviewProjection(overview, { scope:'ekodibiz', mode:'platform', now });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['secret-db','private.js','private.yml','private note','\"database\":','\"deployWorkflow\":']) {
    assert.equal(serialized.includes(forbidden), false, `must not expose ${forbidden}`);
  }
  assert.equal(result.services.find(service => service.id === 'biz').live.status, 'online');
  assert.deepEqual(result.privacy, { profile:'public-safe-projection', personalData:false, secrets:false, rawLogs:false, sourcePaths:false, databaseIdentifiers:false, deploymentMetadata:false, internalSourceTopology:false });
});
test('EKODIBIZ scope and developer contracts reuse the same projection', () => {
  const result = buildPublicPreviewProjection({ services:[] }, { scope:'ekodibiz', mode:'dev', now:Date.parse('2026-09-08T07:30:00Z') });
  assert.deepEqual(result.services.map(service => service.id), ['biz','business','mall','marketing','trade','invest']);
  assert.ok(result.contracts.some(contract => contract.id === 'mcp'));
  assert.ok(result.contracts.every(contract => /^https:\/\//.test(contract.url)));
});

test('stale operational observations are never presented as live', () => {
  const result = buildPublicPreviewProjection({
    services:[{ id:'biz', latest:{ status:'online', checkedAt:'2026-09-08T06:00:00Z' } }],
  }, { scope:'ekodibiz', mode:'platform', now:Date.parse('2026-09-08T07:30:00Z') });
  assert.equal(result.services.find(service => service.id === 'biz').live.status, 'unknown');
  assert.equal(result.services.find(service => service.id === 'biz').live.fresh, false);
});

test('unknown preview scope or mode is rejected', () => {
  assert.throws(() => buildPublicPreviewProjection({}, { scope:'private', mode:'platform' }), TypeError);
  assert.throws(() => buildPublicPreviewProjection({}, { scope:'ekodi', mode:'user' }), TypeError);
});

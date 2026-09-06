import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { d1SchemaReady } from '../d1-schema-readiness.js';

function fakeDb({ fail = false } = {}) {
  const calls = { prepare: [], batch: 0, all: 0 };
  const db = {
    prepare(sql) {
      calls.prepare.push(sql);
      return { async all() { calls.all += 1; if (fail) throw new Error('missing table'); return { results: [] }; } };
    },
    async batch(statements) {
      calls.batch += 1;
      if (fail) throw new Error('missing table');
      return statements.map(() => ({ results: [] }));
    },
  };
  return { db, calls };
}

test('schema readiness uses zero-row table probes and memoizes a positive result', async () => {
  const { db, calls } = fakeDb();
  assert.equal(await d1SchemaReady(db, ['alpha','beta']), true);
  assert.equal(await d1SchemaReady(db, ['alpha','beta']), true);
  assert.equal(calls.batch, 1);
  assert.deepEqual(calls.prepare, ['SELECT 1 FROM "alpha" LIMIT 0','SELECT 1 FROM "beta" LIMIT 0']);
  assert.equal(calls.prepare.some(sql => sql.includes('sqlite_master')), false);
});
test('schema readiness fails closed and memoizes a negative result briefly', async () => {
  const { db, calls } = fakeDb({ fail: true });
  assert.equal(await d1SchemaReady(db, ['missing_table']), false);
  assert.equal(await d1SchemaReady(db, ['missing_table']), false);
  assert.equal(calls.batch, 1);
});

test('schema readiness rejects dynamic identifiers before preparing SQL', async () => {
  const { db, calls } = fakeDb();
  assert.equal(await d1SchemaReady(db, ['safe','bad-name']), false);
  assert.equal(calls.prepare.length, 0);
});

test('ekodi-auth hot paths do not scan sqlite_master for readiness', () => {
  const files = [
    'workspace-platform-api-worker.js','workspace-platform-entry-worker.js','profile-evidence-runtime.js',
    'marketing-growth-worker.js','mall-promotion-automation.js','mall-sales-intelligence.js',
  ];
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /sqlite_master/, file);
    assert.match(source, /d1SchemaReady/, file);
  }
});

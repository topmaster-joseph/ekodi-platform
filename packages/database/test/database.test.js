import assert from 'node:assert/strict';
import test from 'node:test';
import { DATABASE_BINDING, DATABASE_NAME, databaseFromEnv, isUniqueConstraintError, MIGRATIONS } from '../src/index.ts';

test('D1 metadata is stable and ordered', () => {
  assert.equal(DATABASE_NAME, 'ekodi-auth');
  assert.equal(DATABASE_BINDING, 'DB');
  assert.deepEqual(MIGRATIONS, [
    '0001_initial.sql',
    '0002_password_iterations.sql',
    '0003_multisite_cms.sql',
    '0004_media_assets.sql',
    '0005_content_classification.sql',
    '0006_revision_classification.sql'
  ]);
});

test('database binding validation rejects incomplete bindings', () => {
  const database = { prepare() {} };
  assert.equal(databaseFromEnv({ DB: database }), database);
  assert.equal(databaseFromEnv({ DB: {} }), null);
  assert.equal(databaseFromEnv({}), null);
});

test('D1 unique constraint errors are normalized', () => {
  assert.equal(isUniqueConstraintError(new Error('D1_ERROR: UNIQUE constraint failed: cms_pages.site_id')), true);
  assert.equal(isUniqueConstraintError(new Error('network failure')), false);
});

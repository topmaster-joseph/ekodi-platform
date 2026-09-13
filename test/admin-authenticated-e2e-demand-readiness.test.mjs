import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E waits for demand placeholders before contextual navigation', () => {
  assert.match(source, /stage\('ready-demand'\)/);
  assert.match(source, /window\.EKODIAdminDemand/);
  assert.match(source, /data-demand-feature="devotional"/);
  assert.ok(source.indexOf("stage('ready-demand')") < source.indexOf("stage('ready-session')"));
});

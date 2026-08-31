import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DEVOTIONAL_SEED, isDevotionalControlPath } from '../devotional-automation.js';

const sourceFiles = [
  'devotional-automation.js',
  'devotional-admin.js',
  'admin-demand-loader.js',
  'admin-menu-registry.js',
  'api-worker.js'
];

test('devotional source files pass Node syntax validation', () => {
  for (const file of sourceFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

test('September devotional seed has one entry for every day', () => {
  assert.equal(DEVOTIONAL_SEED.length, 30);
  assert.equal(DEVOTIONAL_SEED[0].date, '2026-09-01');
  assert.equal(DEVOTIONAL_SEED.at(-1).date, '2026-09-30');
  assert.equal(new Set(DEVOTIONAL_SEED.map(item => item.date)).size, 30);
  for (const entry of DEVOTIONAL_SEED) {
    assert.ok(entry.passage.startsWith('신명기 '));
    assert.ok(entry.title.length > 1);
    assert.ok(entry.script.length > 40);
    assert.ok(entry.core.length > 10);
  }
});

test('devotional control route is isolated to its own namespace', () => {
  assert.equal(isDevotionalControlPath('/api/control/devotional/overview'), true);
  assert.equal(isDevotionalControlPath('/api/control/services'), false);
  assert.equal(isDevotionalControlPath('/api/control/devotionals'), false);
});
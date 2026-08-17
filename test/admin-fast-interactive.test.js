import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin critical shell loads AI Ops and Device shell without serial waterfall', async () => {
  const source = await read('admin-authenticated-shell.js');
  assert.match(source, /criticalPostAuthScripts/);
  assert.match(source, /'ai-ops-admin\.js'/);
  assert.match(source, /Promise\.all\(criticalPostAuthScripts\.map\(loadScript\)\)/);
  assert.doesNotMatch(source, /for \(const src of criticalPostAuthScripts\) await loadScript/);
  assert.match(source, /deferredPostAuthScripts = \['admin-lazy-features\.js'\]/);
});

test('retired Operations grid is not fetched and rendered during every login', async () => {
  const source = await read('control-center.js');
  const showApp = source.match(/function showApp\(email\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(showApp, 'showApp must exist');
  assert.doesNotMatch(showApp, /loadOperationsOverview\s*\(/);
  assert.match(showApp, /AI Ops/);
});

test('Finance monitor is no longer a pre-auth bootstrap script', async () => {
  const html = await read('control-center.html');
  assert.doesNotMatch(html, /<script src="finance-monitor\.js"><\/script>/);
  const features = await read('control-center-features.js');
  assert.match(features, /async function loadFinance\(\) \{ await loadModule\('finance-monitor\.js'\); \}/);
});

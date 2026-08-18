import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entryWorker = await readFile(new URL('../admin-entry-worker.js', import.meta.url), 'utf8');
const emergencyWorker = await readFile(new URL('../admin-staging-worker.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('production admin supports the logical ekodi.index entry route without renaming the physical HTML asset', () => {
  assert.match(entryWorker, /ADMIN_ENTRY_PATH = '\/ekodi\.index'/);
  assert.match(entryWorker, /internalUrl\.pathname = '\/'/);
  assert.match(entryWorker, /X-EKODI-Entry', 'ekodi\.index'/);
  assert.match(wrangler, /main = "admin-entry-worker\.js"/);
  assert.doesNotMatch(wrangler, /main = "site-worker\.js"/);
});

test('independent workers.dev surface acts as a smart gateway with forced emergency escape hatch', () => {
  assert.match(emergencyWorker, /CANONICAL_ENTRY = 'https:\/\/admin\.ekodi\.kr\/ekodi\.index'/);
  assert.match(emergencyWorker, /EMERGENCY_PATH = '\/emergency'/);
  assert.match(emergencyWorker, /AbortSignal\.timeout\(3500\)/);
  assert.match(emergencyWorker, /response\.headers\.get\('x-ekodi-entry'\) === 'ekodi\.index'/);
  assert.match(emergencyWorker, /http-equiv=\"refresh\"/);
  assert.match(emergencyWorker, /X-EKODI-Failover/);
  assert.match(emergencyWorker, /emergency-forced/);
});

test('gateway serves the local emergency copy when the canonical health probe fails', () => {
  assert.match(emergencyWorker, /catch \{\n    return false;/);
  assert.match(emergencyWorker, /if \(await canonicalHealthy\(\)\) return addPrimaryAutoEntry\(local\);\n      return local;/);
});

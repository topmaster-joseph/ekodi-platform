import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const retrySource = () => readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');
const workflowSource = () => readFile(new URL('../.github/workflows/admin-authenticated-e2e.yml', import.meta.url), 'utf8');

test('authenticated Admin E2E retries at most once from a fresh process and bounds renderer stalls', async () => {
  const source = await retrySource();
  assert.match(source, /const maxAttempts = 2/);
  assert.match(source, /const attemptTimeoutMs = 90_000/);
  assert.match(source, /spawn\(process\.execPath, \['scripts\/admin-authenticated-e2e\.mjs'\]/);
  assert.match(source, /child\.kill\('SIGTERM'\)/);
  assert.match(source, /child\.kill\('SIGKILL'\)/);
  assert.match(source, /fresh browser process/);
});

test('production Admin workflow uses the bounded recovery runner and watches both scripts', async () => {
  const workflow = await workflowSource();
  assert.match(workflow, /scripts\/admin-authenticated-e2e\.mjs/);
  assert.match(workflow, /scripts\/admin-authenticated-e2e-retry\.mjs/);
  assert.match(workflow, /run: node scripts\/admin-authenticated-e2e-retry\.mjs/);
});

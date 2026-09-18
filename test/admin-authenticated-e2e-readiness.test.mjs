import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('authenticated Admin E2E treats only meaningful visible loaders as blocking', async () => {
  const e2e = await read('scripts/admin-authenticated-e2e.mjs');
  assert.match(e2e, /querySelectorAll\('\[aria-busy="true"\],\.loading,\.spinner'\)/);
  assert.match(e2e, /node\.getAttribute\('aria-hidden'\) !== 'true'/);
  assert.match(e2e, /if \(state\.busy\).*menu-\$\{id\}-loading/s);
});

test('AI Ops provider status dots are decorative rather than blocking loaders', async () => {
  const source = await read('admin-ai-control-plane.js');
  assert.equal((source.match(/ekodi-provider-dot[^>]*aria-hidden="true"/g) || []).length, 3);
  assert.match(source, /providerState\.status==='loading'/);
  assert.match(source, /data-ekodi-provider-diagnostic/);
});
test('authenticated Admin E2E aggregates every AI settings guard group', async () => {
  const worker = await read('scripts/admin-authenticated-e2e-menu-worker.mjs');
  assert.match(worker, /locator\('\.ai-mgmt-guards'\)\.allTextContents\(\)/);
  assert.doesNotMatch(worker, /locator\('\.ai-mgmt-guards'\)\.textContent\(\)/);
});

test('authenticated Admin E2E boots the canonical path-hosted Admin surface', async () => {
  const worker = await read('scripts/admin-authenticated-e2e-menu-worker.mjs');
  assert.match(worker, /const adminOrigin = 'https:\/\/ekodi\.kr';/);
  assert.match(worker, /const baseUrl = `\$\{adminOrigin\}\/admin\/`;/);
  assert.match(worker, /isCanonicalAdminUrl/);
  assert.doesNotMatch(worker, /https:\/\/admin\.ekodi\.kr/);
});


test('authenticated Admin E2E gives demand-loaded navigation a bounded production readiness window', async () => {
  const worker = await read('scripts/admin-authenticated-e2e-menu-worker.mjs');
  assert.match(worker, /const interactionReadyTimeoutMs = 15_000/);
  assert.match(worker, /locator\.waitFor\(\{ state: 'visible', timeout: interactionReadyTimeoutMs \}\)/);
  assert.match(worker, /locator\.click\(\{ force: true, noWaitAfter: true, timeout: interactionReadyTimeoutMs \}\)/);
  assert.match(worker, /global\.waitFor\(\{ state: 'visible', timeout: interactionReadyTimeoutMs \}\)/);
  assert.match(worker, /group, \{ timeout: interactionReadyTimeoutMs \}\)/);
  assert.ok((worker.match(/tab\.waitFor\(\{ state: 'visible', timeout: interactionReadyTimeoutMs \}\)/g) || []).length >= 2);
  assert.match(worker,/menuId === 'command-home'[\s\S]*tab\.waitFor\(\{ state: 'attached', timeout: interactionReadyTimeoutMs \}\)[\s\S]*verifyCommandWorkbench\(started\)/);
  assert.match(worker, /window\.EKODIAdminDemand\?\.activate/);
  assert.match(worker, /await window\.EKODIAdminDemand\.activate\(section\)/);
  const demandBody=worker.slice(worker.indexOf('async function prepareTargetDemand()'),worker.indexOf('async function waitForAdminNavigationIdle()'));
  assert.doesNotMatch(demandBody,/clickFast\(placeholder\)/);
});

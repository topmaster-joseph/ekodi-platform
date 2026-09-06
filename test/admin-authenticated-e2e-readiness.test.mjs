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

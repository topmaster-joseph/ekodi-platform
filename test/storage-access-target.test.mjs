import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/ensure-storage-access.mjs', import.meta.url), 'utf8');

test('Storage Access requires a real drive.ekodi.kr public destination', () => {
  assert.match(source, /targetHost = 'drive\.ekodi\.kr'/);
  assert.match(source, /destinations: \[\{ type: 'public', uri: targetHost \}\]/);
  assert.match(source, /appCoversHost/);
  assert.match(source, /destination\?\.type === 'public'/);
});

test('Storage Access does not trust a generic All Workers fallback', () => {
  assert.equal(source.toLowerCase().includes("=== 'all workers'"), false);
  assert.equal(source.includes('public Everyone access was not enabled'), true);
  assert.match(source, /cloudflare_account_member/);
});

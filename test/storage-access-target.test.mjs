import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/ensure-storage-access.mjs', import.meta.url), 'utf8');

test('Storage Access requires an exact drive.ekodi.kr public destination', () => {
  assert.match(source, /targetDomain = 'drive\.ekodi\.kr'/);
  assert.match(source, /destinations: \[\{ type: 'public', uri: target \}\]/);
  assert.match(source, /function appTargetsExact/);
  assert.match(source, /destination\?\.type === 'public'/);
  assert.match(source, /normalizedTarget\(destination\?\.uri\) === expected/);
  assert.match(source, /Access application must protect exactly/);
});

test('Storage Access never falls back to a generic All Workers application', () => {
  assert.equal(source.toLowerCase().includes("=== 'all workers'"), false);
  assert.equal(source.toLowerCase().includes('allworkersapp'), false);
  assert.match(source, /find\(item => appTargetsExact\(item, target\)\)/);
  assert.match(source, /cloudflare_account_member/);
  assert.match(source, /broad or wildcard fallback is forbidden/);
});

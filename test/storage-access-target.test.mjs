import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/ensure-storage-access.mjs', import.meta.url), 'utf8');

test('Storage Access requires exact drive.ekodi.kr public destinations', () => {
  assert.match(source, /const targetDomain = 'drive\.ekodi\.kr'/);
  assert.match(source, /const callbackDomain = 'drive\.ekodi\.kr\/api\/control\/storage\/google\/callback'/);
  assert.match(source, /destinations: \[\{ type: 'public', uri: target \}\]/);
  assert.match(source, /appTargetsExact/);
  assert.match(source, /destination\?\.type === 'public'/);
  assert.match(source, /normalizedTarget\(destination\?\.uri\) === expected/);
});

test('Storage Access is fail-closed and never trusts a generic All Workers fallback', () => {
  assert.equal(source.toLowerCase().includes("=== 'all workers'"), false);
  assert.match(source, /broad or wildcard fallback is forbidden/);
  assert.match(source, /cloudflare_account_member/);
  assert.match(source, /decision: 'bypass'/);
  assert.match(source, /include: \[\{ everyone: \{\} \}\]/);
});

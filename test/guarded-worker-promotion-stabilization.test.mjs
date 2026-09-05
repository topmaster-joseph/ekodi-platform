import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const release = await readFile(new URL('../scripts/guarded-worker-release.mjs', import.meta.url), 'utf8');

test('production promotion gets a bounded propagation window before rollback', () => {
  assert.match(release, /const STANDARD_VERIFY_ATTEMPTS = 18;/);
  assert.match(release, /const PROMOTION_VERIFY_ATTEMPTS = 36;/);
  assert.match(release, /phase === 'production' && !overrideVersion \? PROMOTION_VERIFY_ATTEMPTS : STANDARD_VERIFY_ATTEMPTS/);
  assert.match(release, /await verifyAll\('', 'production'\);/);
});

test('candidate and rollback verification remain fail-closed', () => {
  assert.match(release, /await verifyAll\(candidateVersion\);/);
  assert.match(release, /await verifyAll\('', 'rollback'\);/);
  assert.match(release, /throw new Error\(`\$\{request\.url\} verification failed:/);
  assert.match(release, /Rolling back \$\{worker\.name\} to \$\{previousVersion\} at 100%/);
});

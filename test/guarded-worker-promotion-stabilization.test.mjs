import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const release = await readFile(new URL('../scripts/guarded-worker-release.mjs', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));

test('production promotion gets a bounded propagation window before rollback', () => {
  assert.match(release, /const STANDARD_VERIFY_ATTEMPTS = 18;/);
  assert.match(release, /const PROMOTION_VERIFY_ATTEMPTS = 36;/);
  assert.match(release, /phase === 'production' && !overrideVersion \? PROMOTION_VERIFY_ATTEMPTS : STANDARD_VERIFY_ATTEMPTS/);
  assert.match(release, /await verifyAll\('', 'production'\);/);
});

test('candidate and rollback verification remain fail-closed', () => {
  assert.match(release, /phase === 'standard' && overrideVersion && request\.candidateVerify === false/);
  assert.match(release, /candidateVerify=false requires candidateVerifyReason/);
  assert.match(release, /deferred until post-promotion routing is active/);
  assert.match(release, /await verifyAll\(candidateVersion\);/);
  assert.match(release, /await verifyAll\('', 'rollback'\);/);
  assert.match(release, /throw new Error\(`\$\{request\.url\} verification failed:/);
  assert.match(release, /Rolling back \$\{worker\.name\} to \$\{previousVersion\} at 100%/);
});


test('transient routing gates defer candidate-only handoffs without weakening production verification', () => {
  const insurance = manifest.worker.requests.find(request => request.url === 'https://ekodi.kr/insurance/admin');
  const mallAdmin = manifest.worker.requests.find(request => request.url === 'https://ekodi.kr/ekodibiz/mall/admin/');
  assert.equal(insurance?.candidateVerify, false);
  assert.match(insurance?.candidateVerifyReason || '', /0% version-override routing/);
  assert.equal(insurance?.rollbackVerify, false);
  assert.equal(mallAdmin?.rollbackVerify, false);
  assert.ok(!('candidateVerify' in mallAdmin), 'Mall admin must still be candidate verified');
});

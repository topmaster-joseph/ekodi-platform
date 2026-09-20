import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [release, manifestRaw] = await Promise.all([
  readFile(new URL('../scripts/guarded-worker-release.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'),
]);
const manifest = JSON.parse(manifestRaw);

test('guarded version promotion does not mutate non-versioned triggers', () => {
  assert.equal(manifest.worker.reconcileTriggersAfterPromotion, undefined);
  assert.doesNotMatch(release, /reconcileTriggersAfterPromotion|reconcilePromotionTriggers/);
  assert.doesNotMatch(release, /command\(\['triggers', 'deploy'/);
  const phase = release.indexOf("console.log('Phase 3/3:");
  const promote = release.indexOf('deployVersions([`${candidateVersion}@100%`]', phase);
  const verify = release.indexOf("await verifyAll('', 'production');", promote);
  assert.ok(phase >= 0);
  assert.ok(promote > phase);
  assert.ok(verify > promote);
});

test('shared-site release manifest verifies the canonical apex admin diagnostic assets', () => {
  const urls = manifest.worker.requests.map(item => item.url);
  const diagnostics = urls.filter(url => /\/device-browser-diagnostics\.(?:js|css)\?v=device-v28$/.test(url));
  assert.deepEqual(diagnostics.sort(), [
    'https://ekodi.kr/admin/device-browser-diagnostics.css?v=device-v28',
    'https://ekodi.kr/admin/device-browser-diagnostics.js?v=device-v28',
  ]);
});

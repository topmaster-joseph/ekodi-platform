import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [release, manifestRaw] = await Promise.all([
  readFile(new URL('../scripts/guarded-worker-release.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'),
]);
const manifest = JSON.parse(manifestRaw);

test('shared-site guarded release reconciles non-versioned triggers after promotion', () => {
  assert.equal(manifest.worker.reconcileTriggersAfterPromotion, true);
  assert.match(release, /const reconcileTriggersAfterPromotion = worker\.reconcileTriggersAfterPromotion === true/);
  assert.match(release, /function reconcilePromotionTriggers\(\)/);
  assert.match(release, /command\(\['triggers', 'deploy', '--config', worker\.config\]\)/);

  const phase = release.indexOf("console.log('Phase 3/3:");
  const promote = release.indexOf('deployVersions([`${candidateVersion}@100%`]', phase);
  const reconcile = release.indexOf('reconcilePromotionTriggers();', promote);
  const verify = release.indexOf("await verifyAll('', 'production');", reconcile);

  assert.ok(phase >= 0);
  assert.ok(promote > phase);
  assert.ok(reconcile > promote);
  assert.ok(verify > reconcile);
});

test('trigger reconciliation remains opt-in for other Worker manifests', () => {
  assert.match(release, /if \(!reconcileTriggersAfterPromotion\) return/);
});

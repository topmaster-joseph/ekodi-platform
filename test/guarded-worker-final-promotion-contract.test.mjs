import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const release=readFileSync(new URL('../scripts/guarded-worker-release.mjs',import.meta.url),'utf8');
const guardedImport="import { verifyEkodiProtectedPromotion } from './verify-ekodi-final-promotion-receipt.mjs';";

test('protected promotion verifier imported from independent read-only authority',()=>{
  assert.ok(release.includes(guardedImport));
  assert.match(release,/promotionMode !== 'enforced'/);
  assert.match(release,/EKODI_FINAL_PROMOTION_MODE_INVALID/);
  assert.match(release,/EKODI_FINAL_PROMOTION_MAIN_SHA_MISMATCH/);
  assert.match(release,/EKODI_RELEASE_ARTIFACT_DIGEST/);
  assert.match(release,/EKODI_RELEASE_TASK_ID/);
  assert.match(release,/EKODI_RELEASE_BRANCH_REF/);
  assert.match(release,/verifyEkodiProtectedPromotion\(/);
});

test('first-deployment bootstrap cannot call Wrangler deploy before required approval',()=>{
  const start=release.indexOf('async function bootstrapFirstDeploy() {');
  const end=release.indexOf('\ntry {\n  console.log(`Worker guarded release:',start);
  assert.ok(start>0&&end>start);
  const section=release.slice(start,end);
  const approval=section.indexOf('await requireEkodiFinalPromotionApproval();');
  const firstWrite=section.indexOf('command(deployArgs);');
  assert.ok(approval>=0&&firstWrite>approval);
});

test('candidate smoke can run at zero percent but production promotion must recheck owner',()=>{
  const one=release.indexOf('await verifyReleaseAttestation(candidateVersion, \'candidate\');');
  const approval=release.indexOf('await requireEkodiFinalPromotionApproval();',one);
  const promote=release.indexOf('deployVersions([`${candidateVersion}@100%`]',one);
  assert.ok(one>0&&approval>one&&promote>approval);
  const rollback=release.indexOf('restoreVersionWithRetry(previousVersion');
  assert.ok(rollback>promote);
});

test('no synthetic approval response or direct bypass is inserted',()=>{
  const section=release.slice(release.indexOf('async function requireEkodiFinalPromotionApproval() {'),
    release.indexOf('function runChangeOrchestrationGate()'));
  assert.match(section,/approval.verified !== true/);
  assert.doesNotMatch(section,/return true;|productionDeployed: true|skip\s*approval/i);
});

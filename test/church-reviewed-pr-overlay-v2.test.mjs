import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReviewedChurchSource } from '../scripts/verify-reviewed-church-source.mjs';
import { planChurchPagesCandidate } from '../scripts/build-church-pages-candidate.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(readFileSync(resolve(root,'sites/ekodi-church/source-import-manifest.json'),'utf8'));
const clone=()=>structuredClone(source);

test('stacked PR146 and PR149 retain 212 independently reviewed historical Church files',()=>{
  const result=verifyReviewedChurchSource(source);
  assert.equal(source.contract,'ekodi.church-reviewed-integration.v2');
  assert.deepEqual(result.integrationOrder,[143,144,142,146,149]);
  assert.deepEqual(result.pullRequests.map(x=>x.number),[143,144,142,146,149]);
  assert.equal(source.importedTrackedFileCount,223);
  assert.equal(source.reviewedOverlays.changedFiles.length,20);
  assert.equal(source.stackedReviewedOverlays.changedFiles.length,24);
  assert.equal(source.stackedReviewedOverlays.addedFiles.length,11);
  assert.equal(source.productionReleaseSwitched,false);
  assert.equal(source.sourceOwnershipTransferred,false);
  assert.equal(source.legacyRepositoryDeletionAuthorized,false);
});

test('offline candidate contains six-link Church + public notices and schedules but no private source ledger',()=>{
  const plan=planChurchPagesCandidate(source,'a'.repeat(40));
  assert.equal(plan.assets.length,151);
  for(const p of ['church-compact-navigation.css','church-section-nav.js','notices/index.html','schedule/index.html']){
    assert.ok(plan.assets.some(x=>x.path===p),'public asset missing: '+p);
  }
  for(const p of ['source-import-manifest.json','source-import-baseline-v1.json','test/church-selected-panel-runtime.test.mjs']){
    assert.ok(!plan.assets.some(x=>x.path===p),'source-private asset leaked: '+p);
  }
  assert.deepEqual(plan.reviewedUpstreamPullRequests.map(x=>x.number),[143,144,142,146,149]);
});

test('unsafe added file, changed source branch, missing PR evidence or legacy deletion fail closed',()=>{
  const missing=clone();
  missing.stackedReviewedOverlays.pullRequests[1].headSha='a'.repeat(40);
  assert.throws(()=>verifyReviewedChurchSource(missing),/upstream PR head, parent or changed path drift/);
  const hidden=clone();
  hidden.trackedFiles.push({path:'service-role-key.txt',mode:'100644',blobSha:'b'.repeat(40)});
  hidden.importedTrackedFileCount++;
  assert.throws(()=>verifyReviewedChurchSource(hidden),/source contract or independent production safety changed/);
  const originalTampered=clone();
  originalTampered.reviewedOverlays.pullRequests[0].headSha='a'.repeat(40);
  assert.throws(()=>verifyReviewedChurchSource(originalTampered),/earlier 3-PR historical source ledger was replaced/);
  const oldRemoved=clone();
  oldRemoved.stackedReviewedOverlays.changedFiles.pop();
  assert.throws(()=>verifyReviewedChurchSource(oldRemoved),/stacked changes incomplete/);
  const deletion=clone();
  deletion.legacyRepositoryDeletionAuthorized=true;
  assert.throws(()=>planChurchPagesCandidate(deletion,'a'.repeat(40)),/source contract or independent production safety changed/);
});

test('each staged file must preserve exact previously reviewed source and pinned upstream blob',()=>{
  const changed=clone();
  changed.stackedReviewedOverlays.changedFiles[0].finalCanonicalBlobSha='a'.repeat(40);
  assert.throws(()=>planChurchPagesCandidate(changed,'a'.repeat(40)),/tracked source historical\/committed hash mismatch/);
  const origin=clone();
  origin.stackedReviewedOverlays.changedFiles[0].sourceChain[0].upstreamBlobSha='b'.repeat(40);
  assert.throws(()=>planChurchPagesCandidate(origin,'a'.repeat(40)),/upstream SHA-pinned Git blob mismatch/);
  const historical=clone();
  historical.trackedFiles.find(x=>x.path==='index.html').blobSha='c'.repeat(40);
  assert.throws(()=>verifyReviewedChurchSource(historical),/original Git blob or file mode replaced/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReviewedChurchSource } from '../scripts/verify-reviewed-church-source.mjs';
import { planChurchPagesCandidate } from '../scripts/build-church-pages-candidate.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=JSON.parse(readFileSync(resolve(root,'sites/ekodi-church/source-import-manifest.json'),'utf8'));
const clone=()=>structuredClone(original);

test('all three reviewed upstream PRs remain SHA-pinned, without claiming upstream merge or production deployment',()=>{
  const proof=verifyReviewedChurchSource(original);
  assert.deepEqual(proof.integrationOrder,[143,144,142]);
  assert.deepEqual(proof.pullRequests,[
    {number:143,headSha:'9e8fc072d1d6d66286d9a275fe3960e50e5c5e72'},
    {number:144,headSha:'b752da0de6520b934b585a1c2a75d8e7af065ac7'},
    {number:142,headSha:'1607bc1c06157c420afabe3bfc62cca9073738c8'}
  ]);
  assert.equal(original.sourceCommit,'520d4f2daf7e5e4dc53bf928c9df626b5f896600');
  assert.equal(original.productionReleaseSwitched,false);
  assert.equal(original.legacyRepositoryDeletionAuthorized,false);
  assert.equal(original.reviewedOverlays.changedFiles.length,20);
  assert.equal(original.importedTrackedFileCount,212);
});

test('offline Church release candidate records all source PRs and ships native member tabs without source-private tests',()=>{
  const plan=planChurchPagesCandidate(original,'a'.repeat(40));
  assert.equal(plan.sourceSha,'a'.repeat(40));
  assert.equal(plan.assets.length,144);
  assert.equal(plan.assets.some(f=>f.path==='my/member-work-tabs.css'),true);
  assert.equal(plan.assets.some(f=>f.path==='test/church-native-footer.test.mjs'),false);
  assert.equal(plan.assets.some(f=>f.path==='docs/church-tab-plan-20261102.md'),false);
  assert.deepEqual(plan.reviewedUpstreamPullRequests.map(x=>x.number),[143,144,142]);
});

test('unreviewed PR branch revisions, missing import evidence and private workflow changes fail closed',()=>{
  const wrongHead=clone();
  wrongHead.reviewedOverlays.pullRequests[0].headSha='a'.repeat(40);
  assert.throws(()=>verifyReviewedChurchSource(wrongHead),/invalid audited PR head/);
  const wrongOrder=clone();
  wrongOrder.reviewedOverlays.integrationOrder=[142,143,144];
  assert.throws(()=>verifyReviewedChurchSource(wrongOrder),/unapproved integration sequence/);
  const untrusted=clone();
  untrusted.reviewedOverlays.pullRequests[0].changedSourcePaths.push('.github/workflows/deploy-production.yml');
  assert.throws(()=>verifyReviewedChurchSource(untrusted),/untrusted or executable legacy workflow/);
  const extra=clone();
  extra.trackedFiles.push({path:'secrets.txt',blobSha:'a'.repeat(40)});
  extra.importedTrackedFileCount++;
  assert.throws(()=>verifyReviewedChurchSource(extra),/source inventory, release authority or original workflow exclusion drifted/);
});

test('tampered source origin or final canonical SHA never produces an apparently valid candidate',()=>{
  const editedBlob=clone();
  editedBlob.reviewedOverlays.changedFiles[0].finalCanonicalBlobSha='a'.repeat(40);
  assert.throws(()=>planChurchPagesCandidate(editedBlob,'a'.repeat(40)),/mismatched canonical Git blob/);
  const incompleteChain=clone();
  const css=incompleteChain.reviewedOverlays.changedFiles.find(x=>x.path==='church-homepage-layout.css');
  css.sourceChain.splice(1,1);
  assert.throws(()=>planChurchPagesCandidate(incompleteChain,'a'.repeat(40)),/missing or duplicated PR source-chain proof/);
  const wrongOriginal=clone();
  wrongOriginal.sourceCommit='a'.repeat(40);
  assert.throws(()=>planChurchPagesCandidate(wrongOriginal,'a'.repeat(40)),/immutable original import provenance/);
  const deleted=clone();
  deleted.legacyRepositoryDeletionAuthorized=true;
  assert.throws(()=>planChurchPagesCandidate(deleted,'a'.repeat(40)),/source inventory, release authority/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const handoff=load('../publishing/jubilee-series/review-9-private-handoff-intent.json');
const registry=load('../publishing/jubilee-series/draft-registry.json');
const evidence=load('../publishing/jubilee-series/review-9-evidence.json');
const sha=/^[0-9a-f]{64}$/;
test('private transfer is version-locked and matches both actual 9th manuscripts',()=>{
  assert.equal(handoff.schemaVersion,1);
  assert.equal(handoff.seriesId,registry.seriesId);
  assert.equal(handoff.sourceRevision,evidence.sourceRevision);
  assert.ok(registry.volumes.every(x=>x.manuscriptRevision===handoff.sourceRevision));
  assert.equal(handoff.volumeAssets.length,2);
  assert.match(handoff.artifactPackage.sha256,sha);
  assert.match(handoff.artifactPackage.manifestSha256,sha);
  assert.ok(handoff.artifactPackage.bytes>100000);
  for(const [i,v] of handoff.volumeAssets.entries()){
    const reg=registry.volumes[i],ev=evidence.volumes[i];
    assert.equal(v.reviewId,reg.reviewId);
    assert.equal(v.reviewId,ev.reviewId);
    assert.equal(v.docxSha256,ev.files.docx.sha256);
    assert.equal(v.epubSha256,ev.files.epub.sha256);
    assert.equal(v.pdfSha256,ev.files.pdf.sha256);
    assert.equal(handoff.editorialStageByReviewId[v.reviewId],reg.stage);
  }
  assert.equal(handoff.volumeAssets[0].sourceFootnotesChecked,55);
  assert.equal(handoff.volumeAssets[0].sourceOriginalAndPagesVerified,false);
  assert.equal(handoff.volumeAssets[1].finalLiteraryAuthorReview,false);
});
test('handoff proof does not claim private object readback or authorize sales',()=>{
  assert.equal(handoff.artifactPackage.privatePublisherStorageReadback,false);
  assert.equal(handoff.currentWorkflowState,'private-handoff-ready-awaiting-authenticated-ingestion');
  assert.deepEqual(handoff.nextVerifiedTransition.requirements.length,5);
  for(const [k,v] of Object.entries(handoff.release)){
    if(typeof v==='boolean')assert.equal(v,false,'must be false: '+k);
  }
  assert.equal(handoff.release.scheduledReleaseAt,null);
  assert.equal(handoff.release.priceKrw,null);
  assert.equal(handoff.release.isbn,null);
  assert.equal(handoff.privacy.publicGitHubManuscriptBytes,false);
  assert.equal(handoff.privacy.sourcePrivateAssetUrl,null);
  assert.equal(handoff.privacy.internalR2ObjectKeys,null);
  assert.equal(registry.publicCatalog,false);
  assert.equal(registry.commercialActivation,false);
});

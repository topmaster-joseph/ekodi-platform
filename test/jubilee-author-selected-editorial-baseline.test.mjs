import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const folder=new URL('../publishing/jubilee-series/',import.meta.url);
const registry=JSON.parse(readFileSync(new URL('draft-registry.json',folder),'utf8'));
const latest=JSON.parse(readFileSync(new URL('author-selected-baseline-20261108.json',folder),'utf8'));
const prior=JSON.parse(readFileSync(new URL('current-intake-20261102.json',folder),'utf8'));
const hex=/^[a-f0-9]{64}$/;

test('explicit 2026-11-08 source replacement selects exactly two user-provided PDFs',()=>{
  assert.equal(registry.activeEditorialBaselineManifest,'author-selected-baseline-20261108.json');
  assert.equal(registry.editorialBaselineOrigin,'explicit-author-selection-of-two-attached-PDFs');
  assert.equal(latest.sourceAuthority,'user-explicit-selection-of-two-attached-pdfs');
  assert.equal(latest.seriesId,prior.seriesId);
  assert.equal(latest.volumes.length,2);
  const expected=[
    ['희년과 하나님 나라의 회복','e2a1ee508f1285d8a70de42114dcc50f6ea5d827ae18f84ded0ce83114a1bd59',358372],
    ['우리는 다시 돌아갈 수 있는가','3620b7aade0c689e44824c635bffca2c2aebeea1243197f0b094ccd76f31563e',228152],
  ];
  for(const [i,v] of latest.volumes.entries()){
    assert.equal(v.number,i+1);
    assert.deepEqual([v.title,v.editorialSource.sha256,v.editorialSource.bytes],expected[i]);
    assert.equal(v.editorialSource.format,'pdf');
    assert.match(v.continuedHumanWritingCandidate.docxSha256,hex);
    assert.match(v.continuedHumanWritingCandidate.pdfSha256,hex);
    assert.ok(v.continuedHumanWritingCandidate.addedSections>=8);
    assert.equal(registry.volumes[i].manuscriptRevision,'author-selected-20261108-pdf');
    assert.equal(registry.volumes[i].continuedHumanWritingStatus,'ai-assisted-author-review-required');
  }
});

test('superseded 2026-11-02 reviewed assets are preserved and not overwritten',()=>{
  assert.equal(latest.previousBaseline.handoffId,prior.handoffId);
  assert.equal(latest.previousBaseline.retention,'archived-without-delete');
  assert.equal(latest.doNotOverwrite.length,3);
  assert.equal(prior.artifactPackage.sha256,'f057c5277139eeb8e2eeaaaf4bfe35973bb606da55566ef6414ed48a66702092');
  assert.equal(prior.primaryFiles.length,6);
});

test('source selection and AI-assisted writing do not authorize release, sale or storage receipt',()=>{
  assert.equal(registry.publicCatalog,false);
  assert.equal(registry.commercialActivation,false);
  for(const v of registry.volumes){
    assert.equal(v.sourceAssetLocation,'private-external-not-linked');
    assert.equal(v.checkoutEnabled,false);
    assert.equal(v.authorFinalApproval,false);
    assert.equal(v.publisherFinalApproval,false);
    assert.equal(v.publicationId,null);
    assert.equal(v.isbn,null);
  }
  for(const v of latest.volumes){
    const state=v.rightsAndRelease;
    for(const key of ['authorApproval','publisherApproval','citationAndRightsVerified','publisherPrivateIngestReadback','publicCatalog','saleAllowed'])
      assert.equal(state[key],false);
    assert.equal(v.continuedHumanWritingCandidate.status,'ai-assisted-author-review-draft');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../publishing/jubilee-series/',import.meta.url);
const registry=JSON.parse(readFileSync(new URL('draft-registry.json',root),'utf8'));
const candidate=JSON.parse(readFileSync(new URL('human-editorial-round2-20261108.json',root),'utf8'));
const baseline=JSON.parse(readFileSync(new URL('author-selected-baseline-20261108.json',root),'utf8'));
const historical=JSON.parse(readFileSync(new URL('current-intake-20261102.json',root),'utf8'));
const hex=/^[a-f0-9]{64}$/;
test('editorial round2 follows author PDF baseline without changing historical review fingerprint',()=>{
  assert.equal(registry.currentHumanEditorialReviewManifest,'human-editorial-round2-20261108.json');
  assert.equal(registry.activeEditorialBaselineManifest,'author-selected-baseline-20261108.json');
  assert.equal(registry.priorEditorialBaselinePreserved,'current-intake-20261102.json');
  assert.equal(candidate.seriesId,registry.seriesId);
  assert.equal(candidate.volumes.length,2);
  for(const [i,v] of registry.volumes.entries()){
    assert.equal(v.manuscriptRevision,'review-9');
    assert.equal(v.activeEditorialManuscriptRevision,'author-selected-20261108-pdf');
    assert.equal(v.currentHumanEditorialRevision,'human-review-round2-20261108');
    assert.equal(v.currentHumanEditorialReviewComplete,false);
    assert.equal(candidate.volumes[i].selectedOriginalPdfSha256,baseline.volumes[i].editorialSource.sha256);
    assert.ok(candidate.volumes[i].renderedPages>40);
    for(const name of ['revisionDocxSha256','revisionPdfSha256','revisionEpubSha256'])
      assert.match(candidate.volumes[i][name],hex);
  }
  assert.equal(historical.artifactPackage.sha256,'f057c5277139eeb8e2eeaaaf4bfe35973bb606da55566ef6414ed48a66702092');
});
test('previous two PDFs have explicit SHA errata without editing historical user file records',()=>{
  assert.equal(candidate.historicalPdfHashErrata.length,2);
  for(const e of candidate.historicalPdfHashErrata){
    assert.match(e.previouslyDeclared,hex);
    assert.match(e.actualArchivedFile,hex);
    assert.notEqual(e.previouslyDeclared,e.actualArchivedFile);
    assert.equal(e.status,'do-not-overwrite-existing-manifest');
  }
});
test('unverified scholarly footnotes and rights cannot grant release, public sale or private ingest receipts',()=>{
  assert.equal(candidate.unresolvedFootnoteReviewCount,56);
  for(const flag of ['publicationReady','productionIngested','signedAuthorApproval','publisherApproval','publicCatalog','salesEnabled'])
    assert.equal(candidate[flag],false);
  for(const v of candidate.volumes)assert.equal(v.privateFileStorageReadback,false);
  for(const v of registry.volumes){
    assert.equal(v.authorFinalApproval,false);
    assert.equal(v.publisherFinalApproval,false);
    assert.equal(v.checkoutEnabled,false);
    assert.equal(v.publicationId,null);
    assert.equal(v.isbn,null);
  }
  assert.equal(registry.commercialActivation,false);
  assert.equal(registry.publicCatalog,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const folder=new URL('../publishing/jubilee-series/',import.meta.url);
const get=name=>JSON.parse(readFileSync(new URL(name,folder),'utf8'));
const registry=get('draft-registry.json');
const third=get('human-editorial-round3-20261108.json');
const second=get('human-editorial-round2-20261108.json');
const original=get('author-selected-baseline-20261108.json');
const archived=get('current-intake-20261102.json');
const hex=/^[0-9a-f]{64}$/;

test('round3 only adds an editorial candidate; retains signed historical evidence and original source authority',()=>{
  assert.equal(registry.latestHumanEditorialCandidateManifest,'human-editorial-round3-20261108.json');
  assert.equal(registry.currentHumanEditorialReviewManifest,'human-editorial-round2-20261108.json');
  assert.equal(registry.activeEditorialBaselineManifest,'author-selected-baseline-20261108.json');
  assert.equal(third.parentBaselineManifest,'human-editorial-round2-20261108.json');
  assert.equal(third.sourceAuthority,'author-selected-20261108-pdfs');
  assert.equal(third.books.length,2);
  assert.equal(second.volumes.length,2);
  assert.equal(archived.artifactPackage.sha256,'f057c5277139eeb8e2eeaaaf4bfe35973bb606da55566ef6414ed48a66702092');
  for(const [i,b] of third.books.entries()){
    assert.equal(b.volume,i+1);
    assert.equal(b.selectedOriginalPdfSha256,original.volumes[i].editorialSource.sha256);
    assert.equal(registry.volumes[i].manuscriptRevision,'review-9');
    assert.equal(registry.volumes[i].activeEditorialManuscriptRevision,'author-selected-20261108-pdf');
    assert.equal(registry.volumes[i].latestHumanEditorialCandidateApproved,false);
    assert.equal(b.epubCoreStructuralValidation,true);
    assert.equal(b.epubCheckFullValidation,false);
    assert.equal(b.screenReaderDeviceValidation,false);
    for(const format of ['docx','pdf','epub']){
      assert.match(b.revisionFiles[format].sha256,hex);
      assert.ok(b.revisionFiles[format].bytes>10000);
    }
  }
});

test('exact round3 archive fingerprint and source footnote limitations are pinned',()=>{
  assert.equal(third.privateUserPackage.fileCount,18);
  assert.equal(third.privateUserPackage.sha256,'29d2cea78fc54d52298f2374e6e08ca873a02bde33625a404b18cd7f61ea0dd1');
  assert.equal(third.books[0].pdfPages,58);
  assert.equal(third.books[1].pdfPages,41);
  assert.equal(third.books[0].pendingFootnotes,56);
  assert.equal(third.footnoteStatus.recoveredSourceFootnotes,55);
  assert.equal(third.footnoteStatus.unresolvedEditorialMarkers,56);
  assert.equal(third.footnoteStatus.highContextCandidates,5);
  assert.equal(third.footnoteStatus.partialContextCandidates,13);
  assert.equal(third.footnoteStatus.unresolved,38);
  assert.equal(third.footnoteStatus.autoApproved,0);
});

test('private editorial progress never authorizes manuscript ingestion, public release, or sales',()=>{
  assert.equal(third.stage,'private-ai-assisted-human-review');
  for(const flag of Object.values(third.releaseFlags))assert.equal(flag,false);
  assert.equal(registry.commercialActivation,false);
  assert.equal(registry.publicCatalog,false);
  for(const v of registry.volumes){
    assert.equal(v.authorFinalApproval,false);
    assert.equal(v.publisherFinalApproval,false);
    assert.equal(v.checkoutEnabled,false);
    assert.equal(v.publicationId,null);
    assert.equal(v.isbn,null);
  }
});

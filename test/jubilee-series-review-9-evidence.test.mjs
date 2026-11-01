import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectJubileeDraftRegistry } from '../publishing/jubilee-series/review-gate.js';

const load=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registry=load('../publishing/jubilee-series/draft-registry.json');
const revision9=load('../publishing/jubilee-series/review-9-evidence.json');
const revision8=load('../publishing/jubilee-series/review-8-evidence.json');
const sha=/^[0-9a-f]{64}$/;

test('revision-9 is the current private manuscript, while the revision-8 evidence is preserved',()=>{
  assert.equal(revision9.sourceRevision,'review-9');
  assert.equal(revision8.sourceRevision,'review-8');
  assert.equal(revision9.seriesId,registry.seriesId);
  assert.equal(revision9.volumes.length,2);
  assert.deepEqual(revision9.volumes.map(v=>v.volumeNumber),[1,2]);
  assert.ok(registry.volumes.every(v=>v.manuscriptRevision==='review-9'));
  assert.equal(inspectJubileeDraftRegistry(registry).readyForPublication,false);
  for(const [i,book] of registry.volumes.entries()){
    const v=revision9.volumes[i];
    assert.equal(book.reviewId,v.reviewId);
    assert.equal(book.title,v.title);
    assert.equal(book.genre,v.format);
    assert.equal(v.manuscriptStatus,'editorial-review');
    assert.ok(v.bodyCharactersWithWhitespace>40000);
    assert.ok(v.pdfPages>30);
    for(const format of ['docx','epub','pdf']){
      assert.match(v.files[format].sha256,sha);
      assert.ok(v.files[format].sizeBytes>40000);
      assert.notEqual(v.files[format].sha256,revision8.volumes[i].files[format].sha256);
    }
    assert.equal(v.epubPackage.zipIntegrity,'passed');
    assert.equal(v.epubPackage.missingInternalLinks,0);
    assert.equal(v.epubPackage.author,'정찬균');
    assert.ok(v.mandatoryOutstanding.includes('official-epubcheck'));
    assert.ok(v.mandatoryOutstanding.includes('author-final-approval'));
    assert.ok(v.mandatoryOutstanding.includes('publisher-final-approval'));
  }
  assert.equal(revision9.volumes[0].wordFootnoteReferences,55);
  assert.equal(revision9.volumes[0].wordFootnoteItems,55);
  assert.equal(revision9.volumes[0].epubPackage.footnoteRefs,55);
  assert.equal(revision9.volumes[0].epubPackage.footnoteItems,55);
  assert.equal(revision9.volumes[0].epubPackage.internalLinks,211);
  assert.equal(revision9.volumes[1].epubPackage.internalLinks,108);
});
test('review-9 fingerprints cannot authorize release, price, ISBN or public sales',()=>{
  assert.equal(revision9.authorApprovalEvidence,false);
  assert.equal(revision9.publisherApprovalEvidence,false);
  assert.equal(revision9.publisherPrivateStorageVerified,false);
  assert.equal(revision9.publicCatalogVisible,false);
  assert.equal(revision9.scheduledReleaseAt,null);
  assert.equal(revision9.commercialReleaseAllowed,false);
  assert.equal(registry.visibility,'private-editorial-review');
  assert.equal(registry.publicCatalog,false);
  assert.equal(registry.commercialActivation,false);
  for(const v of registry.volumes){
    assert.equal(v.publicationId,null);assert.equal(v.editionId,null);
    assert.equal(v.isbn,null);assert.equal(v.priceKrw,null);
    assert.equal(v.publicUrl,null);assert.equal(v.checkoutEnabled,false);
    assert.equal(v.authorFinalApproval,false);assert.equal(v.publisherFinalApproval,false);
    assert.equal(v.sourceAssetLocation,'private-external-not-linked');
  }
});

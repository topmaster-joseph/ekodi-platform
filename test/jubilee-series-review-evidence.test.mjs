import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectJubileeDraftRegistry } from '../publishing/jubilee-series/review-gate.js';

const load=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registry=load('../publishing/jubilee-series/draft-registry.json');
const evidence=load('../publishing/jubilee-series/review-8-evidence.json');
const digest=/^[0-9a-f]{64}$/;
test('8th editorial evidence belongs to the exact two private Jubilee manuscripts',()=>{
  assert.equal(evidence.schemaVersion,1);
  assert.equal(evidence.seriesId,registry.seriesId);
  assert.equal(evidence.sourceRevision,'review-8');
  assert.equal(evidence.volumes.length,2);
  assert.equal(inspectJubileeDraftRegistry(registry).readyForPublication,false);
  for(const [i,record] of registry.volumes.entries()){
    const e=evidence.volumes[i];
    assert.equal(e.reviewId,record.reviewId);
    assert.equal(e.volumeNumber,record.volumeNumber);
    assert.equal(e.title,record.title);
    assert.equal(e.format,record.genre);
    assert.equal(record.manuscriptRevision,evidence.sourceRevision);
    assert.equal(e.manuscriptStatus,'editorial-review');
    assert.ok(e.bodyCharactersWithWhitespace>40000);
    assert.ok(e.pdfPages>=30);
    for(const format of ['docx','epub','pdf']){
      assert.match(e.files?.[format]?.sha256||'',digest);
      assert.ok(e.files[format].sizeBytes>10000);
    }
    assert.equal(e.epubPackage.titleLanguage,'ko-KR');
    assert.equal(e.epubPackage.author,'정찬균');
    assert.equal(e.epubPackage.zipIntegrity,'passed');
    for(const blocker of ['official-epubcheck','author-final-approval','publisher-final-approval']){
      assert.ok(e.mandatoryOutstanding.includes(blocker));
    }
  }
  assert.equal(evidence.volumes[0].wordFootnoteReferences,55);
  assert.equal(evidence.volumes[0].wordFootnoteItems,55);
  assert.ok(evidence.volumes[0].mandatoryOutstanding.includes('academic-footnotes-source-and-page-by-page'));
});
test('artifact fingerprints are not publisher approval or a commercial listing',()=>{
  for(const flag of ['authorApprovalEvidence','publisherApprovalEvidence',
      'publisherPrivateStorageVerified','publicCatalogVisible','commercialReleaseAllowed']){
    assert.equal(evidence[flag],false,flag);
  }
  assert.equal(evidence.scheduledReleaseAt,null);
  assert.equal(registry.visibility,'private-editorial-review');
  assert.equal(registry.commercialActivation,false);
  assert.equal(registry.publicCatalog,false);
  assert.ok(registry.volumes.every(v=>v.authorFinalApproval===false&&
    v.publisherFinalApproval===false&&v.checkoutEnabled===false&&v.publicUrl===null));
});

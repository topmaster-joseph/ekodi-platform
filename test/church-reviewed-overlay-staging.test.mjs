import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyChurchStagedOverlay } from '../scripts/verify-church-staged-overlay.mjs';
import { buildChurchStagedPreview } from '../scripts/build-church-staged-preview.mjs';

const root=resolve('.');
const overlay=join(root,'staging/church-pr149-review');
const manifest=JSON.parse(await readFile(join(overlay,'overlay-manifest.json'),'utf8'));
const copy=()=>structuredClone(manifest);
test('the original 212-file SHA-pinned canonical source is unchanged and all 24 PR149 source blobs are verified',async()=>{
  const out=await verifyChurchStagedOverlay({repoRoot:root,overlayDir:overlay});
  assert.equal(out.originalSourceSha,'520d4f2daf7e5e4dc53bf928c9df626b5f896600');
  assert.equal(out.sourceHeadSha,'b89c32f9330afbd114dc632306a7b9348c869b7b');
  assert.equal(out.expectedEntries,24);
  assert.equal(out.auditedFiles.length,24);
  assert.equal(out.releaseEligible,false);
  assert.equal(out.productionChanged,false);
});
test('SHA substitution, unauthorized file, incomplete inventory and release authority modifications fail closed',async()=>{
  for(const mutate of [
    m=>{m.files[0].blobSha='f'.repeat(40)},
    m=>{m.files[0].path='../secrets.env'},
    m=>{m.files.pop()},
    m=>{m.sourceHead='a'.repeat(40)},
    m=>{m.stackedSourcePRs[2].head='f'.repeat(40)},
    m=>{m.conditions.productionReleaseSwitched=true},
    m=>{m.conditions.requiresIndependentPR150Reconciliation=false}
  ]){
    const candidate=copy();mutate(candidate);
    await assert.rejects(verifyChurchStagedOverlay({repoRoot:root,overlayDir:overlay,manifestOverride:candidate}),/Church review overlay:/);
  }
});
test('offline preview produces reproducible SHA and a marker that the production release cannot accept',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'ekodi-church-overlay-audit-'));
  try{
    const results=[];
    for(let i=0;i<2;i++){
      const output=join(folder,'build-'+i);
      results.push(await buildChurchStagedPreview({platformRoot:root,overlayDir:overlay,outputDir:output,platformSha:'a'.repeat(40)}));
    }
    const [first,second]=results;
    assert.equal(first.contract,'ekodi.church-review-preview.v1');
    assert.equal(first.deployed,false);
    assert.equal(first.marker.releaseEligible,false);
    assert.equal(first.marker.productionChanged,false);
    assert.equal(first.marker.sourceOwnershipTransferred,false);
    assert.equal(first.marker.reviewedSourceHeadSha,'b89c32f9330afbd114dc632306a7b9348c869b7b');
    assert.equal(first.marker.previewPayloadSha256,second.marker.previewPayloadSha256);
    assert.match(first.marker.previewPayloadSha256,/^[a-f0-9]{64}$/);
    const tracked=JSON.parse(await readFile(join(root,'sites/ekodi-church/source-import-manifest.json'),'utf8'));
    const basePaths=new Set(tracked.trackedFiles.map(item=>item.path));
    const deployableReviewPaths=manifest.files.map(item=>item.path).filter(path=>!path.startsWith('test/'));
    assert.equal(first.marker.addedAssets,deployableReviewPaths.filter(path=>!basePaths.has(path)).length);
    assert.equal(first.marker.overwrittenAssets,deployableReviewPaths.filter(path=>basePaths.has(path)).length);
    const page=await readFile(join(first.outputPath,'index.html'),'utf8');
    assert.ok(page.includes('church-section-nav.js'));
    assert.ok(page.includes('data-church-notices'));
    await access(join(first.outputPath,'notices/index.html'));
    await access(join(first.outputPath,'schedule/index.html'));
    await assert.rejects(access(join(first.outputPath,'test/church-life-hub.test.mjs')));
    const marker=JSON.parse(await readFile(join(first.outputPath,'church-release.json'),'utf8'));
    assert.notEqual(marker.contract,'ekodi.church-release.v2','never confuse offline preview with release-eligible v2');
    assert.equal(marker.releaseEligible,false);
  }finally{await rm(folder,{recursive:true,force:true})}
});

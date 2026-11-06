import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {verifyReviewedChurchSource} from '../scripts/verify-reviewed-church-source.mjs';
import {buildChurchPagesCandidate,planChurchPagesCandidate} from '../scripts/build-church-pages-candidate.mjs';
import {verifyChurchPagesCandidate} from '../scripts/verify-church-pages-candidate.mjs';

const root=resolve('.');
const source=join(root,'sites/ekodi-church');
const PINNED=[
 ['worship/2026-11-08/index.html','5e73dcf3e74fd3d05bfa2b6cd0cd84ccefef5eb4','c17448d9baef36c7653888911e5e9c3f20c23ea2'],
 ['worship/2026-11-08/materials.json','61351b81e3530cb44696b0851e65314e9ca1d88a','f7293d3a6c4a3e94025bf531e52b11bba77224e8'],
 ['worship/2026-11-08/worship.js','31588090e12cf7d4a6dab6b16deb9f155d263fe6','c4fbd044b5a0e4c85014fb55e45f6960cba4b350']
];
const blobSHA=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const manifest=JSON.parse(await readFile(join(source,'source-import-manifest.json'),'utf8'));
const clone=()=>structuredClone(manifest);
const expectedReview={
 mergedPR:150,mergedHeadSha:'74bfab8a62b254148573be620686b301b37317b0',
 mergedCommitSha:'64509fb11d84e2a8269f9d71ebec58f0943e5463',
 preservationPR:151,preservationHeadSha:'9ca89ef9190a61e101bfe0c6129cdc6a668a6a4b'
};

test('PR150 notice is preserved from the exact merged Church source and PR151 stacked source without rewriting the 212-file base',async()=>{
 const verified=verifyReviewedChurchSource(manifest);
 assert.deepEqual(verified.integrationOrder,[143,144,142,146,149]);
 assert.equal(manifest.importedTrackedFileCount,223);
 assert.equal(manifest.canonicalizedPaths.length,37);
 assert.equal(manifest.productionReleaseSwitched,false);
 assert.equal(manifest.sourceOwnershipTransferred,false);
 assert.equal(manifest.legacyRepositoryDeletionAuthorized,false);
 const proof=verified.preservedPublicWorship;
 for(const [name,value] of Object.entries(expectedReview))assert.equal(proof[name],value);
 assert.equal(proof.files.length,3);
 const historical=JSON.parse(await readFile(join(source,'source-import-baseline-v1.json'),'utf8'));
 assert.equal(historical.importedTrackedFileCount,212);
 for(const [index,[path,oldSHA,newSHA]] of PINNED.entries()){
   const entry=manifest.trackedFiles.find(x=>x.path===path);
   const old=historical.trackedFiles.find(x=>x.path===path);
   assert.equal(old.blobSha,oldSHA);
   assert.equal(entry.blobSha,oldSHA);
   assert.equal(entry.normalizedBlobSha,newSHA);
   const bytes=await readFile(join(source,path));
   assert.equal(blobSHA(bytes),newSHA);
   assert.match(bytes.toString('utf8'),/11.15|11월 15일|11\/15/);
   assert.match(bytes.toString('utf8'),/공동의회/);
   assert.equal(proof.files[index].finalCanonicalBlobSha,newSHA);
 }
});

test('invalid PR150/151 SHA, extra asset, changed production flag and renamed bulletin fail closed',()=>{
 for(const change of [
   m=>m.postMergeWorshipReconciliation.files[0].finalCanonicalBlobSha='f'.repeat(40),
   m=>m.postMergeWorshipReconciliation.sourcePreservationHeadSha='b'.repeat(40),
   m=>m.postMergeWorshipReconciliation.sourceOwnershipTransferred=true,
   m=>m.postMergeWorshipReconciliation.files.push({path:'accounts.json'}),
   m=>m.postMergeWorshipReconciliation.files[1].path='../private',
   m=>m.trackedFiles.find(x=>x.path===PINNED[0][0]).normalizedBlobSha='a'.repeat(40),
   m=>m.productionReleaseSwitched=true,
 ]){
   const m=clone();change(m);
   assert.throws(()=>verifyReviewedChurchSource(m),/Church stacked source:/);
 }
});

test('151 public v2 assets have exact PR150-preserved Git SHA and release marker; any payload substitution is rejected',async t=>{
 const base=await mkdtemp(join(tmpdir(),'ekodi-church-pr150-preserve-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const output=join(base,'candidate'),sha='8'.repeat(40);
 const plan=planChurchPagesCandidate(manifest,sha);
 assert.equal(plan.assets.length,151);
 assert.equal(plan.preservedPublicWorship.preservationPR,151);
 const b=await buildChurchPagesCandidate({sourceDir:source,outputDir:output,platformSha:sha});
 const proof=await verifyChurchPagesCandidate({sourceDir:source,artifactDir:output,expectedSourceSha:sha});
 assert.equal(b.deployed,false);
 assert.equal(proof.productionDeployed,false);
 assert.equal(proof.artifactFileCount,151);
 assert.equal(proof.payloadSha256,b.payloadSha256);
 const release=JSON.parse(await readFile(join(output,'church-release.json'),'utf8'));
 assert.equal(release.contract,'ekodi.church-release.v2');
 assert.equal(release.preservedPublicWorship.mergedPR,150);
 assert.equal(release.preservedPublicWorship.preservationHeadSha,expectedReview.preservationHeadSha);
 const path=join(output,PINNED[1][0]);
 const before=await readFile(path);
 assert.equal(blobSHA(before),PINNED[1][2]);
 const broken={...release,preservedPublicWorship:{...release.preservedPublicWorship,mergedCommitSha:'b'.repeat(40)}};
 await writeFile(join(output,'church-release.json'),JSON.stringify(broken));
 await assert.rejects(verifyChurchPagesCandidate({sourceDir:source,artifactDir:output,expectedSourceSha:sha}),/preserved PR150 worship SHA lineage/);
 await writeFile(join(output,'church-release.json'),JSON.stringify(release));
 await writeFile(path,Buffer.concat([before,Buffer.from('tamper')]));
 await assert.rejects(verifyChurchPagesCandidate({sourceDir:source,artifactDir:output,expectedSourceSha:sha}),/candidate blob differs/);
});

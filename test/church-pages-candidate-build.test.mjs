import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { planChurchPagesCandidate, buildChurchPagesCandidate } from '../scripts/build-church-pages-candidate.mjs';

const SHA='a'.repeat(40);
const originalBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
async function fixture(t){
  const base=await mkdtemp(join(tmpdir(),'ekodi-church-candidate-test-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const src=join(base,'source');
  await mkdir(join(src,'test'),{recursive:true});
  const files=new Map([
    ['index.html','<html>Church</html>'],
    ['_headers','/*\n  X-Content-Type-Options: nosniff'],
    ['assets.js','const church = true;'],
    ['test/legacy.test.mjs',"throw new Error('test is not a public asset')"]
  ]);
  const entries=[];
  for(const [path,contents] of files){
    await writeFile(join(src,path),contents);
    const bytes=Buffer.from(contents);
    entries.push({path,blobSha:originalBlob(bytes),mode:'100644'});
  }
  const manifest={
    contract:'ekodi.church-shadow-import.v1',mode:'shadow-source-only',
    sourceRepository:'topmaster-joseph/ekodi-church',sourceCommit:'b'.repeat(40),
    importedTrackedFileCount:entries.length,trackedFiles:entries,
    productionReleaseSwitched:false,legacyRepositoryDeletionAuthorized:false
  };
  await writeFile(join(src,'source-import-manifest.json'),JSON.stringify(manifest));
  return{base,src,files,manifest,output:join(base,'candidate')};
}
test('offline Church Pages builder includes static assets, not tests or private provenance manifest',async t=>{
  const {src,output}=await fixture(t);
  const report=await buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA});
  assert.equal(report.deployed,false);
  assert.equal(report.modifiedProduction,false);
  assert.equal(report.fileCount,3);
  const contents=await readdir(output);
  assert.deepEqual(contents.sort(),['_headers','assets.js','church-release.json','index.html'].sort());
  const marker=JSON.parse(await readFile(join(output,'church-release.json'),'utf8'));
  assert.equal(marker.contract,'ekodi.church-release.v2');
  assert.equal(marker.sourceRepository,'topmaster-joseph/ekodi-platform');
  assert.equal(marker.sourceModule,'sites/ekodi-church');
  assert.equal(marker.sourceSha,SHA);
  assert.equal(marker.upstreamSourceSha,'b'.repeat(40));
  assert.equal(marker.payloadSha256,report.payloadSha256);
});
test('reruns are fail-closed and cannot overwrite an existing Pages artifact',async t=>{
  const {src,output}=await fixture(t);
  await buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA});
  await assert.rejects(buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA}),/Refuse to overwrite/);
});
test('modified source cannot silently change the Pages deployment artifact',async t=>{
  const {src,output}=await fixture(t);
  await writeFile(join(src,'index.html'),'<html>tampered</html>');
  await assert.rejects(buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA}),/Git blob SHA mismatch/);
});
test('untrusted source manifest paths cannot authorize a file outside Church',async t=>{
  const {src,output,manifest}=await fixture(t);
  manifest.trackedFiles.push({path:'../secrets.json',blobSha:SHA,mode:'100644'});
  manifest.importedTrackedFileCount++;
  await writeFile(join(src,'source-import-manifest.json'),JSON.stringify(manifest));
  const plan=planChurchPagesCandidate(manifest,SHA);
  assert.ok(plan.assets.every(x=>!x.path.startsWith('..')));
  const report=await buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA});
  assert.equal(report.fileCount,3);
});
test('path/commit and migration authority fail closed',async t=>{
  const {src,output,manifest}=await fixture(t);
  assert.throws(()=>planChurchPagesCandidate(manifest,'not-commit-sha'),/Exact 40-hex/);
  assert.throws(()=>planChurchPagesCandidate({...manifest,productionReleaseSwitched:true},SHA),/Release switch/);
  await assert.rejects(buildChurchPagesCandidate({sourceDir:src,outputDir:src,platformSha:SHA}),/separate from source/);
  await assert.rejects(buildChurchPagesCandidate({sourceDir:src,outputDir:join(src,'subfolder'),platformSha:SHA}),/separate from source/);
});

test('Windows checkout CRLF conversion is reversed only if exact Git blob SHA matches',async t=>{
  const {src,output}=await fixture(t);
  await writeFile(join(src,'_headers'),'/*\r\n  X-Content-Type-Options: nosniff');
  const report=await buildChurchPagesCandidate({sourceDir:src,outputDir:output,platformSha:SHA});
  assert.equal(report.deployed,false);
  assert.equal(await readFile(join(output,'_headers'),'utf8'),'/*\n  X-Content-Type-Options: nosniff');
});

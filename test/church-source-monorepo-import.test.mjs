import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../sites/ekodi-church/',import.meta.url));
const provenance=JSON.parse(await readFile(join(root,'source-provenance.json'),'utf8'));
const files=async dir=>{
  const all=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory())all.push(...await files(path));
    else if(item.isFile())all.push(path);
    else throw Error('Unsupported or symlinked source entry: '+path);
  }
  return all;
};

test('Church import is lossless and explicitly non-deploying',async()=>{
  assert.equal(provenance.contract,'ekodi.church-monorepo-import.v1');
  assert.equal(provenance.status,'staged-source-only');
  assert.equal(provenance.originalRepository,'topmaster-joseph/ekodi-church');
  assert.match(provenance.originalMainSha,/^[a-f0-9]{40}$/);
  assert.match(provenance.originalTreeSha,/^[a-f0-9]{40}$/);
  assert.equal(provenance.originalTrackedFileCount,216);
  assert.equal(provenance.canonicalSourceDirectory,'sites/ekodi-church');
  assert.equal(provenance.importGitMethod,'subtree-add-without-squash');
  assert.equal(provenance.protectedProductionReleaseUnchanged,true);
  assert.equal(provenance.releaseCutoverApproved,false);
  assert.equal(provenance.legacyRepositoryDeletionAllowed,false);
  assert.equal(provenance.existingProductionReleaseSource,provenance.originalRepository);
  assert.equal(provenance.existingProductionSourceSha,provenance.originalMainSha);
  assert.equal((await files(root)).length,provenance.originalTrackedFileCount+1);
});

test('Church copy retains public, local-member, worship, live, privacy and CSP surfaces',async()=>{
  for(const path of [
    'index.html','_headers','package.json','giving.js','giving-config.json',
    'live','my','worship','devotion','test','church-shell.js'
  ])assert.ok((await stat(join(root,path))).size>=0);
  const source=await readFile(join(root,'index.html'),'utf8');
  assert.match(source,/ekodichurch/);
  const csp=await readFile(join(root,'_headers'),'utf8');
  assert.match(csp,/Content-Security-Policy/);
  assert.doesNotMatch(source,/(?:sk-proj-|-----BEGIN PRIVATE KEY-----)/);
});

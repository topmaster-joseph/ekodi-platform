import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildChurchPagesCandidate } from '../scripts/build-church-pages-candidate.mjs';
import { verifyChurchPagesCandidate } from '../scripts/verify-church-pages-candidate.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA='d'.repeat(40);
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');

async function fixture(t){
  const base=await mkdtemp(join(tmpdir(),'ekodi-church-offline-verify-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const source=join(base,'source');
  const artifact=join(base,'candidate');
  await mkdir(source);
  const files=new Map([
    ['index.html',Buffer.from('<html><body>Public Church</body></html>')],
    ['_headers',Buffer.from('/*\n  X-Content-Type-Options: nosniff\n')]
  ]);
  for(const [p,b] of files)await writeFile(join(source,p),b);
  const manifest={
    contract:'ekodi.church-shadow-import.v1',mode:'shadow-source-only',
    sourceRepository:'topmaster-joseph/ekodi-church',
    sourceCommit:'a'.repeat(40),
    trackedFiles:[...files].map(([path,b])=>({path,mode:'100644',blobSha:blob(b)})),
    importedTrackedFileCount:files.size,productionReleaseSwitched:false,
    legacyRepositoryDeletionAuthorized:false
  };
  await writeFile(join(source,'source-import-manifest.json'),JSON.stringify(manifest));
  return {source,artifact,files};
}

test('offline Church public payload independently matches exact protected source SHA and file hashes',async t=>{
  const f=await fixture(t);
  await buildChurchPagesCandidate({sourceDir:f.source,outputDir:f.artifact,platformSha:SHA});
  const r=await verifyChurchPagesCandidate({sourceDir:f.source,artifactDir:f.artifact,expectedSourceSha:SHA});
  assert.equal(r.artifactFileCount,2);
  assert.equal(r.sourceSha,SHA);
  assert.equal(r.sourceProvenance,'exact-git-blob');
  assert.equal(r.productionDeployed,false);
  assert.equal(r.providerSecretsUsed,false);
});

test('extra private file, modified public asset or spoofed release marker fail closed',async t=>{
  const f=await fixture(t);
  await buildChurchPagesCandidate({sourceDir:f.source,outputDir:f.artifact,platformSha:SHA});
  await writeFile(join(f.artifact,'.env'),'SECRET=test');
  await assert.rejects(verifyChurchPagesCandidate({sourceDir:f.source,artifactDir:f.artifact,expectedSourceSha:SHA}),/candidate source file inventory drift/);
  await rm(join(f.artifact,'.env'));
  await writeFile(join(f.artifact,'index.html'),'<html>modified</html>');
  await assert.rejects(verifyChurchPagesCandidate({sourceDir:f.source,artifactDir:f.artifact,expectedSourceSha:SHA}),/candidate blob differs/);
  await writeFile(join(f.artifact,'index.html'),f.files.get('index.html'));
  const markerPath=join(f.artifact,'church-release.json');
  const marker=JSON.parse(await readFile(markerPath,'utf8'));
  marker.sourceRepository='topmaster-joseph/ekodi-church';
  await writeFile(markerPath,JSON.stringify(marker));
  await assert.rejects(verifyChurchPagesCandidate({sourceDir:f.source,artifactDir:f.artifact,expectedSourceSha:SHA}),/v2 release source, upstream or payload digest mismatch/);
});

test('candidate staging workflow is main-only, public-artifact-only, provider-credential-free and cannot deploy',()=>{
  const workflow=readFileSync(resolve(root,'.github/workflows/church-canonical-offline-staging.yml'),'utf8');
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.match(workflow,/scripts\/verify-church-pages-candidate\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/secrets\.|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|wrangler|pages deploy|GH_TOKEN/);
  assert.doesNotMatch(workflow,/pull_request:/);
  assert.match(workflow,/retention-days: 7/);
});

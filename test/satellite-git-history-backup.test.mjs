import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRestorableGitArchive, validateArchiveSource } from '../scripts/archive-satellite-git-history.mjs';

const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:'pipe',env:{
  ...process.env,GIT_AUTHOR_NAME:'EKODI Test',GIT_AUTHOR_EMAIL:'test@example.invalid',
  GIT_COMMITTER_NAME:'EKODI Test',GIT_COMMITTER_EMAIL:'test@example.invalid'
}}).trim();
const registry={
  canonicalPlatformRepository:'topmaster-joseph/ekodi-platform',
  repositories:[{name:'topmaster-joseph/ekodi-platform',role:'canonical-platform'},{name:'topmaster-joseph/ekodi-mall',role:'active-satellite'}]
};

test('satellite allowlist rejects canonical, unknown and malformed sources',()=>{
  assert.equal(validateArchiveSource('topmaster-joseph/ekodi-mall',registry),'topmaster-joseph/ekodi-mall');
  assert.throws(()=>validateArchiveSource('topmaster-joseph/ekodi-platform',registry),/Canonical/);
  assert.throws(()=>validateArchiveSource('topmaster-joseph/unknown',registry),/Unregistered/);
  assert.throws(()=>validateArchiveSource('../x',registry),/owner\/repo/);
});

test('complete synthetic Git history and tags survive mirror-bundle-restoration',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'ekodi-source-archive-'));
  try {
    const source=join(temp,'fixture');
    await import('node:fs/promises').then(fs=>fs.mkdir(source));
    git(source,'init','-b','main');
    await writeFile(join(source,'example.txt'),'first\n');
    git(source,'add','.');
    git(source,'commit','-m','first');
    git(source,'tag','v1');
    git(source,'checkout','-b','feature');
    await writeFile(join(source,'example.txt'),'second\n');
    git(source,'add','.');
    git(source,'commit','-m','second');
    git(source,'checkout','main');
    const destination=join(temp,'private-backup');
    const proof=await createRestorableGitArchive({repository:'synthetic-example/source',source,destination});
    assert.equal(proof.contract,'ekodi.satellite-history-backup.v1');
    assert.equal(proof.gitRefCount,3); // main, feature, annotated/lightweight tag
    assert.match(proof.bundleSha256,/^[a-f0-9]{64}$/);
    assert.equal(proof.sourceMainSha,git(source,'rev-parse','main'));
    assert.equal(proof.restoredMainSha,proof.sourceMainSha);
    assert.equal(proof.offsiteCopyVerified,false);
    assert.equal(proof.productionReleaseVerified,false);
    assert.equal(proof.deletionAuthorized,false);
    assert.equal(proof.deletionPerformed,false);
    assert.ok((await stat(join(destination,'all-refs.bundle'))).size>0);
    const persisted=JSON.parse(await readFile(join(destination,'restore-evidence.json'),'utf8'));
    assert.equal(persisted.bundleSha256,proof.bundleSha256);
    assert.equal(git(join(destination,'restore-drill.git'),'rev-parse','refs/heads/feature'),git(source,'rev-parse','feature'));
    await assert.rejects(()=>createRestorableGitArchive({source,destination}),/already exists/);
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
});

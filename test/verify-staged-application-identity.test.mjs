import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {verifyStagedApplicationIdentity} from '../scripts/verify-staged-application-identity.mjs';

const sha='a'.repeat(40);
const hash=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const config=(main='.release/ai-control/worker.js',assets='./.release/ai-control/assets')=>
  `name = "example"
main = "${main}"
no_bundle = true
compatibility_date = "2026-09-01"
[assets]
directory = "${assets}"
`;

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ekodi-stage-manifest-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const release=path.join(root,'.release','ai-control');
  fs.mkdirSync(path.join(release,'assets'),{recursive:true});
  fs.writeFileSync(path.join(release,'worker.js'),'export default {fetch(){return new Response("ok")}};');
  fs.writeFileSync(path.join(release,'assets','app.txt'),'public asset');
  fs.writeFileSync(path.join(root,'wrangler.ai.staging.release.toml'),config());
  fs.writeFileSync(path.join(root,'wrangler.ai.release.toml'),config());
  const files=['assets/app.txt','worker.js'].map(p=>({
    path:p,sha256:hash(fs.readFileSync(path.join(release,p))),
  }));
  const canonical=files.map(f=>f.sha256+'  '+f.path+'\n').join('');
  const applicationDigest=hash(Buffer.from(canonical));
  const manifest={schemaVersion:1,artifact:'ekodi-ai-control',sourceCommit:sha,
    compatibilityDate:'2026-09-01',artifactDigest:applicationDigest,files};
  const write=()=>fs.writeFileSync(path.join(release,'artifact-manifest.json'),
    JSON.stringify(manifest)+'\n');
  write();
  const verify=()=>verifyStagedApplicationIdentity({root,expectedDigest:applicationDigest,sourceSha:sha});
  return {root,release,manifest,applicationDigest,write,verify};
}

test('identical staging and production entry/assets and exact validated bytes pass',t=>{
  const f=fixture(t);
  const result=f.verify();
  assert.equal(result.verified,true);
  assert.equal(result.applicationDigest,f.applicationDigest);
  assert.equal(result.sourceSha,sha);
  assert.equal(result.fileCount,2);
  assert.equal(result.stagingAndProductionReferenceIdenticalBytes,true);
  assert.equal(result.productionDeployed,false);
});

test('a stale build source SHA or mismatched immutable expected digest fails closed',t=>{
  const f=fixture(t);
  assert.throws(()=>verifyStagedApplicationIdentity({root:f.root,sourceSha:'b'.repeat(40),
    expectedDigest:f.applicationDigest}),/SOURCE_COMMIT_MISMATCH/);
  assert.throws(()=>verifyStagedApplicationIdentity({root:f.root,sourceSha:sha,
    expectedDigest:'sha256:'+'0'.repeat(64)}),/EXPECTED_DIGEST_MISMATCH/);
});

test('tampered worker bytes, extra assets, and omitted files cannot pass manifest',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.release,'worker.js'),'malicious content');
  assert.throws(f.verify,/APPLICATION_BYTES_MISMATCH/);
  fs.writeFileSync(path.join(f.release,'worker.js'),'export default {fetch(){return new Response("ok")}};');
  fs.writeFileSync(path.join(f.release,'assets','new.txt'),'unlisted');
  assert.throws(f.verify,/APPLICATION_FILE_SET_MISMATCH/);
  fs.rmSync(path.join(f.release,'assets','new.txt'));
  fs.rmSync(path.join(f.release,'worker.js'));
  assert.throws(f.verify,/APPLICATION_FILE_SET_MISMATCH/);
});

test('manifest cannot smuggle parent-directory paths, duplicates, or symlinks',t=>{
  const f=fixture(t);
  f.manifest.files[0].path='../other';
  f.write();
  assert.throws(f.verify,/UNSAFE_MANIFEST_PATH/);
  f.manifest.files[0].path='assets/app.txt';
  f.manifest.files.push({...f.manifest.files[0]});
  f.write();
  assert.throws(f.verify,/DUPLICATE_MANIFEST_PATH/);
  f.manifest.files.pop();
  f.write();
  fs.symlinkSync('app.txt',path.join(f.release,'assets','alias.txt'));
  assert.throws(f.verify,/SYMLINK_FORBIDDEN/);
});

test('independent canonical aggregate checksum rejects fabricated manifest claims',t=>{
  const f=fixture(t);
  f.manifest.files[0].sha256='sha256:'+'0'.repeat(64);
  f.write();
  assert.throws(f.verify,/APPLICATION_BYTES_MISMATCH/);
  f.manifest.files[0].sha256=hash(fs.readFileSync(path.join(f.release,'assets','app.txt')));
  f.manifest.artifactDigest='sha256:'+'1'.repeat(64);
  f.write();
  assert.throws(()=>verifyStagedApplicationIdentity({root:f.root,expectedDigest:f.manifest.artifactDigest,sourceSha:sha}),/AGGREGATE_DIGEST_MISMATCH/);
});

test('production Worker config mismatch, bundling, or asset directory mismatch fails',t=>{
  const f=fixture(t);
  const prod=path.join(f.root,'wrangler.ai.release.toml');
  fs.writeFileSync(prod,config('different-worker.js'));
  assert.throws(f.verify,/STAGING_PRODUCTION_CONFIG_MISMATCH/);
  fs.writeFileSync(prod,config('.release/ai-control/worker.js','./wrong-assets'));
  assert.throws(f.verify,/STAGING_PRODUCTION_CONFIG_MISMATCH/);
  fs.writeFileSync(prod,config().replace('no_bundle = true','no_bundle = false'));
  assert.throws(f.verify,/STAGING_PRODUCTION_CONFIG_MISMATCH/);
});

test('staging job independently verifies actual immutable app bytes without granting release authority',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-ai-control.yml',import.meta.url),'utf8');
  const stage=workflow.slice(workflow.indexOf('  deploy-staging:'),workflow.indexOf('  deploy-production:'));
  const verifyStep=stage.indexOf('- name: Verify immutable application payload digest');
  const deployStep=stage.indexOf('- name: Deploy immutable artifact to isolated staging Worker');
  assert.ok(verifyStep>0&&deployStep>verifyStep);
  assert.match(stage,/node scripts\/verify-staged-application-identity\.mjs --verify/);
  assert.match(stage,/EXPECTED_AI_ARTIFACT_DIGEST: \$\{\{ needs\.validate\.outputs\.artifact_digest \}\}/);
  assert.doesNotMatch(stage,/EKODI_FINAL_PROMOTION_MODE:\s*enforced/);
});

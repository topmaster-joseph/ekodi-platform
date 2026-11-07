import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planChurchPagesCandidate,buildChurchPagesCandidate} from '../scripts/build-church-pages-candidate.mjs';
import {verifyChurchPagesCandidate} from '../scripts/verify-church-pages-candidate.mjs';
import {verifyChurchHeaderNavigation} from '../scripts/verify-church-header-navigation.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'sites/ekodi-church');
const SHA='9'.repeat(40);
const expectedLabels=['매일묵상','예배·방송','공지사항','주요일정','함께하기','마이페이지'];

const navigation=html=>{
  const nav=html.match(/<nav id="main-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
  return [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map(([,body])=>body.replace(/<[^>]*>/g,'').trim());
};

test('current reviewed v2 Church source produces an independently verified 151-asset release-format offline candidate',async t=>{
  const base=await mkdtemp(join(tmpdir(),'ekodi-church-v2-release-audit-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const artifact=join(base,'candidate');
  const manifest=JSON.parse(await readFile(join(source,'source-import-manifest.json'),'utf8'));
  assert.equal(manifest.contract,'ekodi.church-reviewed-integration.v2');
  assert.equal(manifest.importedTrackedFileCount,223);
  assert.equal(manifest.sourceOwnershipTransferred,false);
  assert.equal(manifest.productionReleaseSwitched,false);
  assert.equal(manifest.legacyRepositoryDeletionAuthorized,false);

  const plan=planChurchPagesCandidate(manifest,SHA);
  assert.equal(plan.assets.length,151);
  assert.deepEqual(plan.reviewedUpstreamPullRequests.map(p=>p.number),[143,144,142,146,149]);

  const build=await buildChurchPagesCandidate({sourceDir:source,outputDir:artifact,platformSha:SHA});
  const verified=await verifyChurchPagesCandidate({sourceDir:source,artifactDir:artifact,expectedSourceSha:SHA});
  assert.equal(build.fileCount,151);
  assert.equal(build.deployed,false);
  assert.equal(build.modifiedProduction,false);
  assert.equal(verified.productionDeployed,false);
  assert.equal(verified.providerSecretsUsed,false);
  assert.equal(verified.artifactFileCount,151);
  assert.equal(build.payloadSha256,verified.payloadSha256);
  assert.match(verified.payloadSha256,/^[0-9a-f]{64}$/);
  const marker=JSON.parse(await readFile(join(artifact,'church-release.json'),'utf8'));
  assert.equal(marker.contract,'ekodi.church-release.v2');
  assert.equal(marker.sourceRepository,'topmaster-joseph/ekodi-platform');
  assert.equal(marker.sourceModule,'sites/ekodi-church');
  assert.equal(marker.sourceSha,SHA);
  assert.equal(marker.payloadSha256,verified.payloadSha256);
  assert.deepEqual(marker.reviewedUpstreamPullRequests.map(p=>p.number),[143,144,142,146,149]);

  const home=await readFile(join(artifact,'index.html'),'utf8');
  const selected=await readFile(join(artifact,'church-section-nav.js'),'utf8');
  const proof=verifyChurchHeaderNavigation(home,selected);
  assert.equal(proof.contract,'six-item-selected-content');
  assert.equal(proof.contextItems,8);
  assert.match(home,/data-church-shared-schedules/);
  assert.match(home,/data-church-notices/);
  assert.match(home,/href="\/ekodichurch\/schedule\/"/);
  assert.match(home,/href="\/ekodichurch\/notices\/"/);
  for(const path of ['index.html','devotion/index.html','notices/index.html','schedule/index.html']){
    const html=await readFile(join(artifact,path),'utf8');
    assert.deepEqual(navigation(html),expectedLabels,'public route menu mismatch: '+path);
    assert.doesNotMatch(html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0]||'',/오늘의 삶|>공동체<\/a>|>협력소식<\/a>/);
  }
  await access(join(artifact,'church-compact-navigation.css'));
  await access(join(artifact,'church-public-updates.js'));
  await assert.rejects(access(join(artifact,'source-import-manifest.json')),{code:'ENOENT'});
  await assert.rejects(access(join(artifact,'source-import-baseline-v1.json')),{code:'ENOENT'});
  await assert.rejects(access(join(artifact,'test/church-selected-panel-runtime.test.mjs')),{code:'ENOENT'});

  // The independent source digest guard must reject even one altered public byte.
  const noticePath=join(artifact,'notices/index.html');
  const original=await readFile(noticePath);
  await writeFile(noticePath,Buffer.concat([original,Buffer.from('\n<!-- tampered -->\n')]));
  await assert.rejects(verifyChurchPagesCandidate({
    sourceDir:source,artifactDir:artifact,expectedSourceSha:SHA
  }),/candidate blob differs/);
});

test('canonical source ownership/rollback still requires a separately authorized C3 release',async()=>{
  const wf=await readFile(join(root,'.github/workflows/deploy-ekodi-church-homepage.yml'),'utf8');
  const artifactWorkflow=await readFile(join(root,'.github/workflows/church-canonical-offline-staging.yml'),'utf8');
  assert.match(wf,/if: vars\.CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED == 'true'/);
  assert.match(wf,/EKODI AI Orchestration Gate/);
  assert.match(wf,/release_branch_ref/);
  assert.match(wf,/release_task_id/);
  assert.match(wf,/--project-name ekodi-church --branch main/);
  assert.match(wf,/payloadSha256/);
  assert.match(artifactWorkflow,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(artifactWorkflow,/CLOUDFLARE_API_TOKEN|secrets\.|pages deploy|wrangler/);
  assert.match(artifactWorkflow,/retention-days: 7/);
});

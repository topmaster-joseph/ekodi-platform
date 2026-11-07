import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyReviewedChurchSource} from '../scripts/verify-reviewed-church-source.mjs';
import {planChurchPagesCandidate} from '../scripts/build-church-pages-candidate.mjs';

const base=resolve('sites/ekodi-church');
const manifest=JSON.parse(readFileSync(resolve(base,'source-import-manifest.json'),'utf8'));
const home=readFileSync(resolve(base,'index.html'),'utf8');
const gitSha=text=>{
  const bytes=Buffer.from(text,'utf8');
  return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
};

test('new PR153 header cleanup is the only new Church homepage change and source is independently proven',()=>{
  const proof=verifyReviewedChurchSource(manifest).reviewedHomeHeader;
  assert.equal(proof.sourcePR,153);
  assert.equal(proof.sourceHeadSha,'b9e2fdb608c55964438f6c5fa1f895e3c3095c08');
  assert.equal(proof.parentHeadSha,'9ca89ef9190a61e101bfe0c6129cdc6a668a6a4b');
  assert.equal(gitSha(home),proof.finalCanonicalBlobSha);
  assert.equal(
    gitSha(home.replace('>커뮤니티 채널 ↗</a>','>에코디커뮤니티 채널 ↗</a>')),
    proof.sourceBlobSha
  );
  assert.equal(proof.sourceBlobSha,'e0e52a81d11a040ef943bc8411b21262e5b45a8b');
  assert.equal(manifest.stackedReviewedOverlays.changedFiles.find(x=>x.path==='index.html').finalCanonicalBlobSha,
    proof.previousCanonicalBlobSha);
  assert.equal(manifest.trackedFiles.find(x=>x.path==='index.html').normalizedBlobSha,
    proof.finalCanonicalBlobSha);
  const upstreamTest=readFileSync(resolve(base,'test/church-inline-live.test.mjs'),'utf8');
  assert.equal(gitSha(upstreamTest),'cb8ab8205f45eb946f032b237fcc616fc547dc7d');
  assert.equal(manifest.trackedFiles.find(x=>x.path==='test/church-inline-live.test.mjs').normalizedBlobSha,
    'cb8ab8205f45eb946f032b237fcc616fc547dc7d');
  assert.equal(manifest.canonicalizedPaths.length,38);
  assert.doesNotMatch(home,/<div class="daily-verse"|<script[^>]+church-daily-verse\.js/);
  assert.match(home,/church-compact-navigation\.css/);
  assert.match(home,/church-section-nav\.js/);
});

test('six primary links remain ordered and public notices and schedules keep their own routes',()=>{
  const nav=home.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0]||'';
  const expected=['매일묵상','예배·방송','공지사항','주요일정','함께하기','마이페이지'];
  assert.equal((nav.match(/<a\b/g)||[]).length,6);
  let last=-1;
  for(const label of expected){const at=nav.indexOf('>'+label+'</a>');assert.ok(at>last,label);last=at;}
  for(const route of ['/ekodichurch/devotion/','/ekodichurch/notices/','/ekodichurch/schedule/']){
    assert.ok(nav.includes('href="'+route+'"'));
  }
  assert.match(home,/data-church-shared-schedules/);
  assert.match(readFileSync(resolve(base,'church-shared-schedules.js'),'utf8'),/published-read-only/);
  const plan=planChurchPagesCandidate(manifest,'f'.repeat(40));
  assert.equal(plan.assets.length,151);
  assert.equal(plan.reviewedHomeHeader.sourcePR,153);
  assert.ok(plan.assets.some(x=>x.path==='index.html'&&x.expectedBlobSha===plan.reviewedHomeHeader.finalCanonicalBlobSha));
});

test('invalid PR153 receipt, unexpected source edits, or source ownership change fail closed',()=>{
  for(const mutate of [
    m=>{m.postHomeHeaderReconciliation.reviewedUpstreamHeadSha='a'.repeat(40);},
    m=>{m.postHomeHeaderReconciliation.verifiedUpstreamBlobSha='b'.repeat(40);},
    m=>{m.postHomeHeaderReconciliation.finalCanonicalBlobSha='c'.repeat(40);},
    m=>{m.trackedFiles.find(x=>x.path==='index.html').normalizedBlobSha='d'.repeat(40);},
    m=>{m.stackedReviewedOverlays.changedFiles.find(x=>x.path==='index.html').finalCanonicalBlobSha='e'.repeat(40);},
    m=>{m.postHomeHeaderReconciliation.productionReleaseSwitched=true;},
    m=>{m.productionReleaseSwitched=true;}
  ]){
    const m=structuredClone(manifest);
    mutate(m);
    assert.throws(()=>verifyReviewedChurchSource(m),/Church stacked source:/);
  }
  assert.equal(manifest.productionReleaseSwitched,false);
  assert.equal(manifest.sourceOwnershipTransferred,false);
  assert.equal(manifest.legacyRepositoryDeletionAuthorized,false);
});
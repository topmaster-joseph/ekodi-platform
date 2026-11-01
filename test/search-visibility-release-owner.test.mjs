import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const site=JSON.parse(read('deploy/manifests/shared-site.worker.json'));
const control=JSON.parse(read('deploy/manifests/control-api.worker.json'));
const converge=read('scripts/converge-orchestrated-pr-merge.mjs');
const page=read('search-visibility-admin.js');
const api=read('search-visibility-control.js');

test('Search Visibility UI standalone edits always dispatch guarded Site Core',()=>{
  assert.match(converge,/file==='search-visibility-admin.js'/);
  assert.match(read('scripts/build.mjs'),/'search-visibility-admin.js'/);
  assert.match(read('site-worker.js'),/'\/search-visibility-admin.js'/);
  const request=site.worker.requests.find(item=>item.url?.includes('/admin/search-visibility-admin.js?'));
  assert.ok(request,'missing production Site Core canary');
  assert.deepEqual(request.statuses,[200]);
  assert.equal(request.redirect,'manual');
  assert.equal(request.rollbackVerify,false);
  assert.equal(request.candidateVerify,false);
  assert.ok(request.candidateVerifyReason?.includes('asset-first'));
  for(const marker of request.expect){
    assert.ok(page.includes(marker),'missing runtime canary marker: '+marker);
  }
});

test('Search Visibility Control standalone edits always dispatch guarded Control API',()=>{
  assert.match(converge,/'search-visibility-control.js'/);
  assert.match(read('mission-control-entry-worker.js'),/handleSearchVisibilityControl/);
  const request=control.worker.requests.find(item=>item.url?.includes('growth-search=release-canary-001'));
  assert.ok(request,'missing production unauthenticated API denial canary');
  assert.deepEqual(request.statuses,[401,403]);
  assert.equal(request.redirect,'manual');
  assert.equal(request.rollbackVerify,false);
  const google=control.worker.requests.find(item=>item.url?.includes('googleSiteUrl='));
  assert.ok(google,'missing read-only Google Search Console anonymous denial probe');
  assert.deepEqual(google.statuses,[403]);
  assert.ok(google.expect.includes('SUPER_ADMIN_REQUIRED'));
  assert.equal(google.rollbackVerify,false);
  assert.match(api,/session\?\.authenticated&&session\?\.role==='super_admin'/);
  assert.match(api,/if\(!actor\)return denied\(403,'SUPER_ADMIN_REQUIRED'\)/);
  assert.match(api,/if\(!sameOrigin\(request\)\)return denied\(403,'ORIGIN_FORBIDDEN'\)/);
});

test('Deployment probes assert runtime and deny unauthenticated reads without writing data',()=>{
  for(const item of [...site.worker.requests.filter(x=>x.url?.includes('growth-search=release-canary-001')),
    ...control.worker.requests.filter(x=>x.url?.includes('growth-search=release-canary-001'))]){
    assert.equal(item.rollbackVerify,false);
    assert.ok(!item.method||item.method==='GET');
    assert.ok(!item.headers?.authorization);
  }
  assert.match(page,/manual_confirmation_not_provider_api_verification|등록 여부 미확인/);
});

test('Search Visibility first-party Google Search Console read-only UI is a guarded production canary',()=>{
  const request=site.worker.requests.find(item=>item.url?.includes('/admin/search-visibility-admin.js?growth-search=release-canary-001'));
  assert.ok(request,'Missing canonical Site Core Search Visibility asset canary');
  assert.deepEqual(request.statuses,[200]);
  assert.equal(request.redirect,'manual');
  assert.equal(request.rollbackVerify,false);
  assert.equal(request.candidateVerify,false);
  for(const marker of ['data-sv-google-read','Google 실측 조회','googleSiteUrl=']){
    assert.ok(request.expect.includes(marker),'Missing production verification marker '+marker);
    assert.ok(page.includes(marker),'Expected UI source marker absent '+marker);
  }
});

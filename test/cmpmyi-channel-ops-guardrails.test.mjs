import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeAdminPage, storeAdminScript } from '../store-admin-engine.js';
import { storePortfolioAdminPage, storePortfolioAdminPanelPage, CMPMYI_STORES, CMPMYI_COMMON_MENU } from '../store-portfolio-admin-page.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('cmpmyi child stores reuse the parent session only in embedded context and keep tenant capability checks',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/CENTRAL_CMPMYI_SESSION_KEY='ekodi-cmpmyi-admin-session'/);
  assert.match(script,/IS_CMPMYI_EMBED/);
  assert.match(script,/IS_CMPMYI_EMBED&&FIRST_STORE_SLUGS\.has\(SLUG\)/);
  assert.match(script,/store_operating_space_snapshot/);
  assert.match(script,/roleCapabilities\(role\)/);
  assert.match(script,/returnUrl:location\.origin\+location\.pathname\+location\.search/);
});

test('channel admin has bounded partial loading and an explicit retry path',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/publishingWithTimeout/);
  assert.match(script,/ms=8000/);
  assert.match(script,/Promise\.allSettled/);
  assert.match(script,/data-publishing-loading/);
  assert.match(script,/data-publishing-partial/);
  assert.match(script,/id="retryPublishing"/);
  assert.match(script,/확인된 데이터는 계속 표시합니다/);
  assert.match(script,/일부 연결 확인 필요/);
});

test('active channel accounts never expose routine reauthentication while recovery states do',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/pending_authorization/);
  assert.match(script,/reconnect_required/);
  assert.match(script,/revoked/);
  assert.match(script,/error/);
  assert.match(script,/최초 인증/);
  assert.match(script,/재연결/);
  assert.match(script,/연결 유지 · 재인증 불필요/);
  assert.doesNotMatch(script,/a\.status==='active'\?'재인증':'인증'/);
});

test('channel workspace follows status quick-action list detail ordering on every first store admin',async()=>{
  const script=await storeAdminScript().text();
  const quick=script.indexOf('data-publishing-quick-actions');
  const ops=script.indexOf('data-publishing-operations');
  const detail=script.indexOf('class="publishing-detail"');
  assert.ok(quick>=0&&ops>quick&&detail>ops);
  assert.match(script,/storePublishPolicyForm/);
  for(const store of CMPMYI_STORES){
    const page=await storeAdminPage({...store,id:store.slug,brand:store.short,pathname:'/'+store.slug+'/admin/publishing'}).text();
    assert.match(page,/채널 · 자동게시/);
    assert.match(page,/store-admin\.css\?v=20260928-channel-ops-v1/);
    assert.match(page,/store-admin\.js\?v=20260928-channel-ops-v1/);
  }
});

test('cmpmyi exposes channel publishing as a first-class common view for all three brands',async()=>{
  assert.ok(CMPMYI_COMMON_MENU.some(([key,label])=>key==='publishing'&&label==='채널 · 자동게시'));
  const shell=await storePortfolioAdminPage().text();
  assert.match(shell,/\/cmpmyi\/admin\/panel\/publishing/);
  const panel=await storePortfolioAdminPanelPage('publishing').text();
  assert.match(panel,/채널 · 자동게시 통합관리/);
  for(const store of CMPMYI_STORES){
    assert.ok(panel.includes('/'+store.slug+'/admin/publishing?embed=cmpmyi'));
    assert.ok(panel.includes('/'+store.slug+'/admin/connections?embed=cmpmyi'));
  }
});

test('forced execution rule is documented as a release-blocking shared contract',async()=>{
  const principles=await read('ADMIN_UI_PRINCIPLES.md');
  assert.match(principles,/## 28\. 하부서비스 강제실행 규칙/);
  assert.match(principles,/8초 이내/);
  assert.match(principles,/부분 성공 결과/);
  assert.match(principles,/active.*재인증 동작을 제공하지 않는다/);
  assert.match(principles,/자담치킨 · 피자마루 · 요거트퍼플/);
  assert.match(principles,/CI를 실패시킨다/);
});

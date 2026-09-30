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
    assert.match(page,/store-admin\.css\?v=20260929-pos-web-first-v5/);
    assert.match(page,/store-admin\.js\?v=20260929-pos-web-first-v5/);
  }
});

test('cmpmyi channel publishing opens the real management workspace without a second card click',async()=>{
  assert.ok(CMPMYI_COMMON_MENU.some(([key,label])=>key==='publishing'&&label==='채널 · 자동게시'));
  const shell=await storePortfolioAdminPage().text();
  assert.match(shell,/\/cmpmyi\/admin\/panel\/publishing/);
  const panel=await storePortfolioAdminPanelPage('publishing').text();
  assert.match(panel,/채널 · 자동게시/);
  assert.match(panel,/data-cmpmyi-direct-workspace="publishing"/);
  assert.match(panel,/class="direct-frame"/);
  assert.match(panel,/\/jadam\/admin\/publishing\?embed=cmpmyi/);
  assert.match(panel,/data-direct-brand="jadam"/);
  assert.match(panel,/data-direct-brand="pizzamaru"/);
  assert.match(panel,/data-direct-brand="yogurt"/);
  assert.match(panel,/data-direct-section="publishing"/);
  assert.doesNotMatch(panel,/data-direct-section="connections"/);
  assert.doesNotMatch(panel,/data-direct-section="marketing"/);
  assert.doesNotMatch(panel,/aria-label="채널 · 자동게시 통합관리 브랜드 선택"/);
  assert.match(panel,/중간 선택 카드를 없앴습니다/);
  assert.match(panel,/\/cmpmyi\/admin\/panel\.js/);
});

test('cmpmyi direct workspace remembers brand and task while keeping canonical store admin boundaries',async()=>{
  const script=await (await storePortfolioAdminPanelPage('publishing')).text();
  assert.match(script,/실제 관리화면/);
  const runtime=await (await import('../store-portfolio-admin-page.js')).storePortfolioAdminPanelScript().text();
  assert.match(runtime,/ekodi-cmpmyi-direct-brand/);
  assert.match(runtime,/ekodi-cmpmyi-direct-section:/);
  assert.match(runtime,/data-cmpmyi-direct-workspace/);
  assert.match(runtime,/frame\.setAttribute\('src',next\)/);
  assert.match(runtime,/\?embed=cmpmyi/);
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


test('publishing first paint is informative and store-admin typography respects the 11px floor',async()=>{
  const page=await storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',id:'jadam',brand:'JADAM',pathname:'/jadam/admin/publishing'}).text();
  const css=await (await import('../store-admin-engine.js')).storeAdminCss().text();
  assert.match(page,/연결 채널/);
  assert.match(page,/자동게시 활성/);
  assert.match(page,/최대 8초 안에 확인합니다/);
  assert.doesNotMatch(css,/font-size:(?:8(?:\.5)?|9(?:\.5)?|10(?:\.5)?)px/);
});

test('connected channels expose recent and next publishing signals with Korean status labels',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/최근 게시/);
  assert.match(script,/다음 예약/);
  assert.match(script,/publishingJobStatus/);
  assert.match(script,/publishingTime/);
  assert.match(script,/channel-setting-row/);
  assert.match(script,/reconnect_required:'재연결 필요'/);
  assert.doesNotMatch(script,/reconnect_required:'재인증 필요'/);
});

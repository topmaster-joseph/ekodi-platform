import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../management-worker.js',import.meta.url),'utf8');
test('growth readiness requests only existing scoped store API after an explicit click',()=>{
  const start=app.indexOf('function renderGrowthWorkspace(){');
  const end=app.indexOf('function renderSelectedWorkspace(){',start);
  assert.ok(start>=0&&end>start);
  const growth=app.slice(start,end);
  assert.match(growth,/if\(space.kind==='store'&&validSpaceUrl\(space.slug\)\)/);
  assert.match(growth,/probe.addEventListener\('click',async\(\)=>\{/);
  assert.match(growth,/fetch\('\/api\/store-summary\?slug='\+encodeURIComponent\(space.slug\)/);
  assert.match(growth,/storeSummaryIsValid\(data,space\)/);
  assert.match(growth,/new Set\(state.selection\?\.modules\|\|\[\]\)\.has\('growth'\)/);
  assert.match(growth,/selectedVerifiedWorkspace\(\)\?\.id===space.id/);
  assert.match(growth,/selectedVerifiedWorkspace\(\)\?\.slug===space.slug/);
  assert.match(growth,/output.isConnected/);
  assert.match(growth,/state.session.accessToken===token/);
  assert.match(growth,/state.spacesRequest===epoch/);
  assert.doesNotMatch(growth,/api\/control\/search-visibility/);
  assert.doesNotMatch(growth,/localStorage\.setItem/);
});
test('server route and business owner boundary remain in place',()=>{
  assert.match(worker,/if\(url.pathname==='\/api\/store-summary'\)/);
  assert.match(worker,/if\(!authorization.startsWith\('Bearer '\)\)/);
  assert.match(worker,/spaces\/resolve\?slug=/);
  assert.match(worker,/invalid_store_response/);
  assert.match(worker,/dataPolicy:'verified-read-only'/);
});
test('store metrics are not conflated with marketing, search or sales',()=>{
  assert.match(app,/이는 매장 운영 준비 지표이며 검색노출·광고 효과·전체 주문액·매출 성과가 아닙니다/);
  assert.match(app,/공식 운영지표를 확인할 수 없습니다\. 미연결 상태로 유지합니다/);
  assert.match(app,/공식 공급자 실측 자료 미연결/);
});

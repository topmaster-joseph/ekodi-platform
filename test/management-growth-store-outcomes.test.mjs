import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../management-worker.js',import.meta.url),'utf8');
const growth=app.slice(app.indexOf('function renderGrowthWorkspace(){'),app.indexOf('function renderSelectedWorkspace(){'));
test('growth outcomes require actual authorized store owner role and explicit click',()=>{
  assert.match(growth,/space.kind==='store'&&FINANCIAL_READ_ROLES.has\(space.role\)/);
  assert.match(growth,/공식 완료 주문·매출 조회/);
  assert.match(growth,/action.addEventListener\('click',async\(\)=>\{/);
  assert.match(growth,/FINANCIAL_READ_ROLES.has\(current.role\)/);
  assert.match(growth,/FINANCIAL_READ_ROLES.has\(now.role\)/);
  assert.match(growth,/current\?\.id!==space.id\|\|current\?\.slug!==space.slug/);
  assert.match(growth,/now\?\.role===space.role/);
  assert.match(growth,/new Set\(state.selection\?\.modules\|\|\[\]\)\.has\('growth'\)/);
});
test('server retains bearer and verified workspace-scope with a separate financial authorization gate',()=>{
  assert.match(growth,/fetch\('\/api\/store-business-summary\?slug='\+encodeURIComponent\(space.slug\)/);
  assert.match(growth,/state.session.accessToken===token/);
  assert.match(growth,/state.session.user.id===actor/);
  assert.match(growth,/state.spacesRequest===epoch/);
  assert.match(growth,/panel.isConnected/);
  assert.match(growth,/validBusinessAggregate\(data,space\)/);
  assert.match(worker,/BUSINESS_AGGREGATE_READ_ROLES=new Set\(\['store_owner','tenant_admin','platform_admin'\]\)/);
  assert.match(worker,/business_aggregate_role_required/);
  assert.match(worker,/business_os_store_admin_snapshot/);
});
test('outcomes cannot be mistaken for search results, ads attribution or full external sales',()=>{
  assert.match(growth,/에코디에 기록된 완료 주문만 포함하며 POS·배달앱·은행의 전체 매출 또는 홍보 전환 성과가 아닙니다/);
  assert.match(growth,/공식 매장 실적을 확인할 수 없습니다\. 미연결 상태로 유지합니다/);
  assert.match(growth,/new Date\(data.asOf\).toLocaleString\('ko-KR',\{timeZone:'Asia\/Seoul'\}\)/);
  assert.doesNotMatch(growth,/localStorage\.setItem\(/);
  assert.doesNotMatch(growth,/POST|PUT|DELETE/);
});

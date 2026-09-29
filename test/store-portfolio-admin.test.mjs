import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storePortfolioAdminPage, storePortfolioAdminPanelPage, storePortfolioAdminPanelScript, CMPMYI_STORES, CMPMYI_ADMIN_SECTIONS, CMPMYI_COMMON_MENU } from '../store-portfolio-admin-page.js';
import platformEntry from '../platform-router-entry-worker.js';
import { storeAdminPage } from '../store-admin-engine.js';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

test('cmpmyi admin provides fixed common and brand navigation with a right workspace',async()=>{
  const response=storePortfolioAdminPage();const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-admin');
  assert.deepEqual(CMPMYI_STORES.map(x=>x.slug),['jadam','pizzamaru','yogurt']);
  for(const section of ['pos','delivery','menu','orders','sales','inventory','customers','reviews','marketing','publishing','work','finance','connections','site','members']){
    assert.ok(CMPMYI_ADMIN_SECTIONS.some(([key])=>key===section),`missing ${section}`);
  }
  for(const view of ['overview','pos','agent','delivery','menu','orders','sales','customer','marketing','publishing','operations','connections']){
    assert.ok(CMPMYI_COMMON_MENU.some(([key])=>key===view),`missing common view ${view}`);
    assert.ok(html.includes(`/cmpmyi/admin/panel/${view}`));
  }
  assert.match(html,/공통관리/);
  assert.match(html,/브랜드 관리자 전체 메뉴/);
  assert.match(html,/name="cmpmyi-panel"/);
  assert.match(html,/target="cmpmyi-panel"/);
  assert.match(html,/class="panel-frame"/);
  assert.match(html,/class="portfolio-sidebar"/);
  assert.match(html,/data-cmpmyi-navigation="left-fixed"/);
  assert.match(html,/<details class="brand-group"/);
  assert.match(html,/class="brand-caret"/);
  assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(html,/class="sidebar"/);
  for(const store of CMPMYI_STORES){
    assert.ok(html.includes(store.name));
    assert.ok(html.includes(`/${store.slug}/admin?embed=cmpmyi`));
    for(const section of ['pos','delivery','menu','orders','connections']){
      assert.ok(html.includes(`/${store.slug}/admin/${section}?embed=cmpmyi`));
    }
  }
  const agentShell=await storePortfolioAdminPage('agent').text();
  assert.match(agentShell,/src="\/cmpmyi\/admin\/panel\/agent"/);
});

test('cmpmyi POS Agent manager provides local status, same-domain lifecycle downloads and store links',async()=>{
  assert.ok(CMPMYI_COMMON_MENU.some(([key,label])=>key==='agent'&&label==='POS Agent 관리'));
  const response=storePortfolioAdminPanelPage('agent');
  const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  const csp=response.headers.get('content-security-policy')||'';
  assert.match(csp,/connect-src 'self' http:\/\/127\.0\.0\.1:17831 http:\/\/localhost:17831/);
  assert.match(html,/data-cmpmyi-pos-agent-manager="v1"/);
  assert.match(html,/이 POS PC의 Agent 상태/);
  assert.match(html,/id="posAgentCheck"/);
  for(const file of ['setup-pos-agent.cmd','remove-pos-agent.cmd','start-pos-agent.cmd','stop-pos-agent.cmd','diagnose-pos-targets.ps1','uninstall-pos-agent.ps1']){
    assert.match(html,new RegExp('/cmpmyi/admin/agent/download/'+file.replaceAll('.','\\.')));
  }
  for(const slug of ['jadam','pizzamaru','yogurt'])assert.match(html,new RegExp('/'+slug+'/admin/pos'));
  assert.match(html,/브라우저 보안상 웹페이지가 Windows 설치·삭제 파일을 자동 실행할 수는 없습니다/);
  assert.match(html,/127\.0\.0\.1/);
  assert.match(html,/\/cmpmyi\/admin\/panel\.js/);

  const runtime=await storePortfolioAdminPanelScript().text();
  assert.match(runtime,/ekodiStorePortfolioPanel==='agent'/);
  assert.match(runtime,/127\.0\.0\.1:17831\/v1\/health/);
  assert.match(runtime,/X-EKODI-Store/);
  assert.match(runtime,/Agent 미연결/);
  assert.doesNotMatch(runtime,/\/v1\/focus[\s\S]*ekodiStorePortfolioPanel==='agent'/);
});

test('cmpmyi common panel stays same-origin frameable and exposes brand handoffs',async()=>{
  const response=storePortfolioAdminPanelPage('delivery');const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-panel');
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
  assert.match(html,/배달플랫폼 통합관리/);
  assert.match(html,/data-cmpmyi-delivery-control="brand-handoff"/);
  for(const platform of ['배달의민족','쿠팡이츠','요기요','땡겨요','먹깨비','당근 주문','네이버 주문'])assert.match(html,new RegExp(platform));
  for(const store of CMPMYI_STORES){
    assert.ok(html.includes(store.name));
    for(const section of ['delivery','menu','orders','inventory','reviews','finance','connections']){
      assert.ok(html.includes(`/${store.slug}/admin/${section}?embed=cmpmyi`));
    }
    assert.ok(html.includes(`data-delivery-brand="${store.slug}"`));
  }
  assert.match(html,/사람 승인/);
  assert.match(html,/공식 Adapter/);
  assert.match(html,/브랜드 간 데이터를 합쳐 쓰지 않습니다/);
  assert.match(html,/id="deliveryLiveState"/);
  assert.match(html,/id="deliveryPortfolioSummary"/);
  assert.match(html,/id="deliveryIssuesOnly"/);
  assert.match(html,/이상 브랜드만 보기/);
  assert.match(html,/data-delivery-live="jadam"/);
  assert.match(html,/\/cmpmyi\/admin\/panel\.js/);
});

test('cmpmyi delivery runtime reads existing store ledgers without adding cross-brand writes',async()=>{
  const response=storePortfolioAdminPanelScript();const script=await response.text();
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')||'',/text\/javascript/);
  assert.match(script,/store_operating_space_snapshot/);
  assert.match(script,/store_delivery_platform_admin_snapshot/);
  assert.match(script,/p_days:30/);
  assert.match(script,/ekodi-store-admin-session:jadam/);
  assert.match(script,/data-delivery-live/);
  assert.match(script,/5분 자동갱신/);
  assert.match(script,/document\.visibilityState==='visible'/);
  assert.match(script,/setInterval[\s\S]*300000/);
  assert.match(script,/function applyIssuesFilter/);
  assert.match(script,/d\.syncIssues/);
  assert.match(script,/d\.priceDiff/);
  assert.match(script,/d\.availabilityDiff/);
  assert.match(script,/d\.pendingSettlements/);
  assert.match(script,/d\.unansweredReviews/);
  assert.match(script,/metricLink\(store,'menu','가격차이'/);
  assert.match(script,/metricLink\(store,'inventory','품절차이'/);
  assert.match(script,/metricLink\(store,'finance','정산대기'/);
  assert.match(script,/metricLink\(store,'reviews','미응답 리뷰'/);
  assert.match(script,/storeAdminHref\(store,section\)/);
  assert.doesNotMatch(script,/store_platform_sync_queue|store_platform_review_queue_reply|menu_price_update|menu_availability_update/);
  assert.doesNotMatch(script,/method:'PATCH'|method:'PUT'|method:'DELETE'/);
});

test('router serves cmpmyi common panels and same-origin embedded canonical store admins',async()=>{
  const agentShell=await platformEntry.fetch(new Request('https://ekodi.kr/cmpmyi/admin/agent'),{},{});
  assert.equal(agentShell.status,200);
  assert.match(await agentShell.text(),/\/cmpmyi\/admin\/panel\/agent/);
  const agentPanel=await platformEntry.fetch(new Request('https://ekodi.kr/cmpmyi/admin/panel/agent'),{},{});
  assert.equal(agentPanel.status,200);
  assert.match(await agentPanel.text(),/POS Agent 설치·관리/);

  const panel=await platformEntry.fetch(new Request('https://ekodi.kr/cmpmyi/admin/panel/customer'),{},{});
  assert.equal(panel.status,200);
  assert.equal(panel.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-panel');
  const panelScript=await platformEntry.fetch(new Request('https://ekodi.kr/cmpmyi/admin/panel.js'),{},{});
  assert.equal(panelScript.status,200);
  assert.match(panelScript.headers.get('content-type')||'',/text\/javascript/);
  assert.match(await panelScript.text(),/store_delivery_platform_admin_snapshot/);

  const embedded=await platformEntry.fetch(new Request('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi'),{},{});
  const embeddedHtml=await embedded.text();
  assert.equal(embedded.status,200);
  assert.equal(embedded.headers.get('x-ekodi-route'),'jadam-store-admin');
  assert.equal(embedded.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.equal(embedded.headers.get('x-ekodi-embedded-admin'),'cmpmyi');
  assert.match(embedded.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
  assert.match(embeddedHtml,/data-ekodi-embedded-admin="true"/);
  const css=await (await platformEntry.fetch(new Request('https://ekodi.kr/store-admin.css'),{},{})).text();
  assert.match(css,/\[data-ekodi-embedded-admin="true"\] main\{max-width:none;padding:8px 10px 16px\}/);
  assert.match(css,/\[data-ekodi-embedded-admin="true"\] \.panel\{padding:10px;min-height:120px/);

  const direct=storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',mark:'JD',brand:'JADAM CHICKEN',pathname:'/jadam/admin/menu'});
  assert.equal(direct.status,200);
  assert.equal(direct.headers.get('x-frame-options'),'DENY');
  assert.equal(direct.headers.get('x-ekodi-embedded-admin'),'none');
});

test('aggregate store child URLs remain redirect-only aliases to store-owned admins',async()=>{
  for(const [slug,section] of [['jadam',''],['pizzamaru','/reviews'],['yogurt','/menu']]){
    const response=await platformEntry.fetch(new Request(`https://ekodi.kr/cmpmyi/admin/${slug}${section}`),{},{});
    assert.equal(response.status,308);
    assert.equal(response.headers.get('location'),`https://ekodi.kr/${slug}/admin${section}`);
    assert.equal(response.headers.get('x-ekodi-route'),'admin-canonical-handoff');
  }
});

test('super administrator navigation keeps only the cmpmyi hub as the aggregate entry',()=>{
  const item=ADMIN_MENU_REGISTRY.find(row=>row.id==='cmpmyi');
  assert.ok(item);assert.equal(item.group,'sites');assert.equal(item.superAdminOnly,true);assert.equal(item.internal,true);
  assert.equal(item.href,'https://ekodi.kr/cmpmyi/admin');
  const posAgent=ADMIN_MENU_REGISTRY.find(row=>row.id==='pos-agent');
  assert.equal(posAgent?.href,'https://ekodi.kr/cmpmyi/admin/agent');
  assert.equal(posAgent?.adminHandoff,true);
  const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/storePortfolioAdminPage/);
  assert.match(router,/storePortfolioAdminPanelPage/);
  assert.doesNotMatch(router,/resolveIntegratedStoreAdminRoute/);
});

test('guarded release probes canonical store admins and redirect-only aggregate aliases',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin')?.statuses,[200]);
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin/agent')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/cmpmyi/admin/agent')?.expect.includes('POS Agent 관리'));
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/agent')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/agent')?.expect.includes('원클릭 설치 다운로드'));
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/overview')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/overview')?.headerExpect.includes('x-frame-options: SAMEORIGIN'));
  const liveRuntime=byUrl.get('https://ekodi.kr/cmpmyi/admin/panel.js');
  assert.deepEqual(liveRuntime?.statuses,[200]);
  assert.ok(liveRuntime?.expect.includes('store_operating_space_snapshot'));
  assert.ok(liveRuntime?.expect.includes('store_delivery_platform_admin_snapshot'));
  assert.ok(liveRuntime?.expect.includes('setInterval'));
  assert.ok(liveRuntime?.expect.includes('visibilityState'));
  assert.ok(!liveRuntime?.expect.includes('300000'));
  assert.ok(!liveRuntime?.expect.some(marker=>/[^\x00-\x7F]/.test(marker)));
  assert.deepEqual(byUrl.get('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi')?.headerExpect.includes('x-ekodi-embedded-admin: cmpmyi'));
  for(const slug of ['jadam','pizzamaru','yogurt']){
    const canonical=byUrl.get(`https://ekodi.kr/${slug}/admin`);assert.deepEqual(canonical?.statuses,[200]);
    const alias=byUrl.get(`https://ekodi.kr/cmpmyi/admin/${slug}`);assert.deepEqual(alias?.statuses,[308]);
    assert.ok(alias?.headerExpect.includes(`location: https://ekodi.kr/${slug}/admin`));
  }
});

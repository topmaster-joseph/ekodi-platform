import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const get=path=>new Request('https://ekodi.kr'+path);

test('My Invest shows the autopilot status, policy and emergency stop only inside the owner section',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 const owner=html.indexOf('<section id="owner" hidden>');
 assert.ok(owner>0);
 for(const id of ['id="autopilot"','id="apStop"','id="policyForm"','id="paperForm"','id="apGates"','id="apOrders"','id="apWeekly"'])assert.ok(html.indexOf(id)>owner,id);
 assert.match(html,/신규 주문 긴급정지/);
 assert.match(html,/보유자산을 임의로 청산하지 않습니다/);
 assert.match(html,/실제 손실이 한도를 넘을 수 있습니다/);
 assert.match(html,/자동 적용 안 함/);
 assert.match(html,/문자 \(비용 승인 후\)/);
});

test('autopilot money and loss inputs carry no preset values',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 for(const key of ['totalBudget','maxOrderAmount','maxDailyBuyAmount','dailyLossLimitPct','totalLossLimitPct']){
  const tag=html.match(new RegExp('<input id="pf_'+key+'"[^>]*>'))?.[0];
  assert.ok(tag,key);
  assert.doesNotMatch(tag,/\svalue=/,key);
 }
 assert.doesNotMatch(html,/<style>|style="/);
});

test('autopilot client talks only to the owner API with DOM-safe rendering',async()=>{
 const js=await (await investMyRoute(get('/invest/app.js'),{})).text();
 assert.match(js,/\/workspace-api\/v1\/invest\/autopilot/);
 assert.match(js,/emergency-stop/);
 assert.match(js,/RESUME_AFTER_REVIEW/);
 assert.doesNotMatch(js,/innerHTML|localStorage\.setItem|sessionStorage\.setItem|\/broker\/orders/);
 const css=await (await investMyRoute(get('/invest/style.css'),{})).text();
 assert.match(css,/\.autopilot\{/);
 assert.match(css,/\.btn\.danger/);
});


test('My Invest exposes readable context-specific second-level tabs under owner gate',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 const owner=html.indexOf('<section id="owner" hidden>');
 assert.ok(owner>0,'owner authentication gate must remain');
 assert.ok(html.includes('id="detailCrumb"'),'public breadcrumb can display the section name without protected content');
 for(const id of ['ownerTabs','detailContext','detailHeading','detailTabs']){
  assert.ok(html.indexOf('id="'+id+'"')>owner,id+' stays owner-only');
 }
 assert.match(html,/role="tablist" aria-label="선택한 메뉴의 세부 기능"/);
 assert.match(html,/id="detailTabs"[^>]*><\/nav>/,'detail tab labels must be generated from current section');
 const js=await (await investMyRoute(get('/invest/app.js'),{})).text();
 for(const text of [
  "research:[['strategyLab','전략 비교·검증'],['shortValueResearch','단기 가치발굴·공시']]",
  "analysis:[['portfolio','내 포트폴리오'],['design','투자분석 설계'],['scenario','시나리오 비교'],['insights','리스크 인사이트']]",
  'function renderDetailTabs(group,selectedId)',
  'function detailForHash(id)',
  "if(updateUrl)history.replaceState(null,'',location.pathname+location.search+'#'+encodeURIComponent(selected))",
  "a.setAttribute('aria-current','location')",
  "b.setAttribute('aria-controls',id)",
  "el('detailTabs').addEventListener('keydown'"
 ])assert.ok(js.includes(text),'missing nested-navigation behavior: '+text);
 assert.match(js,/const found=detailForHash\(hash\)/,'direct links and refresh must restore detail');
 assert.match(js,/showTab\(found.group,\{detailId:found.id\}\)/,'direct links select their correct detail');
 assert.doesNotMatch(js,/innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});

test('My Invest responsive typography and focus styling keep hierarchy legible',async()=>{
 const css=await (await investMyRoute(get('/invest/style.css'),{})).text();
 assert.match(css,/\.detail-context h2\{[^}]*font-size:23px/);
 assert.match(css,/\.detail-tabs button\{[^}]*font-size:15px/);
 assert.match(css,/\.sidebar a\{font-size:15px/);
 assert.match(css,/\.tabs\{display:flex;flex-wrap:wrap/);
 assert.match(css,/@media\(max-width:700px\)\{\.tabs\{flex-wrap:nowrap;overflow-x:auto\}/);
 assert.match(css,/\.detail-tabs button:focus-visible/);
 assert.match(css,/\[data-tab-hidden\]\{display:none!important\}/);
});

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


test('My Invest keeps the essential private links in a readable left sidebar with other functions in contextual tabs',async()=>{
 const html=await (await investMyRoute(get('/invest/my'),{})).text();
 const owner=html.indexOf('<section id="owner" hidden>');
 const menu=html.match(/<nav id="ownerSidebar"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 assert.ok(owner>0,'owner authentication gate must remain');
 assert.ok(menu.includes('id="stepUpButton"'),'identity button must live above left sidebar menus');
 assert.equal([...menu.matchAll(/<a /g)].length,11);
 for(const hidden of ['live','design','scenario'])assert.doesNotMatch(menu,new RegExp('href="/invest/my/'+hidden+'"'));
 for(const main of ['투자 현황','직접투자','AI 모의투자','투자 분석','기록·보고'])assert.match(menu,new RegExp(main));
 assert.match(html,/id="detailTabs" class="detail-tabs" hidden role="tablist"/);
 assert.doesNotMatch(html,/<header class="top"|id="detailCrumb"|href="\/my">내 계정/);
 assert.match(html,/id="investAuthIntro"/);
 const js=await (await investMyRoute(get('/invest/my/app.js'),{})).text();
 for(const id of ['manualOrder','brokerReadonly','marketDashboard','portfolio','autopilot','autopilotPolicy','liveTrading','strategyLab','shortValueResearch','design','scenario','insights','export']){
  assert.match(js,new RegExp(id+':'));
 }
 assert.match(js,/const INVEST_DETAIL_PATHS=/);
 assert.match(js,/root\.hidden=!\(group==='auto'\|\|group==='research'\)/);
 assert.match(js,/a\.dataset\.investDetail===selected/);
 assert.match(js,/history\.pushState/);
 assert.match(js,/addEventListener\('popstate'/);
 assert.match(js,/node\.dataset\.detailParent===selected/);
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


test('nested detail tabs scope supplemental scenario and portfolio cards to the correct section',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 assert.match(html,/data-detail-parent="scenario"><header><h2>기간별 시나리오 변화/);
 assert.match(html,/data-detail-parent="portfolio"><header><h2>내 자산 구성/);
 const js=await (await investMyRoute(get('/invest/app.js'),{})).text();
 assert.match(js,/node\.dataset\.detailParent===selected/);
 assert.match(js,/!node\.dataset\.detailParent/);
 assert.match(js,/const selected=entries\.find\(item=>item\[0\]===detailId\)/);
});

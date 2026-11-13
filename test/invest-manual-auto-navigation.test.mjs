import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { investMyRoute } from '../invest-my-workspace.js';

async function get(path){const r=await investMyRoute(new Request('https://ekodi.kr'+path),{});assert.equal(r.status,200);return r.text();}
test('one compact sidebar has direct destinations for all 11 essential destinations, no top header or account duplication',async()=>{
 const html=await get('/invest/my');
 const owner=html.indexOf('<section id="owner" hidden>');
 const menu=html.match(/<nav id="ownerSidebar"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 assert.ok(owner>0);
 assert.equal([...menu.matchAll(/<a /g)].length,11);
 assert.match(menu,/id="stepUpButton"/);
 for(const slug of ['manual','broker','market','portfolio','autopilot','auto-policy','strategy','value','risk','reports']){
  assert.match(menu,new RegExp('href="/invest/my/'+slug+'"'));
 }
 assert.match(menu,/href="\/invest\/my" data-invest-detail="ownerOverview"/);
 for(const hiddenSlug of ['live','design','scenario'])assert.doesNotMatch(menu,new RegExp('href="/invest/my/'+hiddenSlug+'"'));
 for(const heading of ['투자 현황','직접투자','AI 모의투자','투자 분석','기록·보고'])assert.match(menu,new RegExp(heading));
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
 assert.match(html,/id="investAuthIntro"/);
 assert.doesNotMatch(html,/<header class="top"|href="\/my">내 계정|href="\/invest">투자 안내/);
 assert.match(html,/id="detailTabs" class="detail-tabs" hidden role="tablist"/);
 assert.match(html,/id="manualDraftForm"/);
 assert.match(html,/<strong id="kpiLive">잠금<\/strong>/);
});
test('all direct sidebar links have a single well-defined client route',async()=>{
 const js=await get('/invest/my/app.js');
 const registry=js.match(/const DETAIL_GROUPS=\{([\s\S]*?)\};/)?.[1];
 assert.ok(registry);
 const ids=[...registry.matchAll(/\['([A-Za-z]+)','[^']+'\]/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['ownerOverview','manualOrder','brokerReadonly','marketDashboard','portfolio','autopilot','autopilotPolicy','liveTrading','strategyLab','shortValueResearch','design','scenario','insights','export']){
  assert.ok(ids.includes(id),'missing detail: '+id);
  assert.match(js,new RegExp(id+":'|"+id+":'"));
 }
 assert.match(js,/const INVEST_DETAIL_PATHS=/);
 assert.match(js,/root\.hidden=!\(group==='auto'\|\|group==='research'\)/);
 assert.match(js,/history\.pushState/);
 assert.match(js,/addEventListener\('popstate'/);
 assert.match(js,/a\.dataset\.investDetail===selected/);
 assert.match(js,/el\('ownerSidebar'\)\.hidden=!verified/);
 assert.doesNotMatch(js,/\/broker\/orders|innerHTML/);
});
test('untransmitted manual draft rejects invalid notional and never issues brokerage orders',async()=>{
 const js=await get('/invest/my/app.js');
 const start=js.indexOf('function previewManualDraft('),end=js.indexOf('function init()',start);
 assert.ok(start>0&&end>start);
 let inputs={manualSymbol:'005930',manualSide:'BUY',manualQty:'3',manualPrice:'72000'},message='';
 const context={el:id=>({value:inputs[id]}),setText:(_id,value)=>{message=value}};
 const fn=vm.runInNewContext(js.slice(start,end)+';previewManualDraft',context);
 fn({preventDefault(){}});
 assert.match(message,/주문 미전송/);
 assert.match(message,/216,000원/);
 inputs={...inputs,manualQty:'-1'};fn({preventDefault(){}});
 assert.match(message,/주문은 전송되지 않았습니다/);
 inputs={...inputs,manualQty:'1000000',manualPrice:'1000000000'};fn({preventDefault(){}});
 assert.match(message,/주문은 전송되지 않았습니다/);
});
test('compact responsive sidebar styles preserve readable Korean labels and no overlapping tab navigation',async()=>{
 const css=await get('/invest/my/style.css');
 assert.match(css,/\.sidebar-identity/);
 assert.match(css,/\.sidebar-stepup/);
 assert.match(css,/\.sidebar\[hidden\]/);
 assert.match(css,/#detailTabs\{display:none!important\}/);
 assert.match(css,/\.sidebar \.sidebar-group\{font-size:17px;font-weight:850/);
 assert.match(css,/\.sidebar a\[data-invest-detail\]\{font-size:13\.5px;font-weight:590/);
 assert.match(css,/#owner #detailTabs:not\(\[hidden\]\)\{display:grid!important/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.doesNotMatch(css,/word-break:\s*break-all/);
});

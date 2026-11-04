import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { investMyRoute } from '../invest-my-workspace.js';

async function get(path){const r=await investMyRoute(new Request('https://ekodi.kr'+path),{});assert.equal(r.status,200);return r.text();}
test('manual and AI trade workspaces have one main navigation and private contextual tabs',async()=>{
 const html=await get('/invest');
 const owner=html.indexOf('<section id="owner" hidden>');
 const menu=html.match(/<nav class="sidebar"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 assert.ok(owner>0);
 assert.equal([...menu.matchAll(/<a /g)].length,6,'five owner workspaces plus external account link');
 for(const [id,text] of [['ownerOverview','투자 현황'],['manualOrder','직접투자'],['autopilot','AI 자동투자'],['strategyLab','투자 분석·연구'],['export','보고서']]){
  assert.ok(menu.includes('href="#'+id+'">'+text+'</a>'),id+' must be left primary action');
 }
 assert.ok(html.indexOf('id="manualOrder"')>owner,'manual draft must be hidden behind owner gate');
 assert.match(html,/id="ownerTabs" class="tabs" hidden role="tablist"/,'old duplicate top menu must not be visible');
 assert.match(html,/id="detailTabs" class="detail-tabs" role="tablist"/,'right details must be contextual');
 assert.doesNotMatch(menu,/href="#marketDashboard"|href="#shortValueResearch"/,'subfeatures must live in right tabs only');
 assert.match(html,/id="manualDraftForm"/);
 assert.match(html,/한국투자증권에서 직접 주문/);
 assert.match(html,/<strong id="kpiLive">잠금<\/strong>/);
});
test('group ownership is one-to-one and all existing investing panels remain reachable',async()=>{
 const js=await get('/invest/app.js');
 const registry=js.match(/const DETAIL_GROUPS=\{([\s\S]*?)\};/)?.[1];
 assert.ok(registry);
 const ids=[...registry.matchAll(/\['([A-Za-z]+)','[^']+'\]/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'one panel must not appear in several primary groups');
 for(const id of ['ownerOverview','manualOrder','brokerReadonly','marketDashboard','portfolio','autopilot','autopilotPolicy','liveTrading','strategyLab','shortValueResearch','design','scenario','insights','export'])
   assert.ok(ids.includes(id),'missing detail: '+id);
 assert.match(js,/const on=TAB_OF\[a\.getAttribute\('href'\)\.slice\(1\)\]===tab/,'sidebar stays selected when right detail changes');
 assert.match(js,/history\.replaceState/,'deep link must survive refresh');
 assert.doesNotMatch(js,/\/broker\/orders|innerHTML/,'no live broker order and no unsafe HTML');
});
test('manual draft calculation never submits a broker order and rejects invalid notional',async()=>{
 const js=await get('/invest/app.js');
 const start=js.indexOf('function previewManualDraft('),end=js.indexOf('function init()',start);
 assert.ok(start>0&&end>start);
 let inputs={manualSymbol:'005930',manualSide:'BUY',manualQty:'3',manualPrice:'72000'},message='',prevented=false;
 const context={el:id=>({value:inputs[id]}),setText:(_id,value)=>{message=value}};
 const fn=vm.runInNewContext(js.slice(start,end)+';previewManualDraft',context);
 fn({preventDefault(){prevented=true}});
 assert.ok(prevented);
 assert.match(message,/주문 미전송/);
 assert.match(message,/216,000원/);
 assert.match(message,/증권사에서 직접 확인/);
 inputs={...inputs,manualQty:'-1'};fn({preventDefault(){}});
 assert.match(message,/주문은 전송되지 않았습니다/);
 inputs={...inputs,manualQty:'1000000',manualPrice:'1000000000'};fn({preventDefault(){}});
 assert.match(message,/주문은 전송되지 않았습니다/);
});
test('large readable tabs adapt to small screens without forced Korean word breaking',async()=>{
 const css=await get('/invest/style.css');
 assert.match(css,/\.detail-tabs\{display:grid/);
 assert.match(css,/\.detail-tabs button\{white-space:normal;min-height:52px;font-size:16px/);
 assert.match(css,/\.sidebar a\{font-size:16px/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.doesNotMatch(css,/word-break:\s*break-all/);
});

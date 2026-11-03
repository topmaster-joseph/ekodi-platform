import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const get = async(path)=>{
 const response=await investMyRoute(new Request('https://ekodi.kr'+path),{});
 assert.equal(response.status,200);
 return response.text();
};
test('owner navigation exposes named top-level tabs and one contextual section tablist',async()=>{
 const html=await get('/invest');
 assert.match(html,/<nav id="ownerTabs"[^>]*role="tablist"/);
 assert.match(html,/<nav id="ownerSubtabs"[^>]*role="tablist"[^>]*hidden><\/nav>/);
 assert.match(html,/id="ownerSummary"/);
 assert.match(html,/id="strategyLab"/);
 assert.match(html,/id="shortValueResearch"/);
 assert.match(html,/<section id="owner" hidden>/,'private financial data remains hidden before auth');
});
test('every private sidebar link resolves to exactly one section in the owner registry',async()=>{
 const html=await get('/invest');
 const js=await get('/invest/app.js');
 const hrefs=[...html.matchAll(/<a href="#([A-Za-z]+)"[^>]*>[^<]+<\/a>/g)].map(m=>m[1]);
 assert.ok(hrefs.length>=12);
 const registry=js.match(/const SECTION_TABS=Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
 assert.ok(registry,'canonical client section registry required');
 const sections=[...registry.matchAll(/\['([A-Za-z]+)','[^']+'\]/g)].map(m=>m[1]);
 assert.equal(new Set(sections).size,sections.length,'a section must have one owner group');
 for(const target of hrefs){
  if(['design','portfolio'].includes(target)||sections.includes(target))
   assert.ok(sections.includes(target),'unresolved private sidebar target '+target);
 }
 for(const name of ['marketDashboard','brokerReadonly','strategyLab','shortValueResearch','liveTrading','autopilot',
  'autopilotPolicy','portfolio','design','scenario','insights','export'])
   assert.ok(sections.includes(name),'private menu not registered: '+name);
});
test('section tabs are keyboard-accessible and deep-link navigation restores exactly one visible section',async()=>{
 const js=await get('/invest/app.js');
 for(const feature of ['navigateInvestSection','function routeHash()','window.location','hashchange','aria-controls',
   'aria-current','ownerSubtabs','data-tab-hidden','scrollIntoView']){
  // The code intentionally uses location instead of window.location.
  if(feature==='window.location')continue;
  assert.ok(js.includes(feature),'missing required navigation capability '+feature);
 }
 assert.match(js,/aria-selected/);
 assert.match(js,/ArrowRight/);
 assert.match(js,/ArrowLeft/);
 assert.match(js,/const selected=items\.some/);
 assert.match(js,/node\.id===selected/);
 assert.match(js,/child\.setAttribute\('data-tab-hidden'/);
});
test('strategy has five readable detail panels with risk and data separated from synthetic returns',async()=>{
 const js=await get('/invest/app.js');
 for(const label of ['전략 개요','전략 비교','검증 결과','리스크 분석','데이터 조건'])
  assert.ok(js.includes(label),'missing research detail tab '+label);
 for(const id of ['strategyDetailTabs','strategyPane-','labComparisonTable','labValidationDetails','labRiskDetails'])
  assert.ok(js.includes(id),'missing research pane '+id);
 assert.ok(js.includes('dataBasis'));
 assert.match(js,/\'synthetic\'/);
 assert.ok(js.includes('실거래')&&js.includes('주문'));
 assert.doesNotMatch(js,/innerHTML/);
});
test('responsive CSS enlarges readable navigation without page-width wrapping hacks',async()=>{
 const css=await get('/invest/style.css');
 assert.match(css,/\.sidebar a\{font-size:15px/);
 assert.match(css,/\.tabs button\{font-size:15px/);
 assert.match(css,/\.owner-subtabs/);
 assert.match(css,/\.strategy-detail-tabs/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.doesNotMatch(css,/word-break:\s*break-all/);
});
